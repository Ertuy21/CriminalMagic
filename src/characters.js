import * as THREE from 'three';
import { TAU, clamp, lerp, damp, angleLerp, rand, pick, mulberry32, addVertexColor, merge } from './util.js';

export { HeroModel } from './heromodel.js';

// ---------------------------------------------------------------------------
// crowds: pedestrians and police, drawn with a handful of instanced meshes
// ---------------------------------------------------------------------------
export class Crowd {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.max = 72;
    this.agents = [];
    this.copCount = 0;
    this.rnd = mulberry32(777);
    this.dummy = new THREE.Object3D();
    this._buildMeshes();
    this.palettes = [
      [0xd7d2c4, 0x2c2f3a], [0x2e4057, 0xd9c9a8], [0x8c2f39, 0xe8e0d0], [0x2d6a4f, 0x1b1d22],
      [0xd98b49, 0x24262c], [0x5b4b8a, 0xd8d2c8], [0x1f6f8b, 0xe3d7c0], [0xb08968, 0x23252b],
      [0xe8e2d6, 0x3b2f2a], [0x394867, 0xc9c0b1],
    ];
    this.hair = [0x1b1614, 0x2f2118, 0x5a3d28, 0x0f0f12, 0x8a6a4a, 0xd9c7a8];
    this.spawnTimer = 0;
    this._initAgents(this.max);
  }

  _buildMeshes() {
    const cap = this.max;
    // A pedestrian is built from tapered primitives rather than capsules, so
    // the silhouette reads as a person: sloping shoulders, a waist, a neck
    // and separate shoes instead of one tube per limb.
    const torsoGeo = new THREE.CylinderGeometry(0.185, 0.135, 0.52, 10, 1);
    torsoGeo.translate(0, 0.30, 0);
    torsoGeo.scale(1, 1, 0.62);
    const neckGeo = new THREE.CylinderGeometry(0.048, 0.055, 0.09, 8);
    neckGeo.translate(0, 0.60, 0);
    const shoulderGeo = new THREE.SphereGeometry(0.075, 8, 6);
    const headGeo = new THREE.SphereGeometry(0.115, 12, 10);
    headGeo.scale(0.92, 1.06, 0.95);
    const hairGeo = new THREE.SphereGeometry(0.118, 12, 8, 0, TAU, 0, Math.PI * 0.58);
    hairGeo.translate(0, 0.018, -0.006);
    const armGeo = new THREE.CylinderGeometry(0.055, 0.041, 0.52, 7);
    armGeo.translate(0, -0.26, 0);
    const handGeo = new THREE.SphereGeometry(0.048, 7, 6);
    handGeo.scale(0.8, 1.05, 0.6);
    handGeo.translate(0, -0.55, 0);
    const legGeo = new THREE.CylinderGeometry(0.072, 0.05, 0.78, 7);
    legGeo.translate(0, -0.39, 0);
    const shoeGeo = new THREE.BoxGeometry(0.085, 0.062, 0.2);
    shoeGeo.translate(0, -0.795, 0.026);
    const capGeo = new THREE.SphereGeometry(0.122, 10, 6, 0, TAU, 0, Math.PI * 0.55);
    capGeo.translate(0, 0.062, 0);

    const mat = (r, m) => new THREE.MeshStandardMaterial({ roughness: r, metalness: m, color: 0xffffff });
    const make = (geo, roughness, metalness = 0.02) => {
      const m = new THREE.InstancedMesh(geo, mat(roughness, metalness), cap);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      this.scene.add(m);
      return m;
    };
    this.torsoMesh = make(torsoGeo, 0.84);
    this.neckMesh = make(neckGeo, 0.7);
    this.shoulderMesh = make(shoulderGeo, 0.82);
    this.headMesh = make(headGeo, 0.68);
    this.hairMesh = make(hairGeo, 0.9);
    this.armLMesh = make(armGeo, 0.8);
    this.armRMesh = make(armGeo, 0.8);
    this.handLMesh = make(handGeo, 0.66);
    this.handRMesh = make(handGeo, 0.66);
    this.legLMesh = make(legGeo, 0.88);
    this.legRMesh = make(legGeo, 0.88);
    this.shoeLMesh = make(shoeGeo, 0.55, 0.12);
    this.shoeRMesh = make(shoeGeo, 0.55, 0.12);
    this.capMesh = make(capGeo, 0.6);
    this.meshes = [
      this.torsoMesh, this.neckMesh, this.shoulderMesh, this.headMesh, this.hairMesh,
      this.armLMesh, this.armRMesh, this.handLMesh, this.handRMesh,
      this.legLMesh, this.legRMesh, this.shoeLMesh, this.shoeRMesh, this.capMesh,
    ];
  }

  _initAgents(n) {
    for (let i = 0; i < n; i++) {
      const a = {
        active: false, type: 'ped', x: 0, z: 0, yaw: 0, speed: 0, phase: rand(0, TAU),
        state: 'walk', target: { x: 0, z: 0 }, timer: 0, hp: 30, down: false,
        coat: 0, pants: 0, skin: 0, cap: false, color: 0,
      };
      this.agents.push(a);
    }
  }

  setColors(a) {
    const pal = this.palettes[Math.floor(this.rnd() * this.palettes.length)];
    a.hairCol = this.hair[Math.floor(this.rnd() * this.hair.length)];
    if (a.type === 'cop') {
      a.coat = 0x1d2a44; a.pants = 0x151a24; a.skin = 0xb98b6b; a.cap = true; a.color = 0x2a3f66;
    } else if (a.type === 'thug') {
      a.coat = 0x1a1418; a.pants = 0x201a1d; a.skin = 0xa67c60; a.cap = false; a.color = 0x5a1e2a;
    } else {
      a.coat = pal[0]; a.pants = pal[1];
      a.skin = [0xd8ad8c, 0xb98a68, 0x8a6249, 0xe3bb99, 0x6e4a35][Math.floor(this.rnd() * 5)];
      a.cap = false;
    }
    a.shoe = a.type === 'cop' ? 0x0d0f14 : (this.rnd() < 0.5 ? 0x121317 : 0xd8d3c6);
    a.build = 0.94 + this.rnd() * 0.14;
  }

  spawnAgent(a, nearX, nearZ, type = 'ped') {
    const angle = this.rnd() * TAU;
    const dist = 28 + this.rnd() * 45;
    a.x = nearX + Math.cos(angle) * dist;
    a.z = nearZ + Math.sin(angle) * dist;
    if (this.game.world.isWater(a.x, a.z)) {
      a.x = nearX + rand(-15, 15);
      a.z = nearZ + rand(-15, 15);
    }
    a.type = type;
    a.active = true;
    a.state = 'walk';
    a.speed = type === 'cop' ? 3.6 : (0.9 + this.rnd() * 0.7);
    a.yaw = this.rnd() * TAU;
    a.hp = type === 'cop' ? 60 : type === 'thug' ? 45 : 24;
    a.down = false;
    a.timer = this.rnd() * 4;
    a.phase = this.rnd() * TAU;
    // a life of their own: every pedestrian is heading somewhere by the clock
    if (type === 'ped') {
      const roles = ['работяга', 'турист', 'курьер', 'рыбак', 'байкер', 'студент', 'охранник', 'бездельник'];
      a.role = roles[Math.floor(this.rnd() * roles.length)];
      a.goal = this._goalFor(a.role, nearX, nearZ);
      a.dwell = 0;
    } else {
      a.role = type === 'cop' ? 'патруль' : 'бандит';
      a.goal = null;
      a.dwell = 0;
    }
    this.setColors(a);
    a.target = this._goalFor(a.role, nearX, nearZ);
  }

  // role → where this person wants to be at the current hour
  _goalFor(role, bx, bz) {
    const g = this.game;
    const hour = g.world.hour;
    const w = g.world;
    const pickAround = (x, z, r) => {
      const a2 = this.rnd() * TAU, rr = this.rnd() * r;
      return { x: x + Math.cos(a2) * rr, z: z + Math.sin(a2) * rr };
    };
    // people stay within a walkable radius of where they already are
    const near = pickAround(bx, bz, 55);
    let want = near;
    if (hour >= 6 && hour < 11) {
      if (role === 'рыбак') want = pickAround(812, 900, 40);
      else if (role === 'курьер') want = pickAround(744, 200, 30);
      else if (role === 'студент') want = pickAround(360, -60, 45);
      else if (role === 'байкер') want = pickAround(-1150, 320, 45);
    } else if (hour >= 11 && hour < 17) {
      if (role === 'турист') want = pickAround(900, 250, 60);
      else if (role === 'работяга') want = pickAround(-940, 900, 55);
      else if (role === 'охранник') want = pickAround(744, 232, 30);
    } else if (hour >= 17 && hour < 22) {
      if (role === 'байкер') want = pickAround(-1170, 310, 40);
      else if (role === 'студент' || role === 'турист') want = pickAround(744, 232, 26);
      else if (role === 'работяга') want = pickAround(745, 60, 22);
    } else {
      if (role === 'бездельник' || role === 'студент') want = pickAround(744, 232, 26);
      else if (role === 'турист') want = pickAround(791, 146, 18);
      else if (this.rnd() > 0.4) want = pickAround(744, 232, 45);
    }
    // if the role's destination is a long hike, walk locally instead
    if (Math.hypot(want.x - bx, want.z - bz) > 110) return near;
    return want;
  }

  // called when the clock flips to a new phase, so the crowd changes its mind
  refreshGoals() {
    const p = this.game.player;
    if (!p) return;
    for (const a of this.agents) {
      if (!a.active || a.type !== 'ped') continue;
      a.goal = this._goalFor(a.role, p.pos.x, p.pos.z);
      a.target = a.goal;
    }
  }

  ensurePopulation() {
    const p = this.game.player;
    if (!p) return;
    const night = this.game.world.hour > 20 || this.game.world.hour < 6;
    const target = Math.round((this.game.quality.peds || 30) * (night ? 0.75 : 1));
    const active = this.agents.filter(a => a.active);
    let peds = active.filter(a => a.type === 'ped').length;
    let cops = active.filter(a => a.type === 'cop').length;
    const wantCops = Math.min(6, Math.ceil(this.game.state.wanted * 1.6));
    for (const a of this.agents) {
      if (peds >= target && cops >= wantCops) break;
      if (a.active) continue;
      if (peds < target) {
        this.spawnAgent(a, p.pos.x, p.pos.z, 'ped');
        peds++;
      } else if (cops < wantCops) {
        this.spawnAgent(a, p.pos.x, p.pos.z, 'cop');
        cops++;
      }
    }
    // despawn far away
    for (const a of this.agents) {
      if (!a.active) continue;
      const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
      const wantCop = a.type === 'cop' ? cops <= wantCops : true;
      if (d > 130 || (a.type === 'cop' && !wantCop)) a.active = false;
    }
    // when the hour thins the streets, release the people farthest from the player
    if (peds > target) {
      const extra = this.agents
        .filter(a => a.active && a.type === 'ped')
        .sort((a, b) => Math.hypot(b.x - p.pos.x, b.z - p.pos.z) - Math.hypot(a.x - p.pos.x, a.z - p.pos.z));
      for (let i = 0; i < peds - target && i < extra.length; i++) extra[i].active = false;
    }
  }

  panic(x, z, radius = 30, callPolice = true) {
    for (const a of this.agents) {
      if (!a.active || a.type !== 'ped') continue;
      if (Math.hypot(a.x - x, a.z - z) < radius) {
        a.state = 'flee';
        a.timer = 6 + this.rnd() * 5;
        a.speed = 3.2 + this.rnd() * 1.2;
      }
    }
    if (callPolice && this.rnd() < 0.35) this.game.reportCrime(1, x, z, false);
  }

  hurtAt(x, z, radius, damage, byPlayer = true) {
    for (const a of this.agents) {
      if (!a.active || a.down) continue;
      if (a.type !== 'ped' && a.type !== 'cop' && a.type !== 'thug') continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < radius) {
        a.hp -= damage;
        if (a.hp <= 0) {
          a.down = true;
          a.speed = 0;
          a.timer = 14;
          if (byPlayer) this.game.reportCrime(a.type === 'cop' ? 4 : 3, a.x, a.z);
        } else {
          a.state = 'flee';
          a.timer = 5;
        }
      }
    }
  }

  copsNear(x, z, r = 30) {
    let n = 0;
    for (const a of this.agents) if (a.active && a.type === 'cop' && !a.down && Math.hypot(a.x - x, a.z - z) < r) n++;
    return n;
  }

  update(dt) {
    const p = this.game.player;
    if (!p) return;
    this.ensurePopulation();
    this.spawnTimer -= dt;
    // shift the crowd's intent when the day turns over
    const phase = Math.floor(this.game.world.hour / 5);
    if (this.dayPhase !== phase) {
      this.dayPhase = phase;
      this.refreshGoals();
    }
    const wanted = this.game.state.wanted;
    let idx = 0;
    const light = this.game.world.hour;
    const night = light > 20 || light < 6;
    // peds react to a drawn weapon or a spell being cast nearby
    const armed = p.id === 'lucia' ? (p.aiming || p.shootAnim > 0.02) : (p.castAnim > 0.02);
    this.reactT = (this.reactT || 0) - dt;
    if (armed && this.reactT <= 0) {
      this.reactT = 0.55;
      for (const a of this.agents) {
        if (!a.active || a.down || a.type !== 'ped') continue;
        const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
        if (d < 14 + (p.id === 'mage' ? 8 : 0)) {
          a.state = 'flee';
          a.timer = 4 + this.rnd() * 4;
          a.speed = 3.2 + this.rnd() * 1.4;
        }
      }
    }
    for (const a of this.agents) {
      if (!a.active) continue;
      const dx = p.pos.x - a.x, dz = p.pos.z - a.z;
      const dist = Math.hypot(dx, dz);
      a.timer -= dt;
      if (a.stun > 0) {
        a.stun -= dt;
        a.speed = 0;
        a.state = 'stun';
        a.phase += dt * 0.4;
      }

      if (a.down) {
        a.speed = 0;
        if (a.timer <= 0) a.active = false;
      } else if (a.stun > 0) {
        // stunned by an EMP — stays put, head down
      } else if (a.type === 'cop') {
        const targetDist = 12;
        if (dist > targetDist) {
          a.yaw = Math.atan2(dx, dz);
          a.speed = 3.8;
          a.state = 'chase';
        } else {
          a.speed = 0; a.state = 'aim';
          a.yaw = Math.atan2(dx, dz);
          if (this.spawnTimer <= 0 && this.game.hasLineOfSight(a.x, 1.5, a.z, p.pos.x, 1.2, p.pos.z)) {
            this.game.copShoot(a);
            this.spawnTimer = 0.55 + this.rnd() * 0.5;
          }
        }
        if (wanted === 0) a.active = false;
        if (dist > 120) a.active = false;
      } else if (a.type === 'thug') {
        if (a.unaware > 0) {
          a.unaware -= dt;
          const noise = Math.abs(p.crouch ? 0 : p.moving || 0);
          const spotted = dist < (p.crouch ? 5 : 11) && this.game.hasLineOfSight(a.x, 1.5, a.z, p.pos.x, 1.2, p.pos.z);
          if (spotted || noise > 6.2 || p.shootAnim > 0 || p.castAnim > 0) {
            a.unaware = 0;
            a.state = 'chase';
          } else {
            a.speed = 0;
            a.state = 'idle';
            a.phase += dt * 1.1;
          }
        } else if (dist > 6) {
          a.yaw = Math.atan2(dx, dz);
          a.speed = 3.2;
          a.state = 'chase';
        } else {
          a.speed = 0;
          a.state = 'aim';
          a.yaw = Math.atan2(dx, dz);
          if (this.spawnTimer <= 0 && this.game.hasLineOfSight(a.x, 1.5, a.z, p.pos.x, 1.2, p.pos.z)) {
            this.game.copShoot(a);
            this.spawnTimer = 0.7 + this.rnd() * 0.7;
          }
        }
      } else if (a.state === 'flee') {
        a.yaw = Math.atan2(a.x - p.pos.x, a.z - p.pos.z);
        a.speed = 3.8;
        if (a.timer <= 0) { a.state = 'walk'; a.speed = 1.1; a.target = this.game.world.randomStreetPoint(this.rnd); }
      } else {
        if (a.state === 'walk' || a.state === 'idle') {
          if (a.dwell > 0) {
            // arrived, doing their thing for a while
            a.dwell -= dt;
            a.speed = 0;
            a.state = 'idle';
            if (a.dwell <= 0) {
              a.goal = this._goalFor(a.role, p.pos.x, p.pos.z);
              a.target = a.goal;
              a.state = 'walk';
              a.timer = 4 + this.rnd() * 8;
            }
          } else {
            const td = Math.hypot(a.target.x - a.x, a.target.z - a.z);
            if (td < 4 || a.timer <= 0) {
              a.state = this.rnd() < 0.6 ? 'idle' : 'walk';
              a.dwell = a.state === 'idle' ? 3 + this.rnd() * 10 : 0;
              a.speed = 0;
              if (!a.dwell) {
                a.target = this._goalFor(a.role, p.pos.x, p.pos.z);
                a.speed = 0.85 + this.rnd() * 0.9;
              }
            }
            if (a.state === 'walk') a.yaw = Math.atan2(a.target.x - a.x, a.target.z - a.z) + Math.sin(this.game.elapsed * 0.5 + a.phase) * 0.2;
          }
        }
        // avoid player
        if (dist < 1.8 && a.state !== 'idle') {
          a.yaw += 0.8;
          a.speed = 1.4;
        }
      }

      // move
      if (a.speed > 0) {
        const nx = a.x + Math.sin(a.yaw) * a.speed * dt;
        const nz = a.z + Math.cos(a.yaw) * a.speed * dt;
        a.x = nx; a.z = nz;
        const pos = { x: a.x, z: a.z };
        if (this.game.world.collideCircle(pos, 0.4)) {
          a.x = pos.x; a.z = pos.z;
          a.yaw += 1.7;
        }
        if (this.game.world.isWater(a.x, a.z)) { a.x -= Math.sin(a.yaw) * 0.6; a.z -= Math.cos(a.yaw) * 0.6; a.yaw += 2.2; }
        a.phase += dt * (a.speed * 2.6 + 1.5);
      } else {
        a.phase += dt * 1.2;
      }

      // write instance matrices
      this._writeAgent(a, idx++);
    }
    for (const m of this.meshes) {
      m.count = idx;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  _writeAgent(a, i) {
    const moving = a.speed > 0.12;
    const sw = Math.sin(a.phase) * (moving ? 0.58 : 0.03);
    const bob = moving ? Math.abs(Math.sin(a.phase)) * 0.026 : Math.sin(this.game.elapsed * 1.5 + a.phase) * 0.006;
    const down = a.down;
    const d = this.dummy;
    const fwdX = Math.sin(a.yaw), fwdZ = Math.cos(a.yaw);
    const rgtX = Math.cos(a.yaw), rgtZ = -Math.sin(a.yaw);
    const build = a.build || 1;
    const aim = a.type === 'cop' && a.state === 'aim' && !down;
    const aimThug = a.type === 'thug' && a.state === 'aim' && !down;
    const armX = down ? 0 : (aim || aimThug) ? -1.35 : -sw * 0.85;
    const hidden = (mesh) => {
      d.scale.set(0.0001, 0.0001, 0.0001);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    };
    if (down) {
      // lying on the ground: squash everything but the torso into place
      const y = 0.14;
      d.rotation.set(0, a.yaw, 0);
      d.scale.set(build, 0.35, build);
      d.position.set(a.x + fwdX * 0.2, y, a.z + fwdZ * 0.2);
      d.updateMatrix();
      this.torsoMesh.setMatrixAt(i, d.matrix);
      d.scale.set(build, 1, build);
      d.position.set(a.x + fwdX * 0.72, 0.16, a.z + fwdZ * 0.72);
      d.updateMatrix();
      this.headMesh.setMatrixAt(i, d.matrix);
      d.position.set(a.x + fwdX * 0.66, 0.17, a.z + fwdZ * 0.66);
      d.updateMatrix();
      this.hairMesh.setMatrixAt(i, d.matrix);
      for (const m of [this.neckMesh, this.shoulderMesh, this.armLMesh, this.armRMesh, this.handLMesh,
        this.handRMesh, this.legLMesh, this.legRMesh, this.shoeLMesh, this.shoeRMesh, this.capMesh]) hidden(m);
    } else {
      // torso + neck
      d.position.set(a.x, 0.86 * build + bob, a.z);
      d.rotation.set(0, a.yaw, 0);
      d.scale.set(build, build, build);
      d.updateMatrix();
      this.torsoMesh.setMatrixAt(i, d.matrix);
      d.position.set(a.x, 1.40 * build + bob, a.z);
      d.updateMatrix();
      this.neckMesh.setMatrixAt(i, d.matrix);
      // shoulders make the silhouette slope instead of ending in a cut tube
      for (const [mesh, s] of [[this.shoulderMesh, 1], [this.shoulderMesh, -1]]) {
        d.position.set(a.x + rgtX * 0.155 * build * s, 1.35 * build + bob, a.z + rgtZ * 0.155 * build * s);
        d.scale.setScalar(build);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      // head + hair
      d.position.set(a.x, 1.60 * build + bob, a.z);
      d.rotation.set(0, a.yaw, (aim || aimThug) ? 0 : Math.sin(a.phase * 0.5) * 0.03);
      d.scale.setScalar(build);
      d.updateMatrix();
      this.headMesh.setMatrixAt(i, d.matrix);
      d.position.set(a.x, 1.60 * build + bob, a.z);
      d.updateMatrix();
      this.hairMesh.setMatrixAt(i, d.matrix);
      // arms with hands
      for (const [mesh, hand, s] of [[this.armLMesh, this.handLMesh, 1], [this.armRMesh, this.handRMesh, -1]]) {
        const armYaw = a.yaw + (aim || aimThug ? (s > 0 ? 0.18 : -0.18) : 0);
        d.position.set(a.x + rgtX * 0.175 * build * s, 1.33 * build + bob, a.z + rgtZ * 0.175 * build * s);
        d.rotation.set(armX * (s > 0 ? 1 : 0.94), armYaw, s * 0.09, 'YXZ');
        d.scale.set(build, build, build);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        hand.setMatrixAt(i, d.matrix);
      }
      // legs with shoes
      for (const [mesh, shoe, s] of [[this.legLMesh, this.shoeLMesh, 1], [this.legRMesh, this.shoeRMesh, -1]]) {
        d.position.set(a.x + rgtX * 0.082 * build * s, 0.86 * build + bob, a.z + rgtZ * 0.082 * build * s);
        d.rotation.set(sw * 0.95 * s, a.yaw, 0, 'YXZ');
        d.scale.set(build, build, build);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        // shoes follow the swing with a small counter-rotation
        d.rotation.set(sw * 0.95 * s * 0.35, a.yaw, 0, 'YXZ');
        d.updateMatrix();
        shoe.setMatrixAt(i, d.matrix);
      }
      // cap
      if (a.cap) {
        d.position.set(a.x, 1.585 * build + bob, a.z);
        d.rotation.set(0, a.yaw, 0);
        d.scale.set(build, build, build);
        d.updateMatrix();
        this.capMesh.setMatrixAt(i, d.matrix);
      } else hidden(this.capMesh);
    }
    // colours
    const cc = this._cc || (this._cc = new THREE.Color());
    this.torsoMesh.setColorAt(i, cc.set(a.coat));
    this.shoulderMesh.setColorAt(i, cc.set(a.coat));
    this.neckMesh.setColorAt(i, cc.set(a.skin));
    this.headMesh.setColorAt(i, cc.set(a.skin));
    this.hairMesh.setColorAt(i, cc.set(a.hairCol || 0x1b1614));
    this.armLMesh.setColorAt(i, cc.set(a.coat));
    this.armRMesh.setColorAt(i, cc.set(a.coat));
    this.handLMesh.setColorAt(i, cc.set(a.skin));
    this.handRMesh.setColorAt(i, cc.set(a.skin));
    this.legLMesh.setColorAt(i, cc.set(a.pants));
    this.legRMesh.setColorAt(i, cc.set(a.pants));
    this.shoeLMesh.setColorAt(i, cc.set(a.shoe || 0x121317));
    this.shoeRMesh.setColorAt(i, cc.set(a.shoe || 0x121317));
    this.capMesh.setColorAt(i, cc.set(a.color));
  }
}

// ---------------------------------------------------------------------------
// birds, gators and dogs — ambient life. Species are procedural archetypes:
// 62 birds, 34 land mammals, 18 marine species, 22 insects/reptiles.
// ---------------------------------------------------------------------------
const BIRD_SPECIES = [
  ['ПЕЛИКАН', 1.6, 0x9a9384, 1.0], ['ЦАПЛЯ', 1.4, 0x8a929c, 1.1], ['СКОПА', 1.2, 0x5d4a3a, 1.3],
  ['ФРЕГАТ', 1.8, 0x2a2a30, 1.4], ['ЧАЙКА', 1.0, 0xd8d4c8, 1.5], ['КРАЧКА', 0.9, 0xe4e0d4, 1.6],
  ['ИБИС', 1.1, 0xe8e2d2, 0.9], ['КОЛИБРИ', 0.4, 0x3fa88a, 2.2], ['ПОПУГАЙ', 0.7, 0x3fa852, 1.4],
  ['АРА', 0.8, 0x2e6fd8, 1.3], ['СОВА', 1.0, 0x6a5a44, 0.8], ['ЯСТРЕБ', 1.2, 0x7a6a52, 1.2],
  ['ГРИФ', 1.9, 0x3a3430, 0.7], ['ДЯТЕЛ', 0.6, 0xc8c8c8, 1.8], ['СИНИЦА', 0.45, 0x4c86c8, 1.9],
  ['МАЛИНОВКА', 0.42, 0xc84a3a, 1.7], ['ЗИМОРОДОК', 0.5, 0x2a8ab4, 2.0], ['ФЛАМИНГО', 1.5, 0xe884a0, 0.9],
  ['БАКЛАН', 1.3, 0x24282c, 1.1], ['КАРАВАЙКА', 1.2, 0x8a4a3a, 1.0], ['ЛУНЬ', 1.3, 0x8a8a90, 1.1],
  ['ПУСТЕЛЬГА', 1.1, 0xb08a52, 1.2], ['КАНЮК', 1.2, 0x6a5238, 1.15], ['ОРЛАН', 1.7, 0x4a3a2a, 0.95],
  ['СКВОРЕЦ', 0.5, 0x2e2e3a, 1.9], ['ДРОЗД', 0.48, 0x6a5240, 1.7], ['ЩЕГОЛ', 0.38, 0xc8b04a, 1.8],
  ['ЧИЖ', 0.34, 0x8aa04a, 2.0], ['ВОРОБЕЙ', 0.3, 0x9a8468, 2.1], ['ВОРОНА', 0.9, 0x1c1c22, 1.2],
  ['СОРОКА', 0.7, 0x22222a, 1.5], ['СОЙКА', 0.62, 0x4a6a9a, 1.6], ['ПЕРЕСМЕШНИК', 0.7, 0x8a8a8a, 1.4],
  ['ТИМЕЛИЯ', 0.55, 0x8a6a4a, 1.3], ['КАРДИНАЛ', 0.45, 0xc83030, 1.8], ['СНЕГИРЬ', 0.42, 0xc84a5a, 1.6],
  ['КУРОПАТКА', 0.5, 0x8a7a5a, 1.2], ['ФАЗАН', 1.0, 0x9a6a3a, 1.1], ['ИНДЕЙКА', 1.3, 0x4a4038, 1.0],
  ['ПАВЛИН', 1.4, 0x2a6a8a, 0.7], ['ЛЕБЕДЬ', 1.8, 0xf0ece0, 0.8], ['ГУСЬ', 1.5, 0x8a8478, 0.9],
  ['УТКА', 0.9, 0x6a5a3a, 1.3], ['НЫРОК', 0.8, 0x3a4a5a, 1.4], ['КРОНШНЕП', 0.7, 0x9a8a6a, 1.5],
  ['ЗУЁК', 0.4, 0xc8bca0, 1.7], ['КУЛИК', 0.5, 0x8a8070, 1.6], ['БЕКАС', 0.55, 0x6a5a44, 1.4],
  ['ПОГАНКА', 0.6, 0x2a3038, 1.4], ['ГАГАРА', 1.1, 0x242c34, 1.1], ['ОЛУША', 1.7, 0x9a9a94, 0.7],
  ['БУРЕВЕСТНИК', 0.7, 0x3a3a44, 1.5], ['АЛЬБАТРОС', 2.0, 0xd0ccc0, 0.6], ['ФАЭТОН', 1.2, 0xe8e4d8, 0.9],
  ['ТУКАН', 0.8, 0x1a1a20, 1.2], ['КАКАДУ', 0.9, 0xf0ece0, 1.1], ['НЕКТАРНИЦА', 0.35, 0x5a8a4a, 2.1],
  ['ТКАЧ', 0.4, 0xc8a03a, 1.9], ['СЛАВКА', 0.38, 0x6a7a4a, 1.8], ['ПЕНОЧКА', 0.32, 0x8a9a5a, 2.0],
  ['КОРОЛЁК', 0.28, 0xc8b04a, 2.2], ['ПОПОЛЗЕНЬ', 0.3, 0x5a6a8a, 2.0],
];

const LAND_SPECIES = [
  ['АЛЛИГАТОР', 2.6, 0x3c4a34, 0.5], ['КРОКОДИЛ', 3.0, 0x4a4a34, 0.45], ['ДИКИЙ КОТ', 0.5, 0x6a5a44, 1.4],
  ['РЫСЬ', 0.9, 0x8a6a44, 1.3], ['ПУМА', 1.2, 0xa8865a, 1.2], ['КОЙОТ', 0.8, 0x8a7a5a, 1.5],
  ['ЛИСА', 0.7, 0xc06a32, 1.4], ['ЕНОТ', 0.6, 0x5a5a60, 1.2], ['СКУНС', 0.5, 0x202024, 1.0],
  ['БРОНЕНОСЕЦ', 0.6, 0x7a6a58, 0.8], ['ОПОССУМ', 0.45, 0x6a6470, 1.1], ['ЗАЯЦ', 0.4, 0x9a8a70, 1.7],
  ['КРОЛИК', 0.3, 0x8a7a64, 1.5], ['ОЛЕНЬ', 1.4, 0x7a5f44, 1.3], ['ЛАНЬ', 1.2, 0x9a7a56, 1.2],
  ['КАБАН', 1.1, 0x4a3a30, 1.0], ['БАРАН', 0.9, 0x8a7a68, 0.9], ['КОЗА', 0.8, 0xb0a08a, 0.8],
  ['МУСТАНГ', 1.5, 0x6a4a32, 1.5], ['КОРОВА', 1.4, 0xc8bca8, 0.5], ['СВИНЬЯ', 0.9, 0xd8b0a0, 0.6],
  ['ОВЧАРКА', 0.9, 0x6a5238, 1.6], ['БУЛЬДОГ', 0.7, 0xb0a08c, 1.3], ['ХАСКИ', 0.85, 0xb8bcc0, 1.7],
  ['МОПС', 0.5, 0xb8a890, 1.2], ['ТЕРЬЕР', 0.4, 0xc8b898, 1.6], ['КОТ', 0.4, 0x8a8078, 1.1],
  ['ХОРЁК', 0.35, 0x8a6a4a, 1.4], ['БЕЛКА', 0.3, 0x9a6a3a, 1.8], ['ЛЕТУЧАЯ МЫШЬ', 0.25, 0x2a2428, 1.9],
  ['ВЫДРА', 0.6, 0x5a4a3a, 1.2], ['НОРКА', 0.4, 0x4a3a2a, 1.3], ['МАНГУСТ', 0.5, 0x8a7a5a, 1.5],
  ['ХОРЬ', 0.38, 0x9a7a5a, 1.4],
];

const MARINE_SPECIES = [
  ['ДЕЛЬФИН', 2.4, 0x5a7a8a, 1.2], ['ЛАМАНТИН', 2.8, 0x7a8078, 0.6], ['МОРСКАЯ ЧЕРЕПАХА', 1.4, 0x4a6a4a, 0.5],
  ['БАРРАКУДА', 1.2, 0x9aaab0, 1.4], ['ТАРПОН', 1.1, 0x8a9a9a, 1.3], ['МУРЕНА', 1.3, 0x5a6a44, 1.0],
  ['СКАТ', 1.6, 0x7a7a6a, 0.7], ['АКУЛА', 2.2, 0x6a7278, 0.9], ['РЫБА-МЕЧ', 2.0, 0x4a5a6a, 1.1],
  ['МЕДУЗА', 0.8, 0xd0d8e0, 0.4], ['ОСЬМИНОГ', 1.0, 0x8a4a4a, 0.6], ['КРАБ', 0.6, 0xc86a4a, 0.8],
  ['ЛОБСТЕР', 0.7, 0x8a3a2a, 0.7], ['КРЕВЕТКА', 0.3, 0xd8b0a8, 1.2], ['МОРСКОЙ КОНЁК', 0.4, 0xc8a85a, 0.5],
  ['ТУНЕЦ', 1.8, 0x4a6a8a, 1.2], ['МАРЛИН', 2.2, 0x3a5a7a, 1.3], ['ПАРУСНИК', 2.0, 0x2a4a7a, 1.1],
  ['МАКРЕЛЬ', 0.7, 0x5a8a9a, 1.5], ['СЕЛЬДЬ', 0.4, 0xa8b8c0, 1.6], ['САРДИНА', 0.3, 0xc0c8cc, 1.7],
  ['ГРУПЕР', 1.4, 0x8a3a3a, 0.8], ['СНЕППЕР', 1.2, 0xc86a6a, 0.9], ['СОМ', 1.6, 0x4a4238, 0.6],
  ['ЩУКА', 1.2, 0x5a6a3a, 1.0], ['КАРП', 0.9, 0x8a6a3a, 0.7], ['УГОРЬ', 1.0, 0x3a3a2a, 0.6],
  ['МОРСКАЯ ЗВЕЗДА', 0.5, 0xc85a3a, 0.3], ['ЁЖ МОРСКОЙ', 0.4, 0x2a2428, 0.2], ['МИДИЯ', 0.2, 0x4a4a5a, 0.1],
  ['УСТРИЦА', 0.25, 0x8a8474, 0.1], ['ГРЕБЕШОК', 0.3, 0xb0a08a, 0.4], ['КАЛЬМАР', 0.8, 0xc0a8a0, 0.7],
  ['НАУТИЛУС', 0.6, 0xc8b8a0, 0.5], ['МЕЧЕХВОСТ', 1.4, 0x3a4a3a, 0.4],
  ['БЕЛУГА', 2.6, 0x8a929a, 0.5], ['КАСАТКА', 3.0, 0x1a1c22, 1.0], ['ГОРБАЧ', 3.4, 0x3a4450, 0.8],
  ['ТРИТОН МОРСКОЙ', 0.5, 0xc88a5a, 0.4], ['КОРАЛЛ', 0.6, 0xe86a5a, 0.05], ['АНЕМОНА', 0.5, 0xc86a8a, 0.08],
  ['ЁРШ', 0.5, 0x8a6a3a, 0.7], ['ПИЛА-РЫБА', 2.0, 0x7a8078, 1.0], ['ХИМЕРА', 1.1, 0x4a4a5a, 0.7],
  ['ЛЬВИНАЯ РЫБА', 0.6, 0xc86a3a, 0.6],
];

const REPTILE_SPECIES = [
  ['ИГУАНА', 1.0, 0x4a8a3a, 0.9], ['ГЕККОН', 0.2, 0xc8a85a, 1.4], ['АНГОЛИС', 0.4, 0x5a6a4a, 1.0],
  ['ЧЕРЕПАХА', 0.6, 0x4a5a3a, 0.4], ['ЗМЕЯ', 1.2, 0x6a7a3a, 0.8], ['ПИТОН', 2.2, 0x8a7a4a, 0.5],
  ['УЖ', 0.8, 0x3a5a3a, 0.9], ['ЛЯГУШКА', 0.3, 0x4a8a4a, 1.1], ['ЖАБА', 0.35, 0x6a5a3a, 0.8],
  ['САЛАМАНДРА', 0.35, 0x8a5a3a, 0.7], ['ТРИТОН', 0.25, 0xc8a03a, 0.8], ['ХАМЕЛЕОН', 0.3, 0x3a9a4a, 0.9],
  ['ВАРАН', 1.8, 0x6a6a3a, 0.7], ['СЦИНК', 0.5, 0x4a5a4a, 1.0], ['АМЕЙВА', 0.4, 0x3a8a6a, 1.1],
  ['КВАКША', 0.22, 0x3ac86a, 1.3], ['ДРЕВЕСНАЯ ЗМЕЯ', 1.4, 0x7a8a3a, 0.8],
];

const INSECT_SPECIES = [
  ['МОТЫЛЁК', 0.2, 0x8a7ac8, 1.8], ['СТРЕКОЗА', 0.25, 0x3a8a9a, 2.2], ['ЦИКАДА', 0.15, 0x4a4a2a, 1.4],
  ['СВЕТЛЯК', 0.1, 0xd8d86a, 1.6], ['ПЧЕЛА', 0.15, 0xd8b03a, 1.8], ['ОСА', 0.16, 0xd8a03a, 1.9],
  ['МУРАВЕЙ', 0.1, 0x2a2420, 1.2], ['ЖУК-ГЕРКУЛЕС', 0.2, 0x3a2a1a, 1.0], ['БАБОЧКА', 0.22, 0xe8a04a, 1.7],
  ['КОМАР', 0.08, 0x3a3a2a, 2.0], ['МУХА', 0.08, 0x2a2a2a, 2.1], ['БОГОМОЛ', 0.3, 0x4a8a3a, 0.8],
  ['СВЕРЧОК', 0.12, 0x4a3a2a, 1.5], ['ТЕРМИТ', 0.08, 0x8a7a5a, 1.1],
];

export class Wildlife {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.time = 0;
    this.rnd = mulberry32(1212);
    this.birds = [];
    this.wingGeo = new THREE.BufferGeometry();
    const verts = new Float32Array([0, 0, 0, 0.12, 0.02, 0.5, 0.02, 0, -0.35]);
    this.wingGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    this.wingGeo.computeVertexNormals();
    this.wingMat = new THREE.MeshBasicMaterial({ color: 0x1a1c22, side: THREE.DoubleSide });
    this.wings = [];
    for (const s of [-1, 1]) {
      const im = new THREE.InstancedMesh(this.wingGeo, this.wingMat, 64);
      im.frustumCulled = false;
      this.scene.add(im);
      this.wings.push({ mesh: im, side: s });
    }
    const birdTotal = 64;
    for (let i = 0; i < birdTotal; i++) {
      const sp = BIRD_SPECIES[i % BIRD_SPECIES.length];
      this.birds.push({
        cx: 700 + this.rnd() * 500, cz: -500 + this.rnd() * 1000,
        r: 20 + this.rnd() * 80, a: this.rnd() * TAU, sp: 0.15 + this.rnd() * 0.3,
        y: 25 + this.rnd() * 55, phase: this.rnd() * TAU, scale: 0.7 + this.rnd() * 0.9,
        species: sp[0], tint: sp[2], flap: sp[3], color: sp[2],
      });
    }
    this.animals = [];
    this.species = {
      birds: BIRD_SPECIES.length,
      land: LAND_SPECIES.length,
      marine: MARINE_SPECIES.length,
      reptiles: REPTILE_SPECIES.length,
      insects: INSECT_SPECIES.length,
      total: BIRD_SPECIES.length + LAND_SPECIES.length + MARINE_SPECIES.length + REPTILE_SPECIES.length + INSECT_SPECIES.length,
      seen: new Set(),
    };
    this._spawnAnimals();
    this._spawnMarine();
    this._spawnSmallFauna();
  }

  _spawnSmallFauna() {
    this.small = [];
    const make = (sp, x, z, flying) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 3, 6), this.smallMat || (this.smallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 })));
      const mesh = body;
      addVertexColor(mesh.geometry, sp[2]);
      g.add(mesh);
      if (flying) {
        for (const s of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.09), new THREE.MeshStandardMaterial({ color: sp[2], transparent: true, opacity: 0.65, side: THREE.DoubleSide, roughness: 0.9 }));
          wing.position.set(s * 0.11, 0.01, 0);
          wing.rotation.z = s * 0.3;
          g.add(wing);
        }
      }
      g.scale.setScalar(sp[1] * 3.4);
      g.position.set(x, flying ? 0.6 + Math.random() * 0.8 : 0.06, z);
      this.scene.add(g);
      this.small.push({ g, kind: sp, x, z, y: g.position.y, phase: this.rnd() * TAU, flying, speed: 0.5 + this.rnd() });
      this.species.seen.add(sp[0]);
    };
    for (let i = 0; i < REPTILE_SPECIES.length; i++) {
      const sp = REPTILE_SPECIES[i];
      const x = -600 + this.rnd() * 1400, z = -600 + this.rnd() * 1700;
      make(sp, sp[0] === 'ЧЕРЕПАХА' ? 960 + this.rnd() * 60 : x, sp[0] === 'ЧЕРЕПАХА' ? -100 + this.rnd() * 300 : z, false);
    }
    for (let i = 0; i < INSECT_SPECIES.length; i++) {
      const sp = INSECT_SPECIES[i];
      make(sp, -200 + this.rnd() * 800, 600 + this.rnd() * 500, true);
    }
  }

  _spawnAnimals() {
    const make = (type, x, z, col, scale, speed, kind) => {
      const geos = [];
      const body = new THREE.BoxGeometry(0.42, 0.42, 1.1);
      body.translate(0, 0.55, 0);
      const head = new THREE.BoxGeometry(0.3, 0.3, 0.42);
      head.translate(0, 0.75, 0.62);
      geos.push(body, head);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = new THREE.BoxGeometry(0.09, 0.45, 0.09);
        leg.translate(sx * 0.14, 0.24, sz * 0.34);
        geos.push(leg);
      }
      const merged = merge(geos);
      addVertexColor(merged, col);
      const mesh = new THREE.Mesh(merged, this.animalMat);
      mesh.castShadow = true;
      const g = new THREE.Group();
      g.add(mesh);
      g.scale.setScalar(scale);
      g.position.set(x, 0, z);
      g.rotation.y = this.rnd() * TAU;
      this.scene.add(g);
      const sp = kind || LAND_SPECIES[this.animals.length % LAND_SPECIES.length];
      this.animals.push({ g, type, kind: sp, x, z, scale, speed, phase: this.rnd() * TAU, alert: 0 });
      this.species.seen.add(sp[0]);
      return g;
    };
    this.animalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
    for (let i = 0; i < 46; i++) {
      const sp = LAND_SPECIES[i % LAND_SPECIES.length];
      let x, z;
      if (i < 8) { x = -180 + this.rnd() * 380; z = 780 + this.rnd() * 220; }
      else if (i < 16) { x = 560 + this.rnd() * 240; z = -160 + this.rnd() * 500; }
      else if (i < 30) { x = -1380 + this.rnd() * 500; z = -900 + this.rnd() * 700; }
      else { x = -1000 + this.rnd() * 900; z = -1800 + this.rnd() * 500; }
      make(sp[0], x, z, sp[2], 0.8 + this.rnd() * 0.7, 0.6 + this.rnd() * 1.4, sp);
    }
    // gator families stay near water
    for (let i = 0; i < 4; i++) make('РђР›Р›РР“РђРўРћР ', -140 + this.rnd() * 420, 820 + this.rnd() * 160, 0x3c4a34, 1.6, 0.35, LAND_SPECIES[0]);
  }

  _spawnMarine() {
    const g = this.scene;
    this.marine = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.1 });
    const make = (kind, x, z, y) => {
      const geos = [];
      const body = new THREE.CapsuleGeometry(0.28, 1.1, 4, 8);
      body.rotateX(Math.PI / 2);
      geos.push(body);
      const fin = new THREE.ConeGeometry(0.26, 0.7, 4);
      fin.translate(0, 0.34, -0.1);
      fin.rotateX(-0.2);
      geos.push(fin);
      const merged = merge(geos);
      addVertexColor(merged, kind[2]);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      const grp = new THREE.Group();
      grp.add(mesh);
      grp.position.set(x, y, z);
      g.add(grp);
      this.marine.push({ g: grp, x, z, y, phase: this.rnd() * TAU, kind, speed: 0.4 + this.rnd() * 0.8 });
      this.species.seen.add(kind[0]);
    };
    for (let i = 0; i < 26; i++) {
      const sp = MARINE_SPECIES[i % MARINE_SPECIES.length];
      const x = 940 + this.rnd() * 420;
      const z = -700 + this.rnd() * 1300;
      make(sp, x, z, -1.2 + this.rnd() * 0.8);
    }
  }

  update(dt) {
    this.time += dt;
    const p = this.game.player;
    const d = this.dummy || (this.dummy = new THREE.Object3D());
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      b.a += b.sp * dt;
      const x = b.cx + Math.cos(b.a) * b.r;
      const z = b.cz + Math.sin(b.a) * b.r;
      const y = b.y + Math.sin(this.time * 0.8 + b.phase) * 3;
      for (const w of this.wings) {
        const flap = Math.sin(this.time * 9 * b.flap + b.phase) * 0.55;
        d.position.set(x, y, z);
        d.rotation.set(0, -b.a + Math.PI / 2, w.side > 0 ? flap : -flap);
        d.scale.setScalar(b.scale);
        d.updateMatrix();
        w.mesh.setMatrixAt(i, d.matrix);
      }
    }
    for (const w of this.wings) {
      w.mesh.count = this.birds.length;
      w.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const a of this.animals) {
      a.phase += dt * a.speed;
      const dx = p ? a.x - p.pos.x : 0, dz = p ? a.z - p.pos.z : 0;
      const dist = Math.hypot(dx, dz);
      a.alert = dist < 12 ? 1 : Math.max(0, a.alert - dt);
      if (a.alert > 0) {
        a.x += (dx / (dist || 1)) * dt * 2.6;
        a.z += (dz / (dist || 1)) * dt * 2.6;
        a.g.rotation.y = Math.atan2(dx, dz);
      } else {
        a.x += Math.sin(a.phase * 0.4) * dt * 0.45;
        a.z += Math.cos(a.phase * 0.31) * dt * 0.4;
        a.g.rotation.y = Math.atan2(Math.cos(a.phase * 0.4), -Math.sin(a.phase * 0.31));
      }
      a.g.position.set(a.x, Math.abs(Math.sin(a.phase * 2)) * 0.03, a.z);
    }
    for (const m of this.marine) {
      m.phase += dt * m.speed;
      m.g.position.set(m.x + Math.sin(m.phase * 0.5) * 7, m.y + Math.sin(m.phase * 1.3) * 0.3, m.z + Math.cos(m.phase * 0.4) * 6);
      m.g.rotation.y = Math.atan2(Math.cos(m.phase * 0.5), -Math.sin(m.phase * 0.4));
    }
    for (const s of this.small) {
      s.phase += dt * s.speed;
      if (s.flying) {
        s.g.position.set(s.x + Math.sin(s.phase * 0.9) * 4, s.y + Math.sin(s.phase * 2.2) * 0.4, s.z + Math.cos(s.phase * 0.7) * 4);
        s.g.rotation.y += dt * 3;
      } else {
        s.g.position.set(s.x + Math.sin(s.phase * 0.3) * 2.4, s.y, s.z + Math.cos(s.phase * 0.24) * 2.1);
        s.g.rotation.y = Math.atan2(Math.cos(s.phase * 0.3), -Math.sin(s.phase * 0.24));
      }
    }
  }

  codex() {
    return {
      total: this.species.total,
      birds: this.species.birds,
      land: this.species.land,
      marine: this.species.marine,
      reptiles: this.species.reptiles,
      insects: this.species.insects,
      seen: this.species.seen.size,
    };
  }
}

