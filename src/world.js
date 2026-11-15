import * as THREE from 'three';
import {
  TAU, clamp, lerp, damp, smoothstep, rand, randInt, pick, chance, mulberry32,
  canvasTexture, buildFacadeTextures, buildSignAtlas, buildAdAtlas, buildGraffitiAtlas,
  asphaltTextures, concreteTexture, sandTexture, grassTexture, glowTexture,
  FACADE, scaleUV, tintGeometry, merge, addVertexColor, circleBox, segmentBox2D,
  fmtTime, districtNames, buildStorefrontTexture,
} from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// ---------------------------------------------------------------------------
// sky
// ---------------------------------------------------------------------------
const SKY_VERT = `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uSunColor, uSunDir, uMoonDir, uCityGlow;
uniform float uNight, uTime, uCloud, uFlash;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), u.x),
             mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y*1.15, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.5));
  float az = atan(d.z, d.x);
  col += uCityGlow * uNight * smoothstep(0.2, -0.05, d.y) * (0.6 + 0.4*sin(az*2.0));
  vec3 sd = normalize(uSunDir);
  float sun = max(dot(d, sd), 0.0);
  col += uSunColor * (pow(sun, 900.0)*5.0 + pow(sun, 24.0)*0.22 + pow(sun, 4.0)*0.04);
  // moon
  vec3 md = normalize(uMoonDir);
  float moon = max(dot(d, md), 0.0);
  col += vec3(0.72,0.82,1.0) * (pow(moon, 3000.0)*8.0 + pow(moon, 60.0)*0.12) * uNight;
  // clouds
  vec2 cuv = d.xz / (d.y + 0.28) * 0.55 + vec2(uTime*0.004, uTime*0.0015);
  float n = fbm(cuv*2.2 + fbm(cuv*4.0));
  float band = smoothstep(0.35, 0.72, n) * smoothstep(0.0, 0.22, d.y) * uCloud;
  vec3 cloudCol = mix(vec3(0.028,0.034,0.055), uSunColor*0.8, 0.85*(1.0-uNight));
  col = mix(col, cloudCol, band*0.82);
  // stars, only where the clouds part
  if(uNight > 0.02 && d.y > 0.0){
    vec2 sp = d.xz / (d.y + 0.18) * 9.0;
    vec2 ip = floor(sp * 80.0);
    float st = hash(ip);
    float tw = 0.65 + 0.35*sin(uTime*2.0 + st*40.0);
    float vis = 1.0 - clamp(band*1.35, 0.0, 1.0);
    col += vec3(0.75,0.82,1.0) * step(0.994, st) * uNight * tw * vis * smoothstep(0.0,0.2,d.y);
  }
  col += uFlash * vec3(0.55,0.6,0.8);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------------------
// water
// ---------------------------------------------------------------------------
const WATER_VERT = `
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const WATER_FRAG = `
varying vec3 vWorld;
uniform float uTime, uNight, uRain, uStorm;
uniform vec3 uDeep, uSky, uSunColor, uSunDir, uFogColor, uNeon;
uniform float uFogDensity;
void main(){
  vec2 p = vWorld.xz;
  float t = uTime;
  // layered medium-scale waves (normals only, analytic)
  float nx = cos(p.x*0.11 + t*0.8)*0.65 + cos((p.x+p.y)*0.27 + t*1.25)*0.38 + cos(p.y*0.53 - t*1.6)*0.2
           + cos(p.x*1.7 + p.y*0.9 + t*3.1)*0.12 + cos(p.y*2.3 - t*2.4)*0.07;
  float nz = cos(p.y*0.11 - t*0.7)*0.65 + cos((p.x-p.y)*0.27 + t*1.1)*0.38 + cos(p.x*0.53 + t*1.4)*0.2
           + cos(p.y*1.7 - p.x*0.9 - t*2.9)*0.12 + cos(p.x*2.3 + t*2.2)*0.07;
  vec3 nor = normalize(vec3(nx*0.2, 1.0, nz*0.2));
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(nor, view), 0.0), 4.0);
  vec3 col = mix(uDeep, uSky*0.5, clamp(fres*1.05 + 0.06, 0.0, 1.0));
  vec3 sd = normalize(uSunDir);
  vec3 r = reflect(-view, nor);
  float sunSpec = pow(max(dot(r, sd), 0.0), 220.0);
  float sunGlint = pow(max(dot(r, sd), 0.0), 28.0);
  col += uSunColor * (sunSpec*3.0 + sunGlint*0.12);
  // moon glitter at night
  vec3 md = normalize(vec3(-sd.x, abs(sd.y)*0.8 + 0.22, -sd.z));
  float moonSpec = pow(max(dot(r, md), 0.0), 260.0);
  col += vec3(0.55,0.7,1.0) * moonSpec * uNight * 2.2;
  // neon shimmer near the city shoreline
  float shore = (1.0 - smoothstep(900.0, 1550.0, vWorld.x)) * (1.0 - smoothstep(650.0, 1000.0, abs(vWorld.z + 200.0)));
  float streak = smoothstep(0.55, 0.95, sin(p.y*0.13 + sin(p.x*0.06 + t*0.3)*2.2)) * (0.35 + 0.65*sin(t*0.6 + p.y*0.02));
  col += uNeon * uNight * shore * (0.035 + streak*0.05);
  col += vec3(0.15,0.55,0.75) * uNight * shore * 0.03;
  // storm chop
  float foam = smoothstep(0.7, 1.0, nx*0.5 + 0.5) * uStorm;
  col = mix(col, vec3(0.5,0.6,0.63), foam*0.22);
  float dist = length(cameraPosition - vWorld);
  float f = 1.0 - exp(-pow(uFogDensity*dist, 2.0));
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------------------

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.renderer = game.renderer;
    this.root = new THREE.Group();
    this.root.name = 'world';
    this.scene.add(this.root);

    this.buildings = [];
    this.colliders = [];
    this.colGrid = new Map();
    this.landRects = [];
    this.roads = [];
    this.vRoads = [];
    this.hRoads = [];
    this.blocks = [];
    this.districts = [];
    this.doors = [];
    this.artifacts = [];
    this.trafficNodes = [];
    this.trafficEdges = [];
    this.lampPools = null;
    this.signMat = null;
    this.atlas = null;

    this.hour = 21.4;
    this.dayLength = 1400; // seconds per 24h
    this.weather = 'clear';
    this.rain = 0;
    this.cloud = 0.22;
    this.storm = 0;
    this.flash = 0;
    this.wind = 0.2;
    this.envTimer = 0;
    this.timeBucket = -1;

    this.cameraPos = new THREE.Vector3();
    this.regionId = 'vice';
    this.owned = [];

    this._buildMaterials();
    this._buildSky();
    this._buildLights();
    this._buildWater();
    this._buildLand();
    this._defineDistricts();
    this._buildRoads();
    this._buildCity();
    this._buildStreetFurniture();
    this._buildVegetation();
    this._buildLandmarks();
    this._buildVenues();
    this._buildDistantSkyline();
    this._buildDoors();
    this._buildArtifacts();
    this._optimizeStatics();
    this.root.traverse(o => {
      if (o.isInstancedMesh) {
        o.frustumCulled = false;
        o.instanceMatrix.needsUpdate = true;
        if (o.instanceColor) o.instanceColor.needsUpdate = true;
      }
    });
    this._updateEnvironment(true);
  }

  // =========================================================================
  _buildMaterials() {
    this.tex = {
      asphalt: asphaltTextures(),
      concrete: concreteTexture('#8a8880'),
      sidewalk: concreteTexture('#9a978e'),
      sand: sandTexture(),
      grass: grassTexture(),
      rock: concreteTexture('#565a5c'),
    };
    this.tex.concrete.repeat.set(1, 1);
    this.facades = buildFacadeTextures();
    this.storeTex = buildStorefrontTexture();
    this.atlas = buildSignAtlas();
    this.ads = buildAdAtlas();
    this.graffiti = buildGraffitiAtlas();

    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.mat = {
      asphalt: std({ map: this.tex.asphalt.map, roughnessMap: this.tex.asphalt.rough, color: 0xa8a8aa, roughness: 0.72, metalness: 0.08, envMapIntensity: 0.85 }),
      sidewalk: std({ map: this.tex.sidewalk, color: 0xb8b5ab, roughness: 0.86, metalness: 0.02 }),
      concrete: std({ map: this.tex.concrete, color: 0x9c9a94, roughness: 0.9 }),
      sand: std({ map: this.tex.sand, color: 0xd6c3a4, roughness: 0.95 }),
      grass: std({ map: this.tex.grass, color: 0x8ea57a, roughness: 0.92 }),
      dirt: std({ map: this.tex.asphalt.map, color: 0x7a6350, roughness: 0.95 }),
      rock: std({ map: this.tex.rock, color: 0x77797a, roughness: 0.9 }),
      roof: std({ map: this.tex.concrete, color: 0x5b5c5e, roughness: 0.95 }),
      trim: std({ map: this.tex.concrete, color: 0x9a958b, roughness: 0.85 }),
      metal: std({ color: 0x3d4348, roughness: 0.38, metalness: 0.85 }),
      darkMetal: std({ color: 0x1a1d22, roughness: 0.5, metalness: 0.7 }),
      white: std({ color: 0xe8e5da, roughness: 0.6 }),
      glass: std({ color: 0x0b1520, roughness: 0.08, metalness: 0.55, transparent: true, opacity: 0.62, envMapIntensity: 1.4 }),
      neon: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      roadMark: std({ color: 0xd8d2bf, roughness: 0.6, emissive: 0x222018, emissiveIntensity: 0.25 }),
      sign: new THREE.MeshBasicMaterial({ map: this.atlas.texture, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }),
      ad: new THREE.MeshBasicMaterial({ map: this.ads.texture, transparent: true, toneMapped: false, side: THREE.DoubleSide }),
      graffiti: new THREE.MeshBasicMaterial({ map: this.graffiti, transparent: true, opacity: 0.85, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffb066, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      neonReflect: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      windowGlass: std({ color: 0x1a2733, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.5 }),
      container: std({ vertexColors: true, roughness: 0.65, metalness: 0.25 }),
    };
    this.facadeMats = {};
    for (const k of Object.keys(this.facades)) {
      const glassy = k === 'glass';
      this.facadeMats[k] = std({
        map: this.facades[k].map,
        emissiveMap: this.facades[k].emissive,
        emissive: 0xffffff,
        emissiveIntensity: 0.0,
        vertexColors: true,
        roughness: glassy ? 0.24 : 0.78,
        metalness: glassy ? 0.55 : 0.06,
        envMapIntensity: glassy ? 1.25 : 0.45,
      });
    }
    this.mat.storefront = std({
      map: this.storeTex.map,
      emissiveMap: this.storeTex.emissive,
      emissive: 0xffffff,
      emissiveIntensity: 0.0,
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.15,
      envMapIntensity: 0.8,
    });
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(4200, 40, 24);
    this.skyUniforms = {
      uTop: { value: new THREE.Color(0x0b1b33) },
      uHorizon: { value: new THREE.Color(0x33233d) },
      uSunColor: { value: new THREE.Color(0xffb070) },
      uSunDir: { value: new THREE.Vector3(0, -1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uCityGlow: { value: new THREE.Color(0x35143a) },
      uNight: { value: 1 },
      uTime: { value: 0 },
      uCloud: { value: 0.2 },
      uFlash: { value: 0 },
    };
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyUniforms,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -100;
    this.root.add(this.sky);
  }

  _buildLights() {
    this.sun = new THREE.DirectionalLight(0xffd9a8, 3.0);
    this.sun.position.set(-120, 160, 60);
    this.sun.castShadow = true;
    const q = this.game.quality;
    this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 420;
    const s = 95;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.035;
    this.root.add(this.sun);
    this.root.add(this.sun.target);

    this.moon = new THREE.DirectionalLight(0x9db8ff, 0.6);
    this.moon.position.set(80, 140, -60);
    this.root.add(this.moon);

    this.hemi = new THREE.HemisphereLight(0x8fb4ff, 0x191520, 0.55);
    this.root.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x4a4f66, 0.22);
    this.root.add(this.ambient);

    // Forward rendering evaluates every light for every pixel, so the budget is
    // deliberately tiny: three street pools that follow the player, plus the
    // hero and blast lights elsewhere. Everything else glows through emissive
    // materials and bloom, which is free.
    this.streetLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffb877, 0, 34, 2);
      l.castShadow = false;
      this.root.add(l);
      this.streetLights.push(l);
    }

    // lightning light
    this.flashLight = new THREE.DirectionalLight(0xcfd8ff, 0);
    this.flashLight.position.set(-100, 200, -60);
    this.root.add(this.flashLight);
  }

  _buildWater() {
    this.waterUniforms = {
      uTime: { value: 0 },
      uNight: { value: 1 },
      uRain: { value: 0 },
      uStorm: { value: 0 },
      uDeep: { value: new THREE.Color(0x021018) },
      uSky: { value: new THREE.Color(0x2b3e58) },
      uSunColor: { value: new THREE.Color(0xffd9a8) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uFogColor: { value: new THREE.Color(0x1a2233) },
      uFogDensity: { value: 0.002 },
      uNeon: { value: new THREE.Color(0xff2e88) },
    };
    const geo = new THREE.PlaneGeometry(12000, 12000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: this.waterUniforms,
    });
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.position.y = -0.55;
    this.water.frustumCulled = false;
    this.water.receiveShadow = false;
    this.root.add(this.water);
  }

  _landSlab(x1, z1, x2, z2, topMat) {
    const w = x2 - x1, d = z2 - z1;
    const geo = new THREE.BoxGeometry(w, 1.4, d);
    const mats = [this.mat.rock, this.mat.rock, topMat, this.mat.rock, this.mat.rock, this.mat.rock];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set((x1 + x2) / 2, -0.7, (z1 + z2) / 2);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.landRects.push({ minX: x1, maxX: x2, minZ: z1, maxZ: z2 });
    return mesh;
  }

  _buildLand() {
    // mainland (Vice City + west wilderness + mountain)
    this._landSlab(-1600, -2000, 940, 520, this.mat.grass);
    // port peninsula
    this._landSlab(-1230, 520, -640, 1270, this.mat.concrete);
    // keys
    this._landSlab(480, 640, 770, 840, this.mat.sand);
    this._landSlab(650, 860, 870, 1030, this.mat.sand);
    this._landSlab(180, 960, 520, 1200, this.mat.sand);
    // swamp islands
    this._landSlab(-170, 700, 130, 900, this.mat.grass);
    this._landSlab(-400, 980, -120, 1140, this.mat.grass);
    // causeway + bridges
    this._landSlab(684, 480, 716, 690, this.mat.concrete);
    this._landSlab(676, 640, 704, 690, this.mat.concrete);
    this._landSlab(590, 820, 616, 990, this.mat.concrete);
    this._landSlab(740, 820, 764, 890, this.mat.concrete);
    // pier
    this._landSlab(920, 300, 1090, 344, this.mat.concrete);
    // marina dock
    this._landSlab(858, -150, 928, -40, this.mat.concrete);

    // city ground
    const city = new THREE.Mesh(new THREE.PlaneGeometry(1440, 1500), this.mat.concrete);
    city.rotation.x = -Math.PI / 2;
    city.position.set(80, 0.015, -250);
    city.receiveShadow = true;
    this.mat.concrete.map.repeat.set(70, 70);
    this.root.add(city);

    // beach sand
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(180, 1480), this.mat.sand);
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(850, 0.02, -250);
    this.mat.sand.map.repeat.set(14, 90);
    beach.receiveShadow = true;
    this.root.add(beach);

    // promenade
    const prom = new THREE.Mesh(new THREE.PlaneGeometry(16, 1480), this.mat.sidewalk);
    prom.rotation.x = -Math.PI / 2;
    prom.position.set(762, 0.03, -250);
    this.root.add(prom);

    // refinery dirt
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(560, 640), this.mat.dirt);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(-1300, 0.022, 280);
    this.mat.dirt.map.repeat.set(40, 40);
    this.root.add(dirt);

    // port concrete overlay
    const port = new THREE.Mesh(new THREE.PlaneGeometry(590, 750), this.mat.concrete);
    port.rotation.x = -Math.PI / 2;
    port.position.set(-935, 0.03, 895);
    this.root.add(port);

    // grass patches for keys
    for (const [x, z, w, d] of [[620, 800, 120, 90], [760, 940, 80, 70], [350, 1080, 140, 100]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.mat.grass);
      g.rotation.x = -Math.PI / 2;
      g.position.set(x, 0.04, z);
      g.receiveShadow = true;
      this.root.add(g);
    }
    // island causeway roads
    this._simpleRoad(700, 480, 700, 700, 22);
    this._simpleRoad(603, 820, 603, 1000, 16);
    this._simpleRoad(752, 820, 752, 900, 12);

    // pier planks detail
    const pier = new THREE.Mesh(new THREE.PlaneGeometry(170, 34), this.mat.concrete);
    pier.rotation.x = -Math.PI / 2;
    pier.position.set(1005, 0.05, 322);
    this.root.add(pier);
    for (let i = 0; i < 18; i++) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 8, 6), this.mat.darkMetal);
      pile.position.set(925 + i * 9, -3.5, 306);
      this.root.add(pile);
      const pile2 = pile.clone();
      pile2.position.z = 338;
      this.root.add(pile2);
    }

    // shoreline rocks
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, this.mat.rock, 90);
    rocks.castShadow = true; rocks.receiveShadow = true;
    const rnd = mulberry32(77);
    for (let i = 0; i < 90; i++) {
      const z = -880 + i * 16 + rnd() * 10;
      const s = 0.8 + rnd() * 2.4;
      _m.makeScale(s * (1 + rnd()), s * 0.7, s * (1 + rnd()));
      _m.setPosition(938 + rnd() * 4, -0.2 + rnd() * 0.2, z);
      rocks.setMatrixAt(i, _m);
    }
    this.root.add(rocks);
  }

  _defineDistricts() {
    this.districts = [
      { id: 'vice', name: 'ВАЙС-СИТИ', center: new THREE.Vector2(80, -240), color: '#ff2e88', desc: 'Неоновый мегаполис' },
      { id: 'keys', name: 'ЛЕОНИДА-КИС', center: new THREE.Vector2(600, 900), color: '#4df3ff', desc: 'Острова и болота' },
      { id: 'grass', name: 'ГРАССРИВЕРС', center: new THREE.Vector2(-1100, -420), color: '#9dff8a', desc: 'Дикая природа' },
      { id: 'port', name: 'ПОРТ-ГЕЛЛХОРН', center: new THREE.Vector2(-940, 900), color: '#ffb657', desc: 'Промышленный порт' },
      { id: 'ambrosia', name: 'АМБРОЗИЯ', center: new THREE.Vector2(-1300, 300), color: '#ff7a45', desc: 'Нефть и байкеры' },
      { id: 'kalaga', name: 'МАУНТ-КАЛАГА', center: new THREE.Vector2(0, -1450), color: '#b58cff', desc: 'Национальный парк' },
    ];
  }

  regionAt(x, z) {
    if (z < -980) return 'kalaga';
    if (x < -980 && z > 80 && z < 700) return 'ambrosia';
    if (x < -600 && z > 500) return 'port';
    if (x < -620 && z <= 80) return 'grass';
    if (z > 520) return 'keys';
    return 'vice';
  }

  // =========================================================================
  _buildRoads() {
    const cityX = [-600, -480, -360, -240, -120, 0, 120, 240, 360, 480, 600, 720];
    const cityZ = [-900, -780, -660, -540, -420, -300, -180, -60, 60, 180, 300, 420];
    const majorX = new Set([0, 360, 600]);
    const majorZ = new Set([-60, 300]);
    this.vRoads = cityX.map(x => ({ x, w: majorX.has(x) ? 24 : 15, z1: -920, z2: 440, axis: 'x' }));
    this.hRoads = cityZ.map(z => ({ z, w: majorZ.has(z) ? 24 : 15, x1: -620, x2: 740, axis: 'z' }));
    this.roads = [...this.vRoads, ...this.hRoads];

    const roadGeos = [];
    const marks = [];
    const sidewalks = [];
    const crosswalks = [];

    // vertical segments between horizontal roads
    for (let i = 0; i < cityZ.length - 1; i++) {
      const z0 = cityZ[i], z1 = cityZ[i + 1];
      const hw0 = majorZ.has(z0) ? 12 : 7.5;
      const hw1 = majorZ.has(z1) ? 12 : 7.5;
      for (const r of this.vRoads) {
        const za = z0 + hw0, zb = z1 - hw1;
        const len = zb - za;
        if (len <= 0) continue;
        const g = new THREE.PlaneGeometry(r.w, len);
        g.rotateX(-Math.PI / 2);
        const uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (r.w / 14), uv.getY(k) * (len / 14));
        g.translate(r.x, 0.04, (za + zb) / 2);
        roadGeos.push(g);
        // centre dashes
        for (let d = 8; d < len - 4; d += 9) {
          const m = new THREE.PlaneGeometry(0.25, 3.2);
          m.rotateX(-Math.PI / 2);
          m.translate(r.x, 0.052, za + d);
          marks.push(m);
        }
        // sidewalk strips
        for (const side of [-1, 1]) {
          const sx = r.x + side * (r.w / 2 + 3.6);
          const sw = new THREE.PlaneGeometry(7.2, len);
          sw.rotateX(-Math.PI / 2);
          scaleUV(sw, 7.2 / 9, len / 9);
          sw.translate(sx, 0.045, (za + zb) / 2);
          sidewalks.push(sw);
        }
      }
    }
    // horizontal segments
    for (let i = 0; i < cityX.length - 1; i++) {
      const x0 = cityX[i], x1 = cityX[i + 1];
      const hw0 = majorX.has(x0) ? 12 : 7.5;
      const hw1 = majorX.has(x1) ? 12 : 7.5;
      for (const r of this.hRoads) {
        const xa = x0 + hw0, xb = x1 - hw1;
        const len = xb - xa;
        if (len <= 0) continue;
        const g = new THREE.PlaneGeometry(len, r.w);
        g.rotateX(-Math.PI / 2);
        const uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (len / 14), uv.getY(k) * (r.w / 14));
        g.translate((xa + xb) / 2, 0.041, r.z);
        roadGeos.push(g);
        for (let d = 8; d < len - 4; d += 9) {
          const m = new THREE.PlaneGeometry(3.2, 0.25);
          m.rotateX(-Math.PI / 2);
          m.translate(xa + d, 0.053, r.z);
          marks.push(m);
        }
        for (const side of [-1, 1]) {
          const sz = r.z + side * (r.w / 2 + 3.6);
          const sw = new THREE.PlaneGeometry(len, 7.2);
          sw.rotateX(-Math.PI / 2);
          scaleUV(sw, len / 9, 7.2 / 9);
          sw.translate((xa + xb) / 2, 0.046, sz);
          sidewalks.push(sw);
        }
      }
    }
    // intersections + crosswalks
    for (const v of this.vRoads) {
      for (const h of this.hRoads) {
        const g = new THREE.PlaneGeometry(v.w, h.w);
        g.rotateX(-Math.PI / 2);
        scaleUV(g, v.w / 14, h.w / 14);
        g.translate(v.x, 0.043, h.z);
        roadGeos.push(g);
        // crosswalk stripes on all 4 approaches
        const w = 1.1, gap = 0.85;
        const n = Math.floor((v.w - 4) / (w + gap));
        for (const dir of [-1, 1]) {
          for (let k = 0; k < n; k++) {
            const sx = v.x - (n * (w + gap)) / 2 + k * (w + gap) + w / 2;
            const cg = new THREE.PlaneGeometry(w, 3.4);
            cg.rotateX(-Math.PI / 2);
            cg.translate(sx, 0.055, h.z + dir * (h.w / 2 + 2.4));
            crosswalks.push(cg);
          }
        }
        const n2 = Math.floor((h.w - 4) / (w + gap));
        for (const dir of [-1, 1]) {
          for (let k = 0; k < n2; k++) {
            const sz = h.z - (n2 * (w + gap)) / 2 + k * (w + gap) + w / 2;
            const cg = new THREE.PlaneGeometry(3.4, w);
            cg.rotateX(-Math.PI / 2);
            cg.translate(v.x + dir * (v.w / 2 + 2.4), 0.055, sz);
            crosswalks.push(cg);
          }
        }
      }
    }

    const roadMesh = new THREE.Mesh(merge(roadGeos), this.mat.asphalt);
    roadMesh.receiveShadow = true;
    this.root.add(roadMesh);
    const markMesh = new THREE.Mesh(merge(marks), this.mat.roadMark);
    this.root.add(markMesh);
    const cwMesh = new THREE.Mesh(merge(crosswalks), this.mat.roadMark);
    this.root.add(cwMesh);
    const swMesh = new THREE.Mesh(merge(sidewalks), this.mat.sidewalk);
    swMesh.receiveShadow = true;
    this.root.add(swMesh);

    // curbs along blocks
    const blocks = [];
    for (let i = 0; i < cityX.length - 1; i++) {
      for (let j = 0; j < cityZ.length - 1; j++) {
        const x0 = cityX[i] + (majorX.has(cityX[i]) ? 12 : 7.5);
        const x1 = cityX[i + 1] - (majorX.has(cityX[i + 1]) ? 12 : 7.5);
        const z0 = cityZ[j] + (majorZ.has(cityZ[j]) ? 12 : 7.5);
        const z1 = cityZ[j + 1] - (majorZ.has(cityZ[j + 1]) ? 12 : 7.5);
        if (x1 - x0 < 20 || z1 - z0 < 20) continue;
        blocks.push({ x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, i, j });
      }
    }
    this.blocks = blocks;
    this.cityBlocks = blocks;

    // traffic graph
    const idx = new Map();
    for (let i = 0; i < this.vRoads.length; i++) {
      for (let j = 0; j < this.hRoads.length; j++) {
        const x = this.vRoads[i].x, z = this.hRoads[j].z;
        idx.set(`${i}:${j}`, this.trafficNodes.length);
        this.trafficNodes.push({ x, z, i, j, edges: [] });
      }
    }
    const addEdge = (a, b) => {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      const e = { a, b, dist: d };
      this.trafficEdges.push(e);
      a.edges.push({ to: b, dist: d, edge: e });
      b.edges.push({ to: a, dist: d, edge: e });
    };
    for (let i = 0; i < this.vRoads.length; i++) {
      for (let j = 0; j < this.hRoads.length - 1; j++) {
        addEdge(this.trafficNodes[idx.get(`${i}:${j}`)], this.trafficNodes[idx.get(`${i}:${j + 1}`)]);
      }
    }
    for (let j = 0; j < this.hRoads.length; j++) {
      for (let i = 0; i < this.vRoads.length - 1; i++) {
        addEdge(this.trafficNodes[idx.get(`${i}:${j}`)], this.trafficNodes[idx.get(`${i + 1}:${j}`)]);
      }
    }
  }

  _simpleRoad(x1, z1, x2, z2, w) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const g = new THREE.PlaneGeometry(w, len);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 14), uv.getY(k) * (len / 14));
    const mesh = new THREE.Mesh(g, this.mat.asphalt);
    mesh.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
    mesh.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  // =========================================================================
  _addCollider(minX, minZ, maxX, maxZ, h = 20, tag = 'building') {
    const c = { minX, minZ, maxX, maxZ, h, tag };
    this.colliders.push(c);
    const cell = 64;
    for (let cx = Math.floor(minX / cell); cx <= Math.floor(maxX / cell); cx++) {
      for (let cz = Math.floor(minZ / cell); cz <= Math.floor(maxZ / cell); cz++) {
        const key = cx + ',' + cz;
        if (!this.colGrid.has(key)) this.colGrid.set(key, []);
        this.colGrid.get(key).push(c);
      }
    }
  }

  _buildCity() {
    const rnd = mulberry32(20260214);
    const styleGeos = { glass: [], concrete: [], deco: [], brick: [], warehouse: [] };
    const roofGeos = [];
    const trimGeos = [];
    const signGeos = [];
    const storeGeos = [];
    const reflectGeos = [];
    const balconies = [];
    const acUnits = [];
    const waterTanks = [];
    const antennas = [];
    const antennaLights = [];
    const awningData = [];

    const palette = {
      glass: [0xb8c6d8, 0x9fb4c8, 0xd6e2ef, 0x8fa8bf],
      concrete: [0xc0b6a8, 0xa89c8c, 0xd0c4b0, 0x9a948c],
      deco: [0xffd3c8, 0xbfe9e1, 0xf4e2b4, 0xe6c4ff, 0xffc3a0, 0xc8e6ff],
      brick: [0xb98268, 0x9d6a55, 0xc99a7a],
      warehouse: [0x9aa4a8, 0x8b9496, 0xb0b7b4],
    };

    for (const b of this.blocks) {
      const inDowntown = b.cx > -380 && b.cx < 300 && b.cz > -700 && b.cz < 200;
      const inBeach = b.cx > 330 || b.cz > 240;
      const inNorth = b.cz < -700;
      let styleRoll = rnd();
      let style = 'concrete';
      if (inDowntown) style = styleRoll < 0.55 ? 'glass' : styleRoll < 0.9 ? 'concrete' : 'deco';
      else if (inBeach) style = styleRoll < 0.55 ? 'deco' : styleRoll < 0.82 ? 'concrete' : 'brick';
      else if (inNorth) style = styleRoll < 0.5 ? 'warehouse' : 'concrete';
      else style = styleRoll < 0.35 ? 'brick' : styleRoll < 0.8 ? 'concrete' : 'deco';

      // occasional park / lot
      if (rnd() < 0.055) {
        this._makePark(b, rnd);
        continue;
      }
      if (rnd() < 0.04) {
        this._makeLot(b, rnd);
        continue;
      }

      const margin = 4.5;
      const bx0 = b.x0 + margin, bx1 = b.x1 - margin;
      const bz0 = b.z0 + margin, bz1 = b.z1 - margin;
      const bw = bx1 - bx0, bd = bz1 - bz0;
      if (bw < 10 || bd < 10) continue;

      const tower = inDowntown && rnd() < 0.55;
      const lots = [];
      if (tower) lots.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1 });
      else if (rnd() < 0.45 && bw > 34) {
        const mid = bx0 + bw * (0.35 + rnd() * 0.3);
        lots.push({ x0: bx0, x1: mid - 2, z0: bz0, z1: bz1 });
        lots.push({ x0: mid + 2, x1: bx1, z0: bz0, z1: bz1 });
      } else {
        lots.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz0 + bd * 0.45 });
        lots.push({ x0: bx0, x1: bx1, z0: bz0 + bd * 0.5, z1: bz1 });
        if (bd > 52) {
          const l = lots.shift();
          lots.push({ x0: bx0, x1: bx0 + bw * 0.48, z0: l.z0, z1: l.z1 });
          lots.push({ x0: bx0 + bw * 0.52, x1: bx1, z0: l.z0, z1: l.z1 });
        }
      }

      const fineLots = [];
      for (const lot of lots) {
        const lw = lot.x1 - lot.x0;
        if (!tower && lw > 36 && rnd() < 0.7) {
          const cut = lot.x0 + lw * (0.38 + rnd() * 0.24);
          fineLots.push({ x0: lot.x0, x1: cut - 1.6, z0: lot.z0, z1: lot.z1 });
          fineLots.push({ x0: cut + 1.6, x1: lot.x1, z0: lot.z0, z1: lot.z1 });
        } else {
          fineLots.push(lot);
        }
      }

      for (const lot of fineLots) {
        if (lot.x1 - lot.x0 < 12 || lot.z1 - lot.z0 < 12) continue;
        const inset = 1 + rnd() * 2.5;
        const x0 = lot.x0 + inset, x1 = lot.x1 - inset;
        const z0 = lot.z0 + inset, z1 = lot.z1 - inset;
        const w = x1 - x0, d = z1 - z0;
        if (w < 9 || d < 9) continue;
        let h;
        if (inDowntown) h = 34 + Math.pow(rnd(), 1.55) * 150;
        else if (inBeach) h = 9 + Math.pow(rnd(), 1.4) * 34;
        else if (inNorth) h = 10 + rnd() * 24;
        else h = 11 + rnd() * 40;
        if (tower) h = Math.max(h, 96 + rnd() * 60);
        if (inDowntown && rnd() < 0.07) h = 165 + rnd() * 65;
        const col = pick(palette[style]);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

        this._buildBuilding({
          style, x0, x1, z0, z1, h, col, rnd,
          styleGeos, roofGeos, trimGeos, signGeos, storeGeos, reflectGeos,
          balconies, acUnits, waterTanks, antennas, antennaLights, awningData,
        });
        this._addCollider(x0, z0, x1, z1, h, style);
        this.buildings.push({ x0, x1, z0, z1, h, style, cx, cz });
      }
    }

    for (const k of Object.keys(styleGeos)) {
      if (!styleGeos[k].length) continue;
      const mesh = new THREE.Mesh(merge(styleGeos[k]), this.facadeMats[k]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
    }
    const roofMesh = new THREE.Mesh(merge(roofGeos), this.mat.roof);
    roofMesh.castShadow = true; roofMesh.receiveShadow = true;
    this.root.add(roofMesh);
    const trimMesh = new THREE.Mesh(merge(trimGeos), this.mat.trim);
    trimMesh.castShadow = true; trimMesh.receiveShadow = true;
    this.root.add(trimMesh);
    const signMesh = new THREE.Mesh(merge(signGeos), this.mat.sign);
    signMesh.renderOrder = 2;
    signMesh.frustumCulled = false;
    this.signMesh = signMesh;
    this.root.add(signMesh);
    if (storeGeos.length) {
      const storeMesh = new THREE.Mesh(merge(storeGeos), this.mat.storefront);
      storeMesh.receiveShadow = true;
      storeMesh.castShadow = false;
      this.root.add(storeMesh);
    }
    if (reflectGeos.length) {
      const rm = new THREE.Mesh(merge(reflectGeos), this.mat.neonReflect);
      rm.renderOrder = 3;
      this.root.add(rm);
    }

    // instanced balconies
    if (balconies.length) {
      const g = new THREE.BoxGeometry(1, 0.16, 1);
      const im = new THREE.InstancedMesh(g, this.mat.trim, balconies.length);
      im.castShadow = true;
      balconies.forEach((b, i) => {
        _m.makeScale(b.w, 1, b.d);
        _m.setPosition(b.x, b.y, b.z);
        im.setMatrixAt(i, _m);
      });
      this.root.add(im);
    }
    // AC units
    if (acUnits.length) {
      const g = new THREE.BoxGeometry(1.7, 1.1, 1.3);
      const im = new THREE.InstancedMesh(g, this.mat.metal, acUnits.length);
      acUnits.forEach((p, i) => {
        _m.makeRotationY(p.r);
        _m.setPosition(p.x, p.y, p.z);
        im.setMatrixAt(i, _m);
      });
      im.castShadow = true;
      this.root.add(im);
    }
    // water tanks
    if (waterTanks.length) {
      const g = new THREE.CylinderGeometry(1.7, 1.7, 3.2, 10);
      const im = new THREE.InstancedMesh(g, this.mat.trim, waterTanks.length);
      waterTanks.forEach((p, i) => {
        _m.makeRotationY(p.r);
        _m.setPosition(p.x, p.y, p.z);
        im.setMatrixAt(i, _m);
      });
      im.castShadow = true;
      this.root.add(im);
    }
    // antennas + red lights
    if (antennas.length) {
      const g = new THREE.CylinderGeometry(0.06, 0.1, 1, 5);
      const im = new THREE.InstancedMesh(g, this.mat.darkMetal, antennas.length);
      antennas.forEach((p, i) => {
        _m.makeScale(1, p.h, 1);
        _m.setPosition(p.x, p.y + p.h / 2, p.z);
        im.setMatrixAt(i, _m);
      });
      this.root.add(im);
      const lg = new THREE.SphereGeometry(0.22, 6, 6);
      const lm = new THREE.MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false });
      const lights = new THREE.InstancedMesh(lg, lm, antennaLights.length);
      antennaLights.forEach((p, i) => {
        _m.makeTranslation(p.x, p.y, p.z);
        lights.setMatrixAt(i, _m);
      });
      this.root.add(lights);
      this.antennaLights = lights;
    }
    // awnings
    if (awningData.length) {
      const g = new THREE.BoxGeometry(1, 0.2, 1);
      const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, vertexColors: false }), awningData.length);
      im.castShadow = true;
      awningData.forEach((a, i) => {
        _m.makeRotationY(a.ry);
        _m.scale(_v.set(a.w, 1, a.d));
        _m.setPosition(a.x, a.y, a.z);
        im.setMatrixAt(i, _m);
        im.setColorAt(i, _c.set(a.color));
      });
      im.instanceColor.needsUpdate = true;
      this.root.add(im);
    }
  }

  _buildBuilding(o) {
    const { style, x0, x1, z0, z1, h, col, rnd } = o;
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const tint = _c.set(col);
    const uvOff = [rnd(), rnd()];

    const face = (width, height, px, py, pz, ry) => {
      const g = new THREE.PlaneGeometry(width, height);
      scaleUV(g, width / FACADE.w, height / FACADE.h, uvOff[0] * 0.7, uvOff[1] * 0.7);
      g.rotateY(ry);
      g.translate(px, py, pz);
      tintGeometry(g, tint);
      return g;
    };
    const H = h;
    const f1 = face(w, H, cx, H / 2, cz + d / 2, 0);
    const f2 = face(w, H, cx, H / 2, cz - d / 2, Math.PI);
    const f3 = face(d, H, cx + w / 2, H / 2, cz, Math.PI / 2);
    const f4 = face(d, H, cx - w / 2, H / 2, cz, -Math.PI / 2);
    o.styleGeos[style].push(f1, f2, f3, f4);

    // street-level storefront strip
    const SFH = 4.6;
    const storeFace = (width, px, py, pz, ry, u) => {
      const g = new THREE.PlaneGeometry(width, SFH);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i));
      g.rotateY(ry);
      g.translate(px, py, pz);
      tintGeometry(g, 0xf2e6d8);
      return g;
    };
    o.storeGeos.push(
      storeFace(w, cx, SFH / 2, cz + d / 2 + 0.05, 0, w / 32),
      storeFace(w, cx, SFH / 2, cz - d / 2 - 0.05, Math.PI, w / 32),
      storeFace(d, cx + w / 2 + 0.05, SFH / 2, cz, Math.PI / 2, d / 32),
      storeFace(d, cx - w / 2 - 0.05, SFH / 2, cz, -Math.PI / 2, d / 32)
    );

    // roof
    const roof = new THREE.PlaneGeometry(w, d);
    scaleUV(roof, w / 7, d / 7);
    roof.rotateX(-Math.PI / 2);
    roof.translate(cx, h + 0.02, cz);
    tintGeometry(roof, 0x8a857c);
    o.roofGeos.push(roof);

    // parapet
    const t = 0.35, ph = 0.7;
    const addTrim = (ww, dd, px, pz) => {
      const g = new THREE.BoxGeometry(ww, ph, dd);
      g.translate(px, h + ph / 2, pz);
      tintGeometry(g, 0x9a948a);
      o.trimGeos.push(g);
    };
    addTrim(w + t, t, cx, cz - d / 2);
    addTrim(w + t, t, cx, cz + d / 2);
    addTrim(t, d, cx - w / 2, cz);
    addTrim(t, d, cx + w / 2, cz);

    // setback crown for tall towers
    if (h > 70 && rnd() < 0.55) {
      const sw = w * (0.45 + rnd() * 0.25), sd = d * (0.45 + rnd() * 0.25);
      const sh = h * (0.12 + rnd() * 0.15);
      const cy = h + sh / 2;
      const cf1 = face(sw, sh, cx, cy, cz + sd / 2, 0);
      const cf2 = face(sw, sh, cx, cy, cz - sd / 2, Math.PI);
      const cf3 = face(sd, sh, cx + sw / 2, cy, cz, Math.PI / 2);
      const cf4 = face(sd, sh, cx - sw / 2, cy, cz, -Math.PI / 2);
      o.styleGeos[style].push(cf1, cf2, cf3, cf4);
      const roof2 = new THREE.PlaneGeometry(sw, sd);
      roof2.rotateX(-Math.PI / 2);
      roof2.translate(cx, h + sh + 0.02, cz);
      tintGeometry(roof2, 0x8a857c);
      o.roofGeos.push(roof2);
    }

    // rooftop clutter
    const nAc = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < nAc; i++) {
      o.acUnits.push({
        x: cx + (rnd() - 0.5) * (w - 5), z: cz + (rnd() - 0.5) * (d - 5),
        y: h + 0.55, r: rnd() * TAU,
      });
    }
    if (rnd() < 0.24) {
      o.waterTanks.push({ x: cx + (rnd() - 0.5) * (w - 5), z: cz + (rnd() - 0.5) * (d - 5), y: h + 1.8, r: rnd() * TAU });
    }
    if (h > 40 && rnd() < 0.55) {
      const ax = cx + (rnd() - 0.5) * (w - 6), az = cz + (rnd() - 0.5) * (d - 6);
      const ah = 3 + rnd() * 7;
      o.antennas.push({ x: ax, z: az, y: h, h: ah });
      o.antennaLights.push({ x: ax, y: h + ah + 0.2, z: az });
    }

    // balconies on deco/brick fronts
    if ((style === 'deco' || style === 'brick') && h > 8 && rnd() < 0.5) {
      const floors = Math.floor(h / 3.6);
      for (let f = 1; f < floors; f += 2) {
        const y = f * 3.6 + 1.2;
        if (y > h - 2) break;
        const side = rnd() < 0.5 ? 1 : -1;
        o.balconies.push({ x: cx, y, z: cz + side * (d / 2 + 0.55), w: w * 0.5, d: 1.2 });
      }
    }

    // street-level awning on the nearest street side
    if (rnd() < 0.45) {
      const side = rnd() < 0.5 ? 0 : 1;
      const col2 = pick([0xff2e88, 0x4df3ff, 0xffb657, 0x9d7bff, 0x7dffb2]);
      if (side === 0) {
        o.awningData.push({ x: cx, y: 3.1, z: cz + d / 2 + 1.2, w: w * 0.7, d: 2.4, ry: 0, color: col2 });
      } else {
        o.awningData.push({ x: cx + w / 2 + 1.2, y: 3.1, z: cz, w: 2.4, d: d * 0.7, ry: 0, color: col2 });
      }
    }

    // extra street-level neon above the shopfronts
    if (rnd() < 0.55) {
      const rects = this.atlas.rects;
      const rect = rects[16 + Math.floor(rnd() * 8)];
      const side = Math.floor(rnd() * 4);
      let px = cx, pz = cz, ry = 0;
      if (side === 0) { pz = cz + d / 2 + 0.42; ry = 0; }
      if (side === 1) { pz = cz - d / 2 - 0.42; ry = Math.PI; }
      if (side === 2) { px = cx + w / 2 + 0.42; ry = Math.PI / 2; }
      if (side === 3) { px = cx - w / 2 - 0.42; ry = -Math.PI / 2; }
      const sw = 5.8, sh = 2.2;
      const sg = new THREE.PlaneGeometry(sw, sh);
      const suv = sg.attributes.uv;
      for (let i = 0; i < suv.count; i++) {
        suv.setXY(i, rect.x + suv.getX(i) * rect.w, 1 - rect.y - rect.h + suv.getY(i) * rect.h);
      }
      sg.rotateY(ry);
      sg.translate(px, 5.6, pz);
      o.signGeos.push(sg);
    }

    // neon signs on facades
    const signs = rnd();
    if (signs < 0.42 && h > 7) {
      const rects = this.atlas.rects;
      const vertical = rnd() < 0.55;
      const rect = vertical ? rects[Math.floor(rnd() * 16)] : rects[16 + Math.floor(rnd() * 8)];
      const sw = vertical ? 3.0 : 8.5;
      const sh = vertical ? 7.5 : 4.2;
      const faceSide = Math.floor(rnd() * 4);
      let px = cx, pz = cz, ry = 0, nx = 0, nz = 0;
      if (faceSide === 0) { pz = cz + d / 2 + 0.35; ry = 0; nz = 1; }
      if (faceSide === 1) { pz = cz - d / 2 - 0.35; ry = Math.PI; nz = -1; }
      if (faceSide === 2) { px = cx + w / 2 + 0.35; ry = Math.PI / 2; nx = 1; }
      if (faceSide === 3) { px = cx - w / 2 - 0.35; ry = -Math.PI / 2; nx = -1; }
      const sy = clamp(4 + rnd() * (h - 8), 4.5, h - 2);
      if (faceSide === 2 || faceSide === 3) {
        px += nx * (sw / 2 + 0.1);
      }
      const g = new THREE.PlaneGeometry(sw, sh);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, rect.x + uv.getX(i) * rect.w, 1 - rect.y - rect.h + uv.getY(i) * rect.h);
      }
      g.rotateY(ry);
      g.translate(px, sy, pz);
      o.signGeos.push(g);

      // neon reflection on the pavement
      if (sy < 14 && rnd() < 0.8) {
        const rw = sw * 0.8, rl = 9 + rnd() * 8;
        const rg = new THREE.PlaneGeometry(rw, rl);
        rg.rotateX(-Math.PI / 2);
        if (faceSide === 0) rg.translate(px, 0.065, pz + rl / 2 + 0.5);
        if (faceSide === 1) rg.translate(px, 0.065, pz - rl / 2 - 0.5);
        if (faceSide === 2) { rg.rotateY(Math.PI / 2); rg.translate(px + rl / 2 + 0.5, 0.065, pz); }
        if (faceSide === 3) { rg.rotateY(-Math.PI / 2); rg.translate(px - rl / 2 - 0.5, 0.065, pz); }
        const c = _c.set(rect.color);
        const n = rg.attributes.position.count;
        const cols = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const yy = rg.attributes.uv.getY(i);
          const k = 0.35 + yy * 0.65;
          cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * k; cols[i * 3 + 2] = c.b * k;
        }
        rg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        o.reflectGeos.push(rg);
      }
    }
  }

  _makePark(b, rnd) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const g = new THREE.PlaneGeometry(w - 6, d - 6);
    g.rotateX(-Math.PI / 2);
    scaleUV(g, (w - 6) / 10, (d - 6) / 10);
    g.translate(b.cx, 0.07, b.cz);
    const mesh = new THREE.Mesh(g, this.mat.grass);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    // few trees are added later through vegetation seeds
    this.parkSpots = this.parkSpots || [];
    this.parkSpots.push({ x: b.cx, z: b.cz, w: w - 10, d: d - 10 });
    // path
    const p = new THREE.PlaneGeometry(4, d - 10);
    p.rotateX(-Math.PI / 2);
    p.translate(b.cx, 0.075, b.cz);
    this.root.add(new THREE.Mesh(p, this.mat.sidewalk));
  }

  _makeLot(b, rnd) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const g = new THREE.PlaneGeometry(w - 4, d - 4);
    g.rotateX(-Math.PI / 2);
    scaleUV(g, (w - 4) / 12, (d - 4) / 12);
    g.translate(b.cx, 0.06, b.cz);
    const mesh = new THREE.Mesh(g, this.mat.asphalt);
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  // =========================================================================
  _buildStreetFurniture() {
    const poleGeos = [];
    const lampGeos = [];
    const poolPositions = [];
    const allLampPositions = [];
    const rnd = mulberry32(99);

    const addLamp = (x, z, dx, dz, pool) => {
      const pole = new THREE.CylinderGeometry(0.08, 0.13, 7, 6);
      pole.translate(x, 3.5, z);
      poleGeos.push(pole);
      const arm = new THREE.BoxGeometry(1.9, 0.12, 0.12);
      arm.rotateY(Math.atan2(-dz, dx));
      arm.translate(x + dx * 0.9, 6.9, z + dz * 0.9);
      poleGeos.push(arm);
      const lamp = new THREE.BoxGeometry(0.9, 0.18, 0.5);
      lamp.translate(x + dx * 1.75, 6.78, z + dz * 1.75);
      lampGeos.push(lamp);
      allLampPositions.push({ x: x + dx * 1.75, z: z + dz * 1.75 });
      if (pool) poolPositions.push({ x: x + dx * 1.75, z: z + dz * 1.75 });
    };
    for (const r of this.vRoads) {
      const major = r.x === 0 || r.x === 360 || r.x === 600;
      for (let z = -880; z < 420; z += 52) {
        addLamp(r.x - r.w / 2 - 1.3, z, 1, 0, major);
        addLamp(r.x + r.w / 2 + 1.3, z + 26, -1, 0, major);
      }
    }
    for (const r of this.hRoads) {
      const major = r.z === -60 || r.z === 300;
      for (let x = -600; x < 720; x += 52) {
        addLamp(x + 24, r.z - r.w / 2 - 1.3, 0, 1, major && (x % 104 < 52));
        addLamp(x + 50, r.z + r.w / 2 + 1.3, 0, -1, major && (x % 104 >= 52));
      }
    }
    // actual arms for horizontal roads are not oriented; acceptable visual density at night
    const poles = new THREE.Mesh(merge(poleGeos), this.mat.darkMetal);
    poles.castShadow = true;
    this.root.add(poles);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffc890, toneMapped: false });
    const lamps = new THREE.Mesh(merge(lampGeos), this.lampMat);
    this.root.add(lamps);

    // light pools on the major avenues
    const poolGeo = new THREE.PlaneGeometry(1, 1);
    poolGeo.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(poolGeo, this.mat.glow, poolPositions.length);
    poolPositions.forEach((p, i) => {
      _m.makeRotationY(rnd() * TAU);
      _m.scale(_v.set(13, 1, 13));
      _m.setPosition(p.x, 0.08, p.z);
      pools.setMatrixAt(i, _m);
    });
    pools.instanceMatrix.needsUpdate = true;
    pools.frustumCulled = false;
    this.root.add(pools);
    this.lampPools = pools;

    // lamp halos (one draw call, clamped point size so they read as light, not blobs)
    this.lampPositions = allLampPositions;
    const haloGeo = new THREE.BufferGeometry();
    const hp = new Float32Array(allLampPositions.length * 3);
    const hs = new Float32Array(allLampPositions.length);
    allLampPositions.forEach((p, i) => {
      hp[i * 3] = p.x; hp[i * 3 + 1] = 6.75; hp[i * 3 + 2] = p.z;
      hs[i] = 1.1 + rnd() * 0.5;
    });
    haloGeo.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    haloGeo.setAttribute('aSize', new THREE.BufferAttribute(hs, 1));
    this.lampHaloMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: glowTexture() },
        uOpacity: { value: 0.6 },
        uColor: { value: new THREE.Color(0xffc48a) },
      },
      vertexShader: `
        attribute float aSize;
        varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          gl_PointSize = clamp(aSize * 300.0 / max(d, 1.0), 2.0, 26.0);
          vA = smoothstep(4.0, 15.0, d) * (1.0 - smoothstep(140.0, 300.0, d));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying float vA;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(uColor * t.rgb, t.a * uOpacity * vA);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.lampHalos = new THREE.Points(haloGeo, this.lampHaloMat);
    this.lampHalos.frustumCulled = false;
    this.root.add(this.lampHalos);

    // traffic lights at major intersections
    const tlGeos = [];
    const tlg = [];
    for (const v of this.vRoads.filter(r => [0, 360, -360].includes(r.x))) {
      for (const h of this.hRoads.filter(r => [-60, 300].includes(r.z))) {
        const x = v.x + v.w / 2 + 2.6, z = h.z + h.w / 2 + 2.6;
        const pole = new THREE.CylinderGeometry(0.09, 0.11, 4.4, 6);
        pole.translate(x, 2.2, z);
        tlGeos.push(pole);
        const box = new THREE.BoxGeometry(0.35, 1.0, 0.35);
        box.translate(x, 4.1, z);
        tlGeos.push(box);
        const lg = new THREE.CircleGeometry(0.12, 8);
        lg.translate(x, 4.35, z + 0.18);
        tlg.push(lg);
      }
    }
    const tl = new THREE.Mesh(merge(tlGeos), this.mat.darkMetal);
    this.root.add(tl);
    this.trafficLightMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false });
    this.root.add(new THREE.Mesh(merge(tlg), this.trafficLightMat));

    // benches + bins + hydrants + beach umbrellas
    const benchGeos = [];
    const binGeos = [];
    const hydrantGeos = [];
    for (let z = -860; z < 500; z += 60) {
      const x = 776 + (z % 120 === 0 ? 4 : 0);
      const bench = new THREE.BoxGeometry(2.4, 0.12, 0.7);
      bench.rotateY(Math.PI / 2);
      bench.translate(x, 0.55, z);
      benchGeos.push(bench);
      const back = new THREE.BoxGeometry(0.12, 0.7, 2.4);
      back.translate(x + 0.35, 0.95, z);
      benchGeos.push(back);
    }
    for (let i = 0; i < 40; i++) {
      const x = -580 + rnd() * 1300, z = -880 + rnd() * 1300;
      if (rnd() < 0.5) {
        const bin = new THREE.CylinderGeometry(0.32, 0.28, 0.9, 8);
        bin.translate(x, 0.45, z);
        binGeos.push(bin);
      } else {
        const hyd = new THREE.CylinderGeometry(0.14, 0.18, 0.8, 6);
        hyd.translate(x, 0.4, z);
        hydrantGeos.push(hyd);
      }
    }
    this.root.add(new THREE.Mesh(merge(benchGeos), this.mat.darkMetal));
    this.root.add(new THREE.Mesh(merge(binGeos), this.mat.metal));
    this.root.add(new THREE.Mesh(merge(hydrantGeos), new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.6 })));

    // umbrellas + loungers
    const umb = [];
    const cols = [0xff2e88, 0x4df3ff, 0xffc857, 0x9d7bff];
    const umbGeos = [];
    for (let i = 0; i < 26; i++) {
      const x = 800 + (i % 6) * 22, z = -780 + Math.floor(i / 6) * 60 + rnd() * 20;
      const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5);
      pole.translate(x, 1.2, z);
      umbGeos.push(pole);
      const top = new THREE.ConeGeometry(1.7, 0.7, 8);
      top.translate(x, 2.5, z);
      addVertexColor(top, cols[i % cols.length]);
      umb.push(top);
      const bed = new THREE.BoxGeometry(0.8, 0.18, 2);
      bed.translate(x + 2.2, 0.35, z);
      addVertexColor(bed, 0xe8e0cf);
      umb.push(bed);
    }
    const um = new THREE.Mesh(merge(umb), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    um.castShadow = true;
    this.root.add(um);
    this.root.add(new THREE.Mesh(merge(umbGeos), this.mat.metal));
  }

  _buildVegetation() {
    const rnd = mulberry32(404);
    // palms
    const palmSpots = [];
    for (let z = -880; z < 500; z += 24) palmSpots.push({ x: 870 + rnd() * 30, z, s: 0.8 + rnd() * 0.5 });
    for (let x = -560; x < 700; x += 38) palmSpots.push({ x, z: -62 + (rnd() - 0.5) * 6, s: 0.8 + rnd() * 0.4 });
    for (let i = 0; i < 70; i++) palmSpots.push({ x: -580 + rnd() * 1300, z: -880 + rnd() * 1300, s: 0.7 + rnd() * 0.5 });
    if (this.parkSpots) {
      for (const p of this.parkSpots) {
        for (let i = 0; i < 4; i++) palmSpots.push({ x: p.x + (rnd() - 0.5) * p.w, z: p.z + (rnd() - 0.5) * p.d, s: 0.7 + rnd() * 0.4 });
      }
    }
    const palmCount = palmSpots.length;
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 8, 6, 1);
    trunkGeo.translate(0, 4, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5741, roughness: 0.95 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmCount);
    trunks.castShadow = true;

    // fronds: procedural ribbons with vertex colours (no alpha textures needed)
    const frondGeos = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU + (k % 2) * 0.11;
      const len = k < 6 ? 4.3 : 5.5;
      const segs = 6;
      const pos = [], idx = [], cols = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const r = 0.35 + t * len;
        const droop = Math.pow(t, 1.65) * 2.5 + (k < 6 ? 0.35 : 0);
        const w = 0.46 * (1 - t * 0.82) + 0.03;
        const cx = Math.cos(a), cz = Math.sin(a);
        pos.push(
          cx * r - Math.sin(a) * w, 8.15 - droop, cz * r + Math.cos(a) * w,
          cx * r + Math.sin(a) * w, 8.15 - droop, cz * r - Math.cos(a) * w
        );
        const c = new THREE.Color().setHSL(0.25, 0.36, 0.13 + t * 0.16);
        c.convertSRGBToLinear();
        cols.push(c.r, c.g, c.b, c.r * 1.08, c.g * 1.08, c.b * 1.02);
      }
      for (let i = 0; i < segs; i++) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      frondGeos.push(g.toNonIndexed());
    }
    const core = new THREE.IcosahedronGeometry(0.5, 0);
    core.translate(0, 8.0, 0);
    core.deleteAttribute('uv');
    tintGeometry(core, 0x5c4a30);
    frondGeos.push(core);
    const crownGeo = merge(frondGeos);
    const frondMat = new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.82, metalness: 0.02,
    });
    const crowns = new THREE.InstancedMesh(crownGeo, frondMat, palmCount);
    crowns.castShadow = true;
    this.palmCrowns = crowns;
    this.palmTrunks = trunks;
    this.palms = palmSpots;
    palmSpots.forEach((p, i) => {
      _m.makeRotationY(rnd() * TAU);
      _m.scale(_v.set(p.s, p.s, p.s));
      _m.setPosition(p.x, 0, p.z);
      trunks.setMatrixAt(i, _m);
      crowns.setMatrixAt(i, _m);
    });
    this.root.add(trunks, crowns);

    // pines in the wild / mountain
    const pineSpots = [];
    for (let i = 0; i < 260; i++) {
      const x = -1500 + rnd() * 900;
      const z = -1900 + rnd() * 1000;
      if (x > -700 && z > -1000) continue;
      pineSpots.push({ x, z, s: 0.8 + rnd() * 1.6 });
    }
    for (let i = 0; i < 90; i++) {
      const x = -1500 + rnd() * 900;
      const z = -900 + rnd() * 1000;
      if (x > -650) continue;
      pineSpots.push({ x, z, s: 0.7 + rnd() * 1.2 });
    }
    const pineGeo = new THREE.ConeGeometry(2.6, 9, 7);
    pineGeo.translate(0, 5.5, 0);
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x2f4a32, roughness: 0.95 });
    const pines = new THREE.InstancedMesh(pineGeo, pineMat, pineSpots.length);
    pines.castShadow = true;
    pineSpots.forEach((p, i) => {
      _m.makeRotationY(rnd() * TAU);
      _m.scale(_v.set(p.s, p.s, p.s));
      _m.setPosition(p.x, 0, p.z);
      pines.setMatrixAt(i, _m);
    });
    this.root.add(pines);

    // bushes / mangroves around keys and swamp
    const bushGeo = new THREE.IcosahedronGeometry(1.6, 1);
    const bush = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ color: 0x2c3f2b, roughness: 0.95, flatShading: true }), 280);
    for (let i = 0; i < 280; i++) {
      let x, z;
      if (i < 180) { x = -1600 + rnd() * 1000; z = -1000 + rnd() * 1000; }
      else { x = -300 + rnd() * 1100; z = 600 + rnd() * 700; }
      _m.makeRotationY(rnd() * TAU);
      _m.scale(_v.set(0.6 + rnd(), 0.4 + rnd() * 0.7, 0.6 + rnd()));
      _m.setPosition(x, 0.8, z);
      bush.setMatrixAt(i, _m);
    }
    this.root.add(bush);

    // rocks in mountain
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6d6e, roughness: 0.92, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 160);
    for (let i = 0; i < 160; i++) {
      const x = -700 + rnd() * 1300, z = -1800 + rnd() * 600;
      _m.makeRotationY(rnd() * TAU);
      _m.scale(_v.set(1 + rnd() * 4, 1 + rnd() * 5, 1 + rnd() * 4));
      _m.setPosition(x, 1, z);
      rocks.setMatrixAt(i, _m);
    }
    this.root.add(rocks);
  }

  _addSignPlane(text, sub, x, y, z, ry, w = 10, h = 4, color = '#ff2e88') {
    const tex = canvasTexture(1024, 512, (g, cw, ch) => {
      g.fillStyle = '#05060a'; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = color; g.lineWidth = 10; g.shadowColor = color; g.shadowBlur = 30;
      g.strokeRect(18, 18, cw - 36, ch - 36);
      g.fillStyle = color; g.shadowBlur = 34;
      g.font = '700 150px "Arial Narrow", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, cw / 2, ch * 0.44);
      g.shadowBlur = 12;
      g.font = '500 46px Arial'; g.fillStyle = 'rgba(255,255,255,.8)';
      g.fillText(sub, cw / 2, ch * 0.76);
    }, { clamp: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.root.add(m);
    return m;
  }

  _buildLandmarks() {
    const rnd = mulberry32(555);

    // ---- Mount Kalaga ridge
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5c5f61, roughness: 0.95, flatShading: true });
    const ridge = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
        const n = 1 + Math.sin(x * 4 + i) * 0.12 + Math.cos(z * 5 + y * 3) * 0.1;
        pos.setXYZ(k, x * n, y * n, z * n);
      }
      g.computeVertexNormals();
      const s = 110 + rnd() * 120;
      const m = new THREE.Mesh(g, rockMat);
      m.scale.set(s * 1.5, s * 1.1, s);
      m.position.set(-600 + i * 210, 40 + rnd() * 40, -1720 - rnd() * 120);
      m.rotation.y = rnd() * TAU;
      ridge.add(m);
    }
    this.root.add(ridge);

    // ritual site
    const ritual = new THREE.Group();
    ritual.position.set(0, 0, -1250);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4b4a55, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.5 + rnd() * 2, 1.2), stoneMat);
      s.position.set(Math.cos(a) * 14, 2.2, Math.sin(a) * 14);
      s.rotation.y = -a;
      s.rotation.z = (rnd() - 0.5) * 0.15;
      s.castShadow = true;
      ritual.add(s);
    }
    const ob = new THREE.Mesh(new THREE.ConeGeometry(1.1, 8, 4), stoneMat);
    ob.position.y = 4;
    ritual.add(ob);
    const runeMat = new THREE.MeshBasicMaterial({ color: 0x9d7bff, transparent: true, opacity: 0.9, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const rune = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.06, 6, 40), runeMat);
    rune.position.y = 3.2;
    rune.rotation.x = Math.PI / 2;
    ritual.add(rune);
    this.ritualRune = rune;
    this.root.add(ritual);

    // ---- Ferris wheel on the pier
    const wheel = new THREE.Group();
    wheel.position.set(1020, 0, 322);
    const wheelRoot = new THREE.Group();
    wheelRoot.position.y = 23;
    const supportMat = new THREE.MeshStandardMaterial({ color: 0x8c98a0, metalness: 0.8, roughness: 0.4 });
    for (const a of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 26, 6), supportMat);
      leg.position.set(0, 11, 0);
      leg.rotation.z = a;
      wheel.add(leg);
    }
    const rimMat = new THREE.MeshBasicMaterial({ color: 0xff2e88, toneMapped: false });
    const rim2Mat = new THREE.MeshBasicMaterial({ color: 0x4df3ff, toneMapped: false });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(21, 0.12, 4, 80), rimMat);
    const rimInner = new THREE.Mesh(new THREE.TorusGeometry(16, 0.08, 4, 60), rim2Mat);
    wheelRoot.add(rim, rimInner);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(20, 0.08, 0.08), i % 2 ? rim2Mat : rimMat);
      spoke.position.set(Math.cos(a) * 10, Math.sin(a) * 10, 0);
      spoke.rotation.z = a;
      wheelRoot.add(spoke);
      const gon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0xffc857 : i % 3 === 1 ? 0xff2e88 : 0x4df3ff, roughness: 0.5, emissive: 0x221122, emissiveIntensity: 0.6 }));
      gon.position.set(Math.cos(a) * 22, Math.sin(a) * 22, 0);
      wheelRoot.add(gon);
    }
    wheel.add(wheelRoot);
    this.ferris = wheelRoot;
    this.root.add(wheel);

    // ---- lighthouse on keys
    const lh = new THREE.Group();
    lh.position.set(820, 0, 930);
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(3.2 - i * 0.25, 3.4 - i * 0.25, 4.5, 12), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe8e2d8 : 0xb03a35, roughness: 0.7 }));
      seg.position.y = 2.25 + i * 4.5;
      lh.add(seg);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0xffe6a8, toneMapped: false }));
    lamp.position.y = 19.6;
    lh.add(lamp);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.6, 8), this.mat.darkMetal);
    roof.position.y = 21.2;
    lh.add(roof);
    this.lighthouseBeam = new THREE.Mesh(new THREE.ConeGeometry(9, 34, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.lighthouseBeam.position.set(0, 19.6, 0);
    this.lighthouseBeam.rotation.z = Math.PI / 2;
    lh.add(this.lighthouseBeam);
    this.root.add(lh);

    // ---- port cranes and containers
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xd2703a, metalness: 0.6, roughness: 0.55 });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Group();
      c.position.set(-1120 + i * 110, 0, 760 + (i % 2) * 120);
      for (const sx of [-6, 6]) for (const sz of [-6, 6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 34, 1.2), craneMat);
        leg.position.set(sx, 17, sz);
        c.add(leg);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(14, 2, 14), craneMat);
      top.position.y = 34;
      c.add(top);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 46), craneMat);
      boom.position.set(0, 35, -18);
      c.add(boom);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 18, 4), this.mat.darkMetal);
      cable.position.set(0, 26, -38);
      c.add(cable);
      const hook = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.4), craneMat);
      hook.position.set(0, 17, -38);
      c.add(hook);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
      beacon.position.set(0, 35.6, -38);
      c.add(beacon);
      this.root.add(c);
    }
    const contGeo = new THREE.BoxGeometry(6, 2.6, 2.5);
    const conts = new THREE.InstancedMesh(contGeo, this.mat.container, 150);
    const contCols = [0xc2432f, 0x2f6fc2, 0x3f8a5a, 0xc99a2e, 0x8a8f95, 0x7a3f8a];
    for (let i = 0; i < 150; i++) {
      const stack = Math.floor(rnd() * 4);
      const x = -1150 + Math.floor(rnd() * 9) * 24;
      const z = 980 + Math.floor(rnd() * 7) * 16;
      _m.makeRotationY(Math.floor(rnd() * 2) * Math.PI / 2);
      _m.setPosition(x, 1.3 + stack * 2.62, z);
      conts.setMatrixAt(i, _m);
      conts.setColorAt(i, _c.set(contCols[Math.floor(rnd() * contCols.length)]));
    }
    conts.instanceColor.needsUpdate = true;
    conts.castShadow = true;
    conts.receiveShadow = true;
    this.root.add(conts);

    // ---- Ambrosia refinery
    const ref = new THREE.Group();
    ref.position.set(-1300, 0, 300);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xb9bcb4, metalness: 0.55, roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 19, 18), tankMat);
      t.position.set(-70 + i * 40, 9.5, -40 + (i % 2) * 40);
      t.castShadow = true; t.receiveShadow = true;
      ref.add(t);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(13, 18, 8, 0, TAU, 0, Math.PI / 2), tankMat);
      cap.position.copy(t.position); cap.position.y = 19;
      ref.add(cap);
    }
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x8c8378, metalness: 0.7, roughness: 0.45 });
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 80, 6), pipeMat);
      p.rotation.z = Math.PI / 2;
      p.position.set(-20, 3 + i * 1.4, 10 + i * 4);
      ref.add(p);
    }
    const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 42, 8), pipeMat);
    flare.position.set(80, 21, 30);
    ref.add(flare);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.flareFlame = new THREE.Mesh(new THREE.ConeGeometry(2.4, 9, 8), flameMat);
    this.flareFlame.position.set(80, 46, 30);
    ref.add(this.flareFlame);
    const flareGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a2a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flareGlow.scale.set(18, 18, 1);
    flareGlow.position.set(80, 47, 30);
    ref.add(flareGlow);
    this.root.add(ref);

    // ---- monorail
    const mono = new THREE.Group();
    const trackMat = new THREE.MeshStandardMaterial({ color: 0xcfd4d8, metalness: 0.4, roughness: 0.6 });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1330, 0.9, 2.4), trackMat);
    beam.position.set(60, 9.2, -60);
    mono.add(beam);
    for (let x = -580; x <= 700; x += 65) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 8.8, 8), trackMat);
      col.position.set(x, 4.4, -60);
      mono.add(col);
    }
    const train = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(13, 2.6, 2.4), new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.35, metalness: 0.3 }));
      car.position.set(i * 13.4, 0, 0);
      train.add(car);
      const win = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.9, 2.45), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false }));
      win.position.set(i * 13.4, 0.35, 0);
      train.add(win);
    }
    train.position.set(0, 10.9, -60);
    mono.add(train);
    this.monorail = train;
    this.root.add(mono);

    // ---- blimp
    const blimp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.6 }));
    body.scale.set(20, 6, 6);
    blimp.add(body);
    const adTex = canvasTexture(1024, 256, (g, w, h) => {
      g.fillStyle = '#0a0714'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff2e88'; g.shadowColor = '#ff2e88'; g.shadowBlur = 24;
      g.font = '700 96px "Arial Narrow", Arial'; g.textAlign = 'center';
      g.fillText('МАГИЯ РЕАЛЬНА', w / 2, 120);
      g.fillStyle = '#4df3ff'; g.font = '500 42px Arial';
      g.fillText('VICE CITY · 2026', w / 2, 190);
    }, { clamp: true });
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: adTex, toneMapped: false }));
    ad.position.set(0, 0, 0);
    blimp.add(ad);
    blimp.position.set(-200, 110, -100);
    this.blimp = blimp;
    this.root.add(blimp);

    // ---- marina yachts
    const yachtMat = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.35, metalness: 0.15 });
    for (let i = 0; i < 4; i++) {
      const y = new THREE.Group();
      y.position.set(860 + i * 18, 0, -90 - (i % 2) * 26);
      const hull = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.5, 13), yachtMat);
      hull.position.y = 0.6;
      y.add(hull);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4, 4), yachtMat);
      bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
      bow.position.set(0, 0.6, 8);
      y.add(bow);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 5), new THREE.MeshStandardMaterial({ color: 0x2a3238, roughness: 0.15, metalness: 0.4 }));
      cabin.position.set(0, 2.1, -2);
      y.add(cabin);
      this.root.add(y);
    }

    // ---- graffiti at a few alley walls
    for (let i = 0; i < 10; i++) {
      const b = this.buildings[Math.floor(rnd() * this.buildings.length)];
      if (!b) continue;
      const g = new THREE.PlaneGeometry(6, 3);
      g.translate(b.cx + (rnd() - 0.5) * (b.x1 - b.x0) * 0.5, 2.2, b.z0 - 0.05);
      g.rotateY(Math.PI);
      const m = new THREE.Mesh(g, this.mat.graffiti);
      this.root.add(m);
    }
  }

  _buildVenues() {
    const defs = [
      {
        id: 'motel', x0: 724, x1: 774, z0: 34, z1: 60, h: 9.5, style: 'deco', tint: 0xffd6c6,
        title: 'МОТЕЛЬ', sub: 'СИНИЙ ПРИЛИВ', sign: '#4df3ff', balcony: true,
      },
      {
        id: 'club', x0: 722, x1: 770, z0: 206, z1: 232, h: 13, style: 'concrete', tint: 0x8c8098,
        title: 'КЛУБ', sub: 'ЭХО', sign: '#ff2e88', club: true,
      },
      {
        id: 'shop', x0: 722, x1: 750, z0: -156, z1: -132, h: 7, style: 'concrete', tint: 0xc0a47a,
        title: 'ОРУЖЕЙНАЯ', sub: 'ИЕРИХОН', sign: '#ffb657',
      },
      {
        id: 'diner', x0: 776, x1: 806, z0: 120, z1: 146, h: 6.5, style: 'deco', tint: 0xd8c0a0,
        title: 'ЗАКУСОЧНАЯ', sub: 'СОЛЬ И САХАР', sign: '#ffd166', fog: true,
      },
      {
        id: 'clinic', x0: 776, x1: 806, z0: 56, z1: 84, h: 8, style: 'concrete', tint: 0xb8d0d0,
        title: 'КЛИНИКА', sub: 'ЛЕОНИДА', sign: '#7df9ff', fog: true,
      },
      {
        id: 'garage', x0: -896, x1: -862, z0: 930, z1: 966, h: 9, style: 'concrete', tint: 0x8a9098,
        title: 'МАСТЕРСКАЯ', sub: 'ПОРТ-ГЕЛЛХОРН', sign: '#ffb657', fog: true,
      },
      {
        id: 'bar', x0: -1258, x1: -1222, z0: 432, z1: 468, h: 7.5, style: 'deco', tint: 0xb08060,
        title: 'БАР', sub: 'ЧЁРНАЯ НЕФТЬ', sign: '#ff7a45', fog: true,
      },
      {
        id: 'bait', x0: 560, x1: 596, z0: 800, z1: 836, h: 6, style: 'deco', tint: 0xa8b894,
        title: 'ПРИЧАЛ', sub: 'ЛЕОНИДА-КИС', sign: '#4df3ff', fog: true,
      },
    ];
    const storeMat = this.mat.storefront;
    for (const d of defs) {
      const cx = (d.x0 + d.x1) / 2;
      const cz = (d.z0 + d.z1) / 2;
      const w = d.x1 - d.x0, dep = d.z1 - d.z0, h = d.h;
      const tint = _c.set(d.tint);
      const styleMat = this.facadeMats[d.style];
      const geos = [];
      const addWall = (width, height, px, pz, ry) => {
        const g = new THREE.PlaneGeometry(width, height);
        scaleUV(g, width / FACADE.w, height / FACADE.h, Math.random() * 0.6, Math.random() * 0.4);
        g.rotateY(ry);
        g.translate(px, height / 2, pz);
        tintGeometry(g, tint);
        geos.push(g);
      };
      addWall(w, h, cx, d.z1, 0);
      addWall(w, h, cx, d.z0, Math.PI);
      addWall(dep, h, d.x1, cz, Math.PI / 2);
      addWall(dep, h, d.x0, cz, -Math.PI / 2);
      const mesh = new THREE.Mesh(merge(geos), styleMat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.root.add(mesh);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(w, dep), this.mat.roof);
      roof.rotation.x = -Math.PI / 2;
      roof.position.set(cx, h + 0.02, cz);
      roof.receiveShadow = true;
      this.root.add(roof);
      // storefront band on the street-facing wall
      const sfg = new THREE.PlaneGeometry(w, 4.6);
      const suv = sfg.attributes.uv;
      for (let i = 0; i < suv.count; i++) suv.setXY(i, suv.getX(i) * (w / 32), suv.getY(i));
      sfg.translate(cx, 2.3, d.z1 + 0.06);
      tintGeometry(sfg, 0xf0e2d4);
      const sfm = new THREE.Mesh(sfg, storeMat);
      this.root.add(sfm);
      // awning / canopy
      const can = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.18, 2.2), new THREE.MeshStandardMaterial({ color: d.club ? 0x1c1420 : 0x2b3c48, roughness: 0.5, metalness: 0.3 }));
      can.position.set(cx, 4.85, d.z1 + 1.1);
      can.castShadow = true;
      this.root.add(can);
      // neon sign above the entrance
      this._addSignPlane(d.title, d.sub, cx, 6.3, d.z1 + 0.45, 0, Math.min(15, w * 0.55), 4.2, d.sign);
      // the doorway reads as lit through its emissive frame and the sign; a
      // real point light per venue is far too expensive in forward rendering
      // balcony for the motel
      if (d.balcony) {
        for (let f = 0; f < 2; f++) {
          const y = 4.2 + f * 3.4;
          const b = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.16, 1.6), this.mat.trim);
          b.position.set(cx, y, d.z1 + 0.8);
          b.castShadow = true;
          this.root.add(b);
          for (let i = 0; i < 8; i++) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 0.05), this.mat.metal);
            rail.position.set(d.x0 + 5 + i * (w - 10) / 7, y + 0.5, d.z1 + 1.55);
            this.root.add(rail);
          }
          const railTop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.06, 0.06), this.mat.metal);
          railTop.position.set(cx, y + 0.92, d.z1 + 1.55);
          this.root.add(railTop);
          for (let i = 0; i < 4; i++) {
            const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), this.mat.storefront);
            door.position.set(d.x0 + 7 + i * (w - 14) / 3, y + 1.25, d.z1 + 0.03);
            this.root.add(door);
          }
        }
      }
      if (d.club) {
        // neon strips and queue bollards
        for (let i = 0; i < 3; i++) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: i === 1 ? 0x4df3ff : 0xff2e88, toneMapped: false }));
          strip.position.set(cx, 5.4 + i * 1.9, d.z1 + 0.12);
          this.root.add(strip);
        }
        for (let i = 0; i < 4; i++) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6), this.mat.metal);
          b.position.set(d.x0 + 6 + i * 2.4, 0.5, d.z1 + 3.5);
          this.root.add(b);
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 4), new THREE.MeshBasicMaterial({ color: 0xff2e88, toneMapped: false }));
          rope.rotation.z = Math.PI / 2;
          rope.position.set(d.x0 + 7.2 + i * 2.4, 0.85, d.z1 + 3.5);
          this.root.add(rope);
        }
      }
      // concrete apron
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(w + 6, 9), this.mat.sidewalk);
      apron.rotation.x = -Math.PI / 2;
      apron.position.set(cx, 0.06, d.z1 + 4.5);
      apron.receiveShadow = true;
      this.root.add(apron);
      this._addCollider(d.x0, d.z0, d.x1, d.z1, h, 'venue');
      d.mesh = mesh;
    }
  }

  _buildDistantSkyline() {
    const rnd = mulberry32(808);
    const geos = [];
    for (let i = 0; i < 16; i++) {
      const w = 18 + rnd() * 26, h = 60 + rnd() * 140, d = 18 + rnd() * 26;
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(1300 + rnd() * 500, h / 2, -700 + i * 90 + rnd() * 40);
      tintGeometry(g, 0x2a3340);
      geos.push(g);
    }
    const m = new THREE.Mesh(merge(geos), new THREE.MeshStandardMaterial({ color: 0x5b6a7a, roughness: 0.7, metalness: 0.2 }));
    this.root.add(m);
    // distant tower lights
    const pts = [];
    for (let i = 0; i < 500; i++) {
      const x = 1300 + rnd() * 500, z = -700 + rnd() * 1500;
      pts.push(new THREE.Vector3(x, 8 + rnd() * 170, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.PointsMaterial({ color: 0xffd9a0, size: 1.6, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true });
    this.root.add(new THREE.Points(geo, mat));

    // rooftop billboards and giant landmark signs
    const towers = [...this.buildings].filter(b => b.h > 55).sort((a, b) => b.h - a.h);
    const adGeos = [];
    const frameGeos = [];
    const adCount = 4;
    for (let i = 0; i < 9; i++) {
      const b = towers[Math.floor(rnd() * Math.min(towers.length, 40))];
      if (!b) continue;
      const ad = i % adCount;
      const w = 16 + rnd() * 10, h = w * 0.5;
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) {
        uv.setXY(k, (ad + uv.getX(k)) / adCount, uv.getY(k));
      }
      const ry = rnd() < 0.5 ? Math.PI / 2 : 0;
      const x = b.cx + (ry === 0 ? (rnd() - 0.5) * (b.x1 - b.x0) * 0.4 : 0);
      const z = b.cz + (ry === 0 ? 0 : (rnd() - 0.5) * (b.z1 - b.z0) * 0.4);
      g.rotateY(ry);
      g.translate(x, b.h + 8.5, z);
      adGeos.push(g);
      // support frame
      for (const off of [-w * 0.35, w * 0.35]) {
        const post = new THREE.BoxGeometry(0.4, 8, 0.4);
        if (ry === 0) post.translate(x + off, b.h + 4, z - 0.3);
        else post.translate(x - 0.3, b.h + 4, z + off);
        frameGeos.push(post);
      }
    }
    if (adGeos.length) {
      const ads = new THREE.Mesh(merge(adGeos), this.mat.ad);
      this.root.add(ads);
      this.root.add(new THREE.Mesh(merge(frameGeos), this.mat.darkMetal));
    }

    // giant neon signs visible from across the bay
    const bigTowers = towers.slice(0, 5);
    const bigSigns = [
      ['ВАЙС-СИТИ', 'VICE CITY · 2026', '#ff2e88'],
      ['МАГИЯ', 'ARCANE', '#9d7bff'],
      ['ЛЕОНИДА', 'NEVER SLEEPS', '#4df3ff'],
    ];
    bigTowers.forEach((b, i) => {
      if (i >= bigSigns.length) return;
      const [ru, en, color] = bigSigns[i];
      const ry = i % 2 ? Math.PI / 2 : 0;
      const x = b.cx + (ry === 0 ? 0 : 0.8);
      const z = b.cz + (ry === 0 ? 0.8 : 0);
      this._addSignPlane(ru, en, x, b.h + 8, z, ry, 24, 11, color);
    });
  }

  // =========================================================================
  _buildDoors() {
    const defs = [
      { id: 'motel', label: 'МОТЕЛЬ «СИНИЙ ПРИЛИВ»', x: 745, z: 60.3, color: 0x4df3ff, interior: 'motel' },
      { id: 'club', label: 'КЛУБ «ЭХО»', x: 744, z: 232.3, color: 0xff2e88, interior: 'club' },
      { id: 'shop', label: 'ОРУЖЕЙНАЯ «ИЕРИХОН»', x: 736, z: -131.7, color: 0xffb657, interior: 'shop' },
      { id: 'diner', label: 'ЗАКУСОЧНАЯ «СОЛЬ И САХАР»', x: 791, z: 146.3, color: 0xffd166, interior: 'diner' },
      { id: 'clinic', label: 'КЛИНИКА «ЛЕОНИДА»', x: 791, z: 84.3, color: 0x7df9ff, interior: 'clinic' },
      { id: 'garage', label: 'МАСТЕРСКАЯ ПОРТА', x: -879, z: 966.3, color: 0xffb657, interior: 'garage' },
      { id: 'bar', label: 'БАР «ЧЁРНАЯ НЕФТЬ»', x: -1240, z: 468.3, color: 0xff7a45, interior: 'bar' },
      { id: 'bait', label: 'ПРИЧАЛ ЛЕОНИДА-КИС', x: 578, z: 836.3, color: 0x4df3ff, interior: 'bait' },
    ];
    for (const d of defs) {
      const g = new THREE.Group();
      g.position.set(d.x, 0, d.z);
      const frameMat = new THREE.MeshBasicMaterial({ color: d.color, toneMapped: false });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.6, 0.16), frameMat);
      frame.position.y = 1.8;
      g.add(frame);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 3.2), new THREE.MeshStandardMaterial({ color: 0x0a0d13, roughness: 0.3, metalness: 0.6 }));
      door.position.set(0, 1.6, -0.09);
      g.add(door);
      const label = this._addSignPlane(d.label, 'ОТКРЫТО', d.x + 3.4, 4.3, d.z + 0.2, -Math.PI / 2, 7, 1.8, '#' + d.color.toString(16).padStart(6, '0'));
      label.rotation.y = -Math.PI / 2;
      // move label to face the promenade
      label.position.set(d.x, 4.6, d.z + 2.2);
      label.rotation.y = 0;
      this.root.add(g);
      d.group = g;
      d.light = null;
      this.doors.push(d);
      this._addCollider(d.x - 0.2, d.z - 0.2, d.x + 0.2, d.z + 0.2, 3, 'door');
    }

    // safehouse marker and a parked sports car spot
    this.spawn = { x: 748, z: 78, yaw: Math.PI };
    this.safehouse = { x: 748, z: 74 };
  }

  _buildArtifacts() {
    const spots = [
      { id: 'wheel', name: 'Осколок Разлома · Пирс', x: 1020, z: 300, district: 'vice' },
      { id: 'light', name: 'Осколок Разлома · Маяк', x: 812, z: 900, district: 'keys' },
      { id: 'port', name: 'Осколок Разлома · Порт', x: -1080, z: 1030, district: 'port' },
      { id: 'refinery', name: 'Осколок Разлома · Амброзия', x: -1210, z: 330, district: 'ambrosia' },
      { id: 'rift', name: 'Осколок Разлома · Калага', x: 0, z: -1240, district: 'kalaga' },
    ];
    const shardMat = new THREE.MeshStandardMaterial({ color: 0x9d7bff, emissive: 0x6b3dff, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.3 });
    for (const s of spots) {
      const g = new THREE.Group();
      g.position.set(s.x, 0, s.z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.4, 8), this.mat.darkMetal);
      base.position.y = 0.2;
      g.add(base);
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), shardMat);
      shard.position.y = 1.8;
      shard.scale.set(0.8, 2.2, 0.8);
      g.add(shard);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9d7bff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      glow.scale.set(7, 7, 1);
      glow.position.y = 2;
      g.add(glow);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.4, 26, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x7d5cff, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      beam.position.y = 13;
      g.add(beam);
      // the shard already has an emissive crystal and a sprite bloom; a per-shard
      // point light would cost every pixel in the frame for no visible gain
      s.group = g;
      s.shard = shard;
      s.collected = false;
      this.root.add(g);
      this.artifacts.push(s);
    }
  }

  // =========================================================================
  // Static batching: hundreds of one-off meshes (cranes, yachts, ritual stones,
  // pier piles, venue props) are merged by material. Animated nodes opt out
  // with userData.noMerge, so the Ferris wheel, monorail and shards keep moving.
  _optimizeStatics() {
    this.root.updateMatrixWorld(true);
    const animated = new Set();
    const mark = (o) => { if (o) o.traverse(c => { animated.add(c); }); };
    mark(this.ferris); mark(this.lighthouseBeam); mark(this.monorail); mark(this.blimp);
    mark(this.flareFlame); mark(this.ritualRune); mark(this.palmCrowns); mark(this.palmTrunks);
    mark(this.lampHalos); mark(this.antennaLights); mark(this.signMesh);
    for (const a of this.artifacts) mark(a.group);
    for (const d of this.doors) mark(d.group);

    const buckets = new Map();
    const doomed = [];
    const skip = (o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isPoints || o.isSprite) return true;
      if (Array.isArray(o.material)) return true;
      if (o.userData.noMerge || animated.has(o)) return true;
      if (o.material.isShaderMaterial) return true;
      return false;
    };
    this.root.traverse((o) => {
      if (skip(o)) return;
      const m = o.material;
      let key = m.uuid;
      const bucket = buckets.get(key);
      const geo = o.geometry;
      if (!geo || !geo.attributes.position) return;
      const item = { o, geo, m };
      if (bucket) bucket.items.push(item);
      else buckets.set(key, { m, items: [item] });
    });

    const rel = new THREE.Matrix4();
    for (const b of buckets.values()) {
      if (b.items.length < 2) continue;
      const geos = [];
      for (const it of b.items) {
        const g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
        if (g === it.geo) { /* already a clone */ } else it.geo = g;
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        }
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) {
          g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        }
        g.applyMatrix4(it.o.matrixWorld);
        geos.push(g);
      }
      let merged = null;
      try { merged = merge(geos); } catch { merged = null; }
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.m);
      mesh.castShadow = b.items.some(it => it.o.castShadow);
      mesh.receiveShadow = b.items.some(it => it.o.receiveShadow);
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      for (const it of b.items) doomed.push(it.o);
    }
    for (const o of doomed) {
      o.parent?.remove(o);
      o.geometry.dispose();
    }
  }

  // =========================================================================
  // interactions / queries
  // =========================================================================
  collideCircle(pos, r) {
    const cell = 64;
    const cx = Math.floor(pos.x / cell), cz = Math.floor(pos.z / cell);
    let hit = null;
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const arr = this.colGrid.get(ix + ',' + iz);
        if (!arr) continue;
        for (const b of arr) {
          const res = circleBox(pos.x, pos.z, r, b.minX, b.minZ, b.maxX, b.maxZ);
          if (res) {
            pos.x = res.x; pos.z = res.z;
            hit = res;
          }
        }
      }
    }
    return hit;
  }

  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const span = Math.min(maxDist, 220);
    const cell = 64;
    const minX = Math.min(ox, ox + dx * span), maxX = Math.max(ox, ox + dx * span);
    const minZ = Math.min(oz, oz + dz * span), maxZ = Math.max(oz, oz + dz * span);
    let best = Infinity, bestBox = null;
    const seen = new Set();
    for (let ix = Math.floor(minX / cell) - 1; ix <= Math.floor(maxX / cell) + 1; ix++) {
      for (let iz = Math.floor(minZ / cell) - 1; iz <= Math.floor(maxZ / cell) + 1; iz++) {
        const arr = this.colGrid.get(ix + ',' + iz);
        if (!arr) continue;
        for (const b of arr) {
          if (seen.has(b)) continue;
          seen.add(b);
          const t = segmentBox2D(ox, oz, ox + dx * span, oz + dz * span, b.minX, b.minZ, b.maxX, b.maxZ);
          if (t === Infinity || t < 0 || t > 1) continue;
          const y = oy + dy * span * t;
          if (y < 0 || y > b.h) continue;
          if (t < best) { best = t; bestBox = b; }
        }
      }
    }
    if (!bestBox) return null;
    const dist = span * best;
    return {
      dist, box: bestBox,
      point: new THREE.Vector3(ox + dx * dist, oy + dy * dist, oz + dz * dist),
    };
  }

  isWater(x, z) {
    for (const r of this.landRects) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return false;
    }
    return true;
  }

  nearestRoad(x, z) {
    let best = null, bd = Infinity;
    for (const r of this.roads) {
      if (r.axis === 'x') {
        if (z >= r.z1 && z <= r.z2) {
          const d = Math.abs(x - r.x);
          if (d < bd) { bd = d; best = { x: r.x, z, d }; }
        }
      } else {
        if (x >= r.x1 && x <= r.x2) {
          const d = Math.abs(z - r.z);
          if (d < bd) { bd = d; best = { x, z: r.z, d }; }
        }
      }
    }
    return best;
  }

  randomStreetPoint(rnd = Math.random) {
    const b = this.blocks[Math.floor(rnd() * this.blocks.length)];
    if (!b) return { x: 0, z: 0 };
    return { x: b.x0 + rnd() * (b.x1 - b.x0), z: b.z0 + rnd() * (b.z1 - b.z0) };
  }

  roadPointNear(x, z, maxDist = 400) {
    let best = null, bd = Infinity;
    for (const r of this.roads) {
      if (r.axis === 'x') {
        const zz = clamp(z, r.z1, r.z2);
        const d = Math.hypot(x - r.x, z - zz);
        if (d < bd && d < maxDist) { bd = d; best = { x: r.x + 4, z: zz, d }; }
      } else {
        const xx = clamp(x, r.x1, r.x2);
        const d = Math.hypot(x - xx, z - r.z);
        if (d < bd && d < maxDist) { bd = d; best = { x: xx, z: r.z - 4, d }; }
      }
    }
    return best;
  }

  // =========================================================================
  setHour(h) { this.hour = ((h % 24) + 24) % 24; this._updateEnvironment(true); }

  setWeather(w) {
    this.weather = w;
    this.scriptedUntil = (this.game.elapsed || 0) + 260;
    if (w === 'clear') { this.wind = 0.25; }
    if (w === 'rain') { this.wind = 0.6; }
    if (w === 'storm') { this.wind = 1.0; }
  }

  flashBolt() {
    this.flash = 1.0;
    this.flashLight.intensity = 4;
  }

  _skyColors(elev) {
    const day = smoothstep(0.02, 0.35, elev);
    const night = 1 - smoothstep(-0.22, 0.06, elev);
    const sunset = Math.exp(-Math.pow((elev - 0.03) / 0.2, 2));
    const top = new THREE.Color(0x03060e).lerp(new THREE.Color(0x2d6fb5), day);
    top.lerp(new THREE.Color(0x2a1d40), sunset * 0.65);
    const horizon = new THREE.Color(0x0c1424).lerp(new THREE.Color(0xd8ecf7), day);
    horizon.lerp(new THREE.Color(0xff7a52), sunset * 0.75);
    horizon.lerp(new THREE.Color(0x3a1636), night * 0.35);
    const sunCol = new THREE.Color(0xff9a5c).lerp(new THREE.Color(0xfff3dd), day);
    sunCol.lerp(new THREE.Color(0xff5c3c), sunset * 0.7);
    return { top, horizon, sunCol, day, night, sunset };
  }

  _updateEnvironment(force = false) {
    const theta = ((this.hour - 6) / 24) * TAU;
    const elev = Math.sin(theta);
    const sunDir = _v.set(Math.cos(theta) * 0.85, elev, -0.32).normalize();
    const { top, horizon, sunCol, day, night, sunset } = this._skyColors(elev);

    this.skyUniforms.uTop.value.copy(top);
    this.skyUniforms.uHorizon.value.copy(horizon);
    this.skyUniforms.uSunColor.value.copy(sunCol);
    this.skyUniforms.uSunDir.value.copy(sunDir);
    this.skyUniforms.uMoonDir.value.set(-sunDir.x, Math.abs(sunDir.y) * 0.8 + 0.2, -sunDir.z).normalize();
    this.skyUniforms.uNight.value = night;
    this.skyUniforms.uCloud.value = this.cloud;
    this.skyUniforms.uCityGlow.value.set(0x2b0e2c).multiplyScalar(0.7 + this.rain * 0.5);

    this.waterUniforms.uNight.value = night;
    this.waterUniforms.uSky.value.copy(horizon).lerp(top, 0.3);
    this.waterUniforms.uSunColor.value.copy(sunCol);
    this.waterUniforms.uSunDir.value.copy(sunDir);
    this.waterUniforms.uFogColor.value.copy(horizon);
    this.waterUniforms.uFogDensity.value = this.scene.fog.density;
    this.waterUniforms.uRain.value = this.rain;
    this.waterUniforms.uStorm.value = this.storm;

    if (elev > -0.02) {
      this.sun.position.copy(sunDir).multiplyScalar(220);
      this.sun.intensity = 4.2 * smoothstep(-0.02, 0.22, elev) * (1 - this.rain * 0.55) * (1 - this.storm * 0.45);
      this.sun.color.copy(sunCol);
      this.sun.castShadow = this.sun.intensity > 0.15;
      this.moon.intensity = 0.05;
      this.moon.color.set(0x9db8ff);
    } else {
      this.sun.intensity = 0;
      this.sun.castShadow = false;
      this.moon.position.set(-sunDir.x * 180, 140, -sunDir.z * 180);
      this.moon.intensity = 1.55 * night * (1 - this.rain * 0.5);
    }
    this.hemi.color.copy(horizon).lerp(top, 0.4);
    this.hemi.color.lerp(new THREE.Color(0x5f7fa8), 0.35);
    this.hemi.groundColor.set(0x2a1a24);
    // Night needs more fill than daylight: without it every character reads as
    // a black silhouette against the neon, which is what the old build did.
    this.hemi.intensity = 0.55 + day * 0.5 + night * 0.30;
    this.ambient.intensity = 0.34 + day * 0.10 + night * 0.22;
    this.ambient.color.copy(horizon).lerp(new THREE.Color(0x506080), 0.5);

    // interior lighting unaffected; fog
    const fogColor = horizon.clone().lerp(new THREE.Color(0x0a0f18), night * 0.5);
    fogColor.lerp(new THREE.Color(0x33404a), this.rain * 0.35);
    this.scene.fog.color.copy(fogColor);
    this.scene.fog.density = 0.00068 + this.rain * 0.0015 + this.storm * 0.0011 + night * 0.00012;
    this.renderer.setClearColor(fogColor);

    const nightGlow = clamp(night + sunset * 0.45, 0, 1);
    for (const k of Object.keys(this.facadeMats)) {
      this.facadeMats[k].emissiveIntensity = 0.06 + nightGlow * 0.95;
    }
    if (this.mat.storefront) this.mat.storefront.emissiveIntensity = 0.06 + nightGlow * 0.85;
    this.renderer.toneMappingExposure = 1.26 - day * 0.2;
    if (this.mat.sign) this.mat.sign.color.setScalar(0.55 + nightGlow * 0.55);
    if (this.lampMat) this.lampMat.color.setRGB(1, 0.8, 0.62).multiplyScalar(0.35 + nightGlow * 1.6);
    if (this.lampPools) this.mat.glow.opacity = nightGlow * 0.38;
    if (this.mat.neonReflect) this.mat.neonReflect.opacity = nightGlow * 0.22;
    if (this.antennaLights) this.antennaLights.visible = night > 0.2;
    if (this.water) this.waterUniforms.uNeon.value.set(0xff2e88).multiplyScalar(0.55);

    // fog affects sky horizon
    this.skyUniforms.uHorizon.value.lerp(this.scene.fog.color, this.rain * 0.25);
    this.skyUniforms.uCloud.value = this.cloud + this.storm * 0.25;

    if (force) this._updateEnvMap();
  }

  _updateEnvMap() {
    if (!this.pmrem) {
      this.pmrem = new THREE.PMREMGenerator(this.renderer);
      this.pmrem.compileEquirectangularShader();
    }
    const envScene = new THREE.Scene();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), this.skyMat);
    sphere.material = this.skyMat;
    envScene.add(sphere);
    // ground disk to avoid black bottom
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x1a1712, side: THREE.DoubleSide });
    const disk = new THREE.Mesh(new THREE.CircleGeometry(90, 24), groundMat);
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = -6;
    envScene.add(disk);
    const rt = this.pmrem.fromScene(envScene, 0.04);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.75;
  }

  update(dt, realDt) {
    // time of day
    this.hour = (this.hour + (dt * 24) / this.dayLength) % 24;

    const theta = ((this.hour - 6) / 24) * TAU;
    const elev = Math.sin(theta);
    const sunDir = _v.set(Math.cos(theta) * 0.85, elev, -0.32).normalize();
    this.skyUniforms.uTime.value += dt;
    this.waterUniforms.uTime.value += dt;
    this.skyUniforms.uFlash.value = this.flash * 0.9;
    this.waterUniforms.uFlash?.value;
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.flashLight.intensity = this.flash * 5;

    if (this.flash > 0.92) this.skyUniforms.uFlash.value = this.flash;

    // cloud/rain transitions
    const targetCloud = this.weather === 'clear' ? 0.24 : this.weather === 'rain' ? 0.85 : 1.0;
    const targetRain = this.weather === 'clear' ? 0 : this.weather === 'rain' ? 0.55 : 1.0;
    this.cloud = damp(this.cloud, targetCloud, 0.5, realDt);
    this.rain = damp(this.rain, targetRain, 0.4, realDt);
    this.storm = this.weather === 'storm' ? 1 : 0;
    this.wind = damp(this.wind, this.weather === 'storm' ? 1.4 : this.weather === 'rain' ? 0.7 : 0.2, 1, realDt);

    // update colours every few frames
    this.envAcc = (this.envAcc || 0) + realDt;
    if (this.envAcc > 0.22) {
      this.envAcc = 0;
      this._updateEnvironment(false);
      this.skyUniforms.uTime.value += 0; // noop
    }
    this.envTimer += realDt;
    const bucket = Math.floor(this.hour * 4) + (this.weather === 'storm' ? 100 : this.weather === 'rain' ? 50 : 0);
    if (bucket !== this.timeBucket && this.envTimer > 6) {
      this.timeBucket = bucket;
      this.envTimer = 0;
      this._updateEnvMap();
    }

    // sun shadow follows the active player
    const p = this.game.player?.group?.position || this.game.camera.position;
    this.sun.target.position.set(p.x, 0, p.z);
    this.sun.target.updateMatrixWorld();
    this.sun.position.set(p.x + sunDir.x * 150, Math.max(40, sunDir.y * 150), p.z + sunDir.z * 150);

    this.sky.position.copy(this.game.camera.position);
    this._updateAtmosphereVisuals(dt);
    this._updateStreetLights();
    this._animateLandmarks(dt);
  }

  _updateStreetLights() {
    if (!this.lampPositions || !this.streetLights) return;
    const t = this.game.elapsed;
    if (this._lightT && t - this._lightT < 0.18) return;
    this._lightT = t;
    const p = this.game.player?.group?.position || this.game.camera.position;
    const night = clamp(1 - smoothstep(-0.18, 0.08, Math.sin(((this.hour - 6) / 24) * TAU)), 0, 1);
    if (night < 0.12) {
      for (const l of this.streetLights) l.intensity = 0;
      return;
    }
    const best = [];
    for (const lp of this.lampPositions) {
      const dx = lp.x - p.x, dz = lp.z - p.z;
      const d = dx * dx + dz * dz;
      if (d > 8100) continue;
      if (best.length < 6) best.push({ d, lp });
      else {
        let mi = 0, md = best[0].d;
        for (let i = 1; i < best.length; i++) if (best[i].d > md) { md = best[i].d; mi = i; }
        if (d < md) best[mi] = { d, lp };
      }
    }
    best.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.streetLights.length; i++) {
      const l = this.streetLights[i];
      const item = best[i];
      if (item) {
        l.position.set(item.lp.x, 6.3, item.lp.z);
        l.intensity = 65 * night * (1 - this.rain * 0.15);
      } else {
        l.intensity = 0;
      }
    }
  }

  _updateAtmosphereVisuals(dt) {
    const nightGlow = clamp((1 - smoothstep(-0.22, 0.06, Math.sin(((this.hour - 6) / 24) * TAU))) + 0.2, 0, 1);
    if (this.lampPools) this.mat.glow.opacity = nightGlow * 0.38;
    if (this.lampHaloMat) this.lampHaloMat.uniforms.uOpacity.value = 0.12 + nightGlow * 0.55;
    if (this.mat.neonReflect) this.mat.neonReflect.opacity = nightGlow * 0.24;
    this.lampMat.color.setRGB(1, 0.8, 0.62).multiplyScalar(0.25 + nightGlow * 1.9);
    if (this.trafficLightMat) {
      const t = (this.game.elapsed * 0.5) % 2;
      this.trafficLightMat.color.set(t < 1 ? 0xff3b3b : 0x36ff7a);
    }
    if (this.flareFlame) {
      const s = 0.85 + Math.sin(this.game.elapsed * 9) * 0.12 + Math.sin(this.game.elapsed * 23) * 0.06;
      this.flareFlame.scale.set(s, 1 + Math.sin(this.game.elapsed * 7) * 0.2, s);
    }
    if (this.ritualRune) {
      this.ritualRune.rotation.z += dt * 0.25;
      this.ritualRune.position.y = 3.2 + Math.sin(this.game.elapsed * 1.5) * 0.3;
    }
    for (const a of this.artifacts) {
      if (a.collected) continue;
      a.shard.rotation.y += dt * 1.4;
      a.shard.position.y = 1.9 + Math.sin(this.game.elapsed * 1.8 + a.x) * 0.25;
    }
    // palm sway
    if (this.palmCrowns && this.palms) {
      const wind = this.wind;
      if (!this._palmT || this.game.elapsed - this._palmT > 0.08) {
        this._palmT = this.game.elapsed;
        for (let i = 0; i < this.palms.length; i++) {
          const p = this.palms[i];
          const ph = this.game.elapsed * 1.3 + i;
          _q.setFromEuler(_e.set(Math.sin(ph) * 0.018 * wind, 0, Math.cos(ph * 0.8) * 0.022 * wind, 'YXZ'));
          _m.makeRotationFromQuaternion(_q);
          _m.scale(_v.set(p.s, p.s, p.s));
          _m.setPosition(p.x, 0, p.z);
          this.palmCrowns.setMatrixAt(i, _m);
        }
        this.palmCrowns.instanceMatrix.needsUpdate = true;
      }
    }
  }

  _animateLandmarks(dt) {
    if (this.ferris) this.ferris.rotation.z += dt * 0.055;
    if (this.lighthouseBeam) this.lighthouseBeam.rotation.y += dt * 0.35;
    if (this.monorail) {
      const t = (this.game.elapsed * 0.025) % 2;
      const k = t < 1 ? t : 2 - t;
      this.monorail.position.x = -580 + k * 1280;
      this.monorail.rotation.y = t < 1 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (this.blimp) {
      this.blimp.position.x = -500 + ((this.game.elapsed * 2.2) % 1400);
      this.blimp.position.z = -350 + Math.sin(this.game.elapsed * 0.02) * 180;
      this.blimp.rotation.y = Math.PI / 2;
    }
  }

  sampleRain() {
    return this.rain;
  }

  districtInfo(x, z) {
    const id = this.regionAt(x, z);
    const d = this.districts.find(k => k.id === id) || this.districts[0];
    return d;
  }
}
