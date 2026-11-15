import * as THREE from 'three';
import { TAU, clamp, lerp, damp, rand, angleDamp, shortAngle, glowTexture, pick, mulberry32 } from './util.js';
import { HeroModel } from './characters.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();

const MAGE_SPELLS = [
  { id: 'fireball', name: 'ОГНЕННЫЙ ШАР', icon: '✦', cost: 12, cd: 0.7 },
  { id: 'shield', name: 'ЩИТ', icon: '◈', cost: 25, cd: 12 },
  { id: 'time', name: 'ЗАМЕДЛЕНИЕ', icon: '◷', cost: 30, cd: 20 },
  { id: 'illusion', name: 'ИЛЛЮЗИЯ', icon: '❖', cost: 20, cd: 14 },
  { id: 'levitate', name: 'ЛЕВИТАЦИЯ', icon: '↑', cost: 10, cd: 6 },
  { id: 'portal', name: 'ПОРТАЛ', icon: '◎', cost: 34, cd: 22 },
  { id: 'enchant', name: 'ЗАЧАРОВАТЬ', icon: '⌁', cost: 20, cd: 15 },
];

const WEAPONS = {
  pistol: { name: 'ПИСТОЛЕТ', mag: 12, dmag: 26, rate: 0.26, spread: 0.008, auto: false, reload: 1.15, pellets: 1, reserve: 84 },
  smg: { name: 'ПП «ОСА»', mag: 30, dmag: 14, rate: 0.075, spread: 0.028, auto: true, reload: 1.55, pellets: 1, reserve: 150 },
  shotgun: { name: 'ДРОБОВИК', mag: 6, dmag: 12, rate: 0.8, spread: 0.07, auto: false, reload: 2.1, pellets: 7, reserve: 36 },
};

class Hero {
  constructor(game, id, x, z, yaw = 0) {
    this.game = game;
    this.id = id;
    this.model = new HeroModel(id);
    this.model.setGlowTexture(glowTexture());
    this.group = this.model.group;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
    game.scene.add(this.group);
    this.yaw = yaw;
    this.pos = this.group.position;
    this.vel = new THREE.Vector3();
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.crouch = false;
    this.moving = 0;
    this.running = false;
    this.aiming = false;
    this.shootAnim = 0;
    this.castAnim = 0;
    this.stepT = 0;
    this.hpMax = id === 'mage' ? 110 : 125;
    this.hp = this.hpMax;
    this.manaMax = 100;
    this.mana = 100;
    this.weapon = 'pistol';
    this.owned = { pistol: true, smg: false, shotgun: false };
    this.mag = { pistol: 12, smg: 30, shotgun: 6 };
    this.reserve = { pistol: 84, smg: 150, shotgun: 36 };
    this.reloadT = 0;
    this.reloadWeapon = null;
    this.fireCd = 0;
    this.spell = 0;
    this.spells = MAGE_SPELLS.map(s => ({ ...s, cdLeft: 0 }));
    this.spellCd = 0;
    this.shieldHp = 0;
    this.shieldMesh = null;
    this.shieldTime = 0;
    this.enchant = 0;
    this.levitate = 0;
    this.glide = false;
    this.empCd = 0;
    this.medkits = 3;
    this.alive = true;
    this.downT = 0;
    this.inVehicle = null;
    this.passenger = false;
    this.deathT = 0;
    this.interaction = null;
    this.lastDamage = -10;
    this.stamina = 1;
    this.footT = 0;
    this.recoil = 0;
    this.aimPoint = new THREE.Vector3();
    this.aimTarget = null;
    this.acting = false;
    this.agro = 0;
  }

  get weaponData() { return WEAPONS[this.weapon] || WEAPONS.pistol; }

  giveAmmo(type, n) { this.reserve[type] = (this.reserve[type] || 0) + n; }

  setWeapon(w) {
    if (this.id !== 'lucia') return;
    if (!WEAPONS[w] || !this.owned[w]) return;
    this.weapon = w;
    this.model.setWeapon(w);
    this.reloadT = 0;
    this.fireCd = 0.15;
  }

  update(dt, active) {
    const g = this.game;
    if (!this.alive) {
      this.deathT += dt;
      this.model.update(dt, { dead: true });
      return;
    }
    this.aiming = false;
    this.shootAnim = Math.max(0, this.shootAnim - dt);
    this.castAnim = Math.max(0, this.castAnim - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.empCd = Math.max(0, this.empCd - dt);
    for (const s of this.spells) s.cdLeft = Math.max(0, s.cdLeft - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    if (this.shieldTime <= 0 && this.shieldHp > 0) this._removeShield();
    if (this.enchant > 0) this.enchant -= dt;
    this.mana = Math.min(this.manaMax, this.mana + dt * (6 + (g.timeSlow > 0 ? 4 : 0)));
    this.levitate = Math.max(0, this.levitate - dt);
    this.lastDamage += dt;
    if (this.hp < this.hpMax && this.lastDamage > 6) this.hp = Math.min(this.hpMax, this.hp + dt * 1.4);
    this.recoil = damp(this.recoil, 0, 10, dt);

    if (this.inVehicle) {
      this.updateVehicle(dt, active);
      return;
    }
    this.group.visible = true;
    if (this.passenger) { this.group.visible = false; return; }

    const input = g.input;
    const blocked = g.mode !== 'play' || g.wheelOpen || g.dialogueOpen;
    let mx = blocked ? 0 : input.move.x;
    let my = blocked ? 0 : input.move.y;
    if (active && !blocked) {
      this.crouch = input.crouch;
    }
    if (!active) { mx = 0; my = 0; }

    const camYaw = g.cameraRig.yaw;
    const fwdX = Math.sin(camYaw), fwdZ = Math.cos(camYaw);
    // the camera's right-hand vector on screen is (-cos, +sin); the old
    // (+cos, -sin) mirrored strafing and made the stick feel inverted
    const rgtX = -Math.cos(camYaw), rgtZ = Math.sin(camYaw);
    let dirX = fwdX * my + rgtX * mx;
    let dirZ = fwdZ * my + rgtZ * mx;
    const mag = Math.hypot(dirX, dirZ);
    if (mag > 1) { dirX /= mag; dirZ /= mag; }
    this.running = active && input.runHeld() && !this.crouch;
    let targetSpeed = 0;
    if (mag > 0.08) {
      targetSpeed = (this.crouch ? 2.2 : this.running ? 7.7 : 4.3) * Math.min(1, mag * 1.2);
    }
    const inWater = g.world.isWater(this.pos.x, this.pos.z);
    if (inWater) targetSpeed *= 0.45;
    // acceleration
    const desiredX = dirX * targetSpeed;
    const desiredZ = dirZ * targetSpeed;
    this.vel.x = damp(this.vel.x, desiredX, this.grounded ? 9 : 2.5, dt);
    this.vel.z = damp(this.vel.z, desiredZ, this.grounded ? 9 : 2.5, dt);
    if (mag < 0.03) { this.vel.x = damp(this.vel.x, 0, 12, dt); this.vel.z = damp(this.vel.z, 0, 12, dt); }
    this.moving = Math.hypot(this.vel.x, this.vel.z);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const hit = g.world.collideCircle(this.pos, 0.42);
    if (hit) {
      this.vel.x *= 0.2; this.vel.z *= 0.2;
    }
    // keep out of deep water unless swimming
    if (inWater && this.pos.y < -0.5) this.pos.y = 0;
    // vertical
    if (active && !blocked && input.jumpPressed && this.grounded) {
      this.vy = 7.4;
      this.grounded = false;
      g.audio?.play('jump');
      if (this.levitate > 0) this.vy = 8.6;
    }
    if (!this.grounded) {
      const grav = this.glide && this.vy < 0 ? 7 : 20;
      this.vy -= grav * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.grounded = true; this.glide = false; }
    }
    if (this.levitate > 0 && active && input.jumpPressed && !this.grounded) {
      this.vy = Math.max(this.vy, 3.5);
      this.glide = true;
    }
    this.group.position.y = this.y;
    this.pos.y = this.y;
    if (active && !blocked) {
      this.updateInteraction();
      this.handleAiming(dt);
      this.handleCombat(dt, active);
      if (input.actionPressed) this.interact();
    } else {
      this.interaction = null;
    }
    // face
    let faceYaw = this.yaw;
    if (this.aiming || this.shootAnim > 0 || this.castAnim > 0) faceYaw = camYaw;
    else if (this.moving > 0.3) faceYaw = Math.atan2(this.vel.x, this.vel.z);
    this.yaw = angleDamp(this.yaw, faceYaw, 10, dt);
    this.group.rotation.y = this.yaw;

    this.model.update(dt, {
      speed: clamp(this.moving / 7.7, 0, 1.2),
      run: this.running,
      aiming: this.aiming,
      shooting: this.shootAnim > 0,
      casting: this.castAnim > 0,
      crouch: this.crouch,
      airborne: !this.grounded,
      driving: false,
      dead: false,
      lookYaw: this.aiming ? 0 : 0,
      strafe: mx,
    });
    // footsteps
    if (this.moving > 1.4 && this.grounded) {
      this.stepT -= dt * this.moving;
      if (this.stepT <= 0) {
        this.stepT = 4.2;
        g.audio?.play('step', { vol: 0.4 });
        if (inWater) g.fx?.sparks(this.pos, null, 2, 0x9fd8e8);
      }
    }
    if (this.shieldMesh) {
      this.shieldMesh.position.copy(this.pos);
      this.shieldMesh.position.y = 1.0 + Math.sin(g.elapsed * 4) * 0.04;
    }
    if (this.id === 'lucia') this.model.setWeapon(this.weapon);
  }

  handleAiming(dt) {
    const g = this.game;
    const input = g.input;
    const want = input.aimHeld || input.fireHeld || this.shootAnim > 0.05 || this.castAnim > 0.05;
    this.aiming = want;
    const p = g.getAimPoint(this);
    this.aimPoint.copy(p);
    if (want) g.cameraRig.aim = true;
  }

  handleCombat(dt, active) {
    const g = this.game;
    const input = g.input;
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this._finishReload();
      return;
    }
    if (input.reloadPressed && this.id === 'lucia') this.reload();
    if (input.quickAbility >= 0) g.selectRadialSlot(input.quickAbility);
    if (this.id === 'lucia') {
      const w = this.weaponData;
      if (this.mag[this.weapon] <= 0) {
        if (input.firePressed) this.reload();
        return;
      }
      if ((input.firePressed || (input.fireHeld && (w.auto || w.rate <= 0.3))) && this.fireCd <= 0) {
        this.shoot();
      }
    } else {
      const sp = this.spells[this.spell];
      if ((input.firePressed || (input.fireHeld && sp.id === 'fireball')) && this.fireCd <= 0) {
        if (sp.cdLeft <= 0 && this.mana >= sp.cost) this.cast(sp);
        else if (input.firePressed && this.mana < sp.cost) g.ui?.toast('НЕДОСТАТОЧНО МАНЫ', 'bad');
      }
    }
  }

  shoot() {
    const g = this.game;
    const w = this.weaponData;
    if (this.mag[this.weapon] <= 0) { this.reload(); return; }
    this.mag[this.weapon]--;
    this.fireCd = w.rate;
    this.shootAnim = 0.18;
    g.audio?.play(this.id === 'lucia' ? (this.weapon === 'shotgun' ? 'shotgun' : this.weapon === 'smg' ? 'smg' : 'shot') : 'magic');
    const muzzle = this.getMuzzleWorld();
    g.cameraRig.shake(0.055 + (this.weapon === 'shotgun' ? 0.1 : 0));
    g.gameplay.fireHitscan(this, this.weapon, muzzle);
    if (this.mag[this.weapon] === 0) setTimeout(() => this.reload(), 350);
  }

  reload() {
    if (this.reloadT > 0) return;
    const w = this.weaponData;
    if (this.mag[this.weapon] >= w.mag) return;
    if (this.reserve[this.weapon] <= 0) return;
    this.reloadT = w.reload;
    this.reloadWeapon = this.weapon;
    this.game.audio?.play('reload');
  }

  _finishReload() {
    const w = WEAPONS[this.reloadWeapon];
    if (!w) return;
    const need = w.mag - this.mag[this.reloadWeapon];
    const take = Math.min(need, this.reserve[this.reloadWeapon]);
    this.mag[this.reloadWeapon] += take;
    this.reserve[this.reloadWeapon] -= take;
    this.reloadWeapon = null;
  }

  cast(sp) {
    const g = this.game;
    this.mana -= sp.cost;
    sp.cdLeft = sp.cd;
    this.fireCd = 0.25;
    this.castAnim = 0.35;
    this.aiming = true;
    g.cameraRig.shake(0.04);
    const hand = this.getMuzzleWorld();
    switch (sp.id) {
      case 'fireball': {
        g.audio?.play('magic');
        const dir = _v.copy(this.aimPoint).sub(hand).normalize();
        g.gameplay.spawnFireball(hand, dir.multiplyScalar(42), this);
        g.fx?.magic(hand, 8, 0x8ab6ff);
        break;
      }
      case 'shield': {
        g.audio?.play('magic');
        this.shieldHp = 130;
        this.shieldTime = 8;
        this._makeShield();
        break;
      }
      case 'time': {
        g.audio?.play('magic');
        g.setTimeSlow(0.32, 5.5);
        g.fx?.shockwave(this.pos, 26, 0x9d7bff);
        g.ui?.toast('ВРЕМЯ ЗАМЕДЛЕНО');
        break;
      }
      case 'illusion': {
        g.audio?.play('magic');
        g.gameplay.spawnDecoy(this);
        break;
      }
      case 'levitate': {
        this.levitate = 3.2;
        this.vy = 7.6;
        this.grounded = false;
        this.glide = true;
        g.fx?.shockwave(this.pos, 6, 0x4df3ff);
        g.audio?.play('magic');
        break;
      }
      case 'portal': {
        g.audio?.play('magic');
        const yaw = g.cameraRig.yaw;
        const dist = 62;
        let tx = this.pos.x + Math.sin(yaw) * dist;
        let tz = this.pos.z + Math.cos(yaw) * dist;
        if (g.world.isWater(tx, tz)) { tx = this.pos.x + Math.sin(yaw) * 18; tz = this.pos.z + Math.cos(yaw) * 18; }
        const probe = { x: tx, z: tz };
        g.world.collideCircle(probe, 0.5);
        g.fx?.shockwave(this.pos, 7, 0x9d7bff);
        g.fx?.magic(this.pos.clone().setY(1.1), 16, 0x9d7bff);
        this.pos.x = probe.x;
        this.pos.z = probe.z;
        this.y = 0; this.vy = 0; this.grounded = true;
        this.group.position.y = 0;
        g.fx?.shockwave(this.pos, 7, 0x4df3ff);
        g.fx?.magic(this.pos.clone().setY(1.1), 16, 0x4df3ff);
        g.cameraRig.initialized = false;
        g.ui?.toast('ПОРТАЛ · 62 М');
        break;
      }
      case 'enchant': {
        const comp = g.gameplay.companion;
        if (comp && comp.pos.distanceTo(this.pos) < 20) {
          comp.enchant = 45;
          g.addBond(2, 'СОВМЕСТНАЯ МАГИЯ');
          g.fx?.magic(comp.getMuzzleWorld(), 20, 0xff6fb5);
          g.ui?.toast('ОРУЖИЕ ЛЮСИИ ЗАЧАРОВАНО');
          g.audio?.play('magic');
        } else {
          this.mana += sp.cost;
          sp.cdLeft = 1;
          g.ui?.toast('ЛЮСИЯ СЛИШКОМ ДАЛЕКО', 'bad');
        }
        break;
      }
    }
  }

  _makeShield() {
    if (this.shieldMesh) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), new THREE.MeshBasicMaterial({
      color: 0x4df3ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    const wire = new THREE.Mesh(new THREE.SphereGeometry(1.26, 12, 8), new THREE.MeshBasicMaterial({
      color: 0x4df3ff, wireframe: true, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    m.add(wire);
    m.position.copy(this.pos); m.position.y = 1.0;
    this.game.scene.add(m);
    this.shieldMesh = m;
  }

  _removeShield() {
    if (!this.shieldMesh) return;
    this.game.scene.remove(this.shieldMesh);
    this.shieldMesh.geometry.dispose();
    this.shieldMesh.material.dispose();
    this.shieldMesh = null;
    this.shieldHp = 0;
  }

  getMuzzleWorld() {
    if (this.id === 'lucia' && this.model.muzzle) {
      this.model.muzzle.getWorldPosition(_v);
      return _v.clone();
    }
    if (this.model.arms) {
      this.model.arms.R.hand.getWorldPosition(_v);
      _v.y += 0.15;
      return _v.clone();
    }
    return this.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
  }

  updateVehicle(dt, active) {
    const g = this.game;
    const v = this.inVehicle;
    const input = g.input;
    this.aiming = false;
    this.pos.x = v.pos.x;
    this.pos.z = v.pos.z;
    this.pos.y = 0;
    this.y = 0;
    this.yaw = v.yaw;
    this.group.visible = !!v.isBike;
    if (active && g.mode === 'play' && !g.wheelOpen) {
      const y = input.move.y;
      const x = input.move.x;
      v.controls = { throttle: Math.abs(y) > 0.12 ? y : 0, steer: x, brake: false };
      this.updateInteraction();
      if (input.actionPressed) {
        this.interact();
        if (this.inVehicle !== v) return;
      }
    } else {
      v.controls = { throttle: 0, steer: 0, brake: true };
      this.interaction = null;
    }
    if (v.isBike) {
      this.group.visible = true;
      this.group.position.copy(v.pos);
      this.group.position.y = 0.35;
      this.group.rotation.y = v.yaw;
      this.yaw = v.yaw;
      this.model.update(dt, {
        speed: clamp(Math.abs(v.speed) / 30, 0, 1), run: true, aiming: false, shooting: false,
        casting: false, crouch: false, airborne: false, driving: true, dead: false,
      });
    }
    g.audio?.setEngine(v.speed, v.controls.throttle);
  }

  updateInteraction() {
    const g = this.game;
    const input = g.input;
    let best = null;
    if (this.inVehicle) {
      const v = this.inVehicle;
      const stations = g.gameplay.fuelStations;
      for (const s of stations) {
        if (Math.hypot(v.pos.x - s.x, v.pos.z - s.z) < 7) {
          best = { label: `ЗАПРАВИТЬ · $40`, action: () => g.gameplay.refuel(v) };
          break;
        }
      }
      if (!best) best = { label: 'ВЫЙТИ', action: () => g.gameplay.exitVehicle() };
    } else {
      const near = g.vehicles.nearest(this.pos.x, this.pos.z, 4.3, false) || g.vehicles.nearest(this.pos.x, this.pos.z, 8.5, true);
      if (near) best = { label: near.isBoat ? 'СЕСТЬ В КАТЕР' : near.isBike ? 'СЕСТЬ НА БАЙК' : 'СЕСТЬ', action: () => g.gameplay.enterVehicle(near) };
      if (!best) {
        for (const d of g.world.doors) {
          if (Math.hypot(this.pos.x - d.x, this.pos.z - d.z) < 4.5) {
            const labels = { motel: 'ВОЙТИ В МОТЕЛЬ', club: 'ВОЙТИ В КЛУБ', shop: 'ВОЙТИ В ОРУЖЕЙНУЮ', diner: 'ВОЙТИ В ЗАКУСОЧНУЮ', clinic: 'ВОЙТИ В КЛИНИКУ', garage: 'ВОЙТИ В МАСТЕРСКУЮ', bar: 'ВОЙТИ В БАР', bait: 'ПОДОЙТИ К ПРИЧАЛУ' };
            best = { label: labels[d.id] || 'ВОЙТИ', action: () => g.ui?.openInterior(d.interior || d.id) };
            break;
          }
        }
      }
      if (!best) {
        for (const a of g.world.artifacts) {
          if (!a.collected && Math.hypot(this.pos.x - a.x, this.pos.z - a.z) < 3.4) {
            best = { label: 'ВЗЯТЬ ОСКОЛОК', action: () => g.gameplay.collectArtifact(a) };
            break;
          }
        }
      }
      if (!best && g.gameplay.companion && g.gameplay.companion.hp <= 0 && g.gameplay.companion.pos.distanceTo(this.pos) < 3.5) {
        best = { label: 'ПОДНЯТЬ', action: () => g.gameplay.reviveCompanion() };
      }
      if (!best && this.id === 'lucia') {
        for (const v of g.vehicles.list) {
          const rearX = v.pos.x - Math.sin(v.yaw) * 2.5;
          const rearZ = v.pos.z - Math.cos(v.yaw) * 2.5;
          if (Math.hypot(this.pos.x - rearX, this.pos.z - rearZ) < 2.6 && !v.driver) {
            best = { label: 'БАГАЖНИК', action: () => g.gameplay.trunk(v) };
            break;
          }
        }
      }
      if (!best && g.missions?.interaction) best = g.missions.interaction;
    }
    this.interaction = best;
  }

  interact() {
    if (this.interaction) this.interaction.action();
    this.interaction = null;
  }

  hurt(n, from) {
    if (!this.alive || n <= 0) return;
    this.lastDamage = 0;
    if (this.shieldHp > 0) {
      this.shieldHp -= n;
      this.game.fx?.sparks(this.pos.clone().setY(1.2), null, 6, 0x4df3ff);
      if (this.shieldHp <= 0) this._removeShield();
      return;
    }
    this.hp -= n;
    this.game.ui?.damage(n);
    this.game.cameraRig.shake(0.25);
    this.game.audio?.play('hit');
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deathT = 0;
      this.game.onHeroDown(this);
    }
  }

  heal(n) {
    this.hp = Math.min(this.hpMax, this.hp + n);
    this.alive = true;
  }

  revive() {
    this.hp = Math.max(30, this.hpMax * 0.45);
    this.alive = true;
    this.deathT = 0;
    this.group.rotation.z = 0;
    this.model.hips.rotation.x = 0;
  }

  updateCompanion(dt) {
    const g = this.game;
    if (!this.alive) { this.model.update(dt, { dead: true }); return; }
    if (this.passenger) { this.group.visible = false; return; }
    const player = g.player;
    if (g.mode !== 'play' || g.wheelOpen || !g.gameplay.followEnabled) {
      this.model.update(dt, { speed: 0 });
      return;
    }
    const dist = this.pos.distanceTo(player.pos);
    if (dist > 90) {
      const right = new THREE.Vector3(Math.cos(g.cameraRig.yaw), 0, -Math.sin(g.cameraRig.yaw));
      this.pos.copy(player.pos).addScaledVector(right, 3.2);
      this.pos.z += Math.cos(g.cameraRig.yaw) * 1.5;
    }
    const hostile = g.gameplay.nearestHostile(this.pos, 32);
    let moveTo = null;
    if (hostile) {
      const hd = Math.hypot(hostile.x - this.pos.x, hostile.z - this.pos.z);
      if (hd > 14) moveTo = new THREE.Vector3(hostile.x, 0, hostile.z);
      else if (hd < 6) moveTo = this.pos.clone().add(new THREE.Vector3(this.pos.x - hostile.x, 0, this.pos.z - hostile.z).normalize().multiplyScalar(6));
      this.aiming = true;
      this.yaw = Math.atan2(hostile.x - this.pos.x, hostile.z - this.pos.z);
      this.companionCd = (this.companionCd || 0) - dt;
      if (this.companionCd <= 0 && g.gameplay.hasLOS(this.pos, hostile)) {
        this.companionCd = 0.9 + rand(0, 0.4);
        const from = this.pos.clone().setY(1.4);
        const to = new THREE.Vector3(hostile.x, 1.2, hostile.z);
        if (this.id === 'mage') {
          from.y += 0.1;
          g.fx?.tracer(from, to, 0x7d9bff);
          g.fx?.magic(from, 3, 0x7d9bff);
        } else {
          g.fx?.tracer(from, to, this.enchant > 0 ? 0x4df3ff : 0xffd9a0);
          g.audio?.play('shot', { vol: 0.25 });
        }
        g.gameplay.damageAgent(hostile, this.id === 'mage' ? 11 : 9);
        this.shootAnim = 0.12;
      }
    } else {
      this.aiming = false;
      this.companionCd = 0;
      if (dist > 7) {
        const fwdX = Math.sin(g.cameraRig.yaw), fwdZ = Math.cos(g.cameraRig.yaw);
        const rightX = Math.cos(g.cameraRig.yaw), rightZ = -Math.sin(g.cameraRig.yaw);
        moveTo = player.pos.clone().add(new THREE.Vector3(fwdX * 0.4 + rightX * 2.5, 0, fwdZ * 0.4 + rightZ * 2.5));
      }
    }
    if (moveTo) {
      const dx = moveTo.x - this.pos.x, dz = moveTo.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.6) {
        const sp = Math.min(6.6, d * 2.2);
        const nx = this.pos.x + (dx / d) * sp * dt;
        const nz = this.pos.z + (dz / d) * sp * dt;
        const before = { x: nx, z: nz };
        g.world.collideCircle(before, 0.4);
        this.pos.x = before.x; this.pos.z = before.z;
        this.yaw = angleDamp(this.yaw, Math.atan2(dx, dz), 8, dt);
        this.model.update(dt, { speed: clamp(sp / 7.7, 0, 1), run: sp > 5, aiming: !!hostile, shooting: this.shootAnim > 0, crouch: false, airborne: false });
        this.moving = sp;
        this.stepT = (this.stepT || 0) - dt * sp;
        if (this.stepT <= 0) { this.stepT = 4; g.audio?.play('step', { vol: 0.3 }); }
      } else this.model.update(dt, { speed: 0, aiming: !!hostile });
    } else {
      this.model.update(dt, { speed: 0, aiming: !!hostile, shooting: this.shootAnim > 0 });
    }
    this.group.position.copy(this.pos);
    this.group.position.y = 0;
    this.group.rotation.y = this.yaw;
    this.shootAnim = Math.max(0, this.shootAnim - dt);
    this.enchant = Math.max(0, this.enchant - dt);
  }
}

class CameraRig {
  constructor(game) {
    this.game = game;
    this.yaw = Math.PI * 0.4;
    this.pitch = -0.16;
    this.dist = 6.4;
    this.aim = false;
    this.shakeAmt = 0;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.initialized = false;
    this.dist = 5.8;
  }
  shake(n) { this.shakeAmt = Math.min(1.2, this.shakeAmt + n); }
  update(dt) {
    const g = this.game;
    const input = g.input;
    if (g.mode === 'play' && !g.dialogueOpen) {
      // yaw grows counter-clockwise while the camera looks along +forward,
      // so a rightward swipe must subtract from yaw to turn the view right
      this.yaw -= input.look.x * 0.0026 * (g.settings.sens || 1);
      this.pitch -= input.look.y * 0.0022 * (g.settings.sens || 1);
      this.pitch = clamp(this.pitch, -0.92, 0.58);
    }
    const hero = g.player;
    if (!hero) return;
    const vehicle = hero.inVehicle;
    const baseY = vehicle ? (vehicle.isBoat ? 2.6 : 2.35) : 1.55 + hero.y;
    const target = this.target.set(hero.pos.x, baseY, hero.pos.z);
    if (vehicle) {
      target.set(vehicle.pos.x, baseY, vehicle.pos.z);
      this.yaw = angleDamp(this.yaw, vehicle.yaw, 2.4, dt);
    }
    const aiming = hero.aiming || (this.aim && vehicle);
    this.aim = false;
    const wantDist = vehicle ? (vehicle.isBike ? 6.6 : 9.6) : aiming ? 4.4 : 6.5;
    this.dist = damp(this.dist, wantDist, 6, dt);
    const shoulder = aiming ? 0.65 : 0;
    const cy = Math.cos(this.pitch), sy = Math.sin(this.pitch);
    const fx = Math.sin(this.yaw) * cy, fz = Math.cos(this.yaw) * cy;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const desired = _v.set(
      target.x - fx * this.dist + rx * shoulder,
      target.y + 0.45 - sy * this.dist,
      target.z - fz * this.dist + rz * shoulder
    );
    // camera collision
    const ox = target.x, oy = target.y + 0.2, oz = target.z;
    const dx = desired.x - ox, dy = desired.y - oy, dz = desired.z - oz;
    const len = Math.hypot(dx, dy, dz) || 1;
    const hit = g.world.raycast(ox, oy, oz, dx / len, dy / len, dz / len, len);
    if (hit) {
      const k = Math.max(0.15, (hit.dist - 0.4) / len);
      desired.set(ox + dx * k, oy + dy * k, oz + dz * k);
      if (desired.y < 0.5) desired.y = 0.5;
    }
    if (vehicle) desired.y = Math.max(desired.y, vehicle.isBoat ? 2.2 : 1.9);
    if (!this.initialized) { this.pos.copy(desired); this.initialized = true; }
    this.pos.x = damp(this.pos.x, desired.x, 11, dt);
    this.pos.y = damp(this.pos.y, desired.y, 11, dt);
    this.pos.z = damp(this.pos.z, desired.z, 11, dt);
    const shake = this.shakeAmt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    const cam = g.camera;
    cam.position.copy(this.pos);
    if (shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * shake * 0.35;
      cam.position.y += (Math.random() - 0.5) * shake * 0.28;
      cam.position.z += (Math.random() - 0.5) * shake * 0.35;
    }
    const lookAt = _v2.set(target.x + fx * 8, target.y + 0.1 + sy * 8, target.z + fz * 8);
    cam.lookAt(lookAt);
    cam.fov = damp(cam.fov, aiming ? 52 : 60, 6, dt);
    cam.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------------
export class Gameplay {
  constructor(game) {
    this.game = game;
    this.heroes = {
      mage: new Hero(game, 'mage', 758, 96, -2.0),
      lucia: new Hero(game, 'lucia', 800, 160, -1.4),
    };
    this.player = this.heroes.mage;
    this.companion = this.heroes.lucia;
    this.player.active = true;
    this.cameraRig = new CameraRig(game);
    game.cameraRig = this.cameraRig;
    this.projectiles = [];
    this.decoy = null;
    this.fuelStations = [
      { x: 130, z: -300, name: 'АЗС «ЛЕОНИДА»' },
      { x: -420, z: 306, name: 'АЗС «АМБРОЗИЯ»' },
      { x: 560, z: 300, name: 'АЗС «САУТ-БИЧ»' },
    ];
    this.timeSlow = 0;
    this.timeSlowScale = 1;
    this.hostiles = [];
    this.kills = 0;
    this.followEnabled = true;
    this.heroLight = new THREE.PointLight(0xcfe2ff, 0, 9, 2);
    this.heroLight.position.set(0, 3, 0);
    game.scene.add(this.heroLight);
    this.setPlayerVisible();
    this.companion.model.group.visible = true;
    this.player.model.setWeapon('pistol');
    this.player.model.group.rotation.y = Math.PI * 0.9;
    game.camera.position.set(766, 4, 108);
    game.camera.lookAt(720, 2, 60);
  }

  setPlayerVisible() {
    this.player.group.visible = true;
    this.companion.group.visible = true;
  }

  update(dt, realDt) {
    const g = this.game;
    const slow = g.timeSlow > 0 ? g.timeSlowScale : 1;
    const worldDt = realDt * slow;
    g.input.update(realDt);
    this.player.update(realDt, true);
    this.companion.updateCompanion(worldDt);
    this.updateProjectiles(worldDt);
    if (this.decoy) {
      this.decoy.life -= realDt;
      this.decoy.mesh.rotation.y += realDt * 0.7;
      this.decoy.mesh.position.y = 1 + Math.sin(g.elapsed * 4) * 0.1;
      if (this.decoy.life <= 0) {
        g.scene.remove(this.decoy.mesh);
        this.decoy = null;
      }
    }
    this.cameraRig.update(realDt);
    this.updateWanted(realDt);
    const night = 1 - clamp(Math.sin(((g.world.hour - 6) / 24) * TAU) * 0.5 + 0.5, 0, 1);
    if (this.heroLight) {
      const h = this.player;
      const v = h.inVehicle;
      const px = v ? v.pos.x : h.pos.x;
      const pz = v ? v.pos.z : h.pos.z;
      const fx = Math.sin(this.cameraRig.yaw), fz = Math.cos(this.cameraRig.yaw);
      this.heroLight.position.set(px - fx * 1.2, v ? 3.2 : 2.7 + h.y, pz - fz * 1.2);
      this.heroLight.intensity = 5 + night * 7;
      this.heroLight.color.set(v ? 0xffd9b0 : (h.id === 'mage' ? 0xbfe0ff : 0xffd0e4));
    }
    if (g.timeSlow > 0) {
      g.timeSlow -= realDt;
      g.timeSlowScale = damp(g.timeSlowScale, 1, 1.5, realDt);
      if (g.timeSlow <= 0) g.timeSlowScale = 1;
    }
    // interaction UI
    const inter = this.player.interaction;
    if (g.ui) g.ui.setInteraction(inter);
    g.ui?.setAiming(this.player.aiming && !this.player.inVehicle);
    g.audio?.setEngine(this.player.inVehicle ? this.player.inVehicle.speed : 0, this.player.inVehicle ? 1 : 0);
    this.updateDetection(realDt);
  }

  // Cops and thugs "notice" you through vision cones, noise and distance.
  // The HUD shows only accumulation, so stealth is read from the world.
  updateDetection(dt) {
    const g = this.game;
    const p = this.player;
    if (!p || g.mode !== 'play') { g.ui?.setDetection(0, false); return; }
    let heat = 0;
    const crouch = p.crouch;
    const noisy = p.shootAnim > 0 || p.castAnim > 0 || Math.abs(p.moving || 0) > 6.4;
    const range = crouch ? 9 : noisy ? 30 : 16;
    for (const a of g.crowd.agents) {
      if (!a.active || a.down) continue;
      if (a.type !== 'cop' && a.type !== 'thug') continue;
      if (a.unaware > 0) continue;
      const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
      if (d > range) continue;
      const toA = Math.atan2(a.x - p.pos.x, a.z - p.pos.z);
      const facing = Math.abs(shortAngle(p.yaw + Math.PI, toA)) < 1.3;
      const seen = facing && g.hasLineOfSight(a.x, 1.5, a.z, p.pos.x, 1.2, p.pos.z);
      heat += seen ? 1 : 0.25;
    }
    this.detect = damp(this.detect || 0, clamp(heat * 0.4, 0, 1), heat > 0 ? 5 : 0.9, dt);
    g.ui?.setDetection(this.detect, !p.inVehicle);
  }

  // -------------------------------------------------------------------------
  enterVehicle(v) {
    if (!v || v.driver) return;
    const g = this.game;
    v.enter(this.player);
    this.player.inVehicle = v;
    this.player.group.visible = !!v.isBike;
    if (this.companion && !this.companion.passenger) {
      this.companion.passenger = true;
      this.companion.inVehicle = v;
      this.companion.group.visible = false;
    }
    g.audio?.play('ui');
    g.ui?.toast(v.isBoat ? 'КАТЕР' : v.name || 'ТРАНСПОРТ');
  }

  exitVehicle() {
    const v = this.player.inVehicle;
    if (!v) return;
    if (Math.abs(v.speed) > 6) {
      v.controls = { throttle: 0, steer: 0, brake: true };
      this.game.ui?.toast('СНАЧАЛА ОСТАНОВИСЬ', 'bad');
      return;
    }
    v.exit(this.player);
    if (this.companion && this.companion.passenger) {
      this.companion.passenger = false;
      this.companion.inVehicle = null;
      this.companion.group.visible = true;
      const side = new THREE.Vector3(v.pos.x + Math.cos(v.yaw) * 2.2, 0, v.pos.z - Math.sin(v.yaw) * 2.2);
      this.companion.pos.copy(side);
    }
    this.player.inVehicle = null;
    this.player.group.visible = true;
    v.controls = { throttle: 0, steer: 0, brake: true };
    this.cameraRig.dist = 6.4;
    this.player.pos.set(v.pos.x + Math.cos(v.yaw) * 2.0, 0, v.pos.z - Math.sin(v.yaw) * 2.0);
    this.player.y = 0;
    this.player.grounded = true;
  }

  refuel(v) {
    const g = this.game;
    if (g.state.money < 40) { g.ui?.toast('НЕ ХВАТАЕТ ДЕНЕГ', 'bad'); return; }
    g.state.money -= 40;
    v.addFuel(100);
    g.audio?.play('pickup');
    g.ui?.toast('БАК ЗАПОЛНЕН');
    g.ui?.updateMoney();
  }

  trunk(v) {
    const g = this.game;
    if (this.player.id !== 'lucia') return;
    if (!this.player.owned.smg) {
      this.player.owned.smg = true;
      this.player.mag.smg = WEAPONS.smg.mag;
      this.player.reserve.smg = Math.max(this.player.reserve.smg, 90);
      this.player.setWeapon('smg');
      g.ui?.toast('ПП «ОСА» · ИЗ БАГАЖНИКА');
    } else if (!this.player.owned.shotgun) {
      this.player.owned.shotgun = true;
      this.player.mag.shotgun = WEAPONS.shotgun.mag;
      this.player.reserve.shotgun = Math.max(this.player.reserve.shotgun, 24);
      this.player.setWeapon('shotgun');
      g.ui?.toast('ДРОБОВИК · ИЗ БАГАЖНИКА');
    } else {
      for (const k of ['smg', 'shotgun']) {
        this.player.reserve[k] = Math.min(300, this.player.reserve[k] + 60);
        this.player.mag[k] = WEAPONS[k].mag;
      }
      g.ui?.toast('АРСЕНАЛ ПОПОЛНЕН');
    }
    g.audio?.play('reload');
  }

  collectArtifact(a) {
    const g = this.game;
    if (a.collected) return;
    a.collected = true;
    a.group.visible = false;
    g.state.artifacts.push(a.id);
    g.state.artifactsFound = g.state.artifacts.length;
    g.ui?.toast('ОСКОЛОК РАЗЛОМА · ' + g.state.artifacts.length + ' / 5');
    g.audio?.play('pickup');
    g.fx?.shockwave(this.player.pos, 8, 0x9d7bff);
    g.addBond(2, 'ТАЙНА РАЗЛОМА');
    g.ui?.updateArtifacts();
  }

  reviveCompanion() {
    const g = this.game;
    if (!this.companion || this.companion.alive) return;
    this.companion.revive();
    g.addBond(6, 'СПАСЕНИЕ');
    g.ui?.toast('ЛЮСИЯ СНОВА В СТРОЮ');
    g.audio?.play('heal');
  }

  // -------------------------------------------------------------------------
  spawnFireball(pos, vel, owner) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9d7bff, toneMapped: false }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x6d5bff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.setScalar(2.4);
    mesh.add(glow);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.projectiles.push({ mesh, vel: vel.clone(), life: 3.2, owner, radius: 0.35 });
  }

  updateProjectiles(dt) {
    const g = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const prev = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 2.2 * dt;
      g.fx?.magic(p.mesh.position, 2, 0x6d5bff);
      const speed = p.vel.length();
      const dir = _v3.copy(p.vel).normalize();
      let hit = g.world.raycast(prev.x, prev.y, prev.z, dir.x, dir.y, dir.z, speed * dt + 0.4);
      let agentHit = null;
      for (const a of g.crowd.agents) {
        if (!a.active || a.down || a.type === 'ped') continue;
        const d = Math.hypot(a.x - p.mesh.position.x, a.z - p.mesh.position.z);
        if (d < 1.3) { agentHit = a; break; }
      }
      if (hit || agentHit || p.life <= 0 || p.mesh.position.y < 0) {
        const pos = agentHit ? new THREE.Vector3(agentHit.x, 1.1, agentHit.z) : p.mesh.position.clone();
        if (hit && hit.point.distanceTo(prev) < 0.7) pos.copy(hit.point);
        this.explodeFireball(pos, p.owner);
        g.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  explodeFireball(pos, owner) {
    const g = this.game;
    g.fx?.explode(pos, 4.2, 0x8b6cff);
    g.audio?.play('explosion');
    g.crowd.hurtAt(pos.x, pos.z, 4.5, 45, owner === g.player);
    for (const v of g.vehicles.list) {
      if (Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z) < 4.5) v.applyDamage(35, pos);
    }
    g.reportCrime(2, pos.x, pos.z);
  }

  spawnDecoy(hero) {
    const g = this.game;
    if (this.decoy) g.scene.remove(this.decoy.mesh);
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x8b6cff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.1, 4, 8), mat);
    body.position.y = 1.1;
    grp.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat);
    head.position.y = 1.85;
    grp.add(head);
    grp.position.copy(hero.pos);
    g.scene.add(grp);
    this.decoy = { mesh: grp, life: 8, pos: grp.position };
    g.ui?.toast('ИЛЛЮЗИЯ СОЗДАНА');
  }

  // -------------------------------------------------------------------------
  nearestHostile(pos, range = 40) {
    const g = this.game;
    let best = null, bd = range;
    for (const a of g.crowd.agents) {
      if (!a.active || a.down) continue;
      if (a.type !== 'cop' && a.type !== 'thug') continue;
      const d = Math.hypot(a.x - pos.x, a.z - pos.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  hasLOS(from, agent) {
    const g = this.game;
    const dx = agent.x - from.x, dz = agent.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d < 1) return true;
    const hit = g.world.raycast(from.x, 1.4, from.z, dx / d, -0.01, dz / d, d - 0.5);
    return !hit;
  }

  damageAgent(agent, dmg) {
    if (!agent || agent.down) return;
    if (agent.unaware > 0) { dmg *= 3; agent.unaware = 0; }
    agent.hp -= dmg;
    this.game.fx?.sparks(new THREE.Vector3(agent.x, 1.2, agent.z), null, 4, 0xff6d5c);
    if (agent.hp <= 0) {
      agent.down = true;
      agent.speed = 0;
      agent.timer = 12;
      this.kills++;
      this.game.addBond(1);
      if (agent.type === 'cop') this.game.reportCrime(3, agent.x, agent.z);
      else this.game.reportCrime(2, agent.x, agent.z);
    } else {
      agent.state = 'flee';
      agent.timer = 4;
    }
  }

  getCopTarget(agent) {
    const g = this.game;
    if (this.decoy && this.decoy.life > 0) {
      const d = Math.hypot(this.decoy.mesh.position.x - agent.x, this.decoy.mesh.position.z - agent.z);
      const dp = Math.hypot(g.player.pos.x - agent.x, g.player.pos.z - agent.z);
      if (d < dp + 8) return { pos: this.decoy.mesh.position, life: this.decoy.life, decoy: true };
    }
    return g.player;
  }

  radialItems(hero = this.player) {
    if (hero.id === 'mage') {
      return hero.spells.map((s, i) => ({
        key: 'spell' + i, name: s.name, icon: s.icon, cost: s.cost,
        cd: s.cdLeft, selected: hero.spell === i, locked: hero.mana < s.cost,
        sub: s.cdLeft > 0 ? Math.ceil(s.cdLeft) + 'с' : s.cost + ' МАНЫ',
      }));
    }
    const items = [
      { key: 'pistol', name: 'ПИСТОЛЕТ', icon: '⌐', sub: hero.mag.pistol + '/' + hero.reserve.pistol, selected: hero.weapon === 'pistol' },
      { key: 'smg', name: 'ПП «ОСА»', icon: '≡', sub: hero.owned.smg ? hero.mag.smg + '/' + hero.reserve.smg : 'В БАГАЖНИКЕ', selected: hero.weapon === 'smg', locked: !hero.owned.smg },
      { key: 'shotgun', name: 'ДРОБОВИК', icon: '╦', sub: hero.owned.shotgun ? hero.mag.shotgun + '/' + hero.reserve.shotgun : 'В БАГАЖНИКЕ', selected: hero.weapon === 'shotgun', locked: !hero.owned.shotgun },
      { key: 'emp', name: 'ИМПУЛЬС', icon: 'ϟ', sub: hero.empCd > 0 ? Math.ceil(hero.empCd) + 'с' : 'ГОТОВ', cd: hero.empCd },
      { key: 'medkit', name: 'АПТЕЧКА', icon: '+', sub: '×' + hero.medkits },
      { key: 'hack', name: 'ВЗЛОМ', icon: '⌗', sub: 'КОНТЕКСТ' },
    ];
    return items;
  }

  cycleAbility() {
    const g = this.game;
    const h = this.player;
    if (h.id === 'mage') {
      h.spell = (h.spell + 1) % h.spells.length;
      g.ui?.toast(h.spells[h.spell].name);
      g.audio?.play('ui');
    } else {
      const order = ['pistol', 'smg', 'shotgun'].filter(k => h.owned[k]);
      const i = order.indexOf(h.weapon);
      h.setWeapon(order[(i + 1) % order.length] || 'pistol');
      g.ui?.toast(h.weaponData.name);
      g.audio?.play('ui');
    }
  }

  selectRadialSlot(i, hero = this.player) {    const g = this.game;
    if (hero.id === 'mage') {
      if (i >= 0 && i < hero.spells.length) {
        hero.spell = i;
        g.ui?.toast(hero.spells[i].name);
        g.audio?.play('ui');
      }
      return;
    }    if (i === 0 || i === 1 || i === 2) {
      hero.setWeapon(['pistol', 'smg', 'shotgun'][i]);
      g.audio?.play('ui');
    } else if (i === 3) {
      if (hero.empCd > 0) { g.ui?.toast('ИМПУЛЬС ПЕРЕЗАРЯЖАЕТСЯ', 'bad'); return; }
      hero.empCd = 18;
      hero.castAnim = 0.4;
      g.fx?.shockwave(hero.pos, 16, 0x4df3ff);
      g.audio?.play('magic');
      for (const a of g.crowd.agents) {
        if (!a.active || a.down) continue;
        if (Math.hypot(a.x - hero.pos.x, a.z - hero.pos.z) < 16) {
          a.stun = 5;
          a.state = 'stun';
          a.speed = 0;
        }
      }
      g.ui?.toast('ЭЛЕКТРОМАГНИТНЫЙ ИМПУЛЬС');
    } else if (i === 4) {
      if (hero.medkits <= 0) { g.ui?.toast('АПТЕЧЕК НЕТ', 'bad'); return; }
      if (hero.hp >= hero.hpMax) { g.ui?.toast('ЗДОРОВЬЕ В НОРМЕ'); return; }
      hero.medkits--;
      hero.heal(50);
      g.audio?.play('heal');
      g.fx?.magic(hero.pos.clone().setY(1.2), 10, 0x7dffb2);
      g.ui?.toast('АПТЕЧКА ИСПОЛЬЗОВАНА');
    } else if (i === 5) {
      g.ui?.toast('ВЗЛОМ ДОСТУПЕН У МАГИЧЕСКИХ БАРЬЕРОВ');
    }
  }

  getAimPoint(hero) {
    const g = this.game;
    const cam = g.camera;
    const dir = _v.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    let point = cam.position.clone().addScaledVector(dir, 60);
    // auto aim assist against hostiles
    let best = null, bestScore = 0.985;
    for (const a of g.crowd.agents) {
      if (!a.active || a.down) continue;
      if (a.type !== 'cop' && a.type !== 'thug') continue;
      const ax = a.x - cam.position.x, ay = 1.2 - cam.position.y, az = a.z - cam.position.z;
      const d = Math.hypot(ax, ay, az);
      if (d > 70 || d < 2) continue;
      const dot = (ax * dir.x + ay * dir.y + az * dir.z) / d;
      let score = dot;
      if (score > bestScore && !g.world.raycast(cam.position.x, cam.position.y, cam.position.z, ax / d, ay / d, az / d, d - 0.5)) {
        bestScore = score;
        best = a;
      }
    }
    if (best) point.set(best.x, 1.15, best.z);
    // clamp to walls
    const dist = cam.position.distanceTo(point);
    const hit = g.world.raycast(cam.position.x, cam.position.y, cam.position.z, dir.x, dir.y, dir.z, dist);
    if (hit) point.copy(hit.point);
    return point;
  }

  fireHitscan(hero, type, muzzle) {
    const g = this.game;
    const w = type === 'pistol' ? WEAPONS.pistol : type === 'smg' ? WEAPONS.smg : WEAPONS.shotgun;
    const baseDir = _v.copy(hero.aimPoint).sub(muzzle).normalize();
    if (this.game.player === hero && !hero.aimTarget) {
      const target = g.crowd.agents.find(a => a.x === hero.aimPoint.x && a.z === hero.aimPoint.z);
      if (target) hero.aimTarget = target;
    }
    let anyHit = false;
    for (let p = 0; p < w.pellets; p++) {
      const dir = baseDir.clone();
      dir.x += rand(-w.spread, w.spread);
      dir.y += rand(-w.spread, w.spread) * 0.6;
      dir.z += rand(-w.spread, w.spread);
      dir.normalize();
      const hit = this.rayHit(muzzle, dir, 140);
      const end = hit ? hit.point : muzzle.clone().addScaledVector(dir, 140);
      g.fx?.tracer(muzzle, end, hero.enchant > 0 ? 0x4df3ff : 0xffd9a0);
      if (hit) {
        anyHit = true;
        if (hit.agent) {
          if (hit.agent.type === 'ped') {
            g.reportCrime(3, hit.point.x, hit.point.z);
            g.crowd.panic(hit.point.x, hit.point.z, 30);
          }
          this.damageAgent(hit.agent, w.dmag * (hero.enchant > 0 ? 1.5 : 1));
          g.fx?.sparks(hit.point, hit.normal, 6, 0xff6d5c);
        } else if (hit.vehicle) {
          hit.vehicle.applyDamage(w.dmag * 0.9, hit.point);
          g.fx?.sparks(hit.point, hit.normal, 5, 0xffd9a0);
        } else {
          g.fx?.sparks(hit.point, hit.normal, 5, 0xffd9a0);
        }
      }
      if (p === 0) g.reportCrime(1, hero.pos.x, hero.pos.z, true);
    }
    if (anyHit) g.audio?.play('hit', { vol: 0.4 });
    g.crowd.panic(hero.pos.x, hero.pos.z, 24, false);
  }

  rayHit(origin, dir, maxDist) {
    const g = this.game;
    let best = null;
    let bestT = maxDist;
    const wh = g.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
    if (wh) { bestT = wh.dist; best = { type: 'world', dist: wh.dist, point: wh.point, normal: new THREE.Vector3(0, 1, 0).negate(), box: wh.box }; }
    for (const a of g.crowd.agents) {
      if (!a.active || a.down) continue;
      const ax = a.x - origin.x, ay = 1.1 - origin.y, az = a.z - origin.z;
      const t = ax * dir.x + ay * dir.y + az * dir.z;
      if (t < 0 || t > bestT) continue;
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      if (Math.hypot(px - a.x, py - 1.1, pz - a.z) < 0.55) {
        bestT = t;
        best = { type: 'agent', dist: t, agent: a, point: new THREE.Vector3(px, Math.max(0.4, py), pz), normal: new THREE.Vector3(0, 0.3, 0).normalize() };
      }
    }
    for (const v of g.vehicles.list) {
      const vx = v.pos.x - origin.x, vy = 0.8 - origin.y, vz = v.pos.z - origin.z;
      const t = vx * dir.x + vy * dir.y + vz * dir.z;
      if (t < 0 || t > bestT) continue;
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      if (Math.hypot(px - v.pos.x, pz - v.pos.z) < 1.8 && py > 0 && py < 2.2) {
        bestT = t;
        best = { type: 'vehicle', dist: t, vehicle: v, point: new THREE.Vector3(px, Math.max(0.3, py), pz), normal: new THREE.Vector3(0, 0.5, 0).normalize() };
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  updateWanted(dt) {
    const g = this.game;
    const st = g.state;
    if (!st) return;
    st.wanted = Math.min(5, Math.ceil(st.heat / 20));
    if (st.heat > 0) {
      const cops = g.crowd.copsNear(g.player.pos.x, g.player.pos.z, 26);
      if (cops === 0 && g.elapsed - (st.lastCrime || 0) > 9) st.heat = Math.max(0, st.heat - dt * 3.2);
      if (st.wanted === 0 && st.heat > 0) st.heat = Math.max(0, st.heat - dt * 6);
    }
    const w = Math.ceil(st.heat / 20);
    g.ui?.setWanted(w, st.disguise);
    g.audio?.play('siren', { on: w > 0 });
  }

  reportCrime(level, x, z, seen = true) {
    const g = this.game;
    const st = g.state;
    if (!st) return;
    st.heat = clamp(st.heat + level * 11, 0, 100);
    st.lastCrime = g.elapsed;
    g.crowd.panic(x, z, 45);
    if (level >= 2 && st.wanted === 0) g.ui?.toast('РОЗЫСК', 'bad');
  }

  copShoot(agent) {
    const g = this.game;
    const target = g.getCopTarget ? g.getCopTarget(agent) : g.player;
    if (!target) return;
    const from = new THREE.Vector3(agent.x, 1.45, agent.z);
    const to = new THREE.Vector3(target.pos.x, 1.15 + (target.y || 0), target.pos.z);
    g.fx?.tracer(from, to, 0xffd9a0);
    g.fx?.muzzle(from, 0xffd9a0, 0.35);
    g.audio?.play('shot', { vol: 0.35 });
    if (target === g.player) {
      if (g.player.inVehicle) {
        g.player.inVehicle.applyDamage(rand(3, 6));
      } else {
        g.player.hurt(rand(4, 9), agent);
      }
    } else if (target.hurt) {
      target.hurt(rand(3, 6), agent);
    } else if (target.life !== undefined) {
      target.life -= 1.2;
    }
  }

  onPlayerDeath() {
    const g = this.game;
    g.ui?.showDeath();
  }

  switchCharacter(id) {
    const g = this.game;
    if (!this.heroes[id]) return false;
    if (this.heroes[id] === this.player) return true;
    if (g.missionLock && !g.missionLock.includes(id)) {
      g.ui?.wheelLocked();
      return false;
    }
    if (this.player.inVehicle) this.exitVehicle();
    if (this.player.passenger) { this.player.passenger = false; this.player.group.visible = true; }
    const prev = this.player;
    const next = this.heroes[id];
    const d = prev.pos.distanceTo(next.pos);
    if (d > 90 && !g.inMission) {
      const back = new THREE.Vector3(Math.sin(this.cameraRig.yaw), 0, Math.cos(this.cameraRig.yaw)).multiplyScalar(-5);
      next.pos.copy(prev.pos).add(back);
      next.pos.x += rand(-2, 2);
    }
    prev.active = false;
    next.active = true;
    this.player = next;
    this.companion = prev;
    next.group.visible = true;
    prev.group.visible = true;
    this.cameraRig.yaw = next.yaw;
    this.cameraRig.initialized = false;
    this.cameraRig.pitch = -0.14;
    g.player = next;
    g.companion = prev;
    g.fx?.shockwave(next.pos, 5, id === 'mage' ? 0x4df3ff : 0xff2e88);
    g.audio?.play('switch');
    g.ui?.flash();
    g.ui?.setHero(next);
    if (g.mode === 'play') g.ui?.toast(id === 'mage' ? 'МАГ' : 'ЛЮСИЯ');
    return true;
  }

  addTimeSlow(scale, dur) {
    this.game.setTimeSlow(scale, dur);
  }
}

