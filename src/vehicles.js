import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TAU, clamp, damp, lerp, rand, pick, addVertexColor, merge, mulberry32 } from './util.js';

// ---------------------------------------------------------------------------
// Vehicle geometry is built with the length along +Z, so local forward matches
// the driving direction used by the physics (dx = sin(yaw), dz = cos(yaw)).
// Every part of the shell is merged into one vertex-coloured mesh; wheels are
// four merged meshes on steer pivots. That keeps a car at ~9 draw calls
// instead of the old ~80 while looking far more like a real car.
// ---------------------------------------------------------------------------

const MAT = {
  body: new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0.66, roughness: 0.30, envMapIntensity: 1.45,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x22303f, metalness: 0.28, roughness: 0.06, transparent: true, opacity: 0.90,
    envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide,
    ior: 1.45, specularIntensity: 1,
  }),
  light: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  wheel: new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0.42, roughness: 0.52, envMapIntensity: 1.15,
  }),
  trim: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.42, envMapIntensity: 1.1 }),
};

const TYPES = {
  sports: {
    maxSpeed: 41, accel: 15.5, turn: 1.95, radius: 1.35, mass: 1,
    w: 1.74, bodyH: 0.52, cabinH: 0.36, len: 4.42,
    cabinW: 1.50, cabinL: 1.86, cabinZ: -0.26, bodyLift: 0.02,
    wheelR: 0.36, wheelBase: 1.36, track: 0.90,
    color: 0xff2e88,
  },
  sedan: {
    maxSpeed: 32, accel: 10.5, turn: 1.62, radius: 1.4, mass: 1.1,
    w: 1.72, bodyH: 0.56, cabinH: 0.44, len: 4.60,
    cabinW: 1.54, cabinL: 2.10, cabinZ: -0.08, bodyLift: 0.04,
    wheelR: 0.34, wheelBase: 1.40, track: 0.88,
    color: 0x5a7a96,
  },
  muscle: {
    maxSpeed: 37, accel: 13, turn: 1.68, radius: 1.4, mass: 1.15,
    w: 1.78, bodyH: 0.58, cabinH: 0.38, len: 4.75,
    cabinW: 1.50, cabinL: 1.96, cabinZ: -0.30, bodyLift: 0.03,
    wheelR: 0.37, wheelBase: 1.42, track: 0.90,
    color: 0x2a2f3a,
  },
  suv: {
    maxSpeed: 30, accel: 9.5, turn: 1.46, radius: 1.5, mass: 1.3,
    w: 1.82, bodyH: 0.70, cabinH: 0.52, len: 4.90,
    cabinW: 1.62, cabinL: 2.65, cabinZ: -0.14, bodyLift: 0.08,
    wheelR: 0.42, wheelBase: 1.48, track: 0.92,
    color: 0xd8d2c4,
  },
  van: {
    maxSpeed: 26, accel: 7.5, turn: 1.30, radius: 1.65, mass: 1.5,
    w: 1.92, bodyH: 0.88, cabinH: 0.60, len: 5.40,
    cabinW: 1.72, cabinL: 3.45, cabinZ: -0.16, bodyLift: 0.08,
    wheelR: 0.40, wheelBase: 1.64, track: 0.96,
    color: 0xc9c5bb,
  },
  police: {
    maxSpeed: 36, accel: 13, turn: 1.72, radius: 1.4, mass: 1.2,
    w: 1.75, bodyH: 0.56, cabinH: 0.44, len: 4.62,
    cabinW: 1.56, cabinL: 2.12, cabinZ: -0.08, bodyLift: 0.04,
    wheelR: 0.34, wheelBase: 1.41, track: 0.89,
    color: 0x1b2436,
  },
  bike: {
    maxSpeed: 35, accel: 12, turn: 2.3, radius: 0.8, mass: 0.6, isBike: true,
    color: 0x22262d,
  },
  boat: {
    maxSpeed: 26, accel: 8, turn: 1.35, radius: 1.8, mass: 2, isBoat: true,
    color: 0xe8e4da,
  },
};

function rounded(w, h, d, r = 0.08) {
  return new RoundedBoxGeometry(w, h, d, 1, Math.min(r, Math.min(w, h, d) * 0.3));
}

// Non-indexed box with a smaller top face: windscreen and rear window slopes.
function wedgeGeo(w, h, d, topW, topD, topZ = 0) {
  const hw = w / 2, hd = d / 2, tw = topW / 2, td = topD / 2;
  const v = [
    [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
    [-tw, h, -td + topZ], [tw, h, -td + topZ], [tw, h, td + topZ], [-tw, h, td + topZ],
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3],
    [4, 6, 5], [4, 7, 6],
    [0, 4, 5], [0, 5, 1],
    [3, 2, 6], [3, 6, 7],
    [0, 3, 7], [0, 7, 4],
    [1, 5, 6], [1, 6, 2],
  ];
  const pos = [], uv = [];
  for (const f of faces) {
    for (const i of f) {
      pos.push(v[i][0], v[i][1], v[i][2]);
      uv.push(v[i][0] / w + 0.5, v[i][1] / Math.max(h, 0.001) * 0.5 + 0.5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const flat = (g) => (g.index ? g.toNonIndexed() : g);

// ---------------------------------------------------------------------------
// Lofted bodywork. A car is described as a run of cross-sections along +Z, each
// a rounded rectangle of a given width, height and centre. Connecting them
// produces a shell that tapers at the nose and tail and swells at the doors —
// the thing that makes a silhouette read as a car instead of a slab.
// ---------------------------------------------------------------------------
function ringPoints(w, h, r, n = 24) {
  const hw = Math.max(0.001, w / 2), hh = Math.max(0.001, h / 2);
  r = Math.min(r, Math.min(hw, hh) * 0.98);
  const pts = [];
  const per = Math.max(3, Math.round(n / 4));
  const arcs = [
    [hw - r, hh - r, 0, Math.PI / 2],
    [-hw + r, hh - r, Math.PI / 2, Math.PI],
    [-hw + r, -hh + r, Math.PI, Math.PI * 1.5],
    [hw - r, -hh + r, Math.PI * 1.5, Math.PI * 2],
  ];
  for (const [cx, cy, a0, a1] of arcs) {
    for (let i = 0; i < per; i++) {
      const ang = a0 + (a1 - a0) * (i / per);
      pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
  }
  return pts;
}

function loftGeo(sections, n = 24) {
  const rings = sections.map(s => ringPoints(s.w, s.h, s.r ?? 0.06, n).map(([x, y]) => [x, y + s.y, s.z]));
  const pos = [], idx = [];
  const per = rings[0].length;
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  for (let s = 0; s < rings.length - 1; s++) {
    const a = s * per, b = (s + 1) * per;
    for (let i = 0; i < per; i++) {
      const j = (i + 1) % per;
      idx.push(a + i, b + i, a + j);
      idx.push(a + j, b + i, b + j);
    }
  }
  // caps so the shell is closed
  const last = (rings.length - 1) * per;
  for (let i = 1; i < per - 1; i++) {
    idx.push(0, i + 1, i);
    idx.push(last, last + i, last + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    uv[i * 2] = (pos[i * 3] + 2) * 0.25;
    uv[i * 2 + 1] = (pos[i * 3 + 1] + 2) * 0.25;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g.toNonIndexed();
}

// one merged mesh per wheel: tyre, rim, hub and spokes
const wheelGeoCache = new Map();
function wheelGeo(r, width) {
  const key = r.toFixed(3) + ':' + width.toFixed(3);
  if (wheelGeoCache.has(key)) return wheelGeoCache.get(key);
  const geos = [];
  const push = (g, col, jitter = 0.04) => { const ng = flat(g); addVertexColor(ng, col, jitter); geos.push(ng); };
  const tire = new THREE.CylinderGeometry(r, r, width, 26, 1);
  tire.rotateZ(Math.PI / 2);
  push(tire, 0x0a0b0e, 0.03);
  // sidewall ring: keeps the tyre from reading as a flat black disc under rim light
  const sidewall = new THREE.TorusGeometry(r * 0.84, r * 0.17, 6, 22);
  sidewall.rotateY(Math.PI / 2);
  push(sidewall, 0x14161a, 0.02);
  const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, width * 1.04, 20);
  rim.rotateZ(Math.PI / 2);
  push(rim, 0xaeb6c0, 0.03);
  const hub = new THREE.CylinderGeometry(r * 0.20, r * 0.20, width * 1.10, 12);
  hub.rotateZ(Math.PI / 2);
  push(hub, 0x24282e, 0.02);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.BoxGeometry(width * 1.06, r * 0.80, 0.05);
    s.rotateX((i / 5) * TAU);
    push(s, 0x9aa2ac, 0.02);
  }
  const merged = merge(geos);
  wheelGeoCache.set(key, merged);
  return merged;
}

export class Vehicle {
  constructor(game, type, x, z, yaw = 0, opts = {}) {
    this.game = game;
    this.type = type;
    this.cfg = TYPES[type] || TYPES.sedan;
    this.isBoat = !!this.cfg.isBoat;
    this.isBike = !!this.cfg.isBike;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = yaw;
    this.speed = 0;
    this.steer = 0;
    this.damage = 0;
    this.fuel = 100;
    this.engine = 100;
    this.radius = this.cfg.radius;
    this.color = opts.color ?? this.cfg.color;
    const names = { sports: 'LUZ-26', muscle: 'INFERNO', sedan: 'SEDAN', suv: 'RANCH', van: 'HAULER', police: 'PATROL', bike: 'VOLT', boat: 'TIDE' };
    this.name = opts.name || names[type] || type.toUpperCase();
    this.driver = null;
    this.occupied = false;
    this.parked = true;
    this.group = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.group.add(this.bodyGroup);
    this.group.position.copy(this.pos);
    this.group.rotation.y = yaw;
    this.parts = [];
    this.detached = [];
    this.smokeT = 0;
    this.wheelSpin = 0;
    this.wheels = [];
    this._build();
    this.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    game.scene.add(this.group);
    if (this.isBoat) this.group.position.y = -0.18;
  }

  _build() {
    if (this.isBike) return this._buildBike();
    if (this.isBoat) return this._buildBoat();
    return this._buildCar();
  }

  _buildCar() {
    const cfg = this.cfg;
    const color = this.color;
    const W = cfg.w, L = cfg.len, BH = cfg.bodyH, CH = cfg.cabinH;
    const wheelR = cfg.wheelR;
    const bottom = wheelR + cfg.bodyLift;
    const bodyY = bottom + BH / 2;
    const bodyTop = bottom + BH;
    const parts = [];
    const glassParts = [];
    const lightParts = [];

    const add = (g, col, arr = parts) => {
      const ng = flat(g);
      addVertexColor(ng, col, 0.045);
      arr.push(ng);
      return ng;
    };

    // Body: a lofted shell from tail to nose. Sections pinch in at the ends and
    // swell at the doors, which is what a slab can never do.
    const nose = L / 2, tail = -L / 2;
    const tubH = BH * 0.62;
    const sillY = bottom + tubH * 0.50;
    const shoulderY = bottom + BH * 0.80;
    const sections = [
      { z: tail, w: W * 0.72, h: tubH * 0.66, y: bottom + tubH * 0.42, r: 0.10 },
      { z: tail + L * 0.06, w: W * 0.92, h: tubH * 0.92, y: sillY, r: 0.12 },
      { z: tail + L * 0.20, w: W * 0.99, h: tubH, y: sillY, r: 0.13 },
      { z: tail + L * 0.42, w: W, h: tubH * 1.02, y: sillY, r: 0.13 },
      { z: 0, w: W * 0.995, h: tubH * 1.02, y: sillY, r: 0.13 },
      { z: L * 0.30, w: W * 0.985, h: tubH * 0.98, y: sillY, r: 0.13 },
      { z: L * 0.44, w: W * 0.93, h: tubH * 0.88, y: sillY - BH * 0.02, r: 0.12 },
      { z: nose - L * 0.02, w: W * 0.80, h: tubH * 0.66, y: bottom + tubH * 0.44, r: 0.10 },
    ];
    add(loftGeo(sections, 22), color);
    // upper body / shoulders: another loft above the beltline, slightly narrower
    const upperSections = [
      { z: tail + L * 0.02, w: W * 0.82, h: BH * 0.22, y: shoulderY - BH * 0.10, r: 0.06 },
      { z: tail + L * 0.20, w: W * 0.98, h: BH * 0.26, y: shoulderY - BH * 0.11, r: 0.07 },
      { z: 0, w: W * 0.995, h: BH * 0.26, y: shoulderY - BH * 0.11, r: 0.07 },
      { z: L * 0.30, w: W * 0.96, h: BH * 0.24, y: shoulderY - BH * 0.10, r: 0.07 },
      { z: nose - L * 0.03, w: W * 0.82, h: BH * 0.18, y: shoulderY - BH * 0.09, r: 0.05 },
    ];
    add(loftGeo(upperSections, 22), color);
    // bonnet / boot decks finish the top surfaces
    add(rounded(W * 0.90, BH * 0.10, L * 0.30, 0.05).translate(0, shoulderY - BH * 0.05, L * 0.30), color);
    add(rounded(W * 0.88, BH * 0.09, L * 0.17, 0.04).translate(0, shoulderY - BH * 0.06, -L * 0.36), color);
    // beltline crease down each flank
    for (const sx of [-1, 1]) {
      add(rounded(0.035, BH * 0.055, L * 0.74, 0.012).translate(sx * (W / 2 - 0.01), shoulderY - BH * 0.10, -L * 0.02), 0x000000);
    }

    // greenhouse: glass sides and screens with a body-coloured roof
    const cabW = cfg.cabinW, cabL = cfg.cabinL;
    const cabBase = bodyTop - 0.03;
    const glass = wedgeGeo(cabW, CH, cabL, cabW * 0.92, cabL * 0.62, -cabL * 0.05);
    glass.translate(0, cabBase, cfg.cabinZ);
    add(glass, 0x1b2836, glassParts);
    // roof panel
    add(rounded(cabW * 0.88, 0.07, cabL * 0.54, 0.03).translate(0, cabBase + CH - 0.02, cfg.cabinZ - cabL * 0.07), color);
    // A/B/C pillars
    for (const sx of [-1, 1]) {
      add(rounded(0.05, CH * 0.94, 0.10, 0.02).translate(sx * cabW * 0.47, cabBase + CH * 0.47, cfg.cabinZ + cabL * 0.40), color);
      add(rounded(0.05, CH * 0.94, 0.09, 0.02).translate(sx * cabW * 0.47, cabBase + CH * 0.47, cfg.cabinZ - cabL * 0.40), color);
      add(rounded(0.05, CH * 0.90, 0.07, 0.02).translate(sx * cabW * 0.47, cabBase + CH * 0.46, cfg.cabinZ), color);
    }

    // wheel arches: a thin dark lip follows each opening. A capped cylinder
    // reads as a solid disc from the side, so this is a shallow torus arc that
    // only suggests the flare.
    for (const sx of [-1, 1]) {
      for (const wz of [cfg.wheelBase, -cfg.wheelBase]) {
        const flare = new THREE.TorusGeometry(wheelR * 1.05, 0.045, 6, 16, Math.PI);
        flare.rotateY(Math.PI / 2);
        flare.translate(sx * (W / 2 - 0.015), wheelR, wz);
        add(flare, 0x0d0f13);
      }
    }

    // bumpers and rocker panels
    add(rounded(W * 0.99, 0.26, 0.26, 0.07).translate(0, bottom + 0.13, L / 2 - 0.02), 0x14171c);
    add(rounded(W * 0.99, 0.26, 0.26, 0.07).translate(0, bottom + 0.13, -L / 2 + 0.02), 0x14171c);
    for (const sx of [-1, 1]) {
      add(rounded(0.07, 0.13, L * 0.40, 0.03).translate(sx * (tubW / 2 + 0.02), bottom + 0.06, 0), 0x111418);
    }
    // grille and splitter
    add(rounded(W * 0.42, BH * 0.22, 0.04, 0.02).translate(0, bottom + BH * 0.44, L / 2 + 0.004), 0x0b0d11);
    add(rounded(W * 0.88, 0.06, 0.34, 0.02).translate(0, bottom + 0.02, L / 2 + 0.06), 0x0d0f13);

    // mirrors on stalks
    for (const sx of [-1, 1]) {
      add(rounded(0.06, 0.03, 0.10, 0.01).translate(sx * (W / 2 + 0.02), bodyTop + CH * 0.26, cfg.cabinZ + cabL * 0.36), 0x14171c);
      add(rounded(0.15, 0.09, 0.19, 0.03).translate(sx * (W / 2 + 0.10), bodyTop + CH * 0.30, cfg.cabinZ + cabL * 0.36), color);
    }

    // headlights / taillights: small and inset, so bloom does not blow them out
    const ly = bottom + BH * 0.60;
    for (const sx of [-1, 1]) {
      add(rounded(W * 0.19, BH * 0.13, 0.035, 0.015).translate(sx * W * 0.31, ly, L / 2 + 0.010), 0xffe9c4, lightParts);
      add(rounded(W * 0.19, BH * 0.11, 0.035, 0.015).translate(sx * W * 0.31, ly, -L / 2 - 0.010), 0xd81b2c, lightParts);
      // indicator
      add(rounded(W * 0.07, BH * 0.07, 0.03, 0.01).translate(sx * W * 0.44, ly - BH * 0.02, L / 2 + 0.008), 0xffa63c, lightParts);
    }

    // type-specific extras
    if (this.type === 'sports') {
      add(rounded(W * 0.78, 0.05, 0.28, 0.02).translate(0, bodyTop + BH * 0.02, -L / 2 + 0.14), 0x111318);
      for (const sx of [-1, 1]) {
        add(rounded(0.05, 0.20, 0.05, 0.02).translate(sx * W * 0.34, bodyTop - BH * 0.08, -L / 2 + 0.14), 0x111318);
      }
      // side intakes ahead of the rear wheels
      for (const sx of [-1, 1]) {
        add(rounded(0.03, BH * 0.20, 0.5, 0.01).translate(sx * (W / 2 + 0.005), bottom + BH * 0.36, -L * 0.14), 0x0d0f13);
      }
    }
    if (this.type === 'police') {
      add(rounded(1.35, 0.12, 0.36, 0.04).translate(0, cabBase + CH + 0.05, cfg.cabinZ), 0x0a0d12);
      add(rounded(0.26, 0.11, 0.26, 0.02).translate(-0.34, cabBase + CH + 0.16, cfg.cabinZ), 0xe02636, lightParts);
      add(rounded(0.26, 0.11, 0.26, 0.02).translate(0.34, cabBase + CH + 0.16, cfg.cabinZ), 0x2f7bff, lightParts);
      add(rounded(W * 0.82, BH * 0.20, 0.04, 0.02).translate(0, bottom + BH * 0.42, L * 0.03), 0xe8e8e4);
      add(rounded(W * 0.82, BH * 0.16, 0.04, 0.02).translate(0, bottom + BH * 0.42, -L * 0.20), 0xe8e8e4);
    }
    if (this.type === 'van' || this.type === 'suv') {
      for (const sx of [-1, 1]) {
        add(rounded(0.055, 0.05, cabL * 0.78, 0.02).translate(sx * cabW * 0.40, cabBase + CH + 0.02, cfg.cabinZ), 0x1a1d22);
      }
    }
    // exhaust tips
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.042, 0.048, 0.14, 8).rotateX(Math.PI / 2).translate(sx * W * 0.24, bottom + 0.09, -L / 2 - 0.04), 0x2b2e33);
    }

    this.bodyMesh = new THREE.Mesh(merge(parts), MAT.body);
    this.bodyGroup.add(this.bodyMesh);
    this.glassMesh = new THREE.Mesh(merge(glassParts), MAT.glass);
    this.glassMesh.castShadow = false;
    this.bodyGroup.add(this.glassMesh);
    this.lightMesh = new THREE.Mesh(merge(lightParts), MAT.light);
    this.bodyGroup.add(this.lightMesh);

    // underglow for the hero sports car
    if (this.type === 'sports') {
      const ug = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.15, L * 1.05), new THREE.MeshBasicMaterial({
        color: 0xff2e88, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      }));
      ug.rotation.x = -Math.PI / 2;
      ug.position.y = 0.05;
      this.bodyGroup.add(ug);
      this.underglow = ug;
    }

    this._buildWheels(wheelR, cfg.track, cfg.wheelBase);
  }

  _buildWheels(wheelR, track, base) {
    const geo = wheelGeo(wheelR, 0.26);
    for (const wz of [base, -base]) {
      for (const sx of [-1, 1]) {
        const steerPivot = new THREE.Group();
        steerPivot.position.set(sx * track, wheelR, wz);
        const spinGroup = new THREE.Group();
        steerPivot.add(spinGroup);
        const tire = new THREE.Mesh(geo, MAT.wheel);
        spinGroup.add(tire);
        this.bodyGroup.add(steerPivot);
        this.wheels.push({ group: steerPivot, spin: spinGroup, front: wz > 0, side: sx });
      }
    }
  }

  _buildBike() {
    const parts = [];
    const dark = 0x14161a;
    const metal = 0x777f88;
    const add = (g, col) => { const ng = flat(g); addVertexColor(ng, col, 0.04); parts.push(ng); };
    add(rounded(0.22, 0.22, 1.25, 0.03).translate(0, 0.72, 0), this.color);
    add(rounded(0.34, 0.30, 0.55, 0.04).translate(0, 0.98, 0.12), dark);
    add(rounded(0.18, 0.14, 0.50, 0.03).translate(0, 0.36, 0.10), metal);
    add(rounded(0.07, 0.70, 0.07, 0.02).translate(0, 0.62, 0.72), metal);
    add(rounded(0.62, 0.06, 0.06, 0.02).translate(0, 0.98, 0.72), dark);
    add(rounded(0.06, 0.30, 0.06, 0.02).translate(0.30, 0.50, 0.72), metal);
    add(rounded(0.06, 0.30, 0.06, 0.02).translate(-0.30, 0.50, 0.72), metal);
    add(rounded(0.32, 0.08, 0.50, 0.03).translate(0, 1.00, -0.55), dark);
    this.bodyMesh = new THREE.Mesh(merge(parts), MAT.body);
    this.bodyGroup.add(this.bodyMesh);

    this.wheels = [];
    const geo = wheelGeo(0.36, 0.16);
    for (const wz of [0.80, -0.80]) {
      const wg = new THREE.Group();
      wg.position.set(0, 0.36, wz);
      const spin = new THREE.Group();
      wg.add(spin);
      spin.add(new THREE.Mesh(geo, MAT.wheel));
      this.bodyGroup.add(wg);
      this.wheels.push({ group: wg, spin, front: wz > 0, side: 1 });
    }
    this.parts = [];
  }

  _buildBoat() {
    const parts = [];
    const white = 0xe8e4da;
    const add = (g, col) => { const ng = flat(g); addVertexColor(ng, col, 0.04); parts.push(ng); };
    add(rounded(4.2, 0.70, 8.4, 0.14).translate(0, 0.55, 0), white);
    add(rounded(3.4, 0.50, 3.0, 0.10).translate(0, 0.95, 1.4), white);
    add(rounded(2.6, 0.60, 2.2, 0.08).translate(0, 1.30, 0.2), 0x2a343d);
    add(rounded(2.9, 0.90, 2.6, 0.10).translate(0, 1.45, -1.0), white);
    const bow = new THREE.ConeGeometry(2.0, 3.4, 4);
    bow.rotateX(Math.PI / 2);
    bow.rotateY(Math.PI / 4);
    bow.scale(1, 0.5, 1);
    bow.translate(0, 0.55, 5.2);
    add(bow, white);
    add(rounded(3.0, 0.10, 2.2, 0.04).translate(0, 1.22, -2.2), 0x2b333a);
    this.bodyMesh = new THREE.Mesh(merge(parts), MAT.body);
    this.bodyGroup.add(this.bodyMesh);

    this.lightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false }));
    this.lightMesh.position.set(0, 1.0, 3.0);
    this.bodyGroup.add(this.lightMesh);
    this.wheels = [];
    this.parts = [];
    this.group.position.y = -0.25;
  }

  get steering() { return this.steer; }

  setControl(c) { this.controls = c; }

  enter(hero) {
    this.driver = hero;
    this.occupied = true;
    this.parked = false;
    hero.inVehicle = this;
    hero.group.visible = false;
    hero.vehiclePose = true;
    if (this.isBike) {
      hero.group.visible = true;
      hero.group.position.copy(this.pos);
      hero.group.rotation.y = this.yaw;
      hero.group.scale.setScalar(0.9);
    }
  }

  exit(hero) {
    const sx = this.pos.x + Math.cos(this.yaw) * 1.9;
    const sz = this.pos.z - Math.sin(this.yaw) * 1.9;
    const pos = { x: sx, z: sz };
    this.game.world.collideCircle(pos, 0.45);
    hero.group.position.set(pos.x, 0, pos.z);
    hero.group.visible = true;
    hero.group.scale.setScalar(1);
    hero.vehiclePose = false;
    hero.inVehicle = null;
    this.driver = null;
    this.occupied = false;
    this.speed *= 0.4;
  }

  addFuel(n) {
    this.fuel = clamp(this.fuel + n, 0, 100);
    this.engine = clamp(this.engine + n * 0.15, 0, 100);
  }

  applyDamage(n, at = null) {
    this.damage = clamp(this.damage + n, 0, 100);
    this.engine = clamp(this.engine - n * 0.65, 0, 100);
    if (this.damage > 60 && Math.random() < 0.3) this.game.fx?.smoke(this.pos, this.damage / 100);
    if (this.damage > 25 && this.bodyMesh) {
      const s = 1 - (this.damage - 25) * 0.0008;
      this.bodyGroup.scale.set(1, s, 1);
    }
    if (at) this.game.fx?.sparks(at, null, 10);
  }

  update(dt, playerVehicle = false) {
    const ctrl = this.controls || { throttle: 0, steer: 0, brake: false };
    const world = this.game.world;
    const onWater = world.isWater(this.pos.x, this.pos.z);
    if (!this.isBoat && onWater) this.speed *= 0.85;
    if (this.isBoat && !onWater) this.speed *= 0.90;

    const throttle = this.driver ? (ctrl.throttle || 0) : 0;
    const steerInput = this.driver ? (ctrl.steer || 0) : 0;
    const rain = world.rain || 0;
    const storm = world.storm || 0;
    const grip = 1 - rain * 0.18 - storm * 0.22;
    const maxSpeed = this.cfg.maxSpeed * (0.55 + 0.45 * this.engine / 100) * (1 - this.damage * 0.0022) * (1 - storm * 0.14);
    const canDrive = this.fuel > 0;

    // ---- longitudinal ------------------------------------------------------
    if (canDrive && throttle > 0.05) {
      this.speed += this.cfg.accel * throttle * dt;
    } else if (canDrive && throttle < -0.05) {
      // brake first, then reverse once stopped
      if (this.speed > 0.4) this.speed -= this.cfg.accel * 1.4 * Math.abs(throttle) * dt;
      else this.speed -= this.cfg.accel * 0.55 * Math.abs(throttle) * dt;
    } else {
      // engine braking + rolling resistance: the car actually comes to rest
      const decel = (this.driver ? 7.0 : 4.5) + Math.abs(this.speed) * 0.35;
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), decel * dt);
    }
    if (ctrl.brake) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 30 * dt);
    }
    // aerodynamic drag
    this.speed -= this.speed * 0.28 * dt;
    if (!canDrive) this.speed -= this.speed * 1.4 * dt;
    this.speed = clamp(this.speed, -12, maxSpeed);
    if (Math.abs(this.speed) < 0.06) this.speed = 0;

    // ---- steering ----------------------------------------------------------
    this.steer = damp(this.steer, clamp(steerInput, -1, 1), steerInput ? 11 : 16, dt);
    const speedFactor = clamp(Math.abs(this.speed) / 7, 0, 1);
    const reverse = this.speed < 0 ? -1 : 1;
    let turn = -this.steer * this.cfg.turn * speedFactor * grip * reverse;
    if (rain > 0.25 && Math.abs(this.speed) > 16) turn *= 0.82;
    if (storm > 0.5 && this.driver) {
      this.yaw += Math.sin(this.game.elapsed * 2.1 + this.pos.x * 0.1) * 0.012 * storm;
    }
    this.yaw += turn * dt;

    const dx = Math.sin(this.yaw) * this.speed * dt;
    const dz = Math.cos(this.yaw) * this.speed * dt;
    const oldX = this.pos.x, oldZ = this.pos.z;
    this.pos.x += dx;
    this.pos.z += dz;

    // ---- world collision ---------------------------------------------------
    const hit = world.collideCircle(this.pos, this.radius);
    if (hit) {
      const impact = Math.abs(this.speed);
      this.pos.x -= dx * 0.15;
      this.pos.z -= dz * 0.15;
      this.speed *= -0.18;
      if (impact > 6) {
        this.applyDamage(impact * 0.65, this.pos);
        this.game.cameraShake?.(Math.min(0.5, impact * 0.02));
        this.game.audio?.play('crash', { vol: Math.min(1, impact / 20) });
      }
    }
    if (!this.isBoat && world.isWater(this.pos.x, this.pos.z)) {
      this.pos.x = oldX; this.pos.z = oldZ;
      this.speed *= -0.1;
    }
    if (this.isBoat && !world.isWater(this.pos.x, this.pos.z)) {
      this.pos.x = oldX; this.pos.z = oldZ;
      this.speed *= -0.1;
    }

    // ---- transform + suspension -------------------------------------------
    this.group.position.set(this.pos.x, this.isBoat ? -0.25 + Math.sin(this.game.elapsed * 1.1) * 0.04 : 0, this.pos.z);
    this.group.rotation.y = this.yaw;
    const roll = -this.steer * clamp(this.speed / 26, 0, 1) * 0.075;
    this.bodyGroup.rotation.z = damp(this.bodyGroup.rotation.z, roll, 7, dt);
    const pitch = (throttle > 0 ? -0.018 : throttle < 0 ? 0.022 : 0) * clamp(Math.abs(this.speed) / 20, 0, 1);
    this.bodyGroup.rotation.x = damp(this.bodyGroup.rotation.x, pitch, 5, dt);
    this.group.rotation.z = this.isBoat ? Math.sin(this.game.elapsed * 0.9) * 0.02 : 0;

    // ---- wheels ------------------------------------------------------------
    const wr = this.cfg.wheelR || 0.35;
    this.wheelSpin += this.speed * dt / wr;
    if (this.wheelSpin > TAU * 32) this.wheelSpin -= TAU * 32;
    for (const w of this.wheels) {
      if (w.spin) w.spin.rotation.x = this.wheelSpin;
      if (w.front) w.group.rotation.y = -this.steer * 0.46;
    }
    if (this.underglow) this.underglow.material.opacity = 0.12 + Math.abs(this.speed) * 0.004;

    if (this.driver) {
      this.fuel = Math.max(0, this.fuel - dt * (0.18 + Math.abs(throttle) * 0.55));
      if (Math.abs(this.speed) > 6) {
        for (const a of this.game.crowd.agents) {
          if (a.active && !a.down && a.type === 'ped' && Math.hypot(a.x - this.pos.x, a.z - this.pos.z) < 1.6) {
            a.hp = 0; a.down = true; a.timer = 12;
            this.speed *= 0.85;
            this.game.reportCrime(2, this.pos.x, this.pos.z);
          }
        }
      }
    }
    this.smokeT += dt;
    if (this.damage > 55 && this.smokeT > 0.5) {
      this.smokeT = 0;
      this.game.fx?.smoke(this.pos, this.damage / 100);
    }
  }

  seatPosition() {
    return new THREE.Vector3(this.pos.x, 1.2, this.pos.z);
  }
}

// ---------------------------------------------------------------------------
export class Vehicles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.traffic = [];
    this.rnd = mulberry32(4242);
    this._spawnParked();
    this._buildTraffic();
  }

  _spawnParked() {
    const g = this.game;
    const add = (type, x, z, yaw, opts) => {
      const v = new Vehicle(g, type, x, z, yaw, opts);
      this.list.push(v);
      return v;
    };
    add('sports', 728, 90, Math.PI * 0.86, { color: 0xff2e88, name: 'LUZ-26' });
    add('sedan', 108, -76, Math.PI / 2, { color: 0x5d7f9a });
    add('muscle', -232, 176, -Math.PI / 2, { color: 0x2e3542 });
    add('suv', 476, -68, Math.PI, { color: 0xd8d2c2 });
    add('bike', 742, 248, Math.PI * 0.5, { color: 0x2a1d26 });
    add('van', -790, 880, Math.PI * 0.25, { color: 0xc9c5b9 });
    add('boat', 950, -92, Math.PI * 0.1, { color: 0xeee8da });
    add('police', -96, -300, -Math.PI / 2, { color: 0x1b2436 });
    this.policeCar = this.list[this.list.length - 1];
  }

  _buildTraffic() {
    const w = this.game.world;
    if (!w.trafficEdges.length) return;
    const sed = TYPES.sedan;
    const parts = [];
    const add = (g, col) => { const ng = flat(g); addVertexColor(ng, col, 0.03); parts.push(ng); };
    const bottom = sed.wheelR + sed.bodyLift;
    const bodyTop = bottom + sed.bodyH;
    add(rounded(sed.w, sed.bodyH, sed.len, 0.12).translate(0, bottom + sed.bodyH / 2, 0), 0xffffff);
    add(rounded(sed.w * 0.95, sed.bodyH * 0.22, sed.len * 0.32, 0.05).translate(0, bodyTop - sed.bodyH * 0.06, sed.len * 0.31), 0xffffff);
    add(rounded(sed.w * 0.95, sed.bodyH * 0.16, sed.len * 0.20, 0.04).translate(0, bodyTop - sed.bodyH * 0.07, -sed.len * 0.37), 0xffffff);
    for (const sx of [-1, 1]) {
      for (const wz of [sed.wheelBase, -sed.wheelBase]) {
        const tire = new THREE.CylinderGeometry(sed.wheelR, sed.wheelR, 0.26, 12);
        tire.rotateZ(Math.PI / 2);
        tire.translate(sx * sed.track, sed.wheelR, wz);
        add(tire, 0x0d0e11);
      }
    }
    const geo = merge(parts);
    this.trafficBody = new THREE.InstancedMesh(geo, MAT.body, 24);
    this.trafficBody.frustumCulled = false;
    this.trafficBody.castShadow = true;
    this.trafficBody.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(24 * 3), 3);
    this.game.scene.add(this.trafficBody);

    const cab = wedgeGeo(sed.cabinW, sed.cabinH, sed.cabinL, sed.cabinW * 0.90, sed.cabinL * 0.66, -sed.cabinL * 0.04);
    cab.translate(0, bodyTop - 0.02, sed.cabinZ);
    this.trafficGlass = new THREE.InstancedMesh(cab, MAT.glass, 24);
    this.trafficGlass.frustumCulled = false;
    this.game.scene.add(this.trafficGlass);

    const colors = [0x9a3f3f, 0x3d5f7a, 0xc9c3b4, 0x2f3a34, 0x6a5a72, 0xc28b4a, 0x1e232b, 0xd7d9dc];
    const d = new THREE.Object3D();
    for (let i = 0; i < 22; i++) {
      const edgeRef = w.trafficEdges[Math.floor(this.rnd() * w.trafficEdges.length)];
      const a = this.rnd() < 0.5 ? edgeRef.a : edgeRef.b;
      const b = a === edgeRef.a ? edgeRef.b : edgeRef.a;
      const car = {
        node: a, next: b, t: this.rnd() * edgeRef.dist, dist: edgeRef.dist,
        speed: 7 + this.rnd() * 5, color: colors[i % colors.length],
        scaleY: 0.9 + this.rnd() * 0.35, braking: 0,
      };
      this.traffic.push(car);
      this.trafficBody.setColorAt(i, new THREE.Color(car.color));
    }
    if (this.trafficBody.instanceColor) this.trafficBody.instanceColor.needsUpdate = true;
  }

  nearest(x, z, maxDist = 4.2, needWater = null) {
    let best = null, bd = maxDist;
    for (const v of this.list) {
      if (v.driver) continue;
      if (needWater !== null && v.isBoat !== needWater) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  update(dt) {
    for (const v of this.list) v.update(dt, v === this.game.player?.inVehicle);
    this._updateTraffic(dt);
  }

  _updateTraffic(dt) {
    if (!this.traffic.length) return;
    const d = new THREE.Object3D();
    const p = this.game.player;
    const playerCar = p?.inVehicle;
    for (let i = 0; i < this.traffic.length; i++) {
      const c = this.traffic[i];
      const nx = c.next.x - c.node.x, nz = c.next.z - c.node.z;
      const len = Math.hypot(nx, nz) || 1;
      const dirx = nx / len, dirz = nz / len;
      const rightx = dirz, rightz = -dirx;
      let speed = c.speed;
      if (playerCar) {
        const px = c.node.x + dirx * c.t + rightx * 2.1;
        const pz = c.node.z + dirz * c.t + rightz * 2.1;
        const ddx = px - playerCar.pos.x, ddz = pz - playerCar.pos.z;
        const ahead = ddx * Math.sin(playerCar.yaw) + ddz * Math.cos(playerCar.yaw);
        if (Math.abs(ahead) < 9 && Math.hypot(ddx, ddz) < 8) speed = 0;
      }
      c.t += speed * dt;
      if (c.t >= len) {
        c.t -= len;
        c.node = c.next;
        const opts = c.node.edges;
        let pickE = opts[Math.floor(this.rnd() * opts.length)];
        if (opts.length > 1 && pickE.to === c.prev) pickE = opts[(opts.indexOf(pickE) + 1) % opts.length];
        c.prev = c.node;
        c.next = pickE.to;
        c.dist = pickE.dist;
        c.t = 0;
      }
      const x = c.node.x + dirx * c.t + rightx * 2.1;
      const z = c.node.z + dirz * c.t + rightz * 2.1;
      const yaw = Math.atan2(dirx, dirz);
      d.position.set(x, 0, z);
      d.rotation.set(0, yaw, 0);
      d.scale.set(1, c.scaleY, 1);
      d.updateMatrix();
      this.trafficBody.setMatrixAt(i, d.matrix);
      this.trafficGlass.setMatrixAt(i, d.matrix);
      if (playerCar) {
        const dd = Math.hypot(x - playerCar.pos.x, z - playerCar.pos.z);
        if (dd < 2.7 && Math.abs(playerCar.speed) > 4) {
          playerCar.applyDamage(Math.abs(playerCar.speed) * 0.4, playerCar.pos);
          playerCar.speed *= 0.6;
          this.game.cameraShake?.(0.12);
          this.game.audio?.play('crash', { vol: 0.5 });
        }
      }
    }
    this.trafficBody.instanceMatrix.needsUpdate = true;
    this.trafficGlass.instanceMatrix.needsUpdate = true;
  }
}
