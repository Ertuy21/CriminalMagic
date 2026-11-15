import * as THREE from 'three';
import { TAU, clamp, rand, glowTexture, smokeTexture } from './util.js';

const _v = new THREE.Vector3();

class ParticlePool {
  constructor(scene, count, color, size, blending = THREE.AdditiveBlending, gravity = -8) {
    this.count = count;
    this.gravity = gravity;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.col = new Float32Array(count * 3);
    this.base = new THREE.Color(color);
    this.cursor = 0;
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -9999;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh = new THREE.Points(g, new THREE.PointsMaterial({
      size, map: glowTexture(), vertexColors: true, transparent: true, opacity: 0.95,
      blending, depthWrite: false, toneMapped: false, sizeAttenuation: true,
    }));
    this.mesh.frustumCulled = false;
    this.geo = g;
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, life, color = this.base) {
    const i = this.cursor++ % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; continue; }
      const k = this.life[i] / this.maxLife[i];
      this.vel[i * 3 + 1] += this.gravity * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.col[i * 3] = this.base.r * k;
      this.col[i * 3 + 1] = this.base.g * k;
      this.col[i * 3 + 2] = this.base.b * k;
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }
}

export class FX {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.sparksPool = new ParticlePool(game.scene, 220, 0xffb45c, 0.13, THREE.AdditiveBlending, -14);
    this.magicPool = new ParticlePool(game.scene, 180, 0x7db9ff, 0.16, THREE.AdditiveBlending, -2);
    this.debrisPool = new ParticlePool(game.scene, 80, 0x8a8378, 0.19, THREE.NormalBlending, -22);
    this.tracerCount = 22;
    this.tracers = [];
    this.tracerPos = new Float32Array(this.tracerCount * 6);
    this.tracerCol = new Float32Array(this.tracerCount * 6);
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracerGeo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracerGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.tracerMesh = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.tracerMesh.frustumCulled = false;
    game.scene.add(this.tracerMesh);
    this.tracerCursor = 0;

    this.flashSprites = [];
    const flashTex = glowTexture();
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.scale.setScalar(1);
      s.visible = false;
      game.scene.add(s);
      this.flashSprites.push({ s, life: 0, max: 0.08, grow: 0 });
    }
    this.smokeTex = smokeTexture();
    this.smokeSprites = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0x6b6b72, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      game.scene.add(s);
      this.smokeSprites.push({ s, life: 0, maxLife: 2, vy: 0, vx: 0, vz: 0 });
    }
    this.smokeCursor = 0;

    this.blasts = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({
        color: 0xffa050, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      m.visible = false;
      game.scene.add(m);
      this.blasts.push({ m, life: 0, max: 0.5, radius: 1 });
    }
    this.blastLight = new THREE.PointLight(0xffa050, 0, 60, 2);
    game.scene.add(this.blastLight);
    this.blastLightLife = 0;

    // shockwave rings
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({
        color: 0x9d7bff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      game.scene.add(m);
      this.rings.push({ m, life: 0, max: 0.6, radius: 1 });
    }
    this.ringCursor = 0;

    // rain
    this.rainCount = 650;
    this.rainPos = new Float32Array(this.rainCount * 6);
    this.rainDrops = [];
    for (let i = 0; i < this.rainCount; i++) {
      this.rainDrops.push({ x: rand(-45, 45), y: rand(0, 35), z: rand(-45, 45), v: rand(24, 34) });
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    rg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.rainMesh = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({
      color: 0xa8c0d8, transparent: true, opacity: 0.34, depthWrite: false,
    }));
    this.rainMesh.frustumCulled = false;
    this.scene.add(this.rainMesh);
    this.rainGeo = rg;

    this.screenFlash = 0;
    this.shake = 0;
    this._c = new THREE.Color();
    this._c2 = new THREE.Color();
  }

  muzzle(pos, color = 0xffd9a0, size = 0.55) {
    const f = this.flashSprites.find(x => x.life <= 0) || this.flashSprites[0];
    f.s.position.copy(pos);
    f.s.visible = true;
    f.s.material.color.set(color);
    f.s.material.opacity = 1;
    f.s.scale.setScalar(size);
    f.life = f.max = 0.06;
    f.grow = size * 3;
    const p = this.sparksPool;
    for (let i = 0; i < 3; i++) p.emit(pos.x, pos.y, pos.z, rand(-2, 2), rand(-1, 2), rand(-2, 2), 0.1, this._c.set(color));
  }

  tracer(a, b, color = 0xffd9a0) {
    const i = this.tracerCursor++ % this.tracerCount;
    const t = this.tracers[i] || (this.tracers[i] = { life: 0, max: 0.09 });
    t.life = t.max = 0.09;
    const p = this.tracerPos, c = this.tracerCol;
    p[i * 6] = a.x; p[i * 6 + 1] = a.y; p[i * 6 + 2] = a.z;
    p[i * 6 + 3] = b.x; p[i * 6 + 4] = b.y; p[i * 6 + 5] = b.z;
    this._c.set(color);
    for (let k = 0; k < 2; k++) {
      c[i * 6 + k * 3] = this._c.r;
      c[i * 6 + k * 3 + 1] = this._c.g;
      c[i * 6 + k * 3 + 2] = this._c.b;
    }
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.attributes.color.needsUpdate = true;
  }

  sparks(pos, normal, count = 10, color = 0xffb45c) {
    const p = this.sparksPool;
    const base = this._c.set(color);
    for (let i = 0; i < count; i++) {
      p.emit(
        pos.x, pos.y, pos.z,
        rand(-6, 6) + (normal?.x || 0) * 3,
        rand(2, 9) + (normal?.y || 0) * 2,
        rand(-6, 6) + (normal?.z || 0) * 3,
        rand(0.2, 0.55), base
      );
    }
  }

  magic(pos, count = 8, color = 0x7d9bff) {
    const p = this.magicPool;
    const base = this._c.set(color);
    for (let i = 0; i < count; i++) {
      p.emit(pos.x + rand(-0.3, 0.3), pos.y + rand(-0.2, 0.4), pos.z + rand(-0.3, 0.3), rand(-1.5, 1.5), rand(0.4, 2.8), rand(-1.5, 1.5), rand(0.4, 0.9), base);
    }
  }

  smoke(pos, intensity = 0.5) {
    const s = this.smokeSprites[this.smokeCursor++ % this.smokeSprites.length];
    s.life = s.maxLife = 2.2;
    s.s.position.set(pos.x + rand(-0.4, 0.4), pos.y + 0.6, pos.z + rand(-0.4, 0.4));
    s.s.visible = true;
    s.s.material.opacity = 0.35 * clamp(intensity, 0.2, 1);
    s.s.material.color.set(0x56565e);
    s.s.scale.setScalar(1.4);
    s.vx = rand(-0.4, 0.4); s.vy = 1.4 + rand(0, 1); s.vz = rand(-0.4, 0.4);
  }

  debris(mesh, pos, damage) {
    if (!mesh) return;
    const p = this.debrisPool;
    for (let i = 0; i < 12; i++) {
      p.emit(pos.x + rand(-1, 1), pos.y + rand(0.4, 1.2), pos.z + rand(-1.5, 1.5),
        rand(-4, 4), rand(2, 6), rand(-4, 4), rand(0.5, 1.2), this._c.set(0x777066));
    }
    this.sparks(pos, null, 8);
  }

  explode(pos, radius = 5, color = 0xff8a3c) {
    const b = this.blasts.find(x => x.life <= 0) || this.blasts[0];
    b.m.position.copy(pos);
    b.m.material.color.set(color);
    b.m.material.opacity = 0.9;
    b.m.visible = true;
    b.m.scale.setScalar(0.4);
    b.life = b.max = 0.55;
    b.radius = radius;
    this.sparks(pos, null, 34, 0xffc06a);
    this.magic(pos, 14, color);
    for (let i = 0; i < 4; i++) this.smoke(pos, 0.8);
    this.blastLight.position.copy(pos);
    this.blastLight.color.set(color);
    this.blastLight.intensity = 400;
    this.blastLightLife = 0.18;
    this.shake = Math.min(1, this.shake + 0.35);
    this.game.audio?.explosion();
  }

  shockwave(pos, radius = 12, color = 0x4df3ff) {
    const r = this.rings[this.ringCursor++ % this.rings.length];
    r.m.position.set(pos.x, 0.15, pos.z);
    r.m.material.color.set(color);
    r.m.material.opacity = 0.8;
    r.m.visible = true;
    r.m.scale.setScalar(1);
    r.life = r.max = 0.7;
    r.radius = radius;
    this.magic(pos, 24, color);
  }

  lightning() {
    this.screenFlash = 1;
  }

  update(dt) {
    this.sparksPool.update(dt);
    this.magicPool.update(dt);
    this.debrisPool.update(dt);
    for (let i = 0; i < this.tracerCount; i++) {
      const t = this.tracers[i];
      if (!t) continue;
      t.life -= dt;
      const k = Math.max(0, t.life / t.max);
      const c = this.tracerCol;
      c[i * 6] = 1 * k; c[i * 6 + 1] = 0.82 * k; c[i * 6 + 2] = 0.55 * k;
      c[i * 6 + 3] = 1 * k; c[i * 6 + 4] = 0.82 * k; c[i * 6 + 5] = 0.55 * k;
    }
    this.tracerGeo.attributes.color.needsUpdate = true;

    for (const f of this.flashSprites) {
      if (f.life <= 0) { f.s.visible = false; continue; }
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.s.material.opacity = k;
      f.s.scale.setScalar((f.s.scale.x + f.grow * dt));
      if (f.life <= 0) f.s.visible = false;
    }
    for (const s of this.smokeSprites) {
      if (!s.s.visible) continue;
      s.life -= dt;
      if (s.life <= 0) { s.s.visible = false; continue; }
      const k = s.life / s.maxLife;
      s.s.position.x += s.vx * dt;
      s.s.position.y += s.vy * dt;
      s.s.position.z += s.vz * dt;
      s.s.scale.setScalar(s.s.scale.x + dt * 1.2);
      s.s.material.opacity = 0.32 * k;
    }
    for (const b of this.blasts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const k = 1 - b.life / b.max;
      b.m.scale.setScalar(0.4 + b.radius * k);
      b.m.material.opacity = 0.85 * (1 - k);
      if (b.life <= 0) b.m.visible = false;
    }
    if (this.blastLightLife > 0) {
      this.blastLightLife -= dt;
      this.blastLight.intensity = Math.max(0, this.blastLight.intensity - dt * 2600);
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(1 + k * r.radius);
      r.m.material.opacity = 0.7 * (1 - k);
      if (r.life <= 0) r.m.visible = false;
    }
    this.screenFlash = Math.max(0, this.screenFlash - dt * 5);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this._updateRain(dt);
  }

  _updateRain(dt) {
    const intensity = this.game.world.rain;
    this.rainMesh.visible = intensity > 0.05;
    if (!this.rainMesh.visible) return;
    const cam = this.game.camera.position;
    const wind = this.game.world.wind;
    const p = this.rainPos;
    for (let i = 0; i < this.rainCount; i++) {
      const d = this.rainDrops[i];
      d.y -= d.v * dt;
      d.x += wind * 6 * dt;
      if (d.y < -2) { d.y = 32 + rand(0, 10); d.x = rand(-48, 48); d.z = rand(-48, 48); }
      const x = cam.x + d.x, z = cam.z + d.z;
      const y = cam.y + d.y - 24;
      p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x - wind * 0.5; p[i * 6 + 4] = y + 0.9 + wind; p[i * 6 + 5] = z;
    }
    this.rainGeo.attributes.position.needsUpdate = true;
    this.rainMesh.material.opacity = 0.22 + intensity * 0.4;
  }
}
