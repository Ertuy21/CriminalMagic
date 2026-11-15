import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const shortAngle = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const angleDamp = (a, b, lambda, dt) => a + shortAngle(a, b) * (1 - Math.exp(-lambda * dt));
export const angleLerp = (a, b, t) => a + shortAngle(a, b) * t;

export function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function fmtMoney(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.anisotropy = opts.aniso ?? 4;
  if (opts.repeat) {
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

function noise(g, w, h, count, alpha, size = 1.6) {
  for (let i = 0; i < count; i++) {
    const v = Math.random();
    g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${alpha * Math.random()})`;
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.35, 'rgba(255,255,255,.55)');
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, { clamp: true });
}

export function smokeTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    for (let i = 0; i < 22; i++) {
      const r = 18 + Math.random() * 32;
      const x = w / 2 + (Math.random() - 0.5) * 46;
      const y = h / 2 + (Math.random() - 0.5) * 46;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,.16)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }
  }, { clamp: true });
}

export function asphaltTextures() {
  const map = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#14161a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 18 + Math.random() * 42;
      g.fillStyle = `rgba(${v},${v + 2},${v + 4},${0.25 + Math.random() * 0.5})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    g.strokeStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (Math.random() - 0.5) * 60;
        y += Math.random() * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  const rough = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#8a8a8a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 80;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(28,28,28,.75)');
      grd.addColorStop(0.6, 'rgba(60,60,60,.4)');
      grd.addColorStop(1, 'rgba(120,120,120,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }
    noise(g, w, h, 4000, 0.1);
  }, { srgb: false });
  map.anisotropy = 8;
  return { map, rough };
}

export function concreteTexture(tint = '#8d8b86') {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = Math.random() * 0.22;
      g.fillStyle = `rgba(0,0,0,${v})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    g.strokeStyle = 'rgba(0,0,0,.16)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
  });
}

export function sandTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c7b393';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 9000, 0.16, 1.3);
  });
}

export function grassTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#3d4a2f';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      const v = Math.random();
      g.strokeStyle = `rgba(${40 + v * 50},${58 + v * 46},${30 + v * 26},.4)`;
      g.beginPath();
      const x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4);
      g.stroke();
    }
  });
}

// ---------- building facades ----------
const FACADE_W = 30; // world metres covered by one texture tile (10 windows)
const FACADE_H = 42; // 14 floors x 3m

function facadeStyle(kind, seed) {
  const rnd = mulberry32(seed);
  const W = kind === 'brick' || kind === 'warehouse' ? 512 : 1024;
  const H = W;
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
  const ec = document.createElement('canvas'); ec.width = W; ec.height = H;
  const m = mc.getContext('2d'), e = ec.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);

  let base = '#2b2e35', trim = '#1b1e23', glass = '#0c1319';
  if (kind === 'glass') { base = '#0c1622'; trim = '#20303e'; glass = '#08121c'; }
  if (kind === 'concrete') { base = '#4c4842'; trim = '#33302b'; glass = '#0f1519'; }
  if (kind === 'deco') { base = '#c6b49b'; trim = '#e8d9c0'; glass = '#16232a'; }
  if (kind === 'brick') { base = '#553b32'; trim = '#2c1f1b'; glass = '#111619'; }
  if (kind === 'warehouse') { base = '#5b6061'; trim = '#3b4042'; glass = '#131a1e'; }

  m.fillStyle = base; m.fillRect(0, 0, W, H);
  for (let i = 0; i < 5000; i++) {
    const v = Math.random() * 0.18;
    m.fillStyle = `rgba(0,0,0,${v})`;
    m.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 4, 1 + Math.random() * 4);
  }

  const cols = kind === 'glass' ? 12 : 10;
  const rows = 14;
  const cw = W / cols, ch = H / rows;

  if (kind === 'glass') {
    // curtain wall: dark glass with aluminium mullions
    m.fillStyle = '#0a141e'; m.fillRect(0, 0, W, H);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * cw + 2, y = j * ch + 3, ww = cw - 4, hh = ch - 6;
        const gl = m.createLinearGradient(x, y, x + ww, y + hh);
        gl.addColorStop(0, '#14222f'); gl.addColorStop(0.55, '#0a141d'); gl.addColorStop(1, '#050b12');
        m.fillStyle = gl; m.fillRect(x, y, ww, hh);
        m.fillStyle = 'rgba(180,220,255,.055)';
        m.fillRect(x, y, ww, hh * 0.32);
        if (rnd() < 0.46) {
          const warm = rnd() < 0.55;
          const grd = e.createLinearGradient(x, y, x, y + hh);
          if (warm) {
            grd.addColorStop(0, `rgba(255,${190 + rnd() * 40},${120 + rnd() * 50},${0.55 + rnd() * 0.4})`);
            grd.addColorStop(1, `rgba(255,${120 + rnd() * 40},${50 + rnd() * 40},${0.25 + rnd() * 0.3})`);
          } else {
            grd.addColorStop(0, `rgba(${140 + rnd() * 40},${205 + rnd() * 30},255,${0.35 + rnd() * 0.35})`);
            grd.addColorStop(1, `rgba(40,90,140,${0.15 + rnd() * 0.2})`);
          }
          e.fillStyle = grd; e.fillRect(x, y, ww, hh);
          if (rnd() < 0.4) {
            e.fillStyle = 'rgba(0,0,0,.5)';
            e.fillRect(x, y + hh * (0.55 + rnd() * 0.2), ww, hh * 0.25);
          }
        }
      }
    }
    m.strokeStyle = '#263644'; m.lineWidth = 3;
    for (let i = 0; i <= cols; i++) { m.beginPath(); m.moveTo(i * cw, 0); m.lineTo(i * cw, H); m.stroke(); }
    m.strokeStyle = '#1a2734'; m.lineWidth = 5;
    for (let j = 0; j <= rows; j++) { m.beginPath(); m.moveTo(0, j * ch); m.lineTo(W, j * ch); m.stroke(); }
    // diagonal sheen
    m.save(); m.globalAlpha = 0.05; m.fillStyle = '#cfeaff';
    m.beginPath(); m.moveTo(0, H * 0.2); m.lineTo(W, H * 0.55); m.lineTo(W, H * 0.7); m.lineTo(0, H * 0.35); m.fill();
    m.restore();
  } else {
    const winW = cw * 0.52, winH = ch * 0.52;
    for (let j = 0; j < rows; j++) {
      // floor slab / string course
      m.fillStyle = kind === 'deco' ? trim : 'rgba(0,0,0,.35)';
      m.fillRect(0, j * ch, W, kind === 'deco' ? 6 : 3);
      for (let i = 0; i < cols; i++) {
        const x = i * cw + (cw - winW) / 2;
        const y = j * ch + ch * 0.24;
        // recess frame
        m.fillStyle = 'rgba(0,0,0,.55)';
        m.fillRect(x - 3, y - 3, winW + 6, winH + 6);
        m.fillStyle = glass; m.fillRect(x, y, winW, winH);
        // glass reflection
        const gl = m.createLinearGradient(x, y, x + winW, y + winH);
        gl.addColorStop(0, 'rgba(150,200,230,.16)');
        gl.addColorStop(0.45, 'rgba(80,120,150,.05)');
        gl.addColorStop(1, 'rgba(0,0,0,.2)');
        m.fillStyle = gl; m.fillRect(x, y, winW, winH);
        // mullion
        m.fillStyle = 'rgba(0,0,0,.45)';
        m.fillRect(x + winW * 0.48, y, 2, winH);
        // sill
        m.fillStyle = kind === 'deco' ? trim : 'rgba(190,180,160,.18)';
        m.fillRect(x - 4, y + winH, winW + 8, 3);
        if (kind === 'warehouse' || kind === 'brick') {
          m.fillStyle = 'rgba(0,0,0,.25)';
          m.fillRect(x - 6, y - 6, winW + 12, 3);
        }
        if (rnd() < 0.5) {
          const warm = rnd() < 0.72;
          const grd = e.createLinearGradient(x, y, x, y + winH);
          if (warm) {
            grd.addColorStop(0, `rgba(255,${175 + rnd() * 55},${95 + rnd() * 55},${0.4 + rnd() * 0.45})`);
            grd.addColorStop(0.65, `rgba(255,${140 + rnd() * 50},${60 + rnd() * 45},${0.3 + rnd() * 0.35})`);
            grd.addColorStop(1, `rgba(150,80,40,${0.1 + rnd() * 0.2})`);
          } else {
            grd.addColorStop(0, `rgba(${130 + rnd() * 50},${200 + rnd() * 35},255,${0.3 + rnd() * 0.3})`);
            grd.addColorStop(1, `rgba(30,80,120,${0.12 + rnd() * 0.16})`);
          }
          e.fillStyle = grd; e.fillRect(x, y, winW, winH);
          // curtains / blinds
          if (rnd() < 0.34) {
            e.fillStyle = 'rgba(0,0,0,.55)';
            e.fillRect(x, y, winW, winH * (0.2 + rnd() * 0.4));
          }
          // silhouette of a person or plant
          if (rnd() < 0.2) {
            e.fillStyle = 'rgba(0,0,0,.72)';
            const sx = x + winW * (0.25 + rnd() * 0.5);
            e.beginPath(); e.arc(sx, y + winH * 0.62, winW * 0.09, 0, Math.PI * 2); e.fill();
            e.fillRect(sx - winW * 0.09, y + winH * 0.7, winW * 0.18, winH * 0.3);
          }
        } else if (rnd() < 0.2) {
          // blinds drawn, faint glow behind
          m.fillStyle = 'rgba(120,115,100,.25)';
          for (let k = 0; k < 6; k++) m.fillRect(x, y + k * winH / 6, winW, 2);
        }
        if (rnd() < 0.12) {
          // window AC unit
          m.fillStyle = '#8a8c8a';
          m.fillRect(x + winW * 0.2, y + winH + 5, winW * 0.6, ch * 0.14);
          m.fillStyle = 'rgba(0,0,0,.4)';
          m.fillRect(x + winW * 0.2, y + winH + 5, winW * 0.6, 2);
        }
      }
    }
    if (kind === 'brick') {
      m.strokeStyle = 'rgba(0,0,0,.2)'; m.lineWidth = 1;
      for (let y = 0; y < H; y += 7) { m.beginPath(); m.moveTo(0, y); m.lineTo(W, y); m.stroke(); }
      for (let y = 0; y < H; y += 7) {
        for (let x = (y / 7) % 2 ? 0 : 9; x < W; x += 18) {
          m.beginPath(); m.moveTo(x, y); m.lineTo(x, y + 7); m.stroke();
        }
      }
    }
    if (kind === 'warehouse') {
      m.strokeStyle = 'rgba(0,0,0,.18)'; m.lineWidth = 2;
      for (let x = 0; x < W; x += 9) { m.beginPath(); m.moveTo(x, 0); m.lineTo(x, H); m.stroke(); }
    }
    if (kind === 'deco') {
      m.fillStyle = 'rgba(255,255,255,.2)';
      for (let j = 0; j < rows; j++) m.fillRect(0, j * ch + ch * 0.88, W, 4);
    }
  }
  // grime and weather streaks
  const grd = m.createLinearGradient(0, H * 0.6, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,.32)');
  m.fillStyle = grd; m.fillRect(0, 0, W, H);
  m.save();
  m.globalAlpha = 0.08; m.strokeStyle = '#000'; m.lineWidth = 3;
  for (let i = 0; i < 22; i++) {
    const x = rnd() * W;
    m.beginPath(); m.moveTo(x, 0); m.lineTo(x + (rnd() - 0.5) * 8, H * (0.3 + rnd() * 0.7)); m.stroke();
  }
  m.restore();
  return { mapCanvas: mc, emCanvas: ec };
}

export function buildFacadeTextures() {
  const kinds = ['glass', 'concrete', 'deco', 'brick', 'warehouse'];
  const out = {};
  kinds.forEach((k, i) => {
    const a = facadeStyle(k, 1000 + i * 77);
    const map = new THREE.CanvasTexture(a.mapCanvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
    const emissive = new THREE.CanvasTexture(a.emCanvas);
    emissive.colorSpace = THREE.SRGBColorSpace;
    emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
    emissive.anisotropy = 8;
    out[k] = { map, emissive };
  });
  return out;
}

export const FACADE = { w: FACADE_W, h: FACADE_H };

// street-level storefront strip: 32m x 4.5m, four shop units
export function buildStorefrontTexture() {
  const W = 1024, H = 256;
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
  const ec = document.createElement('canvas'); ec.width = W; ec.height = H;
  const m = mc.getContext('2d'), e = ec.getContext('2d');
  m.fillStyle = '#14151a'; m.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const shops = [
    { name: 'БАР', color: '#ff2e88', interior: ['#3a1626', '#170a10'], neon: true },
    { name: '24/7', color: '#4df3ff', interior: ['#16323a', '#081216'], neon: true },
    { name: 'ТАТУ', color: '#9d7bff', interior: ['#241a3a', '#0c0816'], neon: false },
    { name: 'ЕДА', color: '#ffb657', interior: ['#3a2a12', '#140d05'], neon: true },
  ];
  for (let i = 0; i < 4; i++) {
    const x = i * 256;
    const s = shops[i];
    const shuttered = i === 2 && Math.random() < 0.4;
    // pillar
    m.fillStyle = '#1c1d22'; m.fillRect(x, 0, 14, H);
    m.fillStyle = 'rgba(255,255,255,.05)'; m.fillRect(x + 14, 0, 3, H);
    // sign band
    m.fillStyle = '#07080c'; m.fillRect(x + 14, 10, 242, 32);
    m.fillStyle = s.color; m.shadowColor = s.color; m.shadowBlur = 10;
    m.font = '700 22px "Arial Narrow", Arial, sans-serif';
    m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillText(s.name, x + 135, 27);
    m.shadowBlur = 0;
    if (s.neon) {
      e.fillStyle = s.color; e.fillRect(x + 18, 13, 234, 26);
      e.fillStyle = 'rgba(0,0,0,.7)'; e.fillRect(x + 90, 18, 90, 4);
    }
    if (shuttered) {
      m.fillStyle = '#5a5c5e'; m.fillRect(x + 20, 48, 232, 178);
      m.strokeStyle = 'rgba(0,0,0,.3)'; m.lineWidth = 2;
      for (let y = 48; y < 226; y += 8) { m.beginPath(); m.moveTo(x + 20, y); m.lineTo(x + 252, y); m.stroke(); }
      m.fillStyle = 'rgba(255,46,136,.5)'; m.font = '900 30px Arial'; m.fillText('ЗАКРЫТО', x + 135, 150);
      continue;
    }
    // glass
    const grd = m.createLinearGradient(0, 48, 0, 226);
    grd.addColorStop(0, s.interior[0]); grd.addColorStop(1, s.interior[1]);
    m.fillStyle = grd; m.fillRect(x + 20, 48, 232, 178);
    // glass reflections
    m.fillStyle = 'rgba(170,210,235,.1)';
    m.beginPath(); m.moveTo(x + 20, 48); m.lineTo(x + 90, 48); m.lineTo(x + 20, 180); m.fill();
    // interior shapes
    m.fillStyle = 'rgba(255,255,255,.1)';
    m.fillRect(x + 20, 48, 232, 6);
    for (let k = 0; k < 3; k++) {
      m.fillStyle = `rgba(${180 + Math.random() * 60},${130 + Math.random() * 80},${80 + Math.random() * 80},.16)`;
      m.fillRect(x + 40 + k * 60, 90 + Math.random() * 50, 38, 60);
    }
    // bar counter
    m.fillStyle = 'rgba(0,0,0,.45)'; m.fillRect(x + 20, 178, 232, 48);
    // people silhouettes
    m.fillStyle = 'rgba(0,0,0,.8)';
    for (let k = 0; k < 2; k++) {
      const px = x + 60 + Math.random() * 150;
      m.beginPath(); m.arc(px, 138, 9, 0, Math.PI * 2); m.fill();
      m.fillRect(px - 10, 148, 20, 50);
    }
    // mullions and door
    m.fillStyle = '#0d0e12';
    for (let mx = 20; mx < 252; mx += 44) m.fillRect(x + mx, 48, 4, 178);
    m.fillStyle = '#0a0b0f'; m.fillRect(x + 206, 96, 40, 130);
    m.fillStyle = 'rgba(200,220,240,.15)'; m.fillRect(x + 210, 100, 32, 80);
    m.fillStyle = 'rgba(255,255,255,.16)'; m.fillRect(x + 210, 184, 32, 4);
    // interior light wash (emissive), broken up by mullions and counters
    const eg = e.createLinearGradient(0, 48, 0, 226);
    eg.addColorStop(0, i === 0 ? 'rgba(255,80,150,.42)' : i === 1 ? 'rgba(80,240,255,.38)' : 'rgba(255,180,90,.38)');
    eg.addColorStop(0.55, 'rgba(255,190,120,.16)');
    eg.addColorStop(1, 'rgba(30,15,25,.05)');
    e.fillStyle = eg; e.fillRect(x + 20, 48, 232, 178);
    e.fillStyle = 'rgba(0,0,0,.75)';
    for (let mx = 20; mx < 252; mx += 44) e.fillRect(x + mx, 48, 4, 178);
    e.fillStyle = 'rgba(0,0,0,.6)'; e.fillRect(x + 20, 160, 232, 66);
    e.fillStyle = 'rgba(0,0,0,.5)'; e.fillRect(x + 206, 96, 40, 130);
    // ceiling strip lights
    e.fillStyle = i === 1 ? 'rgba(150,245,255,.5)' : 'rgba(255,220,170,.5)';
    e.fillRect(x + 24, 52, 140, 3);
  }
  // overall grime
  const grd = m.createLinearGradient(0, 140, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.35)');
  m.fillStyle = grd; m.fillRect(0, 0, W, H);
  const map = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(ec);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  emissive.anisotropy = 8;
  return { map, emissive };
}

// ---------- neon sign atlas ----------
const SIGN_WORDS = [
  ['НЕОН', 'HOTEL NEON', '#ff2e88'],
  ['ЭХО', 'CLUB ECHO', '#4df3ff'],
  ['24/7', 'LIQUOR', '#ffb657'],
  ['МОТЕЛЬ', 'BLUE TIDE', '#6ee7ff'],
  ['ТАТУ', 'INK', '#ff5cc8'],
  ['ЛОМБАРД', 'CASH', '#ffd166'],
  ['VICE', 'CITY', '#ff2e88'],
  ['SUNSET', 'BAR', '#ff8a5c'],
  ['ФАРМА', 'PHARMACY', '#7dffb2'],
  ['ПОРТ', 'GELLHORN', '#5cc8ff'],
  ['РАЗЛОМ', 'RIFT', '#b58cff'],
  ['АМБРОЗИЯ', 'FUEL', '#ff9f43'],
  ['МАГИЯ', 'ARCANE', '#9d7bff'],
  ['ЛЮСИЯ', 'LUX', '#ff4fa3'],
  ['ТЕНЬ', 'SHADOW', '#7c8cff'],
  ['КИС', 'KEYS', '#52ffd0'],
  ['ПИЦЦА', 'SLICE', '#ffcf5c'],
  ['БАР', 'NIGHTS', '#ff6b9d'],
  ['ОТЕЛЬ', 'PARADISO', '#63e6ff'],
  ['БЕНЗИН', 'GAS', '#ffe066'],
  ['МОТОР', 'GARAGE', '#ff884d'],
  ['ЛЕОНИДА', 'STATE', '#4dd7ff'],
  ['КЛУБ', 'VELVET', '#d17bff'],
  ['СТРИП', 'GIRLS', '#ff3d7f'],
  ['ДИНЕР', 'OCEAN', '#5cffc8'],
  ['ИЕРИХОН', 'GUNS', '#ffb26b'],
  ['АРТЕФАКТ', 'RELIC', '#c9a6ff'],
  ['2026', 'VICE', '#ff3d9a'],
];

export function buildSignAtlas() {
  const W = 2048, H = 2048;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const rects = [];
  // vertical signs: 8 cols x 2 rows, cell 256x512
  for (let i = 0; i < 16; i++) {
    const col = i % 8, row = Math.floor(i / 8);
    const x = col * 256, y = row * 512;
    const [ru, en, color] = SIGN_WORDS[i % SIGN_WORDS.length];
    g.save();
    g.beginPath(); g.rect(x + 6, y + 6, 244, 500); g.clip();
    g.fillStyle = '#05060a'; g.fillRect(x, y, 256, 512);
    g.strokeStyle = color; g.lineWidth = 7; g.shadowColor = color; g.shadowBlur = 26;
    g.strokeRect(x + 14, y + 14, 228, 484);
    g.shadowBlur = 34;
    g.fillStyle = color;
    g.font = '700 88px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const letters = ru.split('');
    const lh = Math.min(84, 430 / letters.length);
    letters.forEach((ch, k) => {
      g.fillText(ch, x + 128, y + 256 + (k - (letters.length - 1) / 2) * lh);
    });
    g.shadowBlur = 10;
    g.font = '600 26px Arial'; g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText(en, x + 128, y + 478);
    g.restore();
    rects.push({ x: x / W, y: y / H, w: 256 / W, h: 512 / H, color });
  }
  // horizontal signs: 4 cols x 2 rows, cell 512x256
  for (let i = 0; i < 8; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    const x = col * 512, y = 1024 + row * 256;
    const [ru, en, color] = SIGN_WORDS[(i + 16) % SIGN_WORDS.length];
    g.save();
    g.fillStyle = '#05060a'; g.fillRect(x, y, 512, 256);
    g.strokeStyle = color; g.lineWidth = 8; g.shadowColor = color; g.shadowBlur = 28;
    g.strokeRect(x + 12, y + 12, 488, 232);
    g.shadowBlur = 30; g.fillStyle = color;
    g.font = '700 76px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ru, x + 256, y + 112);
    g.font = '600 26px Arial'; g.fillStyle = 'rgba(255,255,255,.75)'; g.shadowBlur = 8;
    g.fillText(en, x + 256, y + 190);
    g.restore();
    rects.push({ x: x / W, y: y / H, w: 512 / W, h: 256 / H, color });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { texture: tex, rects };
}

export function signColorRects(atlas) {
  return atlas.rects;
}

// ---------- ad billboards ----------
export function buildAdAtlas() {
  const W = 2048, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const ads = [
    { bg: ['#180a2e', '#4a0f46'], a: '#ff3d9a', b: '#4df3ff', t1: 'МАГИЯ', t2: 'РЕАЛЬНА', s: 'ARCANE COLA · 2026' },
    { bg: ['#031d22', '#0a3f4a'], a: '#4df3ff', b: '#ffd166', t1: 'ВАЙС-СИТИ', t2: 'НИКОГДА НЕ СПИТ', s: 'VISIT LEONIDA' },
    { bg: ['#2a1006', '#5a1c06'], a: '#ffb657', b: '#ff5c5c', t1: 'АМБРОЗИЯ', t2: 'ЭНЕРГИЯ', s: 'AMBROSIA FUEL CO.' },
    { bg: ['#0d0d12', '#26202e'], a: '#d17bff', b: '#ffffff', t1: 'ЛЮСИЯ', t2: 'LUX', s: 'ИМЯ, КОТОРОЕ ЗНАЮТ ВСЕ' },
  ];
  ads.forEach((ad, i) => {
    const x = i * 512;
    const grd = g.createLinearGradient(x, 0, x + 512, H);
    grd.addColorStop(0, ad.bg[0]); grd.addColorStop(1, ad.bg[1]);
    g.fillStyle = grd; g.fillRect(x, 0, 512, H);
    g.save();
    g.beginPath(); g.rect(x, 0, 512, H); g.clip();
    g.globalAlpha = 0.22;
    for (let k = 0; k < 8; k++) {
      g.strokeStyle = k % 2 ? ad.a : ad.b;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath(); g.arc(x + 256, 256, 40 + k * 34, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = ad.a; g.shadowColor = ad.a; g.shadowBlur = 24;
    g.font = '800 92px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(ad.t1, x + 256, 190);
    g.fillStyle = ad.b; g.shadowColor = ad.b;
    g.fillText(ad.t2, x + 256, 282);
    g.shadowBlur = 0; g.font = '500 22px Arial'; g.fillStyle = 'rgba(255,255,255,.75)';
    g.fillText(ad.s, x + 256, 380);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { texture: tex, count: ads.length };
}

export function buildGraffitiAtlas() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const words = ['МАГ', '2026', 'ЛЮСИЯ', 'RIFT', 'ТЕНЬ', 'VICE'];
  const colors = ['#ff3d9a', '#4df3ff', '#ffd166', '#9d7bff', '#7dffb2', '#ff884d'];
  g.clearRect(0, 0, W, H);
  words.forEach((word, i) => {
    const x = (i % 3) * 341, y = Math.floor(i / 3) * 256;
    g.save();
    g.translate(x + 170, y + 130);
    g.rotate(-0.12 + Math.random() * 0.24);
    g.font = '900 92px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.55)';
    g.strokeText(word, 0, 0);
    g.fillStyle = colors[i]; g.globalAlpha = 0.85;
    g.fillText(word, 0, 0);
    g.globalAlpha = 0.35;
    for (let k = 0; k < 14; k++) {
      g.fillStyle = colors[i];
      g.fillRect(-120 + Math.random() * 240, -60 + Math.random() * 120, 2 + Math.random() * 18, 1 + Math.random() * 3);
    }
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// geometry helpers ---------------------------------------------------------
export function planeGeo(w, h) {
  return new THREE.PlaneGeometry(w, h);
}

export function scaleUV(geo, su, sv, ou = 0, ov = 0) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  }
  uv.needsUpdate = true;
  return geo;
}

export function tintGeometry(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function addVertexColor(geo, hex, jitter = 0.04) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  const k = 1 + (Math.random() - 0.5) * jitter;
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r * k; colors[i * 3 + 1] = c.g * k; colors[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function merge(list) {
  const clean = list.filter(Boolean);
  if (!clean.length) return null;
  return mergeGeometries(clean, false);
}

export function disposeObject(obj) {
  obj.traverse?.(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  });
}

// collision helpers --------------------------------------------------------
// circle vs axis aligned box: returns push-out vector or null
export function circleBox(x, z, r, minX, minZ, maxX, maxZ) {
  const cx = clamp(x, minX, maxX);
  const cz = clamp(z, minZ, maxZ);
  let dx = x - cx, dz = z - cz;
  let d2 = dx * dx + dz * dz;
  if (d2 > r * r) return null;
  if (d2 < 1e-6) {
    // inside the box: push along nearest face
    const left = x - minX, right = maxX - x, top = z - minZ, bottom = maxZ - z;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: x - (left + r), z, nx: -1, nz: 0 };
    if (m === right) return { x: x + (right + r), z, nx: 1, nz: 0 };
    if (m === top) return { x, z: z - (top + r), nx: 0, nz: -1 };
    return { x, z: z + (bottom + r), nx: 0, nz: 1 };
  }
  const d = Math.sqrt(d2);
  const push = r - d;
  return { x: x + (dx / d) * push, z: z + (dz / d) * push, nx: dx / d, nz: dz / d };
}

// 2D segment vs AABB, returns t in [0,1] or Infinity
export function segmentBox2D(x0, z0, x1, z1, minX, minZ, maxX, maxZ) {
  const dx = x1 - x0, dz = z1 - z0;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-8) {
    if (x0 < minX || x0 > maxX) return Infinity;
  } else {
    let t1 = (minX - x0) / dx, t2 = (maxX - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-8) {
    if (z0 < minZ || z0 > maxZ) return Infinity;
  } else {
    let t1 = (minZ - z0) / dz, t2 = (maxZ - z0) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function pointInRect(x, z, r) {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

export function makeGlowSprite(color, size = 1, opacity = 1) {
  const tex = glowTexture();
  const mat = new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

export const districtNames = {
  vice: 'ВАЙС-СИТИ',
  keys: 'ЛЕОНИДА-КИС',
  grass: 'ГРАССРИВЕРС',
  port: 'ПОРТ-ГЕЛЛХОРН',
  ambrosia: 'АМБРОЗИЯ',
  kalaga: 'МАУНТ-КАЛАГА',
};

export function fmtTime(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
