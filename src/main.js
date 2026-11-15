import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { World } from './world.js';
import { Crowd } from './characters.js';
import { Wildlife } from './characters.js';
import { Vehicles } from './vehicles.js';
import { Gameplay } from './gameplay.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Missions } from './missions.js';
import { AudioEngine } from './audio.js';
import { clamp, fmtMoney, rand, pick } from './util.js';

const params = new URLSearchParams(location.search);

const QUALITY = {
  low: { pixelRatio: 1.0, shadowMap: 1024, bloom: false, peds: 20, traffic: 8, shadows: true, ssao: false },
  medium: { pixelRatio: 1.25, shadowMap: 1536, bloom: true, peds: 34, traffic: 14, shadows: true, ssao: false },
  high: { pixelRatio: 1.6, shadowMap: 2048, bloom: true, peds: 48, traffic: 20, shadows: true, ssao: true },
  ultra: { pixelRatio: 2.0, shadowMap: 3072, bloom: true, peds: 58, traffic: 26, shadows: true, ssao: true },
};

// One full-screen pass replaces the old SMAA + grade + output trio: ACES
// tonemapping, sRGB encoding, vignette, chromatic aberration, damage tint,
// grain and FXAA all live here. Fewer passes is the single cheapest win on
// integrated GPUs, and the edge blur is good enough that SMAA is not missed.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uTime: { value: 0 }, uNight: { value: 1 }, uSlow: { value: 0 }, uDamage: { value: 0 }, uFlash: { value: 0 },
    uExposure: { value: 1.2 }, uFxaa: { value: 1 }, uAberration: { value: 1 }, uGrain: { value: 0.016 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uTime, uNight, uSlow, uDamage, uFlash, uExposure, uFxaa, uAberration, uGrain;
    varying vec2 vUv;

    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    void main(){
      vec2 p = vUv - 0.5;
      float l = length(p);
      // radial chromatic aberration, stronger while time is slowed
      vec2 ca = p * (0.0009 + uSlow * 0.0028) * uAberration;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - ca).b;

      col = aces(col * uExposure);
      col = toSRGB(col);

      // FXAA on the encoded image: one extra gather set, no extra pass
      if (uFxaa > 0.5) {
        vec3 nw = toSRGB(aces(texture2D(tDiffuse, vUv + vec2(-uTexel.x, -uTexel.y)).rgb * uExposure));
        vec3 ne = toSRGB(aces(texture2D(tDiffuse, vUv + vec2( uTexel.x, -uTexel.y)).rgb * uExposure));
        vec3 sw = toSRGB(aces(texture2D(tDiffuse, vUv + vec2(-uTexel.x,  uTexel.y)).rgb * uExposure));
        vec3 se = toSRGB(aces(texture2D(tDiffuse, vUv + vec2( uTexel.x,  uTexel.y)).rgb * uExposure));
        float lNW = luma(nw), lNE = luma(ne), lSW = luma(sw), lSE = luma(se);
        float lMin = min(luma(col), min(min(lNW, lNE), min(lSW, lSE)));
        float lMax = max(luma(col), max(max(lNW, lNE), max(lSW, lSE)));
        float contrast = lMax - lMin;
        if (contrast > 0.10) {
          vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
          float dlen = length(dir);
          if (dlen > 1e-5) {
            dir = normalize(dir) * uTexel * 1.35;
            vec3 a = toSRGB(aces(texture2D(tDiffuse, vUv + dir).rgb * uExposure));
            vec3 b = toSRGB(aces(texture2D(tDiffuse, vUv - dir).rgb * uExposure));
            col = mix(col, (a + b) * 0.5, clamp(contrast * 3.0, 0.0, 0.75));
          }
        }
      }

      // vignette + cool shadows, warm highlights
      float vig = smoothstep(0.95, 0.26, l);
      col *= mix(0.66, 1.0, vig);
      col = mix(col, col * vec3(0.94, 0.98, 1.06), 0.35 * (1.0 - luma(col)));
      col = mix(col, col * vec3(1.04, 1.0, 0.96), 0.30 * luma(col));
      col = mix(col, col * vec3(0.76, 0.87, 1.14), uSlow * 0.6);

      float edge = smoothstep(0.26, 0.8, l);
      col = mix(col, vec3(0.34, 0.012, 0.03), edge * uDamage * 0.6);

      if (uGrain > 0.0) {
        float g = fract(sin(dot(vUv * vec2(1223.0, 951.0) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        col += (g - 0.5) * uGrain;
      }
      col += uFlash * 0.1;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

class Game {
  constructor() {
    this.params = params;
    this.canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x070b12);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x101a28, 0.0012);
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 6500);
    this.camera.position.set(800, 6, 230);
    this.camera.lookAt(650, 10, -40);

    const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    this.mobile = mobile;
    if (!mobile) document.body.classList.add('no-touch');
    let savedSettings = {};
    try { savedSettings = JSON.parse(localStorage.getItem('mag2026.settings') || '{}'); } catch {}
    const qName = params.get('quality') || savedSettings.quality || (mobile ? 'medium' : 'high');
    this.quality = { ...(QUALITY[qName] || QUALITY.high), level: qName };
    this.settings = { music: 0.32, sfx: 0.7, sens: 1, ...savedSettings, quality: qName };
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.pixelRatio));
    this.renderer.setSize(innerWidth, innerHeight, false);

    this.state = this.newState();
    this.elapsed = 0;
    this.mode = 'menu';
    this.paused = false;
    this.wheelOpen = false;
    this.radialOpen = false;
    this.dialogueOpen = false;
    this.mapOpen = false;
    this.inMission = false;
    this.missionLock = null;
    this.timeSlow = 0;
    this.timeSlowScale = 1;
    this.waypoint = null;
    this.weatherT = 0;
    this.flashT = 0;
    this.lightningT = rand(8, 18);
    this.menuT = 0;
    this.debugCam = params.get('cam') || params.get('px') ? true : false;
    this.freeCam = this.debugCam;
    this.clipReady = false;
    this.autoScale = {
      pr: this.renderer.getPixelRatio(),
      maxPr: this.renderer.getPixelRatio(),
      slow: 0, t: 0,
      // always on: the frame budget is the real limit, and a stable image beats
      // a sharp one that stutters. Mobile starts lower and is allowed to fall further.
      enabled: !this.debugCam,
    };
    this.frameAcc = 0;
    this.frameN = 0;

    this.world = new World(this);
    if (params.get('hour')) this.world.setHour(parseFloat(params.get('hour')));
    if (params.get('weather')) this.world.setWeather(params.get('weather'));
    this.fx = new FX(this);
    this.crowd = new Crowd(this);
    this.wildlife = new Wildlife(this);
    this.vehicles = new Vehicles(this);
    this.gameplay = new Gameplay(this);
    this.heroes = this.gameplay.heroes;
    this.player = this.gameplay.player;
    this.companion = this.gameplay.companion;
    this.cameraRig = this.gameplay.cameraRig;
    this.audio = new AudioEngine();
    this.audio.setVolumes(this.settings.music, this.settings.sfx);
    this.input = new Input(this);
    this.input.setSensitivity(this.settings.sens);
    this.missions = new Missions(this);
    this.ui = new UI(this);
    this.ui.setQualityUI(qName);
    this.ui.setBond(this.state.bond);
    this.ui.updateArtifacts();
    this.ui.updateMoney();
    this.ui.updateContinue();
    this.ui.setHero(this.player);
    this.ui.hideLoading();
    this.setupPost();
    this.setupWaypointMarker();
    this.setupDebugCamera();
    this.bindEvents();
    document.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });

    if (params.get('play')) {
      setTimeout(() => this.startNewGame(), 60);
    }
  }

  newState() {
    return {
      bond: 34, money: 1500, wanted: 0, heat: 0, artifacts: [], opsDone: 0,
      contractsDone: 0, storyDone: 0, chapter: 1, flags: {}, disguise: false,
      contractSeq: 0, ending: null, lastCrime: 0,
    };
  }

  setupPost() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.66, 0.5, 0.63);
    this.bloom.enabled = !!this.quality.bloom;
    this.composer.addPass(this.bloom);
    // three passes total: scene, bloom, then the combined grade/FXAA/output.
    // The old chain ran five (add SMAA + separate OutputPass), which cost ~9 FPS
    // on integrated GPUs for a barely visible difference.
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uTexel.value.set(1 / innerWidth, 1 / innerHeight);
    this.grade.uniforms.uFxaa.value = this.quality.level === 'low' ? 0 : 1;
    this.grade.uniforms.uGrain.value = this.quality.level === 'low' ? 0.010 : 0.016;
    this.composer.addPass(this.grade);
    this.smaa = null;
  }

  setupWaypointMarker() {
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 32), new THREE.MeshBasicMaterial({ color: 0x4df3ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    grp.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 40, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x4df3ff, transparent: true, opacity: 0.055, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    beam.position.y = 20;
    grp.add(beam);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshBasicMaterial({ color: 0x4df3ff, transparent: true, opacity: 0.9, toneMapped: false }));
    gem.position.y = 5;
    grp.add(gem);
    grp.visible = false;
    this.scene.add(grp);
    this.wpMarker = { grp, gem, ring, beam };
  }

  setupDebugCamera() {
    const cam = params.get('cam');
    if (!this.debugCam) return;
    const set = (px, py, pz, tx, ty, tz) => {
      this.camera.position.set(px, py, pz);
      this.camera.lookAt(tx, ty, tz);
    };
    if (cam === 'beach') set(888, 6.5, 300, 380, 26, -260);
    else if (cam === 'skyline') set(1180, 20, 480, 300, 38, -260);
    else if (cam === 'street') set(652, 3.0, -66, -320, 12, -66);
    else if (cam === 'aerial') set(900, 230, 600, 0, 0, -300);
    else if (cam === 'port') set(-640, 18, 1120, -1050, 24, 820);
    else if (cam === 'ritual') set(0, 12, -1190, 0, 6, -1260);
    else if (params.get('px')) {
      set(parseFloat(params.get('px')), parseFloat(params.get('py')), parseFloat(params.get('pz')),
        parseFloat(params.get('tx') || 0), parseFloat(params.get('ty') || 10), parseFloat(params.get('tz') || -100));
    }
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
  }

  bindEvents() {
    addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.audio?.setEngine(0, 0); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.mode === 'play') this.ui.togglePause();
      if (e.code === 'KeyF' && this.mode === 'play') this.missions?.debugSkip?.();
    });
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    if (this.bloom) this.bloom.resolution.set(w / 2, h / 2);
    if (this.grade) this.grade.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  setQuality(q) {
    if (!QUALITY[q]) return;
    this.quality = { ...QUALITY[q], level: q };
    this.settings.quality = q;
    const pr = Math.min(devicePixelRatio, this.quality.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.enabled = !!this.quality.bloom;
    if (this.grade) {
      this.grade.uniforms.uFxaa.value = q === 'low' ? 0 : 1;
      this.grade.uniforms.uGrain.value = q === 'low' ? 0.010 : 0.016;
      this.grade.uniforms.uTexel.value.set(1 / innerWidth, 1 / innerHeight);
    }
    if (this.world?.sun) {
      this.world.sun.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
      if (this.world.sun.shadow.map) {
        this.world.sun.shadow.map.dispose();
        this.world.sun.shadow.map = null;
      }
    }
    this.saveSettings();
  }

  saveSettings() {
    try { localStorage.setItem('mag2026.settings', JSON.stringify(this.settings)); } catch {}
  }

  // -----------------------------------------------------------------------
  startNewGame() {
    this.audio.unlock();
    this.audio.setVolumes(this.settings.music, this.settings.sfx);
    this.audio.startMusic();
    this.state = this.newState();
    this.mode = 'cutscene';
    this.paused = false;
    this.inMission = false;
    this.missionLock = null;
    this.wheelOpen = false;
    this.dialogueOpen = false;
    this.waypoint = null;
    this.ui.hideMenu();
    this.ui.hideLoading();
    this.ui.setBond(this.state.bond);
    this.ui.updateMoney();
    this.ui.updateArtifacts();
    this.ui.setHero(this.player);
    this.ui.hideMission();
    this.ui.el['hud'].classList.remove('hidden');
    this.ui.el.fade.style.opacity = '0.9';
    setTimeout(() => { this.ui.el.fade.style.opacity = '0'; }, 150);
    this.world.setWeather('clear');
    this.world.setHour(21.4);
    const gp = this.gameplay;
    gp.heroes.mage.active = true;
    gp.heroes.lucia.active = false;
    gp.player = gp.heroes.mage;
    gp.companion = gp.heroes.lucia;
    this.player = gp.player;
    this.companion = gp.companion;
    this.cameraRig = gp.cameraRig;
    for (const h of Object.values(gp.heroes)) {
      h.alive = true;
      h.hp = h.hpMax;
      h.mana = h.manaMax;
      h.inVehicle = null;
      h.passenger = false;
      h.group.visible = true;
      h.group.rotation.z = 0;
    }
    gp.heroes.lucia.owned = { pistol: true, smg: false, shotgun: false };
    gp.heroes.lucia.weapon = 'pistol';
    gp.heroes.lucia.setWeapon('pistol');
    this.player.pos.set(758, 0, 96);
    this.player.yaw = Math.PI * 0.82;
    this.player.hp = this.player.hpMax;
    this.player.mana = 100;
    this.player.alive = true;
    this.companion.pos.set(800, 0, 170);
    this.companion.yaw = Math.PI * 1.1;
    this.cameraRig.yaw = -2.0;
    this.cameraRig.pitch = -0.13;
    this.cameraRig.initialized = false;
    this.missions.active = false;
    this.missions.running = false;
    this.missions._stop = false;
    this.missions.current = null;
    this.missions.pendingStory = null;
    this.missions.task = null;
    this.missions.contracts = [];
    this.missions.contractSeq = 0;
    this.missions._genContracts(4);
    this.ui.updateBars();
    this.save();
    setTimeout(() => this.missions.startCampaign(), 400);
  }

  loadGame() {
    let data;
    try { data = JSON.parse(localStorage.getItem('mag2026.save') || 'null'); } catch { data = null; }
    if (!data) { this.startNewGame(); return; }
    this.audio.unlock();
    this.audio.startMusic();
    this.state = { ...this.newState(), ...(data.state || {}) };
    this.world.setHour(data.hour ?? 21.4);
    this.world.setWeather(data.weather || 'clear');
    this.player.pos.set(data.pos?.mage?.x ?? 758, 0, data.pos?.mage?.z ?? 96);
    this.player.yaw = data.pos?.mage?.yaw ?? -2.0;
    this.companion.pos.set(data.pos?.lucia?.x ?? 800, 0, data.pos?.lucia?.z ?? 170);
    this.companion.yaw = data.pos?.lucia?.yaw ?? Math.PI;
    this.player.hp = this.player.hpMax;
    this.player.alive = true;
    if (this.companion) this.companion.alive = true;
    for (const a of this.world.artifacts) {
      if (this.state.artifacts.includes(a.id)) { a.collected = true; a.group.visible = false; }
    }
    this.mode = 'play';
    this.paused = false;
    this.inMission = false;
    this.missionLock = null;
    this.ui.hideMenu();
    this.ui.hideLoading();
    this.ui.setHero(this.player);
    this.ui.setBond(this.state.bond);
    this.ui.updateMoney();
    this.ui.updateArtifacts();
    this.cameraRig.yaw = this.player.yaw;
    this.cameraRig.initialized = false;
    this.missions.active = false;
    this.missions.running = false;
    this.missions._stop = false;
    this.missions.current = null;
    this.missions.pendingStory = null;
    this.missions.task = null;
    this.ui.el.fade.style.opacity = '0.8';
    setTimeout(() => { this.ui.el.fade.style.opacity = '0'; }, 120);
    this.save();
    setTimeout(() => this.missions.startCampaign(), 500);
  }

  save() {
    try {
      const data = {
        v: 1, state: this.state, hour: this.world.hour, weather: this.world.weather,
        pos: {
          mage: { x: this.heroes.mage.pos.x, z: this.heroes.mage.pos.z, yaw: this.heroes.mage.yaw },
          lucia: { x: this.heroes.lucia.pos.x, z: this.heroes.lucia.pos.z, yaw: this.heroes.lucia.yaw },
        },
        savedAt: Date.now(),
      };
      localStorage.setItem('mag2026.save', JSON.stringify(data));
      this.ui.updateContinue();
    } catch {}
  }

  toMenu() {
    this.mode = 'menu';
    this.paused = false;
    this.wheelOpen = false;
    this.timeSlow = 0;
    this.audio?.stopMusic();
    this.audio?.setEngine(0, 0);
    this.cameraRig && (this.cameraRig.initialized = false);
    this.menuT = 0;
  }

  showMenu() {
    this.ui.showMenu();
    this.camera.position.set(790, 5.6, 150);
    this.camera.lookAt(730, 7, 32);
  }

  // -----------------------------------------------------------------------
  setTimeSlow(scale, dur) {
    this.timeSlow = Math.max(this.timeSlow, dur);
    this.timeSlowScale = scale;
  }

  cameraShake(n) { this.cameraRig?.shake(n); }

  setWanted(n) {
    this.state.heat = clamp(n * 20, 0, 100);
    this.state.wanted = n;
    this.state.lastCrime = this.elapsed;
    if (n === 0) this.audio?.play('siren', { on: false });
    this.ui?.setWanted(n, this.state.disguise);
  }

  reportCrime(level, x, z, seen = true) {
    this.gameplay.reportCrime(level, x, z, seen);
  }

  copShoot(agent) { this.gameplay.copShoot(agent); }

  hasLineOfSight(a, b, c, d, e, f) {
    if (typeof a === 'object') return this.gameplay.hasLOS(a, b);
    const dx = d - a, dz = f - c;
    const len = Math.hypot(dx, dz);
    if (len < 1) return true;
    const hit = this.world.raycast(a, b, c, dx / len, (e - b) / len, dz / len, len - 0.4);
    return !hit;
  }

  getCopTarget(agent) { return this.gameplay.getCopTarget(agent); }

  getAimPoint(hero) { return this.gameplay.getAimPoint(hero); }

  addBond(n, label = null) {
    if (!n) return;
    this.state.bond = clamp(this.state.bond + n, 0, 100);
    this.ui?.setBond(this.state.bond, true);
    if (label && n >= 4) this.ui?.toast(label + ' · СВЯЗЬ +' + n);
  }

  selectRadialSlot(i) { this.gameplay.selectRadialSlot(i); }

  cycleAbility() { this.gameplay.cycleAbility(); }

  radialItems() { return this.gameplay.radialItems(); }

  switchCharacter(id) {
    const ok = this.gameplay.switchCharacter(id);
    if (ok) {
      this.player = this.gameplay.player;
      this.companion = this.gameplay.companion;
      this.cameraRig = this.gameplay.cameraRig;
      this.ui.setHero(this.player);
      this.ui.updateBars();
    }
    return ok;
  }

  setWaypoint(x, z, label = 'ЦЕЛЬ') {
    this.waypoint = { x, z, label };
    if (this.wpMarker) {
      this.wpMarker.grp.position.set(x, 0, z);
      this.wpMarker.grp.visible = true;
    }
  }

  clearWaypoint() {
    this.waypoint = null;
    if (this.wpMarker) this.wpMarker.grp.visible = false;
  }

  onHeroDown(hero) {
    if (hero === this.player) {
      this.audio?.setEngine(0, 0);
      this.ui.showDeath();
    } else {
      hero.alive = false;
      this.ui?.toast('ЛЮСИЯ РАНЕНА · ПОДНИМИ ЕЁ', 'bad');
    }
  }

  respawn() {
    const hero = this.player;
    hero.alive = true;
    hero.hp = hero.hpMax;
    hero.mana = 100;
    hero.group.rotation.z = 0;
    hero.model.hips.rotation.x = 0;
    hero.pos.set(748, 0, 78);
    hero.y = 0;
    hero.vy = 0;
    hero.grounded = true;
    if (hero.inVehicle) { hero.inVehicle = null; hero.group.visible = true; }
    this.state.heat = 0;
    this.state.wanted = 0;
    this.state.money = Math.max(0, this.state.money - 150);
    this.ui.updateMoney();
    this.cameraRig.initialized = false;
    this.ui.el.fade.style.opacity = '0';
    this.ui.setHero(hero);
    this.ui.updateBars();
    this.save();
  }

  // -----------------------------------------------------------------------
  animate() {
    const raw = Math.min(this.clockDelta || 0.016, 0.05);
    this.clockDelta = 0;
    this.elapsed += raw;
    const dt = Math.min(0.05, raw || 0.016);

    if (this.mode === 'menu') {
      this.menuT += dt;
      this.world.update(dt, dt);
      this.vehicles.update(dt);
      this.crowd.update(dt);
      this.wildlife.update(dt);
      this.fx.update(dt);
      this.updateMenuCamera(dt);
      this.ui.updateMenuInfo();
      if (this.grade) this.grade.uniforms.uTime.value = this.elapsed;
      this.render();
      if (!this.clipReady) { this.clipReady = true; window.__READY = true; }
      return;
    }

    if (!this.paused && this.mode !== 'ending') {
      this.gameplay.update(dt, dt);
      const slow = this.wheelOpen || this.radialOpen ? 0.16 : this.timeSlow > 0 ? this.timeSlowScale : 1;
      const npcDt = dt * slow;
      this.world.update(dt, dt);
      this.vehicles.update(npcDt);
      this.crowd.update(npcDt);
      this.wildlife.update(npcDt);
      this.fx.update(dt);
      this.missions.update(dt);
      this.updateWaypoint(dt);
      this.audio.update(dt, this);
      this.audio.setNight(1 - clamp(Math.sin(((this.world.hour - 6) / 24) * Math.PI * 2) * 0.5 + 0.5, 0, 1));
      this.ui.update(dt);
      this.updateWeather(dt);
      this.updatePost(dt);
      this.input.endFrame();
      this.saveT = (this.saveT || 0) + dt;
      if (this.saveT > 45) { this.saveT = 0; this.save(); }
    } else {
      this.ui.update(dt);
      this.input.endFrame();
    }
    this.debugFreeCamera();
    this.render();
    this.autoResolution(raw);
    if (!this.clipReady) { this.clipReady = true; window.__READY = true; }
  }

  autoResolution(raw) {
    const a = this.autoScale;
    if (!a?.enabled) return;
    this.frameAcc += raw;
    this.frameN++;
    if (this.frameN < 60) return;
    const avg = this.frameAcc / this.frameN;
    this.frameAcc = 0;
    this.frameN = 0;
    const target = 1 / 50;
    if (avg > target && this.player && !this.paused) a.slow++; else a.slow = Math.max(0, a.slow - 1);
    if (a.slow > 2 && a.pr > 0.62) {
      a.pr = Math.max(0.6, a.pr - 0.1);
      a.slow = 0;
      this.applyPixelRatio(a.pr);
    } else if (avg < 1 / 58 && a.slow === 0 && a.pr < a.maxPr) {
      // headroom again: walk back up slowly so a temporary hitch does not
      // leave the game permanently blurry
      a.pr = Math.min(a.maxPr, a.pr + 0.05);
      this.applyPixelRatio(a.pr);
    }
  }

  applyPixelRatio(pr) {
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer.setSize(innerWidth, innerHeight);
    if (this.bloom) this.bloom.resolution.set(innerWidth / 2, innerHeight / 2);
    if (this.grade) this.grade.uniforms.uTexel.value.set(pr / innerWidth, pr / innerHeight);
  }

  render() {
    if (this.debugCam) {
      this.camera.updateMatrixWorld();
    }
    this.composer.render();
  }

  updateMenuCamera(dt) {
    if (this.freeCam) return;
    const t = this.menuT * 0.06;
    this.camera.position.set(790 + Math.sin(t) * 5, 5.6 + Math.sin(t * 0.7) * 0.3, 150 - Math.cos(t) * 12);
    this.camera.lookAt(730, 7, 32);
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
  }

  debugFreeCamera() {
    if (!this.freeCam) return;
    this.camera.position.copy(this._dbgPos || this.camera.position);
  }

  updateWaypoint(dt) {
    const p = this.player.pos;
    this.wpMarker.grp.position.set(this.waypoint?.x || 0, 0, this.waypoint?.z || 0);
    if (!this.waypoint) { this.wpMarker.grp.visible = false; return; }
    const d = Math.hypot(this.waypoint.x - p.x, this.waypoint.z - p.z);
    this.wpMarker.grp.visible = d > 4;
    this.wpMarker.gem.rotation.y += dt * 1.4;
    this.wpMarker.gem.position.y = 5 + Math.sin(this.elapsed * 2) * 0.25;
    this.wpMarker.ring.rotation.z += dt * 0.4;
  }

  updateWeather(dt) {
    if (this.mode !== 'play') return;
    if (this.elapsed < (this.world.scriptedUntil || 0)) return;
    this.weatherT += dt;
    if (this.weatherT > 210) {
      this.weatherT = 0;
      const r = Math.random();
      const w = r < 0.55 ? 'clear' : r < 0.88 ? 'rain' : 'storm';
      this.world.setWeather(w);
      if (w !== 'clear') this.ui.toast(w === 'storm' ? 'ШТОРМ НАД ЛЕОНИДОЙ' : 'ДОЖДЬ');
    }
    if (this.world.weather === 'storm') {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = rand(7, 16);
        this.world.flashBolt();
        this.fx.lightning();
        setTimeout(() => this.audio.play('thunder', { vol: 0.8 }), rand(300, 1200));
      }
    }
  }

  updatePost(dt) {
    const hp = this.player ? 1 - this.player.hp / this.player.hpMax : 0;
    const u = this.grade.uniforms;
    u.uTime.value = this.elapsed;
    u.uNight.value = 1;
    u.uSlow.value = this.timeSlow > 0 ? 0.8 : 0;
    u.uDamage.value = clamp(hp * 1.4, 0, 0.9);
    u.uFlash.value = this.fx.screenFlash * 0.5;
  }

  // called from requestAnimationFrame wrapper
  get clockDeltaVal() { return 0; }
}

// simple clock that is not THREE.Clock (avoids deprecation)
Game.prototype._tick = function () {};

const game = new Game();
game.clock = { last: performance.now() };
game.clockDelta = 0.016;
function loop(ts) {
  const dt = Math.max(0, (ts - game.clock.last) / 1000);
  game.clock.last = ts;
  game.clockDelta = Math.min(0.05, dt);
  game.animate();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__game = game;

addEventListener('error', (e) => {
  const l = document.getElementById('load-label');
  if (l && !window.__READY) l.textContent = 'ОШИБКА: ' + e.message;
});

