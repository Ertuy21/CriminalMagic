import { clamp } from './util.js';

export class Input {
  constructor(game) {
    this.game = game;
    this.move = { x: 0, y: 0 };
    this.stickMove = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.fireHeld = false;
    this.firePressed = false;
    this.aimHeld = false;
    this.jumpPressed = false;
    this.crouch = false;
    this.actionPressed = false;
    this.quickAbility = -1;
    this.reloadPressed = false;
    this.sensitivity = 1;
    this.keys = new Set();
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.stickId = null;
    this.lookId = null;
    this.stickCenter = { x: 0, y: 0 };
    this.wheel = { down: false, hold: 0, open: false, justOpened: false, justClosed: false, dx: 0, dy: 0, quick: false, x: 0, y: 0 };
    this.radial = { down: false, hold: 0, open: false, justOpened: false, justClosed: false, dx: 0, dy: 0, quick: false, x: 0, y: 0 };
    this.aimTouch = false;
    this.zoomScroll = 0;
    this.everLocked = false;
    this.lockFailed = false;
    this._setupTouch();
    this._setupKeyboard();
    this._setupMouse();
  }

  setSensitivity(v) { this.sensitivity = clamp(v, 0.3, 2.2); }

  _setupTouch() {
    const stickZone = document.getElementById('stick-zone');
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    // floating stick: it recentres under the thumb, so a press near the edge
    // of the pad no longer produces an instant full-speed lurch
    this.stickR = 52;
    this.stickDead = 0.12;
    const resetStick = () => {
      this.stickId = null;
      this.stickMove.x = 0; this.stickMove.y = 0;
      knob.style.transform = 'translate(0px,0px)';
      stick.style.opacity = '0.55';
      stick.classList.remove('active');
    };
    const placeStick = (clientX, clientY) => {
      const zr = stickZone.getBoundingClientRect();
      const sr = stick.getBoundingClientRect();
      const half = sr.width / 2;
      let px = clientX - zr.left - half;
      let py = clientY - zr.top - half;
      px = Math.max(-half * 0.55, Math.min(zr.width - sr.width + half * 0.55, px));
      py = Math.max(-half * 0.55, Math.min(zr.height - sr.height + half * 0.55, py));
      stick.style.left = px + 'px';
      stick.style.top = py + 'px';
      stick.style.bottom = 'auto';
      this.stickCenter.x = zr.left + px + half;
      this.stickCenter.y = zr.top + py + half;
    };
    stickZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && this.touch) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      stickZone.setPointerCapture(e.pointerId);
      placeStick(e.clientX, e.clientY);
      this._moveStick(e.clientX, e.clientY);
      stick.style.opacity = '1';
      stick.classList.add('active');
    });
    stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      this._moveStick(e.clientX, e.clientY);
    });
    const up = (e) => { if (e.pointerId === this.stickId) resetStick(); };
    stickZone.addEventListener('pointerup', up);
    stickZone.addEventListener('pointercancel', up);
    stickZone.addEventListener('lostpointercapture', up);

    const lookZone = document.getElementById('look-zone');
    lookZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      lookZone.setPointerCapture(e.pointerId);
      this._lookLast = { x: e.clientX, y: e.clientY };
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      const dx = e.clientX - this._lookLast.x;
      const dy = e.clientY - this._lookLast.y;
      this._lookLast = { x: e.clientX, y: e.clientY };
      this.look.x += dx * this.sensitivity;
      this.look.y += dy * this.sensitivity;
    });
    const lookUp = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    lookZone.addEventListener('pointerup', lookUp);
    lookZone.addEventListener('pointercancel', lookUp);
    lookZone.addEventListener('lostpointercapture', lookUp);

    const holdButton = (id, state, onTap) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        state.down = true;
        state.hold = 0;
        state.open = false;
        state.x = e.clientX; state.y = e.clientY;
        state.x0 = e.clientX; state.y0 = e.clientY;
        state.dx = 0; state.dy = 0;
        el.classList.add('pressed');
      });
      el.addEventListener('pointermove', (e) => {
        if (!state.down) return;
        state.dx = e.clientX - state.x0;
        state.dy = e.clientY - state.y0;
        state.x = e.clientX; state.y = e.clientY;
      });
      const end = (e) => {
        if (!state.down) return;
        el.classList.remove('pressed');
        if (state.open) {
          state.justClosed = true;
          state.open = false;
        } else {
          onTap?.(e);
        }
        state.down = false;
        state.hold = 0;
        try { el.releasePointerCapture(e.pointerId); } catch {}
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };
    holdButton('btn-switch', this.wheel, () => { this.wheel.quick = true; });
    holdButton('btn-ability', this.radial, () => { this.radial.quick = true; });

    // swipe up on the radar corner also raises the character wheel
    const swipeEl = document.getElementById('minimap-wrap');
    if (swipeEl) {
      let sy = null, sx = null, st = 0;
      swipeEl.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        sy = e.clientY; sx = e.clientX; st = performance.now();
      });
      swipeEl.addEventListener('pointerup', (e) => {
        if (sy === null) return;
        const dy = sy - e.clientY;
        const dx = Math.abs(e.clientX - sx);
        if (dy > 46 && dx < 56 && performance.now() - st < 520) {
          if (!this.wheel.down) {
            this.swipeWheel = true;
            this.wheel.down = true;
            this.wheel.hold = 1;
            this.wheel.open = true;
            this.wheel.justOpened = true;
            this.wheel.x0 = e.clientX; this.wheel.y0 = e.clientY;
            this.wheel.dx = 0; this.wheel.dy = 0;
          }
        }
        sy = null;
      });
      // a tap anywhere while the swipe-opened wheel is up commits the choice
      const closeSwipe = (e) => {
        if (!this.swipeWheel) return;
        if (e.target.closest && e.target.closest('#wheel')) return;
        this.swipeWheel = false;
        if (this.wheel.open) { this.wheel.justClosed = true; this.wheel.open = false; }
        this.wheel.down = false;
      };
      document.addEventListener('pointerup', closeSwipe);
    }

    const fire = document.getElementById('btn-fire');
    fire.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fire.setPointerCapture(e.pointerId);
      this.fireHeld = true;
      this.firePressed = true;
      fire.classList.add('pressed');
    });
    const fireUp = (e) => {
      this.fireHeld = false;
      fire.classList.remove('pressed');
    };
    fire.addEventListener('pointerup', fireUp);
    fire.addEventListener('pointercancel', fireUp);

    document.getElementById('btn-jump').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.jumpPressed = true;
    });
    document.getElementById('btn-crouch').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.crouch = !this.crouch;
      document.getElementById('btn-crouch').classList.toggle('pressed', this.crouch);
    });
    document.getElementById('btn-action').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actionPressed = true;
    });
    document.getElementById('btn-action').addEventListener('pointerup', () => {});
  }

  _moveStick(cx, cy) {
    const dx = cx - this.stickCenter.x;
    const dy = cy - this.stickCenter.y;
    const max = this.stickR || 52;
    const len = Math.hypot(dx, dy);
    const k = len > max ? max / len : 1;
    const px = dx * k, py = dy * k;
    const knob = document.getElementById('stick-knob');
    knob.style.transform = `translate(${px}px,${py}px)`;
    // dead zone removes thumb tremor, then a smooth ramp avoids a hard snap
    let nx = px / max, ny = -py / max;
    const mag = Math.hypot(nx, ny);
    const dead = this.stickDead || 0.12;
    if (mag <= dead) { nx = 0; ny = 0; }
    else {
      const t = (mag - dead) / (1 - dead);
      const eased = t * t * (3 - 2 * t);
      nx = (nx / mag) * eased;
      ny = (ny / mag) * eased;
    }
    this.stickMove.x = nx;
    this.stickMove.y = ny;
  }

  _setupKeyboard() {
    addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (['Space', 'KeyQ', 'Tab', 'KeyV'].includes(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (e.code === 'KeyE') this.actionPressed = true;
      if (e.code === 'KeyC') this.crouch = !this.crouch;
      if (e.code === 'KeyR') this.reloadPressed = true;
      if (e.code === 'KeyM') this.game.ui?.toggleMap();
      if (e.code === 'Escape') this.game.ui?.togglePause();
      if (e.code === 'KeyQ' || e.code === 'Tab') {
        e.preventDefault();
        if (!this.wheel.down) {
          this.wheel.down = true; this.wheel.hold = 0; this.wheel.open = false;
          this.wheel.x0 = innerWidth / 2; this.wheel.y0 = innerHeight / 2;
          this.wheel.dx = 0; this.wheel.dy = 0;
        }
      }
      // hold V for the weapon/spell radial (keyboard equivalent of the touch button)
      if (e.code === 'KeyV') {
        e.preventDefault();
        if (!this.radial.down) {
          this.radial.down = true; this.radial.hold = 0; this.radial.open = false;
          this.radial.x0 = innerWidth / 2; this.radial.y0 = innerHeight / 2;
          this.radial.dx = 0; this.radial.dy = 0;
        }
      }
      if (/^Digit[1-6]$/.test(e.code)) this.quickAbility = parseInt(e.code.slice(-1), 10) - 1;
      if (e.code === 'KeyF') this.game.ui?.flashHint?.();
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyQ' || e.code === 'Tab') {
        if (this.wheel.open) { this.wheel.justClosed = true; this.wheel.open = false; }
        else this.wheel.quick = true;
        this.wheel.down = false;
      }
      if (e.code === 'KeyV') {
        if (this.radial.open) { this.radial.justClosed = true; this.radial.open = false; }
        else this.radial.quick = true;
        this.radial.down = false;
      }
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.fireHeld = false;
      this.aimHeld = false;
      this.move.x = this.move.y = 0;
    });
  }

  get isLocked() { return document.pointerLockElement === this.game.canvas; }

  requestLock() {
    const canvas = this.game.canvas;
    if (this.isLocked) return true;
    try {
      const p = canvas.requestPointerLock?.({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => { this.lockFailed = true; });
    } catch { this.lockFailed = true; }
    return false;
  }

  _setupMouse() {
    const canvas = this.game.canvas;
    const uiTarget = (t) => !!(t && t.closest &&
      t.closest('button, input, #menu, #pause, #map-screen, #wheel, #radial, #dialogue, #interior, #chapter-card, #ending, #loading'));
    // Pointer lock retargets every mouse event to the canvas, so listening on
    // #look-zone meant the first click only captured the pointer and no later
    // click or aim ever reached the game. Window-level handlers fix both.
    addEventListener('mousedown', (e) => {
      if (uiTarget(e.target)) return;
      if (this.game.mode !== 'play' || this.game.dialogueOpen) return;
      if (e.button === 2) { this.aimHeld = true; return; }
      if (e.button !== 0) return;
      if (!this.isLocked) {
        // pointer lock can be denied (embedded frame, browser policy). In that
        // case fall back to drag-look and treat a clean click as a shot.
        this._drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
        if (!this.game.mobile) this.requestLock();
        return;
      }
      this.fireHeld = true;
      this.firePressed = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.aimHeld = false;
      if (e.button === 0 && this._drag) {
        const d = this._drag;
        this._drag = null;
        if (d.moved < 8 && performance.now() - d.t < 320 && !this.isLocked) {
          this.firePressed = true;
          this.fireHeld = false;
        }
      }
    });
    addEventListener('mousemove', (e) => {
      // while a wheel is up the same motion picks the slot instead of turning
      if (this.wheel.open) {
        this.wheel.dx += e.movementX || 0;
        this.wheel.dy += e.movementY || 0;
        return;
      }
      if (this.radial.open) {
        this.radial.dx += e.movementX || 0;
        this.radial.dy += e.movementY || 0;
        return;
      }
      if (this.isLocked) {
        this.look.x += (e.movementX || 0) * this.sensitivity;
        this.look.y += (e.movementY || 0) * this.sensitivity;
        return;
      }
      if (this._drag && (e.buttons & 1)) {
        const dx = e.clientX - this._drag.x;
        const dy = e.clientY - this._drag.y;
        this._drag.x = e.clientX; this._drag.y = e.clientY;
        this._drag.moved += Math.abs(dx) + Math.abs(dy);
        this.look.x += dx * 1.6 * this.sensitivity;
        this.look.y += dy * 1.6 * this.sensitivity;
      }
    });
    addEventListener('wheel', (e) => {
      if (this.game.mode !== 'play' || this.game.wheelOpen || this.game.radialOpen || this.game.dialogueOpen) return;
      if (!e.deltaY) return;
      this.cycleWheel = Math.sign(e.deltaY);
    }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = this.isLocked;
      if (locked) this.everLocked = true;
      if (!locked) { this.fireHeld = false; this.aimHeld = false; }
      document.body.classList.toggle('pointer-locked', locked);
      this.game.ui?.setPointerLocked?.(locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
      this.game.ui?.toast?.('МЫШЬ НЕ ЗАХВАЧЕНА · РАБОТАЕТ СВОБОДНЫЙ ОБЗОР', 'bad');
    });
  }

  update(dt) {
    if (this.wheel.down) {
      this.wheel.hold += dt;
      if (!this.wheel.open && this.wheel.hold > 0.22) {
        this.wheel.open = true;
        this.wheel.justOpened = true;
      }
    }
    if (this.radial.down) {
      this.radial.hold += dt;
      if (!this.radial.open && this.radial.hold > 0.2) {
        this.radial.open = true;
        this.radial.justOpened = true;
      }
    }
    // the mouse wheel steps quick-selects even without the radial menu
    if (this.cycleWheel) {
      this.radial.quick = true;
      this.cycleWheel = 0;
    }
    // keyboard movement and the stick are merged once per frame so releasing
    // every input always falls back to zero instead of keeping the last value
    let kx = 0, ky = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (kx || ky) {
      const l = Math.hypot(kx, ky) || 1;
      this.move.x = kx / l;
      this.move.y = ky / l;
    } else if (this.stickId !== null) {
      this.move.x = this.stickMove.x;
      this.move.y = this.stickMove.y;
    } else {
      this.move.x = 0;
      this.move.y = 0;
    }
    // keyboard look via IJKL when pointer lock is not active.
    // yaw grows counter-clockwise in this scene's convention, so screen-right
    // needs a negative yaw delta; the old +9 made the camera feel mirrored.
    if (document.pointerLockElement !== this.game.canvas) {
      let lx = 0, ly = 0;
      if (this.keys.has('KeyJ')) lx -= 1;
      if (this.keys.has('KeyL')) lx += 1;
      if (this.keys.has('KeyI')) ly -= 1;
      if (this.keys.has('KeyK')) ly += 1;
      if (lx) this.look.x += lx * 9;
      if (ly) this.look.y += ly * 9;
    }
  }

  endFrame() {
    this.firePressed = false;
    this.jumpPressed = false;
    this.actionPressed = false;
    this.reloadPressed = false;
    this.quickAbility = -1;
    this.wheel.justOpened = false;
    this.wheel.justClosed = false;
    this.wheel.quick = false;
    this.radial.justOpened = false;
    this.radial.justClosed = false;
    this.radial.quick = false;
    this.look.x = 0;
    this.look.y = 0;
  }

  runHeld() {
    return Math.hypot(this.move.x, this.move.y) > 0.82 || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
}
