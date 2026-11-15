import * as THREE from 'three';
import { clamp, lerp, fmtTime, fmtMoney, districtNames, TAU } from './util.js';
import { HeroModel } from './characters.js';

const _v = new THREE.Vector3();

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {};
    const ids = [
      'hud', 'hud-portrait', 'hud-name', 'hud-sub', 'bar-hp', 'bar-mana', 'bond-val', 'bond-chip',
      'clock', 'day', 'money', 'wanted', 'mission-panel', 'mission-kicker', 'mission-title', 'mission-obj', 'mission-bar',
      'minimap', 'region', 'waypoint-dist', 'ammo', 'ammo-mag', 'ammo-res', 'weapon-name', 'cast-info', 'cast-name', 'cast-cd',
      'btn-action', 'action-label', 'aim-dot', 'btn-fire', 'radial', 'radial-slots', 'radial-title', 'radial-center',
      'wheel', 'bond-num', 'bond-circle', 'wheel-lock', 'lucia-loc', 'mage-loc', 'wheel-mage', 'wheel-lucia',
      'dialogue', 'dlg-name', 'dlg-role', 'dlg-text', 'dlg-choices', 'dlg-next', 'dialogue-box',
      'map-screen', 'map-canvas', 'map-tip', 'map-coords', 'map-tp', 'map-close', 'btn-pause',
      'pause', 'p-resume', 'p-map', 'p-save', 'p-menu', 'p-bond', 'p-art', 'p-ops', 'p-money', 'quality-seg',
      'p-codex', 'codex-panel', 'codex-chapters', 'codex-fauna', 'codex-bond', 'codex-flags',
      'vol-music', 'vol-sfx', 'sens', 'p-fullscreen', 'menu', 'btn-new', 'btn-continue', 'btn-settings',
      'menu-time', 'menu-weather', 'mc-weather2', 'mc-wanted', 'menu-bond', 'menu-quality', 'menu-music', 'menu-sfx',
      'menu-settings', 'ms-close', 'menu-fullscreen', 'chapter-card', 'cc-num', 'cc-title', 'cc-sub',
      'ending', 'end-title', 'end-text', 'end-kicker', 'end-stats', 'end-continue', 'loading', 'load-progress', 'load-label',
      'fade', 'flash', 'toast-zone', 'wheel-lock', 'hud', 'detect',
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.el['dlg-box'] = document.querySelector('.dlg-box');
    const mapCanvas = this.el['map-canvas'];
    if (mapCanvas) { mapCanvas.width = 1400; mapCanvas.height = 1100; }
    this.mapOpen = false;
    this.pauseOpen = false;
    this.wheelOpen = false;
    this.radialOpen = false;
    this.interiorOpen = false;
    this.portraits = {};
    this.lastMini = 0;
    this.toastList = [];
    this.waypoint = null;
    this.selectedWheel = null;
    this.radialSlot = 0;
    this.menuVisible = true;
    this._bindAll();
    this._buildWanted();
    this.buildMapBase();
    this.setHero(game.player);
    this.updateMoney();
    this.updateBars();
    this.setBond(game.state?.bond || 30);
    this.updateContinue();
    this.el['hud'].classList.add('hidden');
    this.menuVisible = true;
    this.updateMenuInfo();
    setTimeout(() => this.initPortraits(), 350);
  }

  _bindAll() {
    const g = this.game;
    document.getElementById('btn-new').addEventListener('click', () => g.startNewGame());
    document.getElementById('btn-continue').addEventListener('click', () => g.loadGame());
    document.getElementById('btn-settings').addEventListener('click', () => this.el['menu-settings'].classList.toggle('hidden'));
    document.getElementById('ms-close').addEventListener('click', () => this.el['menu-settings'].classList.add('hidden'));
    document.getElementById('menu-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    document.getElementById('p-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    for (const seg of [this.el['menu-quality'], this.el['quality-seg']]) {
      if (!seg) continue;
      seg.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const q = btn.dataset.q;
          g.setQuality(q);
          this.setQualityUI(q);
          g.audio?.play('ui');
        });
      });
    }
    const music = [this.el['menu-music'], this.el['vol-music']];
    const sfx = [this.el['menu-sfx'], this.el['vol-sfx']];
    for (const m of music) if (m) m.addEventListener('input', () => {
      g.settings.music = m.value / 100;
      g.audio?.setVolumes(g.settings.music, g.settings.sfx);
      music.forEach(x => { if (x) x.value = m.value; });
    });
    for (const s of sfx) if (s) s.addEventListener('input', () => {
      g.settings.sfx = s.value / 100;
      g.audio?.setVolumes(g.settings.music, g.settings.sfx);
      sfx.forEach(x => { if (x) x.value = s.value; });
    });
    this.el['sens'].addEventListener('input', () => {
      g.settings.sens = this.el['sens'].value / 100;
      g.input.setSensitivity(g.settings.sens);
    });
    this.el['btn-pause'].addEventListener('click', () => this.togglePause());
    this.el['p-resume'].addEventListener('click', () => this.togglePause(false));
    this.el['p-map'].addEventListener('click', () => { this.togglePause(false); this.toggleMap(); });
    this.el['p-save'].addEventListener('click', () => { g.save(); this.toast('ИГРА СОХРАНЕНА'); });
    this.el['p-menu'].addEventListener('click', () => { g.save(); this.showMenu(); });
    this.el['p-codex']?.addEventListener('click', () => this.toggleCodex());
    this.el['map-close'].addEventListener('click', () => this.toggleMap(false));
    document.getElementById('minimap-wrap')?.addEventListener('click', () => this.toggleMap(true));
    this.el['end-continue'].addEventListener('click', () => { this.el.ending.classList.add('hidden'); g.showMenu(); });
    this.el['btn-fire'].addEventListener('pointerdown', () => {});
    // map clicks
    const mc = this.el['map-canvas'];
    mc.addEventListener('pointermove', (e) => this._mapHover(e));
    mc.addEventListener('pointerleave', () => this.el['map-tip'].classList.remove('show'));
    mc.addEventListener('pointerup', (e) => this._mapClick(e));
    this.el['fade'].style.opacity = '0';
  }

  _buildWanted() {
    const wrap = this.el.wanted;
    wrap.innerHTML = '';
    this.wantedStars = [];
    for (let i = 0; i < 5; i++) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.classList.add('star');
      s.innerHTML = '<path d="M12 2l2.9 6.2 6.6.9-4.8 4.7 1.2 6.7L12 17.3 6.1 20.5l1.2-6.7L2.5 9.1l6.6-.9z"/>';
      wrap.appendChild(s);
      this.wantedStars.push(s);
    }
  }

  setQualityUI(q) {
    for (const seg of [this.el['menu-quality'], this.el['quality-seg']]) {
      if (!seg) continue;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.q === q));
    }
  }

  updateContinue() {
    const save = localStorage.getItem('mag2026.save');
    this.el['btn-continue'].disabled = !save;
  }

  // -----------------------------------------------------------------------
  // portraits: stylised neon posters rather than raw 3D renders
  initPortraits() {
    try {
      for (const id of ['mage', 'lucia']) {
        const c = this._portrait(id);
        const url = c.toDataURL('image/jpeg', 0.92);
        this.portraits[id] = url;
        if (id === 'mage') this.el['wheel-mage'].src = url;
        else this.el['wheel-lucia'].src = url;
        if (id === this.game.player?.id) this._setHudPortrait(url);
      }
    } catch (e) {
      console.warn('portraits failed', e);
    }
  }

  _portrait(id) {
    const W = 512, H = 640;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const mage = id === 'mage';
    const accent = mage ? '#4df3ff' : '#ff2e88';
    const accent2 = mage ? '#9d7bff' : '#ffb657';
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, mage ? '#06121e' : '#1a0713');
    bg.addColorStop(0.6, mage ? '#03080f' : '#08030a');
    bg.addColorStop(1, '#020305');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // neon halo
    const halo = g.createRadialGradient(W / 2, 250, 10, W / 2, 250, 300);
    halo.addColorStop(0, mage ? 'rgba(77,243,255,.18)' : 'rgba(255,46,136,.2)');
    halo.addColorStop(0.55, mage ? 'rgba(77,243,255,.04)' : 'rgba(255,46,136,.05)');
    halo.addColorStop(1, 'transparent');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    // concentric rings
    g.save();
    g.translate(W / 2, 275);
    g.strokeStyle = mage ? 'rgba(77,243,255,.2)' : 'rgba(255,46,136,.2)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, 130 + i * 42, 0, Math.PI * 2); g.stroke(); }
    g.setLineDash([3, 12]);
    g.beginPath(); g.arc(0, 0, 218, 0, Math.PI * 2); g.stroke();
    g.restore();
    // poster grid
    g.strokeStyle = 'rgba(255,255,255,.04)';
    g.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

    if (mage) {
      // staff
      g.save();
      g.translate(355, 420);
      g.rotate(0.12);
      g.strokeStyle = '#5c4a36';
      g.lineWidth = 13;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-55, -440); g.stroke();
      g.strokeStyle = 'rgba(77,243,255,.7)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-55, -440); g.stroke();
      g.restore();
      // crystal
      g.save();
      g.translate(300, 50);
      g.shadowColor = accent; g.shadowBlur = 30;
      g.fillStyle = accent;
      g.beginPath(); g.moveTo(0, -34); g.lineTo(20, 0); g.lineTo(0, 34); g.lineTo(-20, 0); g.closePath(); g.fill();
      g.restore();
      // shoulders / coat
      g.fillStyle = '#080d16';
      g.beginPath();
      g.moveTo(30, 640); g.lineTo(50, 500); g.quadraticCurveTo(120, 430, 200, 420);
      g.lineTo(312, 420); g.quadraticCurveTo(400, 430, 470, 510); g.lineTo(486, 640); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(77,243,255,.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(70, 560); g.quadraticCurveTo(190, 500, 260, 520); g.stroke();
      // hood
      g.fillStyle = '#0b1322';
      g.beginPath();
      g.moveTo(256, 78); g.quadraticCurveTo(352, 88, 366, 200);
      g.quadraticCurveTo(376, 326, 300, 384);
      g.quadraticCurveTo(256, 408, 212, 384);
      g.quadraticCurveTo(136, 326, 146, 200);
      g.quadraticCurveTo(160, 88, 256, 78); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(77,243,255,.18)'; g.lineWidth = 2; g.stroke();
      // face shadow
      const faceG = g.createRadialGradient(256, 250, 10, 256, 250, 130);
      faceG.addColorStop(0, '#131b26'); faceG.addColorStop(1, '#05080e');
      g.fillStyle = faceG;
      g.beginPath(); g.ellipse(256, 255, 72, 104, 0, 0, Math.PI * 2); g.fill();
      // eyes
      g.shadowColor = accent; g.shadowBlur = 24; g.fillStyle = accent;
      for (const sx of [-1, 1]) {
        g.beginPath(); g.ellipse(256 + sx * 31, 238, 17, 4.5, sx * 0.08, 0, Math.PI * 2); g.fill();
      }
      g.shadowBlur = 0;
      // mask
      g.fillStyle = '#080d14';
      g.beginPath(); g.ellipse(256, 300, 58, 40, 0, 0, Math.PI); g.fill();
      g.strokeStyle = '#8a6a3f'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(198, 296); g.quadraticCurveTo(256, 282, 314, 296); g.stroke();
      // forehead rune
      g.strokeStyle = accent; g.lineWidth = 2; g.shadowColor = accent; g.shadowBlur = 12;
      g.beginPath(); g.moveTo(256, 140); g.lineTo(268, 158); g.lineTo(256, 176); g.lineTo(244, 158); g.closePath(); g.stroke();
      g.shadowBlur = 0;
      // collar
      g.fillStyle = '#05080d';
      g.beginPath(); g.moveTo(180, 390); g.quadraticCurveTo(256, 440, 332, 390); g.lineTo(356, 465); g.quadraticCurveTo(256, 510, 156, 465); g.closePath(); g.fill();
    } else {
      // ponytail sweep
      g.save();
      g.strokeStyle = '#1b0f18'; g.lineCap = 'round';
      g.lineWidth = 52;
      g.beginPath(); g.moveTo(330, 150); g.quadraticCurveTo(470, 190, 438, 370); g.stroke();
      g.strokeStyle = '#3a1f31'; g.lineWidth = 38;
      g.beginPath(); g.moveTo(330, 150); g.quadraticCurveTo(450, 200, 430, 340); g.stroke();
      g.strokeStyle = '#ff4fa3'; g.lineWidth = 12; g.shadowColor = '#ff2e88'; g.shadowBlur = 20;
      g.beginPath(); g.moveTo(430, 330); g.quadraticCurveTo(440, 390, 405, 430); g.stroke();
      g.restore();
      // shoulders / jacket
      g.fillStyle = '#0a070d';
      g.beginPath(); g.moveTo(36, 640); g.lineTo(54, 505); g.quadraticCurveTo(150, 435, 256, 430);
      g.quadraticCurveTo(362, 435, 458, 505); g.lineTo(476, 640); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,46,136,.55)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(112, 640); g.lineTo(126, 520); g.stroke();
      g.beginPath(); g.moveTo(400, 640); g.lineTo(386, 520); g.stroke();
      // neck / shoulders skin
      g.fillStyle = '#c28f72';
      g.beginPath(); g.moveTo(220, 385); g.lineTo(292, 385); g.lineTo(318, 465); g.lineTo(194, 465); g.closePath(); g.fill();
      // face
      const fg = g.createLinearGradient(160, 170, 330, 400);
      fg.addColorStop(0, '#e2b090'); fg.addColorStop(1, '#b57d61');
      g.fillStyle = fg;
      g.beginPath(); g.ellipse(256, 258, 88, 112, 0, 0, Math.PI * 2); g.fill();
      // jaw
      g.fillStyle = '#d19a7a';
      g.beginPath(); g.ellipse(256, 340, 56, 44, 0, 0, Math.PI); g.fill();
      // neck shadow
      g.fillStyle = 'rgba(70,35,30,.35)';
      g.beginPath(); g.ellipse(256, 392, 50, 22, 0, 0, Math.PI); g.fill();
      // hair mass
      g.fillStyle = '#1d1119';
      g.beginPath();
      g.moveTo(160, 300); g.quadraticCurveTo(138, 150, 256, 136);
      g.quadraticCurveTo(374, 150, 352, 300); g.quadraticCurveTo(340, 220, 256, 212);
      g.quadraticCurveTo(172, 220, 160, 300); g.closePath(); g.fill();
      // fringe
      g.fillStyle = '#2a1622';
      g.beginPath(); g.moveTo(166, 220); g.quadraticCurveTo(220, 120, 330, 168);
      g.quadraticCurveTo(300, 214, 256, 222); g.quadraticCurveTo(205, 232, 166, 220); g.fill();
      g.fillStyle = 'rgba(255,79,163,.35)';
      g.beginPath(); g.moveTo(300, 160); g.quadraticCurveTo(350, 185, 340, 240); g.quadraticCurveTo(320, 200, 300, 160); g.fill();
      // visor
      g.save();
      g.shadowColor = '#ff2e88'; g.shadowBlur = 24;
      g.fillStyle = '#0a0710';
      g.beginPath(); g.roundRect(180, 238, 152, 34, 12); g.fill();
      g.fillStyle = '#ff2e88';
      g.fillRect(190, 250, 132, 3);
      g.restore();
      // nose
      g.strokeStyle = 'rgba(90,50,40,.55)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(256, 282); g.quadraticCurveTo(250, 306, 262, 312); g.stroke();
      // lips
      g.fillStyle = '#8e3048';
      g.beginPath(); g.ellipse(256, 334, 22, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.fillRect(246, 332, 12, 2);
      // earring
      g.strokeStyle = '#ffc266'; g.lineWidth = 3;
      g.beginPath(); g.arc(340, 300, 11, 0, Math.PI * 2); g.stroke();
      // neon necklace
      g.strokeStyle = '#ff2e88'; g.lineWidth = 2; g.shadowColor = '#ff2e88'; g.shadowBlur = 12;
      g.beginPath(); g.moveTo(206, 440); g.quadraticCurveTo(256, 470, 306, 440); g.stroke();
      g.shadowBlur = 0;
    }
    // vignette + grain
    const v = g.createRadialGradient(W / 2, H * 0.45, 80, W / 2, H * 0.45, 400);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.7)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }
    return c;
  }

  _setHudPortrait(url) {
    const canvas = this.el['hud-portrait'].querySelector('canvas');
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      const g = canvas.getContext('2d');
      g.clearRect(0, 0, 128, 128);
      const s = Math.max(128 / img.width, 128 / img.height);
      const w = img.width * s, h = img.height * s;
      g.drawImage(img, (128 - w) / 2, (128 - h) * 0.42, w, h);
    };
    img.src = url;
  }

  // -----------------------------------------------------------------------
  setHero(hero) {
    if (!hero) return;
    this.currentHero = hero;
    this.el['hud-name'].textContent = hero.id === 'mage' ? 'МАГ' : 'ЛЮСИЯ';
    this.el['hud-sub'].textContent = hero.id === 'mage' ? 'ОРДЕН ТЕНЕЙ' : 'УЛИЧНАЯ ВЗЛОМЩИЦА';
    this.el['hud-name'].style.color = hero.id === 'mage' ? '#e8f6ff' : '#ffd6e6';
    if (this.portraits[hero.id]) this._setHudPortrait(this.portraits[hero.id]);
    this.updateAmmo();
  }

  updateBars() {
    const hero = this.game.player;
    if (!hero) return;
    const hp = clamp(hero.hp / hero.hpMax, 0, 1);
    const mana = clamp(hero.mana / hero.manaMax, 0, 1);
    this.el['bar-hp'].style.transform = `scaleX(${hp})`;
    this.el['bar-mana'].style.transform = `scaleX(${mana})`;
    this.el['bar-hp'].style.background = hp < 0.3 ? 'linear-gradient(90deg,#ff2030,#ff7980)' : '';
    this.el['bond-val'].textContent = 'СВЯЗЬ ' + Math.round(this.game.state.bond);
  }

  updateMoney() {
    this.el.money.textContent = fmtMoney(this.game.state.money);
    if (this.el['p-money']) this.el['p-money'].textContent = fmtMoney(this.game.state.money);
  }

  updateArtifacts() {
    if (this.el['p-art']) this.el['p-art'].textContent = `${this.game.state.artifacts.length} / 5`;
    if (this.el['p-ops']) this.el['p-ops'].textContent = `${this.game.state.opsDone} / 45`;
  }

  setBond(n, flash = false) {
    this.game.state.bond = clamp(n, 0, 100);
    this.el['bond-val'].textContent = 'СВЯЗЬ ' + Math.round(this.game.state.bond);
    this.el['bond-num'].textContent = Math.round(this.game.state.bond);
    const c = this.el['bond-circle'];
    if (c) c.style.strokeDashoffset = String(327 - (this.game.state.bond / 100) * 327);
    if (this.el['menu-bond']) this.el['menu-bond'].style.width = this.game.state.bond + '%';
    if (flash) {
      this.el['bond-chip'].classList.add('flash');
      setTimeout(() => this.el['bond-chip'].classList.remove('flash'), 600);
    }
  }

  setWanted(n, disguise = false) {
    this.wantedStars.forEach((s, i) => s.classList.toggle('on', i < n));
    if (this.el['mc-wanted']) this.el['mc-wanted'].textContent = n > 0 ? `${'★'.repeat(n)} ${disguise ? '· МАСКА' : ''}` : 'ЧИСТО';
    this.el['region'].style.color = n > 0 ? '#ff9a9a' : '';
  }

  // the wheel lock is contextual, never an explanatory popup
  setWheelLock(ids) {
    const g = this.game;
    g.missionLock = ids || null;
  }

  // nearby hostiles who know you are there; drives the stealth readout
  setDetection(level, onFoot) {
    const el = this.el['detect'];
    if (!el) return;
    const lvl = onFoot ? Math.round(clamp(level, 0, 1) * 100) : 0;
    el.classList.toggle('hidden', lvl <= 0);
    el.classList.toggle('warn', lvl > 60);
    if (lvl > 0) el.querySelector('i').style.width = lvl + '%';
  }

  setMission(m) {
    if (!m) { this.el['mission-panel'].classList.add('hidden'); return; }
    this.el['mission-panel'].classList.remove('hidden');
    this.el['mission-kicker'].textContent = m.kicker || 'ОПЕРАЦИЯ';
    this.el['mission-title'].textContent = m.title || '';
    this.el['mission-obj'].textContent = m.obj || '';
    this.el['mission-bar'].style.width = `${clamp((m.progress || 0) * 100, 0, 100)}%`;
  }

  setObjective(obj, progress = 0) {
    this.el['mission-obj'].textContent = obj || '';
    this.el['mission-bar'].style.width = `${clamp(progress * 100, 0, 100)}%`;
    // the chosen approach quietly tints the objective line
    const mode = this.game.state?.approach;
    const el = this.el['mission-obj'];
    if (el) {
      el.style.color = mode === 'stealth' ? 'rgba(140,235,210,.92)'
        : mode === 'loud' ? 'rgba(255,150,120,.95)'
        : mode === 'magic' ? 'rgba(190,160,255,.95)' : '';
    }
  }

  hideMission() { this.el['mission-panel'].classList.add('hidden'); }

  setInteraction(inter) {
    this.interaction = inter;
    const btn = this.el['btn-action'];
    if (!inter) { btn.classList.add('hidden'); return; }
    btn.classList.remove('hidden');
    this.el['action-label'].textContent = inter.label;
  }

  setAiming(v) {
    this.el['hud'].classList.toggle('aiming', !!v);
  }

  setPointerLocked(locked) {
    const el = this.el['hud'];
    if (el) el.classList.toggle('locked', !!locked);
    const btn = document.getElementById('btn-fire');
    if (btn) btn.classList.toggle('locked', !!locked);
  }

  updateAmmo() {
    const hero = this.game.player;
    if (!hero) return;
    if (hero.id === 'lucia') {
      const w = hero.weaponData || { name: 'ПИСТОЛЕТ' };
      this.el.ammo.classList.remove('hidden');
      this.el['cast-info'].classList.add('hidden');
      this.el['ammo-mag'].textContent = hero.mag[hero.weapon] ?? 0;
      this.el['ammo-res'].textContent = hero.reserve[hero.weapon] ?? 0;
      this.el['weapon-name'].textContent = w.name;
    } else {
      this.el.ammo.classList.add('hidden');
      const sp = hero.spells[hero.spell];
      if (sp) {
        this.el['cast-info'].classList.remove('hidden');
        this.el['cast-name'].textContent = sp.name;
        this.el['cast-cd'].style.opacity = sp.cdLeft > 0 ? '0.9' : '0.35';
      }
    }
    // ability icon state
    const ab = document.getElementById('btn-ability');
    if (ab) ab.classList.toggle('cooldown', hero.id === 'mage' ? hero.spells[hero.spell]?.cdLeft > 0 : hero.empCd > 0);
  }

  // -----------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    this.updateBars();
    this.updateAmmo();
    const hour = g.world.hour;
    this.el.clock.textContent = fmtTime(hour);
    const dayNames = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
    this.el.day.textContent = dayNames[new Date().getDay()];
    const reg = g.world.regionAt(g.player.pos.x, g.player.pos.z);
    this.el.region.textContent = districtNames[reg] || 'ВАЙС-СИТИ';
    this.setWanted(g.state.wanted, g.state.disguise);
    if (g.state.wanted > 0) this.el['region'].style.color = '#ff9a9a';
    // waypoint
    if (g.waypoint) {
      const d = Math.hypot(g.waypoint.x - g.player.pos.x, g.waypoint.z - g.player.pos.z);
      this.el['waypoint-dist'].textContent = d > 1000 ? (d / 1000).toFixed(2) + ' КМ' : Math.round(d) + ' М';
    } else this.el['waypoint-dist'].textContent = '';
    // interaction
    this.setInteraction(g.player?.interaction);
    // radar
    if (g.elapsed - this.lastMini > 0.06) {
      this.lastMini = g.elapsed;
      this.drawMinimap();
    }
    this.updateWheelHold();
    this.updateRadialHold();
    if (this.menuVisible) this.updateMenuInfo();
    if (this.mapOpen && g.elapsed - (this._mapT || 0) > 0.3) {
      this._mapT = g.elapsed;
      this.drawFullMap();
    }
  }

  updateMenuInfo() {
    const g = this.game;
    this.el['menu-time'].textContent = fmtTime(g.world.hour);
    const w = g.world.weather;
    this.el['menu-weather'].textContent = w === 'storm' ? 'ШТОРМ · 24°' : w === 'rain' ? 'ДОЖДЬ · 25°' : 'ЯСНО · 28°';
    this.el['mc-weather2'].textContent = w === 'storm' ? 'УРАГАН' : w === 'rain' ? 'ЛИВЕНЬ' : 'ШТИЛЬ';
    this.el['mc-wanted'].textContent = g.state.wanted > 0 ? '★'.repeat(g.state.wanted) : 'ЧИСТО';
    this.el['menu-bond'].style.width = g.state.bond + '%';
    this.el['bond-num'].textContent = Math.round(g.state.bond);
  }

  // -----------------------------------------------------------------------
  // character wheel
  updateWheelHold() {
    const input = this.game.input;
    if (input.wheel.justOpened) this.openWheel();
    if (input.wheel.open && this.wheelOpen) this.updateWheelSelection();
    if (input.wheel.justClosed) this.closeWheel(true);
    if (input.wheel.quick) {
      const other = this.game.player.id === 'mage' ? 'lucia' : 'mage';
      this.game.switchCharacter(other);
    }
  }

  openWheel() {
    const g = this.game;
    if (!g.heroes || this.wheelOpen) return;
    this.wheelOpen = true;
    g.wheelOpen = true;
    this.el.wheel.classList.remove('hidden');
    this.el['wheel-lock'].classList.remove('show');
    if (!this._wheelTapBound) {
      this._wheelTapBound = true;
      this.el.wheel.querySelectorAll('.hero-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.hero;
          if (!id) return;
          if (g.missionLock && !g.missionLock.includes(id)) { this.wheelLocked(); return; }
          this.selectedWheel = id;
          this.closeWheel(true);
        });
      });
      this.el.wheel.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.hero-card')) return;
        this._wheelBgTap = true;
      });
      this.el.wheel.addEventListener('pointerup', (e) => {
        if (e.target.closest('.hero-card')) return;
        if (this._wheelBgTap) this.closeWheel(true);
        this._wheelBgTap = false;
      });
    }
    const other = g.player.id === 'mage' ? g.heroes.lucia : g.heroes.mage;
    const dist = other.pos.distanceTo(g.player.pos);
    this.el['lucia-loc'].textContent = other.id === 'lucia'
      ? `${g.world.districtInfo(other.pos.x, other.pos.z).name} · ${(dist / 1000).toFixed(1)} КМ`
      : '';
    this.el['mage-loc'].textContent = other.id === 'mage'
      ? `${g.world.districtInfo(other.pos.x, other.pos.z).name} · ${(dist / 1000).toFixed(1)} КМ`
      : '';
    const otherId = other.id;
    if (g.missionLock && !g.missionLock.includes(otherId)) {
      this.el['wheel-lock'].classList.add('show');
    }
    this.el['wheel'].querySelectorAll('.hero-card').forEach(c => c.classList.remove('selected'));
    const cur = this.el['wheel'].querySelector(`.hero-card[data-hero="${g.player.id}"]`);
    cur?.classList.add('selected');
    this.selectedWheel = g.player.id;
    g.audio?.play('ui');
  }

  updateWheelSelection() {
    const input = this.game.input;
    const dx = input.wheel.dx || 0;
    const g = this.game;
    if (Math.abs(dx) > 35) {
      const id = dx < 0 ? 'lucia' : 'mage';
      if (g.missionLock && !g.missionLock.includes(id)) {
        this.el['wheel-lock'].classList.add('show');
        return;
      }
      this.el['wheel-lock'].classList.remove('show');
      this.selectedWheel = id;
      this.el['wheel'].querySelectorAll('.hero-card').forEach(c => c.classList.toggle('selected', c.dataset.hero === id));
    }
  }

  closeWheel(commit) {
    const g = this.game;
    if (!this.wheelOpen) return;
    this.wheelOpen = false;
    g.wheelOpen = false;
    this.el.wheel.classList.add('hidden');
    if (commit && this.selectedWheel) g.switchCharacter(this.selectedWheel);
    this.selectedWheel = null;
  }

  wheelLocked() {
    this.el['wheel-lock'].classList.add('show');
    this.game.audio?.play('ui');
  }

  // -----------------------------------------------------------------------
  // radial
  updateRadialHold() {
    const input = this.game.input;
    if (input.radial.justOpened) this.openRadial();
    if (input.radial.open && this.radialOpen) this.updateRadialSelection();
    if (input.radial.justClosed) this.closeRadial(true);
    if (input.radial.quick) {
      this.game.cycleAbility();
    }
  }

  openRadial() {
    const g = this.game;
    if (this.radialOpen) return;
    this.radialOpen = true;
    g.radialOpen = true;
    this.el.radial.classList.remove('hidden');
    this.el['radial-title'].textContent = g.player.id === 'mage' ? 'МАГИЯ' : 'АРСЕНАЛ';
    this.el['radial-center'].textContent = g.player.id === 'mage' ? 'ВЫБЕРИ ЗАКЛИНАНИЕ' : 'ВЫБЕРИ ОРУЖИЕ';
    const items = g.radialItems();
    const wrap = this.el['radial-slots'];
    wrap.innerHTML = '';
    const R = 155;
    items.forEach((it, i) => {
      const a = -Math.PI / 2 + (i / items.length) * TAU;
      const el = document.createElement('div');
      el.className = 'rslot' + (it.locked ? ' locked' : '') + (it.selected ? ' selected' : '') + (it.cd > 0 ? ' cooldown' : '');
      el.style.left = `${Math.cos(a) * R}px`;
      el.style.top = `${Math.sin(a) * R}px`;
      el.innerHTML = `<div class="ic">${it.icon}</div><div class="nm">${it.name}</div><div class="cost">${it.sub || ''}</div>`;
      wrap.appendChild(el);
    });
    this.radialSlot = items.findIndex(i => i.selected);
    if (this.radialSlot < 0) this.radialSlot = 0;
    this.radialItems = items;
    this.updateRadialSelection(true);
    g.audio?.play('ui');
  }

  updateRadialSelection(force = false) {
    const input = this.game.input;
    const items = this.radialItems;
    if (!items) return;
    let idx = this.radialSlot;
    const dx = input.radial.dx || 0;
    const dy = input.radial.dy || 0;
    const len = Math.hypot(dx, dy);
    if (len > 32) {
      let a = Math.atan2(dy, dx);
      a += Math.PI / 2;
      if (a < 0) a += TAU;
      idx = Math.round((a / TAU) * items.length) % items.length;
    }
    if (idx !== this.radialSlot || force) {
      this.radialSlot = idx;
      const slots = this.el['radial-slots'].children;
      for (let i = 0; i < slots.length; i++) slots[i].classList.toggle('selected', i === idx);
      this.el['radial-center'].textContent = items[idx]?.name || '';
      this.game.audio?.play('ui', { vol: 0.35 });
    }
  }

  closeRadial(commit) {
    const g = this.game;
    if (!this.radialOpen) return;
    this.radialOpen = false;
    g.radialOpen = false;
    this.el.radial.classList.add('hidden');
    if (commit) g.selectRadialSlot(this.radialSlot);
  }

  // -----------------------------------------------------------------------
  // map
  buildMapBase() {
    const g = this.game;
    const W = 1400, H = 1100;
    const minX = -1620, maxX = 1250, minZ = -1950, maxZ = 1320;
    this.mapBounds = { minX, maxX, minZ, maxZ, W, H };
    const px = (x) => ((x - minX) / (maxX - minX)) * W;
    const pz = (z) => ((z - minZ) / (maxZ - minZ)) * H;
    this.mapPx = px; this.mapPz = pz;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#041019');
    grd.addColorStop(0.55, '#071521');
    grd.addColorStop(1, '#03080d');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    // water shimmer lines
    ctx.strokeStyle = 'rgba(50,140,170,.055)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 18) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) {
        ctx.lineTo(x, y + Math.sin(x * 0.02 + y * 0.03) * 3);
      }
      ctx.stroke();
    }
    // land
    ctx.fillStyle = '#0d1b21';
    for (const r of g.world.landRects) {
      ctx.fillRect(px(r.minX), pz(r.minZ), px(r.maxX) - px(r.minX), pz(r.maxZ) - pz(r.minZ));
    }
    // beach
    ctx.fillStyle = 'rgba(162,140,100,.22)';
    ctx.fillRect(px(760), pz(-920), px(940) - px(760), pz(520) - pz(-920));
    // city blocks
    ctx.fillStyle = '#17232b';
    for (const b of g.world.blocks) {
      ctx.fillRect(px(b.x0), pz(b.z0), Math.max(1, px(b.x1) - px(b.x0)), Math.max(1, pz(b.z1) - pz(b.z0)));
    }
    // roads
    ctx.strokeStyle = '#2e4350';
    ctx.lineWidth = 3;
    for (const r of g.world.roads) {
      ctx.beginPath();
      if (r.axis === 'x') {
        ctx.moveTo(px(r.x), pz(r.z1));
        ctx.lineTo(px(r.x), pz(r.z2));
      } else {
        ctx.moveTo(px(r.x1), pz(r.z));
        ctx.lineTo(px(r.x2), pz(r.z));
      }
      ctx.stroke();
    }
    // causeway + island roads
    ctx.strokeStyle = '#314754';
    ctx.lineWidth = 2.4;
    for (const [x1, z1, x2, z2] of [[700, 480, 700, 700], [603, 820, 603, 1000], [752, 820, 752, 900], [920, 322, 1090, 322]]) {
      ctx.beginPath(); ctx.moveTo(px(x1), pz(z1)); ctx.lineTo(px(x2), pz(z2)); ctx.stroke();
    }
    // district labels
    ctx.textAlign = 'center';
    for (const d of g.world.districts) {
      const x = px(d.center.x), y = pz(d.center.y);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.font = '600 15px "Segoe UI", Arial';
      ctx.fillText(d.name, x, y);
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.font = '400 10px Arial';
      ctx.fillText(d.desc, x, y + 17);
    }
    this.mapBase = c;
    // minimap base (lower detail)
    const m = document.createElement('canvas');
    m.width = 700; m.height = 550;
    m.getContext('2d').drawImage(c, 0, 0, 700, 550);
    this.miniBase = m;
  }

  worldToScreen(x, z, rect) {
    const b = this.mapBounds;
    const nx = (x - b.minX) / (b.maxX - b.minX);
    const nz = (z - b.minZ) / (b.maxZ - b.minZ);
    return { x: rect.x + nx * rect.w, y: rect.y + nz * rect.h };
  }

  _mapViewRect() {
    const canvas = this.el['map-canvas'];
    const r = canvas.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  _mapHover(e) {
    if (!this.mapOpen) return;
    const tip = this.el['map-tip'];
    const r = this.el['map-canvas'].getBoundingClientRect();
    const wx = this.mapBounds.minX + ((e.clientX - r.left) / r.width) * (this.mapBounds.maxX - this.mapBounds.minX);
    const wz = this.mapBounds.minZ + ((e.clientY - r.top) / r.height) * (this.mapBounds.maxZ - this.mapBounds.minZ);
    const marker = this.findMapMarker(wx, wz);
    if (marker) {
      tip.innerHTML = `<b>${marker.label}</b><em>${marker.sub || ''}</em>`;
      tip.style.left = `${e.clientX - r.left}px`;
      tip.style.top = `${e.clientY - r.top}px`;
      tip.classList.add('show');
    } else {
      tip.classList.remove('show');
    }
    this.el['map-coords'].textContent = `${wx.toFixed(0)} · ${wz.toFixed(0)}`;
  }

  findMapMarker(wx, wz) {
    const markers = this.getMarkers();
    let best = null, bd = 60;
    for (const m of markers) {
      const d = Math.hypot(m.x - wx, m.z - wz);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  _mapClick(e) {
    const r = this.el['map-canvas'].getBoundingClientRect();
    const wx = this.mapBounds.minX + ((e.clientX - r.left) / r.width) * (this.mapBounds.maxX - this.mapBounds.minX);
    const wz = this.mapBounds.minZ + ((e.clientY - r.top) / r.height) * (this.mapBounds.maxZ - this.mapBounds.minZ);
    const marker = this.findMapMarker(wx, wz);
    if (marker) {
      if (marker.type === 'contract') {
        this.game.missions?.startContract(marker.id);
        this.toggleMap(false);
      } else if (marker.type === 'mission') {
        this.game.setWaypoint(marker.x, marker.z, marker.label);
      } else {
        this.game.setWaypoint(marker.x, marker.z, marker.label);
        this.toast(marker.label);
      }
      return;
    }
    this.game.setWaypoint(wx, wz, 'ТОЧКА');
    this.toast('ТОЧКА ПОСТАВЛЕНА');
  }

  getMarkers() {
    const g = this.game;
    const out = [];
    for (const a of g.world.artifacts) if (!a.collected) out.push({ type: 'artifact', x: a.x, z: a.z, label: a.name, sub: 'ОСКОЛОК РАЗЛОМА' });
    for (const d of g.world.doors) out.push({ type: 'safe', x: d.x, z: d.z, label: d.label, sub: 'УКРЫТИЕ' });
    if (g.missions?.getMapMarkers) out.push(...g.missions.getMapMarkers());
    return out;
  }

  drawMinimap() {
    const g = this.game;
    const canvas = this.el.minimap;
    const ctx = canvas.getContext('2d');
    const S = canvas.width;
    const C = S / 2;
    const px = g.player.pos.x, pz = g.player.pos.z;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, C - 2, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#061018';
    ctx.fillRect(0, 0, S, S);
    const theta = Math.PI + g.cameraRig.yaw;
    const basePxPerM = 700 / (this.mapBounds.maxX - this.mapBounds.minX);
    const basePzPerM = 550 / (this.mapBounds.maxZ - this.mapBounds.minZ);
    const spanM = 280;
    const srcW = spanM * basePxPerM;
    const srcH = spanM * basePzPerM;
    const bx = this.mapPx(px) * 0.5, bz = this.mapPz(pz) * 0.5;
    const sx = bx - srcW / 2, sy = bz - srcH / 2;
    ctx.translate(C, C);
    ctx.rotate(theta);
    ctx.drawImage(this.miniBase, sx, sy, srcW, srcH, -C, -C, S, S);
    ctx.restore();
    // markers (screen space)
    const markers = this.getMarkers();
    const scale = S / spanM;
    for (const m of markers) {
      const dx = m.x - px, dz = m.z - pz;
      const sx2 = dx * Math.cos(theta) - dz * Math.sin(theta);
      const sy2 = dx * Math.sin(theta) + dz * Math.cos(theta);
      const mx = C + sx2 * scale, my = C + sy2 * scale;
      if (Math.hypot(mx - C, my - C) > C - 6) continue;
      let color = '#ff2e88';
      if (m.type === 'artifact') color = '#9d7bff';
      else if (m.type === 'safe') color = '#4df3ff';
      else if (m.type === 'contract') color = '#ffb657';
      else if (m.type === 'mission') color = '#ff2e88';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, my, m.type === 'mission' ? 5 : 3.2, 0, TAU);
      ctx.fill();
      if (m.type === 'mission') {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(mx, my, 9, 0, TAU); ctx.stroke();
      }
    }
    // player
    ctx.save();
    ctx.translate(C, C);
    ctx.fillStyle = '#f4f7ff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // border + N
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, TAU); ctx.stroke();
    const na = theta - Math.PI / 2;
    const nx = C + Math.cos(na) * (C - 13), ny = C + Math.sin(na) * (C - 13);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '600 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);
  }

  drawFullMap() {
    const g = this.game;
    const canvas = this.el['map-canvas'];
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.mapBase, 0, 0, W, H);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += W / 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += H / 11) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const markers = this.getMarkers();
    for (const m of markers) {
      const x = this.mapPx(m.x), y = this.mapPz(m.z);
      let color = '#ff2e88';
      if (m.type === 'artifact') color = '#9d7bff';
      else if (m.type === 'safe') color = '#4df3ff';
      else if (m.type === 'contract') color = '#ffb657';
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.strokeStyle = color; ctx.fillStyle = color;
      if (m.type === 'artifact') {
        ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill();
      } else if (m.type === 'contract') {
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.strokeRect(x - 8, y - 8, 16, 16);
      } else if (m.type === 'safe') {
        ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#041018'; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,46,136,.5)';
        ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    // waypoint
    if (g.waypoint) {
      const x = this.mapPx(g.waypoint.x), y = this.mapPz(g.waypoint.z);
      ctx.strokeStyle = '#4df3ff'; ctx.fillStyle = '#4df3ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 14); ctx.lineTo(x - 7, y); ctx.closePath(); ctx.fill();
    }
    // player
    const px = this.mapPx(g.player.pos.x), py = this.mapPz(g.player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-g.player.yaw + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.font = '500 11px Arial'; ctx.textAlign = 'center';
    ctx.fillText('ВАЙС-СИТИ · ЛЕОНИДА', W / 2, H - 10);
  }

  toggleMap(force) {
    const open = force === undefined ? !this.mapOpen : force;
    this.mapOpen = open;
    this.game.mapOpen = open;
    this.el['map-screen'].classList.toggle('hidden', !open);
    if (open) {
      this.drawFullMap();
      this.el['map-coords'].textContent = '25.7617° N · 80.1918° W';
      this.game.audio?.play('ui');
    }
  }

  // -----------------------------------------------------------------------
  // dialogue
  async say(lines) {
    if (!Array.isArray(lines)) lines = [lines];
    this.game.dialogueOpen = true;
    this.el.hud.classList.add('dialogue');
    this.el.dialogue.classList.remove('hidden');
    let last = null;
    for (const line of lines) {
      last = await this._line(line);
    }
    this.el.dialogue.classList.add('hidden');
    this.el.hud.classList.remove('dialogue');
    this.game.dialogueOpen = false;
    return last;
  }

  async ask(question, options, speaker = { name: 'МАГ', role: 'ОРДЕН ТЕНЕЙ', accent: 'mage' }) {
    this.game.dialogueOpen = true;
    this.el.hud.classList.add('dialogue');
    this.el.dialogue.classList.remove('hidden');
    this.el.dialogue.classList.toggle('lucia', speaker.accent === 'lucia');
    this.el['dlg-name'].textContent = speaker.name || 'МАГ';
    this.el['dlg-role'].textContent = speaker.role || '';
    this.el['dlg-text'].textContent = question;
    this.el['dlg-choices'].innerHTML = '';
    this.el['dlg-next'].style.display = 'none';
    const result = await new Promise((resolve) => {
      options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'dlg-choice';
        b.innerHTML = `<span>${opt.text || opt}</span>${opt.tag ? `<b>${opt.tag}</b>` : ''}`;
        b.addEventListener('click', () => {
          this.el['dlg-choices'].innerHTML = '';
          resolve(i);
        });
        this.el['dlg-choices'].appendChild(b);
      });
    });
    this.el.dialogue.classList.add('hidden');
    this.el.hud.classList.remove('dialogue');
    this.game.dialogueOpen = false;
    return result;
  }

  _line(line) {
    return new Promise((resolve) => {
      const speaker = line.who === 'lucia' ? { name: 'ЛЮСИЯ', role: 'ВЗЛОМЩИЦА', accent: 'lucia' }
        : line.who === 'narrator' ? { name: 'ВАЙС-СИТИ', role: '2026', accent: 'narrator' }
        : line.who === 'rey' ? { name: 'РЭЙ', role: 'ДИЛЕР', accent: 'narrator' }
        : line.who === 'cop' ? { name: 'ПАТРУЛЬ', role: 'ПОЛИЦИЯ', accent: 'narrator' }
        : { name: 'МАГ', role: 'ОРДЕН ТЕНЕЙ', accent: 'mage' };
      this.el.dialogue.classList.toggle('lucia', speaker.accent === 'lucia');
      this.el['dlg-name'].textContent = speaker.name;
      this.el['dlg-role'].textContent = speaker.role;
      const target = line.text || '';
      const textEl = this.el['dlg-text'];
      const choicesEl = this.el['dlg-choices'];
      choicesEl.innerHTML = '';
      this.el['dlg-next'].style.display = '';
      this.el.dialogue.classList.remove('hidden');
      let done = false;
      let idx = 0;
      let typing = true;
      let choiceResolve = null;
      textEl.textContent = '';
      this.game.audio?.play('ui', { vol: 0.15 });
      const complete = () => {
        typing = false;
        textEl.textContent = target;
        if (line.choices) this._showChoices(line.choices, choicesEl, (i) => { choiceResolve = null; resolve(i); });
        else this.el['dlg-box'].classList.add('waiting');
      };
      const timer = setInterval(() => {
        if (!typing) return;
        idx += 2;
        textEl.textContent = target.slice(0, idx);
        if (idx >= target.length) { clearInterval(timer); complete(); }
      }, 18);
      const advance = () => {
        if (!this.game.dialogueOpen) return;
        if (typing) { clearInterval(timer); complete(); return; }
        if (line.choices) return;
        cleanup();
        resolve(-1);
      };
      const onClick = (e) => {
        if (e.target.closest('.dlg-choice')) return;
        advance();
      };
      const cleanup = () => {
        this.el['dlg-box'].removeEventListener('click', onClick);
        clearInterval(timer);
        this.el['dlg-box'].classList.remove('waiting');
      };
      this.el['dlg-box'].addEventListener('click', onClick);
      if (line.choices) {
        const old = this._choiceResolve;
        this._choiceResolve = (i) => { this._choiceResolve = old; cleanup(); resolve(i); };
      }
    });
  }

  _showChoices(choices, wrap, done) {
    wrap.innerHTML = '';
    this.el['dlg-box'].classList.remove('waiting');
    choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'dlg-choice';
      b.innerHTML = `<span>${c.text || c}</span>${c.tag ? `<b>${c.tag}</b>` : ''}`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        wrap.innerHTML = '';
        done(i);
      });
      wrap.appendChild(b);
    });
  }

  // -----------------------------------------------------------------------
  // interiors (menu-style, the city keeps living outside)
  openInterior(id) {
    const g = this.game;
    this.interiorOpen = true;
    g.mode = 'interior';
    let overlay = document.getElementById('interior');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'interior';
      overlay.className = 'overlay hidden';
      document.getElementById('app').appendChild(overlay);
    }
    const titles = {
      motel: ['МОТЕЛЬ «СИНИЙ ПРИЛИВ»', 'НОМЕР 6 · СЕЙФ-ХАУС'],
      club: ['КЛУБ «ЭХО»', 'ЮГ БИЧ · ТАНЦПОЛ'],
      shop: ['ОРУЖЕЙНАЯ «ИЕРИХОН»', 'ЦЕНТР · 24/7'],
      diner: ['ЗАКУСОЧНАЯ «СОЛЬ И САХАР»', 'НАБЕРЕЖНАЯ · КРУГЛОСУТОЧНО'],
      clinic: ['КЛИНИКА «ЛЕОНИДА»', 'ПРИЁМНЫЙ ПОКОЙ'],
      garage: ['МАСТЕРСКАЯ ПОРТА', 'РЕМОНТ · ТОПЛИВО'],
      bar: ['БАР «ЧЁРНАЯ НЕФТЬ»', 'АМБРОЗИЯ · БАЙКЕРЫ'],
      bait: ['ПРИЧАЛ «ЛЕОНИДА-КИС»', 'НАЖИВКА · ЛОДКИ · СЛУХИ'],
    };
    const [title, sub] = titles[id] || ['ПОМЕЩЕНИЕ', ''];
    let opts = [];
    if (id === 'motel') {
      opts = [
        { t: 'СМЕНИТЬ ОДЕЖДУ · СБРОСИТЬ РОЗЫСК', fn: () => { g.state.heat = 0; g.state.wanted = 0; g.state.disguise = true; this.toast('ОБРАЗ СМЕНЁН'); } },
        { t: 'СОХРАНИТЬ ИГРУ', fn: () => { g.save(); this.toast('СОХРАНЕНО'); } },
        { t: 'ВЗЯТЬ АПТЕЧКУ', fn: () => { g.player.medkits++; this.toast('АПТЕЧКА +1'); } },
        { t: 'ВЫЙТИ', fn: () => {} },
      ];
    } else if (id === 'club') {
      opts = [
        { t: 'ВЫПИТЬ · $50 ВОССТАНОВИТЬ ЗДОРОВЬЕ', fn: () => { if (g.state.money >= 50) { g.state.money -= 50; g.player.heal(60); g.addBond(2, 'НОЧЬ В КЛУБЕ'); this.toast('ЗДОРОВЬЕ ВОССТАНОВЛЕНО'); g.ui.updateMoney(); } } },
        { t: 'ПОГОВОРИТЬ С ЛЮСИЕЙ', fn: () => { g.addBond(3, 'РАЗГОВОР'); this.toast('СВЯЗЬ +3'); } },
        { t: 'ВЫЙТИ', fn: () => {} },
      ];
    } else if (id === 'diner') {
      opts = [
        { t: 'ПОЕСТЬ · $25 · ЗДОРОВЬЕ', fn: () => { if (g.state.money >= 25) { g.state.money -= 25; g.player.heal(35); this.toast('СЫТ'); g.ui.updateMoney(); } } },
        { t: 'ПОДСЛУШАТЬ РАЗГОВОР', fn: () => { this.toast('«...в порту снова ждут груз без накладной...»'); g.state.flags.heardDock = true; } },
        { t: 'ВЫЙТИ', fn: () => {} },
      ];
    } else if (id === 'clinic') {
      opts = [
        { t: 'ЛЕЧЕНИЕ · $150 · ПОЛНОЕ ЗДОРОВЬЕ', fn: () => { if (g.state.money >= 150) { g.state.money -= 150; g.player.heal(g.player.hpMax); g.state.wanted = Math.max(0, g.state.wanted - 1); this.toast('ЗДОРОВЬЕ ВОССТАНОВЛЕНО'); g.ui.updateMoney(); } else this.toast('НЕ ХВАТАЕТ ДЕНЕГ', 'bad'); } },
        { t: 'АПТЕЧКА · $60', fn: () => { if (g.state.money >= 60) { g.state.money -= 60; g.player.medkits++; this.toast('АПТЕЧКА +1'); g.ui.updateMoney(); } else this.toast('НЕ ХВАТАЕТ ДЕНЕГ', 'bad'); } },
        { t: 'ВЫЙТИ', fn: () => {} },
      ];
    } else if (id === 'garage') {
      opts = [
        { t: 'ЗАПРАВИТЬ МАШИНУ · $40', fn: () => { const v = g.player.inVehicle; if (v && g.state.money >= 40) { g.state.money -= 40; g.gameplay.refuel(v); } else this.toast('НУЖНА МАШИНА И ДЕНЬГИ', 'bad'); } },
        { t: 'ПОЧИНИТЬ ДВИГАТЕЛЬ · $180', fn: () => { const v = g.player.inVehicle; if (v && g.state.money >= 180) { g.state.money -= 180; v.engine = 100; v.damage = Math.max(0, v.damage - 40); this.toast('ДВИГАТЕЛЬ В НОРМЕ'); g.ui.updateMoney(); } else this.toast('НУЖНА МАШИНА И ДЕНЬГИ', 'bad'); } },
        { t: 'ВЫЙТИ', fn: () => {} },
      ];
    } else if (id === 'bar') {
      opts = [
        { t: 'ВЫПИТЬ С БАЙКЕРАМИ · $40', fn: () => { if (g.state.money >= 40) { g.state.money -= 40; g.player.heal(25); g.state.flags.bikersFriendly = true; this.toast('БАЙКЕРЫ ЗАПОМНИЛИ ТЕБЯ'); g.ui.updateMoney(); } } },
        { t: 'НАЙТИ ИНФОРМАТОРА · $120', fn: () => { if (g.state.money >= 120) { g.state.money -= 120; g.state.flags.ambrosiaTip = true; this.toast('НАВОДКА: НЕФТЯНОЙ ДОЛГ'); g.ui.updateMoney(); } else this.toast('НЕ ХВАТАЕТ ДЕНЕГ', 'bad'); } },
        { t: 'ВЫЙТИ', fn: () => {} },
      ];
    } else if (id === 'bait') {
      opts = [
        { t: 'ВЗЯТЬ ЛОДКУ НАПРОКАТ · $70', fn: () => { this.toast('ЛОДКА У ПРИЧАЛА'); } },
        { t: 'УДОЧКА · $30 · ВЗГЛЯНУТЬ НА ФАУНУ', fn: () => { if (g.state.money >= 30) { g.state.money -= 30; this.toast('ТЫ ВИДИШЬ БОЛЬШЕ ЖИЗНИ В ВОДЕ'); g.wildlife?.spotNearby?.(); g.ui.updateMoney(); } } },
        { t: 'ВЫЙТИ', fn: () => {} },
      ];
    } else {
      opts = [
        { t: 'ПАТРОНЫ · $120', fn: () => { if (g.state.money >= 120) { g.state.money -= 120; g.player.giveAmmo('pistol', 48); g.player.giveAmmo('smg', 60); g.player.giveAmmo('shotgun', 12); this.toast('ПАТРОНЫ КУПЛЕНЫ'); g.ui.updateMoney(); } else this.toast('НЕ ХВАТАЕТ ДЕНЕГ', 'bad'); } },
        { t: 'БРОНЯ · $250', fn: () => { if (g.state.money >= 250) { g.state.money -= 250; g.player.hpMax += 15; g.player.heal(50); this.toast('БРОНЯ УСТАНОВЛЕНА'); g.ui.updateMoney(); } else this.toast('НЕ ХВАТАЕТ ДЕНЕГ', 'bad'); } },
        { t: 'ВЫЙТИ', fn: () => {} },
      ];
    }
    overlay.innerHTML = `<div class="interior-panel"><div class="kicker">${sub}</div><h2>${title}</h2><div class="int-list">${opts.map((o, i) => `<button data-i="${i}">${o.t}</button>`).join('')}</div><div class="int-foot">ГОРОД ПРОДОЛЖАЕТ ЖИТЬ СНАРУЖИ</div></div>`;
    overlay.classList.remove('hidden');
    overlay.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => {
      opts[i].fn();
      this.closeInterior();
    }));
    g.audio?.play('ui');
  }

  closeInterior() {
    this.interiorOpen = false;
    document.getElementById('interior')?.classList.add('hidden');
    this.game.mode = 'play';
  }

  // -----------------------------------------------------------------------
  togglePause(force) {
    const open = force === undefined ? !this.pauseOpen : force;
    this.pauseOpen = open;
    this.game.paused = open;
    this.el.pause.classList.toggle('hidden', !open);
    if (open) {
      this.el['p-bond'].textContent = Math.round(this.game.state.bond);
      this.el['p-art'].textContent = `${this.game.state.artifacts.length} / 5`;
      this.el['p-ops'].textContent = `${this.game.state.opsDone} / 45`;
      this.el['p-money'].textContent = fmtMoney(this.game.state.money);
      this.setQualityUI(this.game.quality.level);
      this.buildCodex();
      this.game.audio?.play('ui');
    }
  }

  toggleCodex() {
    const panel = this.el['codex-panel'];
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) this.buildCodex();
    this.game.audio?.play('ui');
  }

  buildCodex() {
    const g = this.game;
    const wrap = this.el['codex-chapters'];
    if (!wrap) return;
    const missions = g.missions?.constructor?.MISSIONS;
    const done = g.state.storyDone || 0;
    const chapters = [
      ['I', 'ЧУЖОЙ ГОД', 0, 7], ['II', 'НЕОНОВАЯ ЛИНИЯ', 7, 15], ['III', 'ПЕПЕЛ АМБРОЗИИ', 15, 22],
      ['IV', 'ЛЕОНИДА-КИС', 22, 30], ['V', 'ГРАССРИВЕРС', 30, 38], ['VI', 'РАЗЛОМ', 38, 45],
    ];
    wrap.innerHTML = chapters.map(([num, title, a, b]) => {
      const inner = [];
      for (let i = a; i < b; i++) {
        const cls = i < done ? 'done' : i === done ? 'next' : '';
        inner.push(`<span class="cx-op ${cls}">${String(i + 1).padStart(2, '0')}</span>`);
      }
      const count = Math.max(0, Math.min(b, done) - a);
      return `<div class="cx-ch"><h4>ГЛАВА ${num} · ${title}<b>${count} / ${b - a}</b></h4><div class="cx-ops">${inner.join('')}</div></div>`;
    }).join('');
    const codex = g.wildlife?.codex?.();
    if (this.el['codex-fauna']) this.el['codex-fauna'].textContent = codex ? `${codex.total} ВИДОВ · ${codex.seen} ЗАМЕЧЕНО` : '172 ВИДА';
    if (this.el['codex-bond']) this.el['codex-bond'].textContent = Math.round(g.state.bond);
    if (this.el['codex-flags']) this.el['codex-flags'].textContent = Object.values(g.state.flags || {}).filter(Boolean).length;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  // -----------------------------------------------------------------------
  showMenu() {
    this.game.toMenu();
    this.el.menu.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.map-screen.classList.add('hidden');
    this.pauseOpen = false;
    this.mapOpen = false;
    this.menuVisible = true;
    this.updateContinue();
    this.updateMenuInfo();
  }

  hideMenu() {
    this.el.menu.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.menuVisible = false;
  }

  showChapter(num, title, sub) {
    return new Promise((resolve) => {
      this.el['cc-num'].textContent = num;
      this.el['cc-title'].textContent = title;
      this.el['cc-sub'].textContent = sub;
      this.el['chapter-card'].classList.remove('hidden');
      this.el['chapter-card'].style.opacity = '1';
      setTimeout(() => {
        this.el['chapter-card'].style.transition = 'opacity .8s';
        this.el['chapter-card'].style.opacity = '0';
        setTimeout(() => {
          this.el['chapter-card'].classList.add('hidden');
          this.el['chapter-card'].style.transition = '';
          resolve();
        }, 800);
      }, 2200);
    });
  }

  showEnding(key, data) {
    const endings = {
      return: ['ВОЗВРАЩЕНИЕ', 'Портал закрылся за спиной. XIV век встретил мага запахом дыма и мокрой шерсти. Вайс-Сити остался в другой жизни — и в чужих снах.\n\nЛюсия не провожала его. Она стояла на крыше и смотрела, как небо над городом снова становится обычным.'],
      stay: ['НОВАЯ ИМПЕРИЯ', 'Маг остался. В городе, где магия почти исчезла, появился человек, который помнил, как она звучит. Люсия получила не просто напарника — оружие, которого не было ни у кого.\n\nК утру их имена знал каждый, кто платит за тишину.'],
      sacrifice: ['ЛЕГЕНДА', 'Разлом схлопнулся и забрал его. На месте, где стоял маг, остался только пепел и тёплый след на асфальте.\n\nЛюсия рассказывала эту историю каждому, кто спрашивал, откуда в Вайс-Сити взялась магия.'],
      hidden: ['ДВА БЕРЕГА', 'Пять осколков сложились в дверь. За ней был не XIV век и не 2026-й — а место, где время не имеет значения.\n\nМаг взял Люсию за руку. Портал закрылся. Город остался без них — и впервые за долгое время не пожалел.'],
    };
    const [title, text] = endings[key] || endings.return;
    const labels = { return: 'ВОЗВРАЩЕНИЕ', stay: 'ИМПЕРИЯ', sacrifice: 'ЖЕРТВА', hidden: 'ДВА БЕРЕГА' };
    this.el['end-kicker'].textContent = key === 'hidden' ? 'СКРЫТЫЙ ФИНАЛ' : 'ФИНАЛ';
    this.el['end-title'].textContent = title;
    this.el['end-text'].textContent = text;
    this.el['end-stats'].innerHTML = `
      <div><span>СВЯЗЬ</span><b>${Math.round(this.game.state.bond)}</b></div>
      <div><span>АРТЕФАКТЫ</span><b>${this.game.state.artifacts.length} / 5</b></div>
      <div><span>ОПЕРАЦИИ</span><b>${this.game.state.opsDone} / 45</b></div>
      <div><span>ФИНАЛ</span><b>${labels[key] || 'НЕИЗВЕСТЕН'}</b></div>`;
    this.el.ending.classList.remove('hidden');
  }

  showDeath() {
    this.el.fade.style.opacity = '0.92';
    this.toast('ТЬМА ЗАБИРАЕТ ТЕБЯ', 'bad');
    setTimeout(() => {
      this.game.respawn();
      this.el.fade.style.opacity = '0';
    }, 2400);
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.innerHTML = text;
    this.el['toast-zone'].appendChild(d);
    setTimeout(() => d.remove(), 3000);
  }

  damage(n) {
    this.el.flash.style.opacity = '0.08';
    setTimeout(() => { this.el.flash.style.opacity = '0'; }, 80);
  }

  flash() {
    this.el.flash.style.opacity = '0.55';
    setTimeout(() => { this.el.flash.style.opacity = '0'; }, 90);
  }

  loading(p, label) {
    if (this.el['load-progress']) this.el['load-progress'].style.width = `${clamp(p, 0, 1) * 100}%`;
    if (label && this.el['load-label']) this.el['load-label'].textContent = label;
  }

  hideLoading() { this.el.loading?.classList.add('hidden'); }
}
