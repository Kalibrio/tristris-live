/* ═══════════════════════════════════════════════════════════════════════
   TRUMBLE LANDING — motion system
   Modules: TrumbleLanding (orchestrator) · AnimatedPiece · ParticleLayer ·
   TrumbleLogo · PrimaryAction. All continuous motion is transform/opacity
   driven from one requestAnimationFrame loop; the intro is CSS keyframes
   (logo, button, background) plus a JS fly-in for the pieces.
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  // Seeded RNG — the layout is COMPOSED, not rolled per visit: the same
  // seed always deals the same scatter, so the page never jumps.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20260824);
  const rand = (lo, hi) => lo + rng() * (hi - lo);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = matchMedia('(max-width: 760px)').matches;
  const lowPower = (navigator.hardwareConcurrency || 4) <= 3;

  // ── piece configuration ─────────────────────────────────────────────
  // Anchors ring the central safe zone (x 27–73%, y 18–72% is reserved for
  // the logo and PLAY button). `dir` is where the piece flies in FROM.
  // depth: far = small/dim/blurred/slow · mid · fore = large/sharp/fast.
  // 10 slots show on phones, all 16 on wide screens.
  const SLOTS = [
    { s: 'o-yellow', x: 14, y: 12, d: 'fore', from: 'top-left', mobile: true },
    { s: 'x-blue', x: 84, y: 10, d: 'mid', from: 'top', mobile: true },
    { s: 'l-red', x: 90, y: 30, d: 'fore', from: 'right', mobile: true },
    { s: 'o-blue', x: 8, y: 38, d: 'mid', from: 'left', mobile: true },
    { s: 'l-yellow', x: 12, y: 66, d: 'mid', from: 'left', mobile: true },
    { s: 'x-red', x: 88, y: 58, d: 'far', from: 'right', mobile: true },
    { s: 'o-red', x: 16, y: 88, d: 'fore', from: 'bottom-left', mobile: true },
    { s: 'l-blue', x: 85, y: 84, d: 'mid', from: 'bottom', mobile: true },
    { s: 'x-yellow', x: 62, y: 92, d: 'far', from: 'bottom', mobile: true },
    { s: 'o-blue', x: 38, y: 8, d: 'far', from: 'top', mobile: true },
    // wide-screen extras
    { s: 'l-yellow', x: 24, y: 26, d: 'far', from: 'top-left', mobile: false },
    { s: 'x-red', x: 70, y: 16, d: 'far', from: 'top-right', mobile: false },
    { s: 'o-red', x: 94, y: 46, d: 'far', from: 'right', mobile: false },
    { s: 'x-blue', x: 30, y: 80, d: 'mid', from: 'bottom-left', mobile: false },
    { s: 'l-red', x: 5, y: 55, d: 'far', from: 'left', mobile: false },
    { s: 'o-yellow', x: 74, y: 74, d: 'fore', from: 'bottom-right', mobile: false },
  ];
  // near-solid at every depth (2026-08-24): translucent pieces read washed
  // out — size, speed, blur and shadow carry the depth instead
  const DEPTH = {
    far: { size: [7, 9], op: [0.8, 0.88], speed: 0.55, parallax: 4 },
    mid: { size: [11, 14], op: [0.93, 0.98], speed: 0.8, parallax: 9 },
    fore: { size: [16, 20], op: [1, 1], speed: 1.05, parallax: 15 },
  };
  const FROM_VEC = {
    top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0],
    'top-left': [-0.8, -0.8], 'top-right': [0.8, -0.8],
    'bottom-left': [-0.8, 0.8], 'bottom-right': [0.8, 0.8],
  };

  // ── AnimatedPiece ───────────────────────────────────────────────────
  // One sprite instance: seeded drift orbit (two incommensurate sines per
  // axis → organic, non-repeating paths), its own rotation sway, ≤4%
  // scale breathing, a fly-in vector for the intro and a press impulse.
  class AnimatedPiece {
    constructor(cfg, host) {
      const d = DEPTH[cfg.d];
      this.cfg = cfg;
      this.depth = d;
      this.el = document.createElement('div');
      this.el.className = `piece ${cfg.d}`;
      const img = document.createElement('img');
      img.src = `assets/${cfg.s}.png`;
      img.alt = '';
      img.draggable = false;
      this.el.appendChild(img);
      const size = rand(d.size[0], d.size[1]);
      this.el.style.width = `min(${size}vmin, ${Math.round(size * 11)}px)`;
      this.el.style.left = cfg.x + '%';
      this.el.style.top = cfg.y + '%';
      host.appendChild(this.el);

      // drift orbit (px): horizontal 15–80, vertical 20–100, scaled by depth
      const sp = d.speed;
      this.ax = rand(15, 80) * sp * 0.9;
      this.ay = rand(20, 100) * sp * 0.9;
      this.wx = (Math.PI * 2) / rand(6, 14);
      this.wy = (Math.PI * 2) / rand(6, 14);
      this.wx2 = this.wx * rand(1.7, 2.6);
      this.px = rand(0, Math.PI * 2); // random phase = randomized progress
      this.py = rand(0, Math.PI * 2);
      this.px2 = rand(0, Math.PI * 2);
      this.rot0 = rand(-14, 14);
      this.rotA = rand(4, 10) * (rng() < 0.5 ? -1 : 1); // cw and ccw mix
      this.wr = (Math.PI * 2) / rand(8, 16);
      this.pr = rand(0, Math.PI * 2);
      this.scaleA = rand(0.015, 0.04);
      this.ws = (Math.PI * 2) / rand(7, 13);
      this.ps = rand(0, Math.PI * 2);
      this.opacity = rand(d.op[0], d.op[1]);

      // intro fly-in: direction- and depth-specific vector + timing
      const v = FROM_VEC[cfg.from];
      const reach = Math.max(innerWidth, innerHeight) * (0.55 + 0.25 * rng());
      this.inX = v[0] * reach;
      this.inY = v[1] * reach;
      this.inDelay = 0.25 + rand(0, 0.85);
      this.inDur = rand(0.9, 1.35) / sp;
      this.inRot = rand(-70, 70);

      // press impulse (radial shove from the hero, decays fast)
      this.impulse = 0;
      this.impX = 0;
      this.impY = 0;
    }

    /** Radial shove away from a point (viewport px), used on PLAY press. */
    shove(cx, cy) {
      const r = this.el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      const len = Math.hypot(dx, dy) || 1;
      this.impX = (dx / len) * 26 * this.depth.speed;
      this.impY = (dy / len) * 26 * this.depth.speed;
      this.impulse = 1;
    }

    update(t, dt, par) {
      // intro progress: 0 = offscreen at its entry vector, 1 = on anchor
      let k = 1;
      if (!reducedMotion) {
        const lt = (t - this.inDelay) / this.inDur;
        k = lt <= 0 ? 0 : lt >= 1 ? 1 : 1 - Math.pow(1 - lt, 3); // easeOutCubic
      }
      if (this.impulse > 0) this.impulse = Math.max(0, this.impulse - dt * 1.8);
      const imp = 1 - Math.pow(1 - this.impulse, 2);

      const drift = reducedMotion ? 0.25 : 1;
      const x = (Math.sin(t * this.wx + this.px) * 0.72 + Math.sin(t * this.wx2 + this.px2) * 0.28)
        * this.ax * drift + (1 - k) * this.inX + this.impX * imp + par.x * this.depth.parallax;
      const y = Math.sin(t * this.wy + this.py) * this.ay * drift
        + (1 - k) * this.inY + this.impY * imp + par.y * this.depth.parallax;
      const rot = this.rot0 + Math.sin(t * this.wr + this.pr) * this.rotA * drift + (1 - k) * this.inRot;
      const sc = 1 + Math.sin(t * this.ws + this.ps) * this.scaleA * drift;

      this.el.style.opacity = (this.opacity * (reducedMotion ? 1 : k)).toFixed(3);
      this.el.style.transform =
        `translate(-50%, -50%) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
    }
  }

  // ── ParticleLayer ───────────────────────────────────────────────────
  // Canvas sparks: gold + cyan pinpricks, soft motes, rare star glints.
  // Low ambient density, one burst at the logo reveal and on PLAY.
  class ParticleLayer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = Math.min(devicePixelRatio || 1, 2);
      this.parts = [];
      this.max = reducedMotion ? 6 : (isMobile || lowPower) ? 16 : 30;
      this.glintAt = 2.5;
      this.resize();
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.round(r.width * this.dpr);
      this.canvas.height = Math.round(r.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    spawn(kind, x, y, burst) {
      const gold = Math.random() < 0.55;
      const sp = burst ? 30 + Math.random() * 80 : 4 + Math.random() * 10;
      const a = Math.random() * Math.PI * 2;
      this.parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: burst ? Math.sin(a) * sp : -(6 + Math.random() * 16),
        size: kind === 'mote' ? 8 + Math.random() * 14 : 1 + Math.random() * 2.2,
        kind,
        gold,
        t: 0,
        ttl: kind === 'mote' ? 7 + Math.random() * 6 : burst ? 0.7 + Math.random() * 0.7 : 4 + Math.random() * 4,
      });
    }
    burst(x, y, n) {
      for (let i = 0; i < n; i++) this.spawn(Math.random() < 0.2 ? 'mote' : 'spark', x, y, true);
    }
    update(t, dt) {
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
      // ambient refill
      if (this.parts.length < this.max && Math.random() < 0.3) {
        this.spawn(Math.random() < 0.25 ? 'mote' : 'spark',
          this.w * (0.08 + Math.random() * 0.84), this.h * (0.15 + Math.random() * 0.8), false);
      }
      c.globalCompositeOperation = 'lighter';
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.t += dt;
        if (p.t > p.ttl) { this.parts.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 0.6;
        p.vy = p.vy * (1 - dt * 0.4) - dt * 2; // settles into a slow rise
        const life = p.t / p.ttl;
        const fade = life < 0.2 ? life / 0.2 : 1 - (life - 0.2) / 0.8;
        if (p.kind === 'mote') {
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          const col = p.gold ? '255, 205, 90' : '110, 200, 255';
          g.addColorStop(0, `rgba(${col}, ${(0.16 * fade).toFixed(3)})`);
          g.addColorStop(1, `rgba(${col}, 0)`);
          c.fillStyle = g;
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
        } else {
          c.fillStyle = p.gold
            ? `rgba(255, 216, 100, ${(0.85 * fade).toFixed(3)})`
            : `rgba(120, 210, 255, ${(0.8 * fade).toFixed(3)})`;
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
        }
      }
      // the occasional star glint — a four-point twinkle, one at a time
      if (!reducedMotion && t > this.glintAt) {
        this.glintAt = t + 2.5 + Math.random() * 3.5;
        this.glint = { x: this.w * (0.1 + Math.random() * 0.8), y: this.h * (0.12 + Math.random() * 0.6), t0: t, gold: Math.random() < 0.5 };
      }
      if (this.glint) {
        const gl = this.glint;
        const gt = (t - gl.t0) / 0.9;
        if (gt > 1) this.glint = null;
        else {
          const a = Math.sin(gt * Math.PI);
          const len = 7 + a * 8;
          c.strokeStyle = gl.gold ? `rgba(255, 226, 130, ${(0.8 * a).toFixed(3)})` : `rgba(140, 220, 255, ${(0.8 * a).toFixed(3)})`;
          c.lineWidth = 1.2;
          c.beginPath();
          c.moveTo(gl.x - len, gl.y); c.lineTo(gl.x + len, gl.y);
          c.moveTo(gl.x, gl.y - len); c.lineTo(gl.x, gl.y + len);
          c.stroke();
        }
      }
      c.globalCompositeOperation = 'source-over';
    }
  }

  // ── TrumbleLogo · PrimaryAction ─────────────────────────────────────
  // The reveal choreography itself lives in CSS keyframes; these wrap the
  // DOM hooks and the moments JS must fire (burst timing, press feedback).
  const TrumbleLogo = {
    el: document.getElementById('logo'),
    center() {
      const r = this.el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    flare(stage) {
      stage.classList.remove('flare');
      void stage.offsetWidth; // restart the animation
      stage.classList.add('flare');
    },
  };

  // ── JellyLogo: the squishy press ────────────────────────────────────
  // A tiny material performance (the jelly spec, 2026-08-24): the logo
  // yields under the finger within a frame, stores the pressure, then
  // releases it through diminishing ripples. One underdamped spring owns
  // the deformation, so rapid taps ADD force to motion already passing
  // through — the logo remembers. Volume is conserved (shorter → wider),
  // the deformation anchors at the touch point, and sound + haptics peak
  // with maximum compression. Words pop in the fixed loop
  // Tumble → Rumble → Crumble → Boing → Boing → TRUMBLE!, and completing
  // the loop fires the amplifier.
  const WORD_SEQ = [
    ['Tumble', '#5AD1FF'], ['Rumble', '#FF9D3C'], ['Crumble', '#FF5470'],
    ['Boing', '#8AF26A'], ['Boing', '#8AF26A'], ['Trumble', '#FFD447'],
  ];

  class JellySound {
    ensure() {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    /** A soft rounded blip: lowpassed, no sharp transient. */
    blip(f0, f1, dur, gain, type = 'sine') {
      const ctx = this.ensure();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      o.frequency.setValueAtTime(Math.max(30, f0), t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(lp); lp.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    mup(p) { this.blip(150 * p, 95 * p, 0.09, 0.08); }
    woop(p) { this.blip(230 * p, 400 * p, 0.12, 0.07); }
    ting(p) { this.blip(520 * p, 780 * p, 0.16, 0.05, 'triangle'); this.blip(660 * p, 990 * p, 0.2, 0.04, 'triangle'); }
  }

  class JellyLogo {
    constructor(wrap, img, fx, stage) {
      this.wrap = wrap; this.img = img; this.fx = fx; this.stage = stage;
      wrap.classList.add('pressable');
      this.u = 0; this.vu = 0;   // squash: negative = compressed
      this.l = 0; this.vl = 0;   // lean, springs back to centre
      this.leanDrag = 0;
      this.target = 0;
      this.pressed = false;
      this.seq = 0; this.combo = 0; this.lastTap = -9;
      this.snd = new JellySound();
      wrap.addEventListener('pointerdown', (e) => this.down(e));
      addEventListener('pointerup', () => this.up());
      addEventListener('pointercancel', () => this.up());
      wrap.addEventListener('pointermove', (e) => this.move(e));
    }
    down(e) {
      e.preventDefault();
      const r = this.wrap.getBoundingClientRect();
      const ox = Math.max(10, Math.min(90, ((e.clientX - r.left) / r.width) * 100));
      this.img.style.transformOrigin = `${ox}% 88%`;
      this.pressed = true;
      this.dragX0 = e.clientX;
      this.target = reducedMotion ? -0.04 : -0.16;
      this.vl += (50 - ox) * 1.2; // press the left, the jelly pushes right
      const now = performance.now() / 1000;
      this.combo = now - this.lastTap < 0.7 ? Math.min(6, this.combo + 1) : 0;
      this.lastTap = now;
      const pitch = (1 + this.combo * 0.02) * (0.98 + Math.random() * 0.04);
      this.snd.mup(pitch);
      if (navigator.vibrate) navigator.vibrate(8);
      this.word(r);
    }
    move(e) {
      if (!this.pressed) return;
      this.leanDrag = Math.max(-40, Math.min(40, e.clientX - this.dragX0)) * 0.45;
    }
    up() {
      if (!this.pressed) return;
      this.pressed = false;
      this.target = 0;
      if (!reducedMotion) this.vu += 2.6 * (1 + this.combo * 0.05); // stored energy escapes
      if (this.leanDrag) { this.vl += this.leanDrag * 6; this.leanDrag = 0; } // slingshot
      const pitch = (1 + this.combo * 0.02) * (0.98 + Math.random() * 0.04);
      this.snd.woop(pitch);
      if (navigator.vibrate) navigator.vibrate(4);
    }
    word(r) {
      const step = this.seq % WORD_SEQ.length;
      const [text, color] = WORD_SEQ[step];
      const finale = step === WORD_SEQ.length - 1;
      this.seq++;
      if (!reducedMotion) {
        const el = document.createElement('span');
        el.className = 'logo-word' + (finale ? ' big' : '');
        el.textContent = finale ? 'Trumble!' : text;
        el.style.color = color;
        el.style.left = `${r.left + r.width * (0.25 + Math.random() * 0.5)}px`;
        el.style.top = `${r.top + r.height * (0.2 + Math.random() * 0.25)}px`;
        document.body.appendChild(el);
        const rise = finale ? 96 : 64;
        const anim = el.animate([
          { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 },
          { transform: 'translate(-50%, -58%) scale(1.1)', opacity: 1, offset: 0.18 },
          { transform: `translate(-50%, calc(-50% - ${rise}px)) scale(1)`, opacity: 0 },
        ], { duration: finale ? 1100 : 850, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' });
        anim.onfinish = () => el.remove();
      }
      if (finale) this.finale(r);
    }
    /** The loop lands on TRUMBLE — everything peaks at once. */
    finale(r) {
      this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, 30);
      this.stage.classList.remove('flare');
      void this.stage.offsetWidth;
      this.stage.classList.add('flare');
      if (!reducedMotion) this.vu += 2.2;
      this.snd.ting(1 + this.combo * 0.015);
      if (navigator.vibrate) navigator.vibrate([10, 30, 14]);
    }
    update(t, dt) {
      // soft underdamped spring (k~300, c~17, m~0.85); reduced motion runs
      // it overdamped, so the compress fades with no oscillation
      const k = 300 / 0.85;
      const cD = (reducedMotion ? 34 : 17) / 0.85;
      this.vu += (k * (this.target - this.u) - cD * this.vu) * dt;
      this.u = Math.max(-0.2, Math.min(0.16, this.u + this.vu * dt));
      this.vl += ((0 - this.l) * 180 - this.vl * 10) * dt;
      this.l += this.vl * dt;
      const lean = this.l + this.leanDrag;
      const sy = 1 + this.u;
      const sx = Math.min(1.16, Math.max(0.84, 1 - this.u * 0.72)); // volume conserved
      let hb = 1;
      if (!reducedMotion && !this.pressed && Math.abs(this.u) < 0.01 && Math.abs(this.vu) < 0.05) {
        // the heartbeat: a lub-dub double pump every 1.6s, only at rest
        const ph = t % 1.6;
        hb = 1 + 0.024 * Math.exp(-Math.pow(ph - 0.10, 2) / 0.004)
          + 0.017 * Math.exp(-Math.pow(ph - 0.34, 2) / 0.005);
      }
      const dy = -this.u * this.wrap.offsetHeight * 0.22;
      this.img.style.transform =
        `translate3d(${(lean * 0.14).toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${(lean * 0.0011).toFixed(4)}rad) scale(${(sx * hb).toFixed(4)}, ${(sy * hb).toFixed(4)})`;
      this.img.style.filter = this.u < -0.02 ? 'brightness(0.95) saturate(1.05)' : '';
    }
  }

  // ── TrumbleLanding: the orchestrator ────────────────────────────────
  class TrumbleLanding {
    constructor() {
      this.stage = document.getElementById('stage');
      this.field = document.getElementById('field');
      this.piecesHost = document.getElementById('pieces');
      this.playBtn = document.getElementById('play');
      this.fx = new ParticleLayer(document.getElementById('fx'));
      this.jelly = new JellyLogo(TrumbleLogo.el, document.querySelector('.logo-img'), this.fx, this.stage);
      this.pieces = SLOTS
        .filter((s) => (isMobile ? s.mobile : true))
        .map((s) => new AnimatedPiece(s, this.piecesHost));
      this.par = { x: 0, y: 0, tx: 0, ty: 0 };
      this.t = 0;
      this.last = performance.now();
      this.flairAt = 4.2; // first logo flair shortly after the intro
      this.burstDone = reducedMotion; // reduced motion skips the reveal burst
      this.running = true;

      this.bindParallax();
      this.bindPlay();
      addEventListener('resize', () => this.fx.resize());
      document.addEventListener('visibilitychange', () => {
        this.running = !document.hidden;
        this.last = performance.now();
        if (this.running) requestAnimationFrame(this.frame);
      });

      this.preload().then(() => this.start());
    }

    /** Background + logo gate the intro; sprites warm in parallel. */
    preload() {
      const load = (src) => new Promise((res) => {
        const im = new Image();
        im.onload = im.onerror = () => res();
        im.src = src;
      });
      SLOTS.forEach((s) => load(`assets/${s.s}.png`)); // fire and forget
      return Promise.race([
        Promise.all([load('assets/background.png'), load('assets/logo.png')]),
        new Promise((res) => setTimeout(res, 1200)), // never hold the page hostage
      ]);
    }

    start() {
      this.stage.classList.add('go');
      // the homepage idle state takes over as the intro finishes
      setTimeout(() => this.stage.classList.add('idle'), reducedMotion ? 50 : 3200);
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    bindParallax() {
      if (reducedMotion) return;
      const set = (nx, ny) => { this.par.tx = nx; this.par.ty = ny; };
      addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
      }, { passive: true });
      addEventListener('deviceorientation', (e) => {
        if (e.gamma === null) return;
        this.hasTilt = true;
        set(Math.max(-1, Math.min(1, e.gamma / 24)), Math.max(-1, Math.min(1, (e.beta - 42) / 28)));
      }, { passive: true });
    }

    bindPlay() {
      new PrimaryAction(this.playBtn, () => this.startGame());
    }

    /** PLAY NOW → tactile beat, then hand over to the game itself. */
    startGame() {
      const c = TrumbleLogo.center();
      TrumbleLogo.flare(this.stage);
      if (!reducedMotion) {
        this.fx.burst(c.x, c.y, 26);
        for (const p of this.pieces) p.shove(c.x, c.y);
      }
      // The handoff: the game lives at the origin root. The session flag
      // tells the root's front-door gate this visit has entered, and the
      // ?from=landing param covers browsers with no storage, so the gate
      // can never bounce us back here in a loop.
      try { sessionStorage.setItem('tristris.entered', '1'); } catch { /* no storage: the param carries it */ }
      setTimeout(() => { location.href = '/?from=landing'; }, 620);
    }

    frame(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;

      // parallax follows the pointer/tilt — or drifts gently on its own
      // when a touch device offers no orientation events
      if (!reducedMotion) {
        if (!this.hasTilt && matchMedia('(hover: none)').matches) {
          this.par.tx = Math.sin(this.t * 0.16) * 0.35;
          this.par.ty = Math.cos(this.t * 0.11) * 0.3;
        }
        this.par.x += (this.par.tx - this.par.x) * Math.min(1, dt * 3);
        this.par.y += (this.par.ty - this.par.y) * Math.min(1, dt * 3);
      }

      for (const p of this.pieces) p.update(this.t, dt, this.par);
      this.fx.update(this.t, dt);
      if (this.stage.classList.contains('idle')) this.jelly.update(this.t, dt);

      // the reveal burst lands as the logo hits its overshoot beat
      if (!this.burstDone && this.t >= 1.55) {
        this.burstDone = true;
        const c = TrumbleLogo.center();
        this.fx.burst(c.x, c.y, 20);
      }

      // logo flair (Tetris-reference, 2026-08-24): every ~6s a star glint
      // pops on the logo's border ring with a small sparkle spray — timed
      // against the CSS wobble so the logo glints, then shakes it off
      if (!reducedMotion && this.t >= this.flairAt) {
        this.flairAt = this.t + 5.5 + Math.random() * 2.5;
        const r = TrumbleLogo.el.getBoundingClientRect();
        const a = Math.random() * Math.PI * 2;
        const gx = r.left + r.width / 2 + Math.cos(a) * r.width * 0.5;
        const gy = r.top + r.height / 2 + Math.sin(a) * r.height * 0.44;
        this.fx.glint = { x: gx, y: gy, t0: this.t, gold: Math.random() < 0.6 };
        this.fx.burst(gx, gy, 5);
      }

      // the logo answers parallax with the gentlest possible hand
      if (!reducedMotion) {
        TrumbleLogo.el.style.transform =
          `translate3d(${(this.par.x * 3).toFixed(2)}px, ${(this.par.y * 3).toFixed(2)}px, 0)`;
      }

      requestAnimationFrame(this.frame);
    }
  }

  // ── PrimaryAction ───────────────────────────────────────────────────
  class PrimaryAction {
    constructor(btn, onActivate) {
      this.btn = btn;
      let fired = false;
      const go = () => {
        if (fired) return; // one launch per visit
        fired = true;
        onActivate();
      };
      btn.addEventListener('click', go);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    }
  }

  new TrumbleLanding();
})();
