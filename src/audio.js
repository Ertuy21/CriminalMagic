import { clamp, rand } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.musicVol = 0.32;
    this.sfxVol = 0.7;
    this.musicOn = false;
    this.engineOn = false;
    this.nextBar = 0;
    this.bar = 0;
    this.rainLevel = 0;
    this.sirenOn = false;
    this.tempo = 82;
    this._bound = false;
  }

  unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this._buildGraph();
      this.ready = true;
    } catch (e) {
      console.warn('audio unavailable', e);
    }
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);

    // reverb
    const len = ctx.sampleRate * 2.6;
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = imp;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.32;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this.musicBus.connect(this.reverb);
    this.sfxBus.connect(this.reverb);

    // noise buffer
    const nlen = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    // rain
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = 1800;
    this.rainSrc = ctx.createBufferSource();
    this.rainSrc.buffer = this.noiseBuf;
    this.rainSrc.loop = true;
    this.rainSrc.connect(rainFilter).connect(this.rainGain).connect(this.sfxBus);
    this.rainSrc.start();

    // siren
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.frequency.value = 0.55;
    this.sirenLfoGain = ctx.createGain();
    this.sirenLfoGain.gain.value = 160;
    this.sirenLfo.connect(this.sirenLfoGain).connect(this.sirenOsc.frequency);
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 800;
    sf.Q.value = 1.4;
    this.sirenOsc.connect(sf).connect(this.sirenGain).connect(this.sfxBus);
    this.sirenOsc.start();
    this.sirenLfo.start();

    // engine
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 3;
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 48;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 24;
    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.sfxBus);
    this.engineOsc1.start();
    this.engineOsc2.start();
  }

  setVolumes(music, sfx) {
    this.musicVol = clamp(music, 0, 1);
    this.sfxVol = clamp(sfx, 0, 1);
    if (!this.ready) return;
    this.musicBus.gain.value = this.musicVol * (this.musicOn ? 1 : 0);
    this.sfxBus.gain.value = this.sfxVol;
  }

  startMusic() {
    this.unlock();
    if (!this.ready) return;
    this.musicOn = true;
    this.musicBus.gain.setTargetAtTime(this.musicVol, this.ctx.currentTime, 0.4);
    this.nextBar = this.ctx.currentTime + 0.3;
    this.bar = 0;
  }

  stopMusic() {
    this.musicOn = false;
    if (this.ready) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  _noise(dur, freq, q, gain, type = 'lowpass', when = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
    return { src, g, f };
  }

  _tone(freq, dur, type, gain, slideTo = null, when = 0, dest = null) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  play(name, opts = {}) {
    if (!this.ready) return;
    const v = opts.vol ?? 1;
    switch (name) {
      case 'shot':
        this._noise(0.09, 2400, 0.7, 0.5 * v);
        this._tone(150, 0.12, 'square', 0.25 * v, 60);
        break;
      case 'smg':
        this._noise(0.06, 3000, 0.8, 0.32 * v);
        this._tone(190, 0.07, 'square', 0.14 * v, 90);
        break;
      case 'shotgun':
        this._noise(0.25, 1600, 0.6, 0.7 * v);
        this._tone(110, 0.22, 'sawtooth', 0.3 * v, 40);
        break;
      case 'magic':
        this._tone(280, 0.45, 'sine', 0.18 * v, 900);
        this._tone(560, 0.3, 'triangle', 0.1 * v, 1200);
        this._noise(0.3, 4200, 2, 0.08 * v, 'bandpass');
        break;
      case 'explosion':
        this._noise(0.7, 500, 0.4, 0.7 * v);
        this._tone(70, 0.7, 'sine', 0.5 * v, 30);
        this._tone(160, 0.3, 'sawtooth', 0.16 * v, 40);
        break;
      case 'hit':
        this._noise(0.07, 900, 1, 0.25 * v);
        break;
      case 'reload':
        this._noise(0.05, 1800, 1, 0.2 * v, 'bandpass');
        this._noise(0.05, 1200, 1, 0.2 * v, 'bandpass', 0.35);
        this._noise(0.05, 2000, 1, 0.18 * v, 'bandpass', 0.7);
        break;
      case 'jump':
        this._noise(0.2, 700, 0.5, 0.08 * v, 'bandpass');
        break;
      case 'step':
        this._noise(0.05, 500, 1.4, 0.045 * v);
        break;
      case 'pickup':
        this._tone(880, 0.25, 'sine', 0.16 * v);
        this._tone(1320, 0.35, 'sine', 0.1 * v, null, 0.08);
        break;
      case 'ui':
        this._tone(520, 0.06, 'sine', 0.08 * v);
        break;
      case 'switch':
        this._noise(0.4, 500, 0.5, 0.15 * v, 'bandpass');
        this._tone(220, 0.5, 'sine', 0.12 * v, 440);
        break;
      case 'crash':
        this._noise(0.3, 1300, 0.5, 0.5 * v);
        this._tone(90, 0.25, 'sawtooth', 0.18 * v, 45);
        break;
      case 'thunder':
        this._noise(2.2, 180, 0.5, 0.6 * v);
        this._tone(50, 2.4, 'sine', 0.22 * v, 24);
        break;
      case 'hack':
        this._tone(1200, 0.05, 'square', 0.05 * v);
        this._tone(1600, 0.05, 'square', 0.05 * v, null, 0.1);
        this._tone(900, 0.08, 'square', 0.05 * v, null, 0.2);
        break;
      case 'heal':
        this._tone(440, 0.4, 'sine', 0.12 * v, 660);
        this._tone(660, 0.6, 'sine', 0.08 * v, 880, 0.15);
        break;
      case 'siren':
        this.sirenOn = !!opts.on;
        break;
      case 'horn': {
        this._tone(330, 0.3, 'square', 0.07 * v);
        this._tone(415, 0.3, 'square', 0.05 * v);
        break;
      }
    }
  }

  explosion() { this.play('explosion', { vol: 1 }); }

  setEngine(speed, throttle) {
    this.engineOn = speed !== 0;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const s = Math.abs(speed);
    this.engineGain.gain.setTargetAtTime(this.engineOn ? 0.035 + Math.min(0.05, s * 0.0018) : 0, t, 0.12);
    this.engineOsc1.frequency.setTargetAtTime(38 + s * 2.4 + Math.abs(throttle) * 16, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(19 + s * 1.2, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(280 + s * 18, t, 0.15);
  }

  update(dt, game) {
    if (!this.ready) return;
    const rain = game?.world?.rain || 0;
    this.rainGain.gain.setTargetAtTime(rain * 0.12, this.ctx.currentTime, 0.5);
    this.sirenGain.gain.setTargetAtTime(this.sirenOn ? 0.035 : 0, this.ctx.currentTime, 0.3);
    if (this.musicOn) this._schedule();
  }

  _schedule() {
    const ctx = this.ctx;
    const beat = 60 / this.tempo;
    const barDur = beat * 4;
    if (this.nextBar < ctx.currentTime - 1) this.nextBar = ctx.currentTime + 0.1;
    while (this.nextBar < ctx.currentTime + 0.4) {
      this._playBar(this.nextBar, this.bar);
      this.bar = (this.bar + 1) % 4;
      this.nextBar += barDur;
    }
  }

  _playBar(t0, barIdx) {
    const ctx = this.ctx;
    const roots = [110, 87.31, 130.81, 98]; // A2 F2 C3 G2
    const root = roots[barIdx % 4];
    const night = this._night ?? 1;
    const bus = this.musicBus;

    const note = (freq, when, dur, type, gain, filterFreq = 900, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      f.Q.value = 1.2;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(gain, when + Math.min(0.08, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(f).connect(g).connect(bus);
      o.start(when);
      o.stop(when + dur + 0.05);
    };
    const beat = 60 / this.tempo;
    // pad chord (Am / F / C / G)
    const chord = barIdx % 4 === 0 ? [220, 261.63, 329.63] : barIdx % 4 === 1 ? [174.61, 220, 261.63] : barIdx % 4 === 2 ? [261.63, 329.63, 392] : [196, 246.94, 293.66];
    chord.forEach((f, i) => note(f, t0, beat * 4.2, 'sawtooth', 0.022 + night * 0.006, 700 + i * 220, i * 4));
    // sub bass
    for (let k = 0; k < 8; k++) {
      const f = k % 4 === 3 ? root * 2 : root;
      note(f, t0 + k * beat * 0.5, beat * 0.42, 'square', 0.05, 260);
    }
    // arp
    const arp = [0, 7, 12, 15, 12, 7, 3, 7];
    for (let k = 0; k < 8; k++) {
      if (night < 0.4 && k % 2) continue;
      note(root * 4 * Math.pow(2, arp[k] / 12), t0 + k * beat * 0.5 + beat * 0.02, beat * 0.38, 'triangle', 0.018, 2400);
    }
    // drums
    const kick = (when, gain) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, when);
      o.frequency.exponentialRampToValueAtTime(42, when + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.25);
      o.connect(g).connect(bus);
      o.start(when); o.stop(when + 0.3);
    };
    const hat = (when, gain) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
      s.connect(f).connect(g).connect(bus);
      s.start(when); s.stop(when + 0.06);
    };
    kick(t0, 0.1);
    kick(t0 + beat * 2, 0.08);
    for (let k = 0; k < 8; k++) hat(t0 + k * beat * 0.5, k % 2 ? 0.012 : 0.02);
    // snare
    for (const b of [1, 3]) {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t0 + b * beat);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + b * beat + 0.2);
      s.connect(f).connect(g).connect(bus);
      s.start(t0 + b * beat); s.stop(t0 + b * beat + 0.22);
    }
  }

  setNight(n) { this._night = n; }
}
