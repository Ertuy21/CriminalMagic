import * as THREE from 'three';
import { TAU, clamp, damp, rand } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Heroes are authored from primitives, then baked per animated joint into a
// handful of vertex-coloured meshes. Colour, roughness and metalness live in
// vertex attributes, so a single material reproduces leather, cloth, skin,
// gold and gemstone while a hero costs ~15 draw calls instead of ~150.
//
// Silhouettes follow the concept sheets: the mage wears a layered violet robe,
// a wide bent-brim hat with a crescent buckle and a gold-trimmed high collar;
// Lucia wears a cropped harness top under an open star-embroidered coat,
// thigh straps and heeled boots, with a small crescent hat.
// ---------------------------------------------------------------------------

const bakedCache = new Map();
function bakedMaterial(side) {
  const key = 'std' + side;
  if (bakedCache.has(key)) return bakedCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, side, metalness: 0.5, roughness: 0.5, envMapIntensity: 1.0,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFill = { value: 0.24 };
    shader.uniforms.uRim = { value: 0.34 };
    shader.uniforms.uRimColor = { value: new THREE.Color(0xa8c4ff) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRough;\nattribute float aMetal;\nvarying float vRough;\nvarying float vMetal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRough = aRough;\nvMetal = aMetal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRough;\nvarying float vMetal;\nuniform float uFill;\nuniform float uRim;\nuniform vec3 uRimColor;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vMetal;')
      .replace('#include <opaque_fragment>', `
        float facing = clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0);
        float rim = pow(1.0 - facing, 2.4);
        outgoingLight += diffuseColor.rgb * uFill;
        outgoingLight += uRimColor * rim * uRim;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => key;
  bakedCache.set(key, m);
  return m;
}

const neonCache = new Map();
function bakedNeon(side) {
  const key = 'neon' + side;
  if (neonCache.has(key)) return neonCache.get(key);
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side, toneMapped: false });
  neonCache.set(key, m);
  return m;
}

const std = (color, roughness = 0.7, metalness = 0, extra = null) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...(extra || {}) });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

function limbGeo(rTop, rBot, len, seg = 10) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
  g.translate(0, -len / 2, 0);
  return g;
}

function latheGeo(points, seg = 18) {
  return new THREE.LatheGeometry(points.map(p => new THREE.Vector2(Math.max(0.0008, p[0]), p[1])), seg);
}

function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// crescent moon from a partial torus, used on hats, belts and the robe hem
function crescentGeo(r = 0.03, thickness = 0.006, arc = 4.2) {
  return new THREE.TorusGeometry(r, thickness, 5, 18, arc);
}

// cylinder shell with an opening: theta 0 faces +Z, so a front gap is
// thetaStart = gap/2 and thetaLength = TAU - gap
function shellGeo(rTop, rBot, h, gap, tilt = 0, seg = 20) {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true, gap / 2, TAU - gap);
}

function bakeColor(geo, color, rough, metal) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const rr = new Float32Array(n);
  const mm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    rr[i] = rough; mm[i] = metal;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aRough', new THREE.BufferAttribute(rr, 1));
  geo.setAttribute('aMetal', new THREE.BufferAttribute(mm, 1));
}

export class HeroModel {
  constructor(id) {
    this.id = id;
    this.isMage = id === 'mage';
    this.group = new THREE.Group();
    this.group.name = 'hero-' + id;
    this.time = 0;
    this.phase = 0;
    this.blinkTimer = rand(1, 4);
    this.blink = 1;
    this.breath = rand(0, TAU);

    this._materials();
    this._build();
  }

  _materials() {
    const mage = this.isMage;
    this.mats = {
      skin: std(mage ? 0xcfa07c : 0xdca98a, 0.56, 0.02),
      skinShade: std(mage ? 0xb08262 : 0xc49170, 0.64, 0.02),
      skinDeep: std(mage ? 0x8a6148 : 0xa8765c, 0.7, 0.02),
      hair: std(mage ? 0x3b2b21 : 0x35221b, 0.85, 0.04),
      hairLo: std(mage ? 0x281b14 : 0x221510, 0.9, 0.03),
      hairHi: std(mage ? 0x5c4331 : 0x5a3828, 0.8, 0.05),
      beard: std(0x35251c, 0.9, 0.02),
      robe: std(mage ? 0x3b2c54 : 0x332648, 0.88, 0.03),
      robeLo: std(mage ? 0x241a36 : 0x1e1729, 0.92, 0.02),
      robeHi: std(mage ? 0x4d3b6e : 0x473462, 0.82, 0.04),
      cloth: std(mage ? 0x1b1626 : 0x120f18, 0.94, 0.01),
      leather: std(0x5e4634, 0.46, 0.16),
      leatherDark: std(0x2f231a, 0.6, 0.2),
      strap: std(0x1a1410, 0.62, 0.22),
      gold: std(0xc9a35a, 0.26, 0.95),
      goldDark: std(0x8f6f3a, 0.4, 0.85),
      boot: std(0x3d2c21, 0.44, 0.2),
      bootDark: std(0x1f1611, 0.5, 0.18),
      stocking: std(0x17131d, 0.34, 0.22),
      trim: std(mage ? 0xc9a35a : 0xd8b26a, 0.3, 0.92),
      gem: glowMat(mage ? 0x9a6bff : 0xb64bff),
      gemDark: std(0x5a2f8f, 0.25, 0.5),
      rune: glowMat(mage ? 0x5cf2ff : 0xff6fcf),
      eyeWhite: std(0xe8e0d4, 0.3),
      iris: std(mage ? 0x6b4a2e : 0x4f7d4c, 0.42),
      lip: std(mage ? 0xa06a60 : 0xba626f, 0.52),
      brow: std(mage ? 0x2c211b : 0x2a1b15, 0.9),
      void: new THREE.MeshBasicMaterial({ color: 0x050406 }),
      socket: std(mage ? 0x8a6250 : 0xa87a68, 0.82, 0),
      lash: std(0x120f14, 0.8, 0.04),
      crease: std(mage ? 0x8e6852 : 0xb8846f, 0.86, 0),
      metal: std(0x2a2f36, 0.3, 0.88),
      polymer: std(0x101216, 0.62, 0.18),
      accent: std(0x9aa1a8, 0.2, 0.95),
    };
  }

  // -------------------------------------------------------------------------
  _build() {
    const g = this.group;
    const mage = this.isMage;
    const s = mage ? 1 : 0.945;

    // ---- hips -------------------------------------------------------------
    this.hips = new THREE.Group();
    this.hips.position.y = 0.93 * s;
    g.add(this.hips);

    const pelvis = latheGeo([
      [0.001, -0.12], [0.082, -0.112], [0.114, -0.072], [0.126, -0.018],
      [0.124, 0.030], [0.112, 0.070], [0.001, 0.086],
    ], 18);
    const pelvisMesh = add(this.hips, pelvis, this.mats.cloth);
    pelvisMesh.scale.set(mage ? 1.06 : 1.10, 1, mage ? 0.86 : 0.80);

    // ---- chest ------------------------------------------------------------
    this.chest = new THREE.Group();
    this.chest.position.y = 0.18 * s;
    this.hips.add(this.chest);

    const torso = latheGeo([
      [0.005, -0.08], [0.116, -0.07], [0.128, -0.01], [0.124, 0.07],
      [0.126, 0.14], [0.140, 0.21], [0.156, 0.27], [0.164, 0.312],
      [0.156, 0.345], [0.128, 0.374], [0.088, 0.398], [0.052, 0.414], [0.022, 0.421],
    ], 24);
    this.torso = add(this.chest, torso, mage ? this.mats.robe : this.mats.cloth);
    this.torso.scale.set(1.10, 1, 0.76);

    if (mage) this._buildMageOutfit(s);
    else this._buildLuciaOutfit(s);

    // ---- belt -------------------------------------------------------------
    const beltY = 0.006 * s;
    const belt = add(this.hips, new THREE.CylinderGeometry(0.114 * s, 0.120 * s, 0.052 * s, 20), this.mats.leather, 0, beltY, 0);
    belt.scale.z = 0.90;
    add(this.hips, new THREE.TorusGeometry(0.116 * s, 0.005 * s, 5, 20), this.mats.goldDark, 0, beltY + 0.022 * s, 0).rotation.x = Math.PI / 2;
    add(this.hips, new THREE.TorusGeometry(0.116 * s, 0.005 * s, 5, 20), this.mats.goldDark, 0, beltY - 0.022 * s, 0).rotation.x = Math.PI / 2;
    const buckle = add(this.hips, new THREE.BoxGeometry(mage ? 0.046 : 0.042 * s, 0.038 * s, 0.014), this.mats.gold, 0, beltY, 0.103 * s);
    buckle.rotation.z = Math.PI / 4;
    if (mage) {
      const satchel = new THREE.Group();
      satchel.position.set(-0.138 * s, -0.075 * s, 0.026 * s);
      satchel.rotation.z = 0.14;
      this.hips.add(satchel);
      add(satchel, new THREE.BoxGeometry(0.084 * s, 0.104 * s, 0.060 * s), this.mats.leather, 0, 0, 0);
      add(satchel, new THREE.BoxGeometry(0.088 * s, 0.034 * s, 0.064 * s), this.mats.leatherDark, 0, 0.046 * s, 0);
      add(satchel, new THREE.BoxGeometry(0.016 * s, 0.024 * s, 0.008), this.mats.gold, 0, 0.010 * s, 0.032 * s);
      add(satchel, new THREE.BoxGeometry(0.010 * s, 0.15 * s, 0.010), this.mats.strap, 0.02 * s, 0.11 * s, 0.008);
      add(this.hips, new THREE.BoxGeometry(0.060 * s, 0.086 * s, 0.048 * s), this.mats.leather, 0.114 * s, -0.060 * s, 0.050 * s);
      add(this.hips, new THREE.BoxGeometry(0.062 * s, 0.024 * s, 0.050 * s), this.mats.leatherDark, 0.114 * s, -0.014 * s, 0.050 * s);
    } else {
      const holster = new THREE.Group();
      holster.position.set(-0.148 * s, -0.058 * s, 0.010 * s);
      holster.rotation.z = -0.10;
      this.hips.add(holster);
      add(holster, new THREE.BoxGeometry(0.060 * s, 0.19 * s, 0.062 * s), this.mats.leatherDark, 0, -0.06 * s, 0);
      add(holster, new THREE.TorusGeometry(0.031 * s, 0.006 * s, 5, 14), this.mats.gold, 0, 0.05 * s, 0.012 * s).rotation.y = Math.PI / 2;
      const ring = add(this.hips, new THREE.TorusGeometry(0.044 * s, 0.008 * s, 6, 18), this.mats.gold, 0.150 * s, -0.056 * s, 0.058 * s);
      ring.rotation.y = Math.PI / 2;
      const orb = add(this.hips, new THREE.SphereGeometry(0.034 * s, 14, 10), this.mats.gem, 0.150 * s, -0.056 * s, 0.058 * s);
      orb.userData.keep = true;
      this.orb = orb;
    }

    // ---- head -------------------------------------------------------------
    this.neck = new THREE.Group();
    this.neck.position.y = 0.428 * s;
    this.chest.add(this.neck);
    this.head = new THREE.Group();
    this.head.position.y = 0.074 * s;
    this.neck.add(this.head);

    const neckMesh = add(this.neck, new THREE.CylinderGeometry(0.040 * s, 0.052 * s, 0.13 * s, 14), this.mats.skin, 0, -0.028 * s, 0.004);
    neckMesh.rotation.x = -0.04;

    this._buildFace(s);
    if (mage) this._buildMageHead(s);
    else this._buildLuciaHead(s);
    this.head.scale.setScalar(0.97);

    // ---- arms -------------------------------------------------------------
    this.arms = {};
    for (const [side, sx] of [['L', -1], ['R', 1]]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.152 * s, 0.330 * s, 0);
      shoulder.rotation.z = sx * 0.15;
      this.chest.add(shoulder);
      // the coat covers the upper arm; the forearm keeps a fitted sleeve
      add(shoulder, limbGeo(0.048 * s, 0.040 * s, 0.285 * s, 12), this.mats.robe);
      if (mage) {
        // layered pauldron shell on the outer shoulder
        const pauldron = add(shoulder, new THREE.SphereGeometry(0.062 * s, 12, 8, 0, TAU, 0, Math.PI * 0.55), this.mats.robeHi, 0, -0.012 * s, 0);
        pauldron.scale.set(1.0, 0.7, 1.0);
      }
      const elbow = new THREE.Group();
      elbow.position.y = -0.285 * s;
      shoulder.add(elbow);
      const sleeve = add(elbow, limbGeo(mage ? 0.040 * s : 0.038 * s, mage ? 0.058 * s : 0.050 * s, 0.235 * s, 12), this.mats.robe);
      add(elbow, new THREE.TorusGeometry(mage ? 0.057 * s : 0.049 * s, 0.0055 * s, 4, 14), this.mats.trim, 0, -0.232 * s, 0);
      add(elbow, new THREE.CylinderGeometry(0.034 * s, 0.030 * s, 0.095 * s, 10), mage ? this.mats.leatherDark : this.mats.strap, 0, -0.256 * s, 0);
      const hand = new THREE.Group();
      hand.position.y = -0.298 * s;
      elbow.add(hand);
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.032 * s, 10, 8), this.mats.skin);
      palm.scale.set(0.88, 1.05, 0.62);
      palm.castShadow = true;
      hand.add(palm);
      const fingers = add(hand, new THREE.BoxGeometry(0.046 * s, 0.046 * s, 0.026 * s), this.mats.skin, 0, -0.034 * s, 0.006);
      fingers.rotation.x = 0.14;
      add(hand, new THREE.BoxGeometry(0.015 * s, 0.030 * s, 0.017 * s), this.mats.skin, -sx * 0.029 * s, -0.011 * s, 0.010).rotation.z = sx * 0.5;
      if (mage && side === 'L') {
        for (let i = 0; i < 3; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.047 * s, 0.0045 * s, 4, 12), this.mats.rune);
          ring.position.y = -0.19 * s - i * 0.030 * s;
          ring.rotation.x = Math.PI / 2;
          shoulder.add(ring);
        }
      }
      this.arms[side] = { shoulder, elbow, hand };
    }

    // ---- legs -------------------------------------------------------------
    this.legs = {};
    for (const [side, sx] of [['L', -1], ['R', 1]]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.084 * s, -0.04 * s, 0);
      this.hips.add(hip);
      const pants = mage ? this.mats.cloth : this.mats.stocking;
      add(hip, limbGeo(mage ? 0.068 * s : 0.064 * s, 0.051 * s, 0.42 * s), pants);
      const knee = new THREE.Group();
      knee.position.y = -0.42 * s;
      hip.add(knee);
      add(knee, limbGeo(0.050 * s, 0.036 * s, 0.41 * s), pants);
      if (!mage) {
        add(hip, new THREE.CylinderGeometry(0.070 * s, 0.066 * s, 0.032 * s, 12), this.mats.leatherDark, 0, -0.335 * s, 0);
        add(hip, new THREE.TorusGeometry(0.069 * s, sx > 0 ? 0.006 * s : 0.0045 * s, 4, 14), sx > 0 ? this.mats.gold : this.mats.strap, 0, -0.335 * s, 0).rotation.x = Math.PI / 2;
      }
      const foot = new THREE.Group();
      foot.position.y = -0.41 * s;
      knee.add(foot);
      if (mage) {
        add(foot, new THREE.CylinderGeometry(0.048 * s, 0.056 * s, 0.19 * s, 12), this.mats.boot, 0, 0.095 * s, 0);
        add(foot, new THREE.TorusGeometry(0.055 * s, 0.0045 * s, 4, 14), this.mats.trim, 0, 0.184 * s, 0).rotation.x = Math.PI / 2;
        const ankle = add(foot, new THREE.SphereGeometry(0.047 * s, 12, 9), this.mats.boot, 0, 0.024 * s, 0.012 * s);
        ankle.scale.set(0.94, 0.70, 1.15);
        const vamp = add(foot, new THREE.SphereGeometry(0.044 * s, 12, 9), this.mats.boot, 0, 0.030 * s, 0.076 * s);
        vamp.scale.set(0.94, 0.62, 1.55);
        const sole = add(foot, new THREE.SphereGeometry(0.043 * s, 12, 6), this.mats.bootDark, 0, 0.006 * s, 0.050 * s);
        sole.scale.set(1.0, 0.30, 1.95);
      } else {
        add(foot, new THREE.CylinderGeometry(0.045 * s, 0.041 * s, 0.20 * s, 12), this.mats.bootDark, 0, 0.10 * s, 0);
        add(foot, new THREE.SphereGeometry(0.043 * s, 12, 9), this.mats.bootDark, 0, 0.024 * s, 0.050 * s).scale.set(0.92, 0.6, 1.5);
        add(foot, new THREE.BoxGeometry(0.066 * s, 0.012 * s, 0.125 * s), this.mats.bootDark, 0, 0.004 * s, 0.058 * s);
        add(foot, new THREE.CylinderGeometry(0.012 * s, 0.009 * s, 0.055 * s, 8), this.mats.gold, 0, -0.026 * s, -0.032 * s);
        add(foot, new THREE.TorusGeometry(0.048 * s, 0.0055 * s, 4, 14), this.mats.gold, 0, 0.196 * s, 0).rotation.x = Math.PI / 2;
      }
      this.legs[side] = { hip, knee, foot };
    }

    // ---- coat tails -------------------------------------------------------
    this.tails = [];
    const tailDefs = mage
      ? [
        [-0.118, 0.50, -0.030, 0.118, -0.20],
        [0.118, 0.50, -0.030, 0.118, 0.20],
        [0.000, 0.56, -0.112, 0.156, 0.00],
        [-0.088, 0.34, 0.080, 0.106, -0.30],
        [0.088, 0.34, 0.080, 0.106, 0.30],
      ]
      : [
        [-0.110, 0.54, -0.052, 0.110, -0.16],
        [0.110, 0.54, -0.052, 0.110, 0.16],
        [-0.096, 0.36, 0.072, 0.090, -0.26],
        [0.096, 0.36, 0.072, 0.090, 0.26],
      ];
    for (let i = 0; i < tailDefs.length; i++) {
      const [xoff, len, zoff, width, tilt] = tailDefs[i];
      const root = new THREE.Group();
      root.position.set(xoff * s, -0.005, zoff * s);
      root.rotation.z = tilt * 0.35;
      this.hips.add(root);
      let parent = root;
      const segs = [];
      const segLen = len / 2;
      for (let k = 0; k < 2; k++) {
        const seg = new THREE.Group();
        seg.position.y = k === 0 ? 0 : -segLen * s;
        parent.add(seg);
        const w = (width * (1 - k * 0.12)) * s;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(w, segLen * s, 0.016 * s), this.mats.robe);
        panel.position.y = -segLen * s / 2;
        panel.castShadow = true;
        seg.add(panel);
        add(seg, new THREE.BoxGeometry(w * 0.9, segLen * s * 0.96, 0.004), this.mats.robeLo, 0, -segLen * s / 2, -0.009 * s);
        add(seg, new THREE.BoxGeometry(0.008 * s, segLen * s, 0.019 * s), this.mats.trim, w / 2, -segLen * s / 2, 0);
        add(seg, new THREE.BoxGeometry(w * 0.55, 0.007 * s, 0.020 * s), this.mats.trim, 0, -segLen * s + 0.01 * s, 0);
        segs.push(seg);
        parent = seg;
      }
      this.tails.push({ root, segs });
    }

    // ---- weapon (Lucia) ---------------------------------------------------
    if (!mage) {
      this.weaponRoot = new THREE.Group();
      this.weaponRoot.userData.noBake = true;
      this.arms.R.hand.add(this.weaponRoot);
      this.weaponRoot.position.set(0, -0.045 * s, 0.02 * s);
      this.weaponRoot.rotation.x = Math.PI / 2;
      this.weapons = {};
      this.weapons.pistol = this._buildGun('pistol', s);
      this.weapons.smg = this._buildGun('smg', s);
      this.weapons.shotgun = this._buildGun('shotgun', s);
      for (const k of Object.keys(this.weapons)) {
        this.weaponRoot.add(this.weapons[k]);
        this.weapons[k].visible = k === 'pistol';
      }
      for (const k of Object.keys(this.weapons)) {
        const grp = this.weapons[k];
        const geos = [];
        for (const child of [...grp.children]) {
          if (!child.isMesh) continue;
          child.updateMatrix();
          const g2 = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone());
          g2.applyMatrix4(child.matrix);
          for (const name of Object.keys(g2.attributes)) {
            if (name !== 'position' && name !== 'normal' && name !== 'uv') g2.deleteAttribute(name);
          }
          if (!g2.attributes.normal) g2.computeVertexNormals();
          if (!g2.attributes.uv) g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2));
          bakeColor(g2, child.material.color, child.material.roughness ?? 0.4, child.material.metalness ?? 0.7);
          geos.push(g2);
          grp.remove(child);
        }
        if (geos.length) {
          const merged = mergeGeometries(geos, false);
          for (const g of geos) g.dispose();
          if (merged) {
            const mesh = new THREE.Mesh(merged, bakedMaterial(THREE.FrontSide));
            mesh.castShadow = true;
            mesh.userData.keep = true;
            grp.add(mesh);
          }
        }
      }
      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0.035, 0.3);
      this.weapons.pistol.add(this.muzzle);
      this.muzzle.userData.keep = true;
    }

    // ---- hand glow --------------------------------------------------------
    this.handGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: null, color: mage ? 0x9a6bff : 0xff5cb0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.handGlow.scale.setScalar(0.5);
    this.handGlow.userData.keep = true;
    this.arms.R.hand.add(this.handGlow);

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this._bake();
  }

  // =========================================================================
  // face: cranium, tapered jaw, nose, layered eyes, brows, mouth, ears
  // =========================================================================
  _buildFace(s) {
    const mats = this.mats;
    const R = 0.092 * s;
    const CY = 0.026 * s;
    this.faceR = R;
    this.faceCY = CY;

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(R, 26, 20), mats.skin);
    cranium.scale.set(0.84, 1.04, 1.0);
    cranium.position.set(0, CY, 0);
    cranium.castShadow = true;
    cranium.receiveShadow = true;
    this.head.add(cranium);
    this.skull = cranium;

    const jawGeo = new THREE.LatheGeometry([
      [0.001, 0.012], [0.062, 0.010], [0.070, -0.012], [0.066, -0.034],
      [0.053, -0.056], [0.036, -0.074], [0.019, -0.086], [0.001, -0.090],
    ].map(p => new THREE.Vector2(Math.max(0.0008, p[0]), p[1])), 22);
    const jaw = add(this.head, jawGeo, mats.skin, 0, CY - 0.006 * s, 0.008);
    jaw.scale.set(0.88, 1.02, 0.98);

    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.026 * s, 10, 8), mats.skin);
      cheek.position.set(sx * 0.040 * s, CY - 0.020 * s, 0.056 * s);
      cheek.scale.set(1.0, 0.78, 0.55);
      this.head.add(cheek);
    }

    const browRidge = new THREE.Mesh(new THREE.SphereGeometry(R * 0.62, 14, 8, 0, Math.PI, Math.PI * 0.28, Math.PI * 0.22), mats.skin);
    browRidge.position.set(0, CY + (R * 0.50) * s, 0.012 * s);
    browRidge.rotation.x = Math.PI * 0.5;
    browRidge.rotation.z = -Math.PI * 0.5;
    browRidge.scale.set(1.0, 1.0, 0.85);
    this.head.add(browRidge);

    const faceZ = (x, y) => Math.sqrt(Math.max(0.0004, R * R - x * x - y * y)) * 0.98;

    // nose
    const noseY = 0.006 * s;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016 * s, 0.050 * s, 7), mats.skin);
    nose.position.set(0, CY + noseY, faceZ(0, noseY) - 0.006 * s);
    nose.rotation.x = Math.PI * 0.52;
    nose.scale.set(1.0, 1.0, 0.55);
    this.head.add(nose);
    const tipY = -0.014 * s;
    const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.0125 * s, 9, 7), mats.skin);
    noseTip.position.set(0, CY + tipY, faceZ(0, tipY) - 0.004 * s);
    noseTip.scale.set(1.15, 0.85, 0.85);
    this.head.add(noseTip);
    for (const sx of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.0075 * s, 6, 5), mats.skinShade);
      nostril.position.set(sx * 0.0115 * s, CY + tipY - 0.009 * s, faceZ(0.0115 * s, tipY) - 0.005 * s);
      nostril.scale.set(1, 0.7, 0.5);
      this.head.add(nostril);
    }

    // eyes: sclera, iris, pupil, highlight, upper lash line
    this.eyes = [];
    const eyeX = 0.034 * s, eyeY = 0.004 * s;
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * eyeX, CY + eyeY, faceZ(eyeX, eyeY) - 0.010 * s);
      this.head.add(eye);
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.0245 * s, 14, 10), mats.socket);
      socket.scale.set(1.18, 0.66, 0.24);
      socket.position.z = -0.002 * s;
      eye.add(socket);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.0200 * s, 16, 12), mats.eyeWhite);
      white.scale.set(1.08, 0.92, 0.62);
      white.position.z = 0.0050 * s;
      eye.add(white);
      const irisG = new THREE.Group();
      irisG.position.z = 0.0060 * s;
      eye.add(irisG);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0108 * s, 14, 10), mats.iris);
      iris.scale.set(1, 1, 0.42);
      iris.position.z = 0.0075 * s;
      irisG.add(iris);
      const pup = new THREE.Mesh(new THREE.SphereGeometry(0.0052 * s, 10, 8), mats.void);
      pup.scale.set(1, 1, 0.4);
      pup.position.z = 0.0122 * s;
      irisG.add(pup);
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.0028 * s, 7, 6), mats.eyeWhite);
      spark.position.set(-sx * 0.0042 * s, 0.0052 * s, 0.0130 * s);
      irisG.add(spark);
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.0202 * s, 0.0028 * s, 4, 16, Math.PI * 0.94), mats.lash);
      lash.position.set(0, 0.0016 * s, 0.0092 * s);
      lash.rotation.set(0.18, 0, Math.PI * 0.03);
      lash.scale.set(1.10, 0.96, 1);
      eye.add(lash);
      const crease = new THREE.Mesh(new THREE.TorusGeometry(0.0232 * s, 0.0016 * s, 4, 16, Math.PI * 0.70), mats.crease);
      crease.position.set(0, 0.0078 * s, 0.0060 * s);
      crease.rotation.set(0.22, 0, Math.PI * 0.10);
      crease.scale.set(1.06, 0.9, 1);
      eye.add(crease);
      this.eyes.push(eye);
    }

    // brows: thin arcs hugging the forehead, not blocks
    this.brows = [];
    const browY = 0.034 * s;
    for (const sx of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.TorusGeometry(0.021 * s, 0.0026 * s, 4, 14, Math.PI * 0.72), mats.brow);
      brow.position.set(sx * 0.034 * s, CY + browY, faceZ(0.034 * s, browY) - 0.0035 * s);
      brow.rotation.set(0.20, 0, sx > 0 ? Math.PI * 0.62 : Math.PI * 0.10);
      brow.scale.set(1.02, 1.0, 0.8);
      this.head.add(brow);
      this.brows.push(brow);
    }

    // mouth
    const mouthY = -0.042 * s;
    const upperLip = new THREE.Mesh(new THREE.SphereGeometry(0.0165 * s, 12, 7), mats.lip);
    upperLip.position.set(0, CY + mouthY + 0.0026 * s, faceZ(0, mouthY) - 0.0080 * s);
    upperLip.scale.set(1.0, 0.20, 0.26);
    this.head.add(upperLip);
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.0175 * s, 12, 7), mats.lip);
    this.mouth.position.set(0, CY + mouthY - 0.0030 * s, faceZ(0, mouthY) - 0.0080 * s);
    this.mouth.scale.set(1.0, 0.24, 0.26);
    this.mouth.userData.keep = true;
    this.head.add(this.mouth);
    const parting = new THREE.Mesh(new THREE.BoxGeometry(0.027 * s, 0.0016 * s, 0.003), mats.void);
    parting.position.set(0, CY + mouthY, faceZ(0, mouthY) - 0.0070 * s);
    this.head.add(parting);
    const phil = new THREE.Mesh(new THREE.BoxGeometry(0.0065 * s, 0.016 * s, 0.003), mats.skinShade);
    phil.position.set(0, CY - 0.022 * s, faceZ(0, -0.022 * s) - 0.0065 * s);
    this.head.add(phil);

    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.0175 * s, 9, 7), mats.skin);
      ear.position.set(sx * 0.077 * s, CY - 0.002 * s, 0.004 * s);
      ear.scale.set(0.45, 1.05, 0.8);
      this.head.add(ear);
      if (!this.isMage) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0120 * s, 0.0028 * s, 4, 10), mats.gold);
        ring.position.set(sx * 0.081 * s, CY - 0.030 * s, 0.006);
        ring.rotation.y = Math.PI / 2;
        this.head.add(ring);
      }
    }
  }

  // =========================================================================
  // mage costume: fitted long coat with a V opening, mantle, high collar
  // =========================================================================
  _buildMageOutfit(s) {
    const mats = this.mats;
    // inner vest and shirt visible through the coat's V
    add(this.chest, new THREE.CylinderGeometry(0.100 * s, 0.110 * s, 0.30 * s, 18), mats.cloth, 0, 0.17 * s, 0.008 * s).scale.z = 0.80;
    for (const sx of [-1, 1]) {
      const lapel = add(this.chest, new THREE.BoxGeometry(0.052 * s, 0.24 * s, 0.012), mats.robeLo,
        sx * 0.056 * s, 0.268 * s, 0.098 * s);
      lapel.rotation.z = -sx * 0.26;
      lapel.rotation.y = -sx * 0.30;
    }

    // fitted coat shell hugging the torso profile, open in front
    const coatProfile = [
      [0.001, -0.09], [0.122, -0.088], [0.136, -0.02], [0.136, 0.06],
      [0.138, 0.13], [0.150, 0.20], [0.166, 0.26], [0.174, 0.310],
      [0.164, 0.344], [0.136, 0.372], [0.094, 0.396],
    ];
    const coat = new THREE.Mesh(new THREE.LatheGeometry(
      coatProfile.map(p => new THREE.Vector2(Math.max(0.0008, p[0] * s), p[1] * s)), 28, 0.50, TAU - 1.00
    ), mats.robe);
    coat.position.set(0, 0, 0);
    coat.scale.set(1.06, 1, 0.84);
    coat.material.side = THREE.DoubleSide;
    coat.castShadow = true;
    this.chest.add(coat);
    // gold piping follows both open edges of the coat
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const y = -0.02 + k * 0.072;
        const rr = 0.132 + Math.max(0, k - 1) * 0.012;
        const ang = Math.PI * 0.5 + 0.50 * (k % 2 ? 1 : 1);
        const px = sx * Math.sin(0.50) * rr * 1.06;
        const pz = Math.cos(0.50) * rr * 0.84;
        const seg = add(this.chest, new THREE.BoxGeometry(0.010 * s, 0.078 * s, 0.012), mats.trim,
          px, y * s, pz);
        seg.rotation.z = -sx * 0.10;
        seg.rotation.y = -sx * 0.58;
      }
    }
    // crossed leather strap with a gold buckle
    const strap = add(this.chest, new THREE.BoxGeometry(0.024 * s, 0.30 * s, 0.010), mats.strap, 0.050 * s, 0.240 * s, 0.110 * s);
    strap.rotation.z = 0.30;
    add(this.chest, new THREE.BoxGeometry(0.020, 0.017, 0.012), mats.gold, 0.020 * s, 0.176 * s, 0.114 * s);

    // high collar, open at the front
    const collar = new THREE.Mesh(shellGeo(0.062 * s, 0.100 * s, 0.105 * s, 1.05), mats.robeLo);
    collar.position.y = 0.352 * s;
    collar.rotation.x = -0.05;
    collar.material.side = THREE.DoubleSide;
    this.chest.add(collar);
    const collarTrim = new THREE.Mesh(new THREE.TorusGeometry(0.063 * s, 0.0045 * s, 5, 16, TAU - 1.05), mats.trim);
    collarTrim.position.y = 0.402 * s;
    collarTrim.rotation.set(Math.PI / 2, 0, 1.05 / 2 + Math.PI * 0.5);
    this.chest.add(collarTrim);
    for (const sx of [-1, 1]) {
      const lap = new THREE.Mesh(new THREE.BoxGeometry(0.034 * s, 0.105 * s, 0.012), mats.robe);
      lap.position.set(sx * 0.056 * s, 0.316 * s, 0.070 * s);
      lap.rotation.set(-0.10, -sx * 0.16, sx * 0.30);
      this.chest.add(lap);
    }

    // shoulder mantle wrapping the back, gold hem
    const cape = new THREE.Mesh(shellGeo(0.062 * s, 0.186 * s, 0.27 * s, Math.PI * 0.66), mats.robeHi);
    cape.position.set(0, 0.256 * s, -0.012 * s);
    cape.scale.set(1.0, 1.0, 0.90);
    cape.material.side = THREE.DoubleSide;
    cape.castShadow = true;
    this.chest.add(cape);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.178 * s, 0.006 * s, 5, 24, TAU - Math.PI * 0.66), mats.trim);
    hem.position.set(0, 0.124 * s, -0.012 * s);
    hem.rotation.set(Math.PI / 2, 0, Math.PI * 0.5 + Math.PI * 0.33 + Math.PI * 0.5);
    hem.scale.set(1.0, 0.90, 1);
    this.chest.add(hem);

    // amulet: gold teardrop setting with a violet gem, plus a fine chain
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.044 * s, 0.0032 * s, 4, 20), mats.gold);
    chain.position.set(0, 0.398 * s, 0.092 * s);
    chain.rotation.x = 1.25;
    this.chest.add(chain);
    const setting = new THREE.Mesh(new THREE.TorusGeometry(0.019 * s, 0.005 * s, 5, 6), mats.gold);
    setting.position.set(0, 0.300 * s, 0.112 * s);
    setting.rotation.z = Math.PI / 6;
    this.chest.add(setting);
    const brooch = add(this.chest, new THREE.OctahedronGeometry(0.016 * s, 0), mats.gem, 0, 0.300 * s, 0.114 * s);
    brooch.scale.set(0.8, 1.3, 0.5);
    brooch.userData.keep = true;
    this.brooch = brooch;

    // staff strapped across the back, crescent head above the left shoulder
    const staff = new THREE.Group();
    staff.position.set(0.116 * s, 0.06 * s, -0.110 * s);
    staff.rotation.set(0.10, 0, -0.14);
    this.chest.add(staff);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.010 * s, 0.014 * s, 1.55 * s, 8), mats.leatherDark);
    shaft.position.y = 0.10 * s;
    shaft.castShadow = true;
    staff.add(shaft);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * s, 0.016 * s, 0.28 * s, 8), mats.leather);
    grip.position.y = -0.16 * s;
    staff.add(grip);
    const head = new THREE.Mesh(crescentGeo(0.052 * s, 0.009 * s, 4.4), mats.gold);
    head.position.y = 0.90 * s;
    head.rotation.set(0.2, 0, -1.9);
    staff.add(head);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.038 * s, 0), mats.gem);
    crystal.position.y = 0.90 * s;
    crystal.userData.keep = true;
    staff.add(crystal);
    this.staffCrystal = crystal;
  }

  // =========================================================================
  // Lucia costume: cropped harness top, open star coat, choker, bare shoulders
  // =========================================================================
  _buildLuciaOutfit(s) {
    const mats = this.mats;
    // cropped bustier
    const bust = new THREE.Mesh(new THREE.SphereGeometry(0.094 * s, 18, 12), mats.cloth);
    bust.position.set(0, 0.248 * s, 0.020 * s);
    bust.scale.set(1.14, 1.06, 0.92);
    this.chest.add(bust);
    const band = add(this.chest, new THREE.CylinderGeometry(0.106 * s, 0.110 * s, 0.070 * s, 18), mats.cloth, 0, 0.150 * s, 0.006 * s);
    band.scale.z = 0.88;
    add(this.chest, new THREE.TorusGeometry(0.109 * s, 0.0045 * s, 4, 18), mats.goldDark, 0, 0.184 * s, 0.006 * s).rotation.x = Math.PI / 2;
    const star = add(this.chest, new THREE.OctahedronGeometry(0.015 * s, 0), mats.gem, 0, 0.212 * s, 0.104 * s);
    star.scale.set(0.8, 1.1, 0.5);
    star.userData.keep = true;
    this.brooch = star;
    // shoulder straps
    for (const sx of [-1, 1]) {
      const strap = add(this.chest, new THREE.BoxGeometry(0.018 * s, 0.095 * s, 0.010), mats.leatherDark, sx * 0.060 * s, 0.328 * s, 0.046 * s);
      strap.rotation.x = -0.26;
      strap.rotation.z = sx * 0.16;
    }

    // open coat: a single shell with a wide front gap, hanging from shoulders
    const coat = new THREE.Mesh(shellGeo(0.110 * s, 0.132 * s, 0.36 * s, Math.PI * 0.52), mats.robe);
    coat.position.set(0, 0.198 * s, 0.002 * s);
    coat.scale.set(1.12, 1, 0.96);
    coat.material.side = THREE.DoubleSide;
    coat.castShadow = true;
    this.chest.add(coat);
    // gold piping along both open edges, with star studs
    for (const sx of [-1, 1]) {
      const edgeZ = Math.cos(Math.PI * 0.26) * 0.112;
      const edgeX = Math.sin(Math.PI * 0.26) * 0.112 * 1.12;
      const pip = add(this.chest, new THREE.BoxGeometry(0.006 * s, 0.35 * s, 0.008), mats.trim,
        sx * edgeX, 0.198 * s, edgeZ);
      pip.rotation.y = -sx * 0.55;
      for (let k = 0; k < 2; k++) {
        const st = add(this.chest, new THREE.OctahedronGeometry(0.010 * s, 0), mats.trim,
          sx * (edgeX + 0.004), 0.105 * s + k * 0.12 * s, edgeZ - 0.001);
        st.scale.set(1, 1, 0.4);
      }
    }
    // back panel with the star motif
    const starBack = add(this.chest, new THREE.OctahedronGeometry(0.020 * s, 0), mats.trim, 0, 0.230 * s, -0.122 * s);
    starBack.scale.set(0.9, 1.3, 0.3);
    // standing collar around the neck, open at the front
    const col = new THREE.Mesh(shellGeo(0.056 * s, 0.070 * s, 0.075 * s, 1.5), mats.robe);
    col.position.y = 0.366 * s;
    col.material.side = THREE.DoubleSide;
    this.chest.add(col);
    const colTrim = new THREE.Mesh(new THREE.TorusGeometry(0.057 * s, 0.004 * s, 4, 16, TAU - 1.5), mats.trim);
    colTrim.position.y = 0.402 * s;
    colTrim.rotation.set(Math.PI / 2, 0, 1.5 / 2 + Math.PI * 0.5);
    this.chest.add(colTrim);
    // chain across the collarbones
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.050 * s, 0.0032 * s, 4, 20), mats.gold);
    chain.position.set(0, 0.396 * s, 0.066 * s);
    chain.rotation.x = 1.38;
    this.chest.add(chain);
  }

  _buildMageHead(s) {
    const mats = this.mats;
    const R = this.faceR, CY = this.faceCY;
    // swept-back medium hair under the hat
    const OPEN = 0.86;
    const cap = add(this.head, new THREE.SphereGeometry(
      R * 1.06, 24, 18, Math.PI * 0.5 + OPEN, Math.PI * 2 - OPEN * 2, 0, Math.PI * 0.80
    ), mats.hair, 0, CY, -0.004 * s);
    cap.scale.set(0.90, 1.06, 1.03);
    cap.material.side = THREE.DoubleSide;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(R * 0.96, 18, 12, 0, TAU, 0, Math.PI * 0.46), mats.hair);
    crown.position.set(0, CY + 0.030 * s, -0.014 * s);
    crown.scale.set(0.92, 0.96, 1.05);
    this.head.add(crown);
    for (const sx of [-1, 1]) {
      const sideMass = new THREE.Mesh(new THREE.SphereGeometry(0.038 * s, 12, 9), mats.hair);
      sideMass.position.set(sx * 0.068 * s, CY + 0.010 * s, -0.020 * s);
      sideMass.scale.set(0.6, 1.15, 1.05);
      this.head.add(sideMass);
      const lock = new THREE.Mesh(limbGeo(0.014 * s, 0.008 * s, 0.13 * s, 7), mats.hairLo);
      lock.position.set(sx * 0.072 * s, CY + 0.010 * s, 0.008 * s);
      lock.rotation.z = sx * 0.12;
      this.head.add(lock);
    }
    const nape = new THREE.Mesh(new THREE.SphereGeometry(0.060 * s, 14, 10), mats.hair);
    nape.position.set(0, CY - 0.036 * s, -0.048 * s);
    nape.scale.set(0.92, 0.9, 0.55);
    this.head.add(nape);
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(
      R * 1.056, 20, 6, Math.PI * 0.5 - 0.92, 1.84, Math.PI * 0.11, Math.PI * 0.16
    ), mats.hair);
    fringe.position.set(0, CY, -0.004 * s);
    fringe.scale.set(0.92, 1.06, 1.03);
    fringe.rotation.y = -0.14;
    this.head.add(fringe);

    // short beard: low jaw band under the cheekbones, sideburns, moustache
    const beardMat = mats.beard;
    const beard = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.014, 24, 12, Math.PI * 0.5 - 0.80, 1.60, Math.PI * 0.685, Math.PI * 0.255),
      beardMat
    );
    beard.position.set(0, CY - 0.006 * s, 0.002);
    beard.scale.set(0.90, 1.02, 0.99);
    beard.material.side = THREE.DoubleSide;
    this.head.add(beard);
    // fuller chin pad so the shell does not read as a flat band
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.023 * s, 10, 8), beardMat);
    chin.position.set(0, CY - 0.074 * s, 0.055 * s);
    chin.scale.set(1.0, 0.66, 0.55);
    this.head.add(chin);
    for (const sx of [-1, 1]) {
      // sideburn strip from the hairline down to the jaw
      const burn = new THREE.Mesh(new THREE.BoxGeometry(0.014 * s, 0.062 * s, 0.026 * s), beardMat);
      burn.position.set(sx * 0.063 * s, CY - 0.036 * s, 0.034 * s);
      burn.rotation.z = sx * 0.10;
      burn.rotation.y = -sx * 0.42;
      this.head.add(burn);
      const stache = new THREE.Mesh(new THREE.SphereGeometry(0.0115 * s, 8, 6), beardMat);
      stache.position.set(sx * 0.011 * s, CY - 0.029 * s, 0.085 * s);
      stache.scale.set(1.10, 0.42, 0.42);
      stache.rotation.z = -sx * 0.30;
      this.head.add(stache);
    }

    // hat: curled wide brim, banded crown bent backwards in two segments
    const hat = new THREE.Group();
    hat.position.set(0, CY + 0.062 * s, -0.008 * s);
    hat.rotation.set(-0.06, 0, -0.05);
    this.head.add(hat);
    const brim = new THREE.Mesh(latheGeo([
      [0.001, 0.004], [0.060, 0.006], [0.120, 0.012], [0.176, 0.022],
      [0.214, 0.038], [0.238, 0.062], [0.246, 0.092],
    ], 30), mats.robeLo);
    brim.material.side = THREE.DoubleSide;
    hat.add(brim);
    const brimTrim = new THREE.Mesh(new THREE.TorusGeometry(0.240 * s, 0.0055 * s, 5, 32), mats.trim);
    brimTrim.position.y = 0.082 * s;
    brimTrim.rotation.x = Math.PI / 2;
    brimTrim.scale.set(1.0, 0.98, 1);
    hat.add(brimTrim);
    const crownGeo = latheGeo([
      [0.001, 0.006], [0.108, 0.010], [0.104, 0.070], [0.092, 0.140], [0.076, 0.180],
    ], 22);
    const seg1 = new THREE.Mesh(crownGeo, mats.robe);
    seg1.position.y = 0.010 * s;
    hat.add(seg1);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.112 * s, 0.114 * s, 0.034 * s, 22), mats.robeLo);
    band.position.y = 0.030 * s;
    hat.add(band);
    const bandTrim = new THREE.Mesh(new THREE.TorusGeometry(0.113 * s, 0.005 * s, 5, 24), mats.trim);
    bandTrim.position.y = 0.048 * s;
    bandTrim.rotation.x = Math.PI / 2;
    hat.add(bandTrim);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.019 * s, 0), mats.gem);
    gem.position.set(0, 0.032 * s, 0.108 * s);
    gem.scale.set(0.8, 1.2, 0.5);
    gem.userData.keep = true;
    hat.add(gem);
    this._bentCrown(hat, mats, s, 0.048);
  }

  _buildLuciaHead(s) {
    const mats = this.mats;
    const R = this.faceR, CY = this.faceCY;
    // choker with a small pendant
    add(this.neck, new THREE.CylinderGeometry(0.046 * s, 0.048 * s, 0.018 * s, 14), mats.strap, 0, -0.006 * s, 0.002);
    const pendant = add(this.neck, new THREE.OctahedronGeometry(0.009 * s, 0), mats.gem, 0, -0.016 * s, 0.048 * s);
    pendant.userData.keep = true;

    // long wavy hair
    const OPEN = 0.80;
    const cap = add(this.head, new THREE.SphereGeometry(
      R * 1.06, 24, 18, Math.PI * 0.5 + OPEN, Math.PI * 2 - OPEN * 2, 0, Math.PI * 0.82
    ), mats.hair, 0, CY, -0.004 * s);
    cap.scale.set(0.92, 1.07, 1.04);
    cap.material.side = THREE.DoubleSide;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(R * 0.97, 18, 12, 0, TAU, 0, Math.PI * 0.47), mats.hair);
    crown.position.set(0, CY + 0.032 * s, -0.014 * s);
    crown.scale.set(0.94, 0.96, 1.05);
    this.head.add(crown);
    const nape = new THREE.Mesh(new THREE.SphereGeometry(0.062 * s, 14, 10), mats.hair);
    nape.position.set(0, CY - 0.042 * s, -0.050 * s);
    nape.scale.set(0.92, 1.1, 0.6);
    this.head.add(nape);
    // centre-parted fringe
    for (const sx of [-1, 1]) {
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(
        R * 1.062, 16, 6, Math.PI * 0.5 + sx * 0.34, 0.52, Math.PI * 0.12, Math.PI * 0.16
      ), mats.hair);
      fringe.position.set(0, CY, -0.004 * s);
      fringe.scale.set(0.92, 1.06, 1.03);
      this.head.add(fringe);
    }
    // wavy locks: upper fixed mass plus animated lower segment per side
    this.pony = [];
    for (const sx of [-1, 1]) {
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.029 * s, 0.13 * s, 4, 8), mats.hair);
      upper.position.set(sx * 0.074 * s, CY - 0.052 * s, 0.008 * s);
      upper.rotation.z = sx * 0.09;
      this.head.add(upper);
      const g1 = new THREE.Group();
      g1.position.set(sx * 0.078 * s, CY - 0.132 * s, 0.006 * s);
      this.head.add(g1);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.025 * s, 0.15 * s, 4, 8), mats.hair);
      lower.position.y = -0.075 * s;
      lower.rotation.z = sx * 0.05;
      g1.add(lower);
      const hi = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075 * s, 0.16 * s, 3, 6), mats.hairHi);
      hi.position.set(sx * 0.014 * s, -0.078 * s, 0.016 * s);
      g1.add(hi);
      this.pony.push(g1);
    }
    const backMass = new THREE.Mesh(new THREE.CapsuleGeometry(0.058 * s, 0.17 * s, 4, 10), mats.hair);
    backMass.position.set(0, CY - 0.130 * s, -0.060 * s);
    backMass.scale.set(1.15, 1, 0.62);
    this.head.add(backMass);

    // smaller hat with the crescent ornament
    const hat = new THREE.Group();
    hat.position.set(0, CY + 0.064 * s, -0.010 * s);
    hat.rotation.set(-0.08, 0, 0.06);
    this.head.add(hat);
    const brim = new THREE.Mesh(latheGeo([
      [0.001, 0.004], [0.056, 0.006], [0.112, 0.012], [0.160, 0.022],
      [0.194, 0.038], [0.214, 0.060], [0.220, 0.088],
    ], 30), mats.robeLo);
    brim.material.side = THREE.DoubleSide;
    hat.add(brim);
    const brimTrim = new THREE.Mesh(new THREE.TorusGeometry(0.214 * s, 0.005 * s, 5, 32), mats.trim);
    brimTrim.position.y = 0.078 * s;
    brimTrim.rotation.x = Math.PI / 2;
    hat.add(brimTrim);
    const seg1 = new THREE.Mesh(latheGeo([
      [0.001, 0.006], [0.100, 0.010], [0.096, 0.070], [0.084, 0.138], [0.068, 0.176],
    ], 22), mats.robe);
    seg1.position.y = 0.010 * s;
    hat.add(seg1);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.104 * s, 0.106 * s, 0.032 * s, 22), mats.robeLo);
    band.position.y = 0.028 * s;
    hat.add(band);
    const bandTrim = new THREE.Mesh(new THREE.TorusGeometry(0.105 * s, 0.0045 * s, 5, 24), mats.trim);
    bandTrim.position.y = 0.044 * s;
    bandTrim.rotation.x = Math.PI / 2;
    hat.add(bandTrim);
    const moon = new THREE.Mesh(crescentGeo(0.024 * s, 0.0055 * s, 4.2), mats.trim);
    moon.position.set(0, 0.030 * s, 0.102 * s);
    moon.rotation.z = -0.7;
    hat.add(moon);
    this._bentCrown(hat, mats, s, 0.046);
  }

  // two leaning segments plus a curled tip: the sheet's bent witch crown
  _bentCrown(hat, mats, s, rBase) {
    const mid = new THREE.Group();
    mid.position.set(0, 0.186 * s, 0);
    mid.rotation.x = -0.42;
    hat.add(mid);
    const seg2 = new THREE.Mesh(latheGeo([
      [0.001, 0.000], [rBase * 1.5, 0.000], [rBase * 1.38, 0.058], [rBase * 1.10, 0.110], [rBase * 0.84, 0.146],
    ], 18), mats.robe);
    mid.add(seg2);
    const top = new THREE.Group();
    top.position.set(0, 0.146 * s, 0);
    top.rotation.x = -0.72;
    mid.add(top);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(rBase * 0.84, 0.24 * s, 14), mats.robe);
    tip.position.y = 0.11 * s;
    top.add(tip);
    const buckle = new THREE.Mesh(new THREE.TorusGeometry(rBase * 0.92, 0.0055 * s, 4, 14), mats.trim);
    buckle.position.y = 0.006 * s;
    buckle.rotation.x = Math.PI / 2;
    top.add(buckle);
  }

  // -------------------------------------------------------------------------
  _bake() {
    this.group.updateMatrixWorld(true);
    const joints = new Set([
      this.hips, this.chest, this.neck, this.head,
      this.arms.L.shoulder, this.arms.R.shoulder,
      this.arms.L.elbow, this.arms.R.elbow,
      this.arms.L.hand, this.arms.R.hand,
      this.legs.L.hip, this.legs.R.hip,
      this.legs.L.knee, this.legs.R.knee,
      this.legs.L.foot, this.legs.R.foot,
    ]);
    for (const e of this.eyes || []) joints.add(e);
    for (const t of this.tails) for (const seg of t.segs) joints.add(seg);
    if (this.pony) for (const seg of this.pony) joints.add(seg);

    const buckets = new Map();
    const doomed = [];
    const inv = new THREE.Matrix4();
    const rel = new THREE.Matrix4();

    this.group.traverse((o) => {
      if (!o.isMesh || o.userData.keep) return;
      let joint = o.parent;
      while (joint && !joints.has(joint)) {
        if (joint.userData.noBake) return;
        joint = joint.parent;
      }
      if (!joint) return;
      const basic = !!o.material.isMeshBasicMaterial;
      const side = o.material.side;
      const key = joint.uuid + '|' + (basic ? 'b' : 's') + '|' + side;
      let bucket = buckets.get(key);
      if (!bucket) { bucket = { joint, basic, side, geos: [] }; buckets.set(key, bucket); }

      const geo = o.geometry.clone();
      inv.copy(joint.matrixWorld).invert();
      rel.multiplyMatrices(inv, o.matrixWorld);
      geo.applyMatrix4(rel);

      const g2 = geo.index ? geo.toNonIndexed() : geo;
      if (g2 !== geo) geo.dispose();
      for (const name of Object.keys(g2.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g2.deleteAttribute(name);
      }
      if (!g2.attributes.normal) g2.computeVertexNormals();
      if (!g2.attributes.uv) {
        const n = g2.attributes.position.count;
        g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      const col = o.material.color || new THREE.Color(0xffffff);
      bakeColor(g2, col, o.material.roughness ?? 0.6, o.material.metalness ?? 0.0);
      bucket.geos.push(g2);
      doomed.push(o);
    });

    for (const b of buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      if (!merged) continue;
      const mat = b.basic ? bakedNeon(b.side) : bakedMaterial(b.side);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !b.basic;
      mesh.receiveShadow = !b.basic;
      b.joint.add(mesh);
    }
    for (const o of doomed) {
      o.parent?.remove(o);
      o.geometry.dispose();
    }
    this.baked = true;
  }

  _buildGun(type, s) {
    const grp = new THREE.Group();
    const metal = std(0x2a2f36, 0.3, 0.88);
    const polymer = std(0x101216, 0.62, 0.18);
    const accent = std(0x8f959c, 0.2, 0.95);
    const make = (w, h, d, x, y, z, mat = metal) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), mat);
      m.position.set(x * s, y * s, z * s);
      m.castShadow = true;
      grp.add(m);
      return m;
    };
    if (type === 'pistol') {
      make(0.042, 0.052, 0.19, 0, 0.035, 0.05);
      make(0.037, 0.04, 0.055, 0, 0.005, -0.035, polymer);
      const grip = make(0.032, 0.112, 0.05, 0, -0.045, -0.042, polymer);
      grip.rotation.x = -0.28;
      make(0.02, 0.02, 0.13, 0, 0.007, 0.06, accent);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0085 * s, 0.0095 * s, 0.05 * s, 8), accent);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.035, 0.155);
      grp.add(barrel);
      make(0.012, 0.036, 0.014, 0, 0.065, 0.02, accent);
      make(0.006, 0.014, 0.006, 0, 0.086, 0.06, polymer);
      make(0.012, 0.012, 0.02, 0, 0.026, -0.02, std(0xb04bff, 0.3, 0.4));
    } else if (type === 'smg') {
      make(0.055, 0.07, 0.28, 0, 0.035, 0.045);
      make(0.04, 0.05, 0.07, 0, 0.0, -0.075, polymer);
      make(0.03, 0.09, 0.042, 0, -0.05, -0.05, polymer).rotation.x = -0.22;
      make(0.03, 0.13, 0.038, 0, -0.06, 0.09, polymer).rotation.x = 0.14;
      make(0.032, 0.032, 0.2, 0, 0.015, 0.2, metal);
      make(0.024, 0.024, 0.1, 0, 0.085, 0.02, accent);
      make(0.016, 0.02, 0.034, 0, 0.04, 0.19, polymer);
      make(0.028, 0.028, 0.12, 0, 0.0, -0.19, metal);
    } else {
      make(0.05, 0.062, 0.34, 0, 0.035, 0.16);
      make(0.034, 0.06, 0.16, 0, 0.02, -0.05, polymer);
      make(0.032, 0.1, 0.05, 0, -0.045, -0.09, polymer).rotation.x = -0.24;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.019 * s, 0.019 * s, 0.5 * s, 10), metal);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0.052, 0.3);
      grp.add(tube);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.048 * s, 0.042 * s, 0.14 * s), polymer);
      pump.position.set(0, 0.012, 0.27);
      grp.add(pump);
      make(0.026, 0.014, 0.2, 0, 0.085, 0.16, accent);
    }
    return grp;
  }

  setWeapon(type) {
    if (!this.weapons) return;
    for (const k of Object.keys(this.weapons)) this.weapons[k].visible = k === type;
    if (this.weapons[type]) {
      const w = this.weapons[type];
      this.muzzle.position.set(0, 0.035, type === 'shotgun' ? 0.56 : type === 'smg' ? 0.32 : 0.18);
      if (this.muzzle.parent !== w) w.add(this.muzzle);
    }
  }

  setGlowTexture(tex) {
    if (this.handGlow) this.handGlow.material.map = tex;
  }

  // -------------------------------------------------------------------------
  update(dt, st = {}) {
    this.time += dt;
    const speed = clamp(st.speed || 0, 0, 1.2);
    const moving = speed > 0.05;
    const run = st.run ? 1 : 0.6;
    const aim = !!st.aiming;
    const shooting = !!st.shooting;
    const casting = !!st.casting;
    const crouch = !!st.crouch;
    const air = !!st.airborne;
    const drive = !!st.driving;
    const dead = !!st.dead;
    const s = this.isMage ? 1 : 0.945;
    this.phase += dt * (1.9 + speed * (6.2 + run * 2.6));
    this.breath += dt * 1.35;

    const breath = Math.sin(this.breath) * 0.004;
    const bob = moving ? Math.abs(Math.sin(this.phase)) * 0.032 * speed : Math.sin(this.breath * 0.8) * 0.004;
    const baseY = 0.93 * s;
    const crouchDrop = crouch ? 0.3 : 0;
    this.hips.position.y = damp(this.hips.position.y, baseY - crouchDrop + bob + (air ? 0.03 : 0), 15, dt);
    this.hips.position.x = damp(this.hips.position.x, moving ? Math.sin(this.phase) * 0.012 * speed : 0, 8, dt);

    const leanTarget = drive ? 0.12 : crouch ? 0.36 : speed * 0.20 + (air ? -0.06 : 0);
    this.chest.rotation.x = damp(this.chest.rotation.x, leanTarget, 8, dt);
    this.chest.rotation.y = damp(this.chest.rotation.y, (st.turn || 0) * 0.3 + (moving ? Math.sin(this.phase) * 0.06 * speed : 0), 7, dt);
    this.chest.rotation.z = damp(this.chest.rotation.z, moving ? -Math.sin(this.phase) * 0.03 * speed : 0, 7, dt);
    this.chest.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.6);

    const lookY = clamp(st.lookYaw || 0, -0.7, 0.7);
    this.neck.rotation.y = damp(this.neck.rotation.y, lookY, 6, dt);
    this.neck.rotation.x = damp(this.neck.rotation.x, aim ? -0.12 : moving ? Math.sin(this.phase * 0.5) * 0.03 : 0, 5, dt);
    this.blinkTimer -= dt;
    if (this.blinkTimer < 0) {
      this.blinkTimer = rand(2.4, 5.8);
      this.blink = 0;
    }
    this.blink = Math.min(1, this.blink + dt * 7);
    const blinkK = this.blink < 0.5 ? 1 : Math.max(0.08, 1 - (this.blink - 0.5) * 2);
    for (const e of this.eyes) e.scale.y = blinkK;
    if (this.mouth) this.mouth.scale.y = st.speaking ? 0.6 + Math.abs(Math.sin(this.time * 14)) * 1.6 : 1;

    const stride = (moving ? 0.72 : 0.02) * speed;
    const L = this.legs.L, R = this.legs.R;
    let lx, rx, lk, rk, lf, rf;
    if (drive) {
      lx = -1.25; rx = -1.25; lk = 1.4; rk = 1.4; lf = -0.2; rf = -0.2;
    } else if (crouch) {
      lx = -0.95; rx = 0.30; lk = 1.45; rk = 1.20; lf = -0.4; rf = -0.25;
    } else if (air) {
      lx = -0.55; rx = 0.22; lk = 1.15; rk = 0.6; lf = -0.3; rf = -0.1;
    } else if (!moving) {
      lx = 0.02; rx = -0.02; lk = 0.04; rk = 0.04; lf = 0; rf = 0;
      this.hips.rotation.z = damp(this.hips.rotation.z, Math.sin(this.breath * 0.7) * 0.012, 4, dt);
    } else {
      const sw = Math.sin(this.phase);
      lx = sw * stride;
      rx = -sw * stride;
      lk = Math.max(0, -Math.sin(this.phase + 0.5)) * 0.95 * speed + 0.04;
      rk = Math.max(0, Math.sin(this.phase + 0.5)) * 0.95 * speed + 0.04;
      lf = -lk * 0.45 + (sw > 0 ? 0.12 : -0.05) * speed;
      rf = -rk * 0.45 + (-sw > 0 ? 0.12 : -0.05) * speed;
      this.hips.rotation.z = damp(this.hips.rotation.z, Math.sin(this.phase) * 0.035 * speed, 8, dt);
    }
    if (dead) { lx = 0.25; rx = 0.25; lk = 0.15; rk = 0.15; }
    L.hip.rotation.x = damp(L.hip.rotation.x, lx, 16, dt);
    R.hip.rotation.x = damp(R.hip.rotation.x, rx, 16, dt);
    L.hip.rotation.z = damp(L.hip.rotation.z, -0.02, 8, dt);
    R.hip.rotation.z = damp(R.hip.rotation.z, 0.02, 8, dt);
    L.knee.rotation.x = damp(L.knee.rotation.x, lk, 16, dt);
    R.knee.rotation.x = damp(R.knee.rotation.x, rk, 16, dt);
    L.foot.rotation.x = damp(L.foot.rotation.x, lf, 14, dt);
    R.foot.rotation.x = damp(R.foot.rotation.x, rf, 14, dt);

    let rX, rZ, rY, rE, rS, lX, lZ, lE, lS;
    if (drive) {
      rX = -1.1; rZ = -0.16; rY = 0; rE = 0.6; rS = 0;
      lX = -1.1; lZ = 0.16; lE = 0.6; lS = 0;
    } else if (casting) {
      rX = -1.55; rZ = -0.5; rY = 0; rE = 0.32; rS = 0.9;
      lX = -1.15; lZ = 0.42; lE = -0.5; lS = 0.4;
    } else if (aim || shooting) {
      rX = -1.52; rZ = -0.12; rY = 0; rE = 0.14; rS = 0;
      lX = -1.30; lZ = 0.50; lE = -0.55; lS = 0;
    } else if (crouch) {
      rX = -0.75; rZ = -0.28; rY = 0; rE = 0.7; rS = 0.2;
      lX = -0.75; lZ = 0.28; lE = 0.7; lS = 0.2;
    } else {
      const swing = Math.sin(this.phase) * (0.5 + speed * 0.35) * speed;
      rX = -swing; lX = swing;
      rZ = -0.10 - speed * 0.04; lZ = 0.10 + speed * 0.04;
      rE = -0.16 - speed * 0.45; lE = -0.16 - speed * 0.45;
      rS = 0; lS = 0;
    }
    if (dead) { rX = 0.5; lX = 0.5; rZ = -0.5; lZ = 0.5; rE = 0.2; lE = 0.2; }
    const armDamp = aim || casting ? 22 : 13;
    const aR = this.arms.R, aL = this.arms.L;
    aR.shoulder.rotation.x = damp(aR.shoulder.rotation.x, rX, armDamp, dt);
    aR.shoulder.rotation.y = damp(aR.shoulder.rotation.y, rY || 0, armDamp, dt);
    aR.shoulder.rotation.z = damp(aR.shoulder.rotation.z, rZ, armDamp, dt);
    aR.elbow.rotation.x = damp(aR.elbow.rotation.x, rE, armDamp, dt);
    aR.hand.rotation.x = damp(aR.hand.rotation.x, (rS || 0) * 0.3, armDamp, dt);
    aL.shoulder.rotation.x = damp(aL.shoulder.rotation.x, lX, armDamp, dt);
    aL.shoulder.rotation.z = damp(aL.shoulder.rotation.z, lZ, armDamp, dt);
    aL.elbow.rotation.x = damp(aL.elbow.rotation.x, lE, armDamp, dt);
    aL.hand.rotation.x = damp(aL.hand.rotation.x, (lS || 0) * 0.3, armDamp, dt);

    if (shooting) {
      aR.shoulder.rotation.x = damp(aR.shoulder.rotation.x, rX + 0.06, 30, dt);
      aR.elbow.rotation.x = damp(aR.elbow.rotation.x, rE + 0.08, 30, dt);
    }

    const back = speed * 0.5 + (air ? 0.55 : 0);
    const side = clamp(st.strafe || 0, -1, 1) * 0.28;
    for (let i = 0; i < this.tails.length; i++) {
      const t = this.tails[i];
      const flare = 0.9 + Math.sin(this.phase * 0.9 + i) * 0.12 * (0.3 + speed);
      for (let k = 0; k < t.segs.length; k++) {
        const seg = t.segs[k];
        const targetX = back * (0.55 + k * 0.3) * flare + Math.sin(this.phase * 0.9 + i + k) * 0.05 * (0.3 + speed);
        const targetZ = side * (0.35 + k * 0.2) + (i - 1) * 0.05;
        seg.rotation.x = damp(seg.rotation.x, targetX, 6 + k * 2, dt);
        seg.rotation.z = damp(seg.rotation.z, targetZ, 5 + k, dt);
      }
    }
    if (this.pony) {
      for (let i = 0; i < this.pony.length; i++) {
        const seg = this.pony[i];
        const ph = this.phase * 0.8 + i * 0.55;
        seg.rotation.x = damp(seg.rotation.x, 0.22 + speed * 0.34 + Math.sin(ph) * 0.09, 7, dt);
        seg.rotation.z = damp(seg.rotation.z, Math.sin(ph * 0.7) * 0.14 + side * 0.5, 6, dt);
      }
    }
    if (this.handGlow) {
      const on = casting ? 1 : 0;
      this.handGlow.material.opacity = damp(this.handGlow.material.opacity, on * 0.85, 12, dt);
      this.handGlow.scale.setScalar(0.3 + Math.sin(this.time * 12) * 0.02 + (casting ? 0.22 : 0));
    }
    if (this.staffCrystal) {
      this.staffCrystal.rotation.y += dt * 1.4;
      this.staffCrystal.position.y = 0.90 * s + Math.sin(this.time * 2) * 0.006;
    }
    if (this.brooch) this.brooch.rotation.y += dt * 0.9;
    if (this.orb) this.orb.rotation.y += dt * 1.6;

    if (dead) {
      this.hips.rotation.x = damp(this.hips.rotation.x, -1.4, 4, dt);
    } else {
      this.hips.rotation.x = damp(this.hips.rotation.x, 0, 9, dt);
    }
  }
}
