/* Virtual MindMeter: a browser recreation of the machine on the MindMeter page.
 *
 * The SVG is static markup in the page; this script only adds behaviour, so if anything here
 * fails the illustration still shows. Structure mirrors the real Arduino code: one small state
 * machine per subsystem, all ticked from a shared loop.
 *
 *   Stage    - shared bits: the SVG, the rAF loop (paused off screen / tab hidden), status line, events.
 *   Mic      - microphone input: peak deviation of the waveform, 0..1. Only on during a session.
 *   Hold     - PUSH and "Hold to shout": while either is held, a simulated peak ramps up.
 *   Tower    - Insanity Tower and the hanging signs: IDLE, LISTENING, RESULT, HAYWIRE.
 *   Wheel    - Wheel of Luck: fast spin, eased stop on a random segment.
 *   Slides   - Slides of Emotion: rapid face flips, settling on a random face.
 *   Lever    - pull to spin the wheel and slides (tower goes rainbow while it's down); springs back.
 *   Crystals - the six diamond pistons follow the pointer in a Gaussian wave.
 *
 * Every subsystem has the shape { init(stage), update(dt, now), needsFrames() } and is added with
 * Stage.register(). They talk through events: the tower emits 'tower:haywire', which spins the
 * wheel and flips the slides.
 */
(function () {
  'use strict';

  var CONFIG = {
    // Peak (0..1, after SENSITIVITY) needed for each level 1..8
    LEVEL_THRESHOLDS: [0.03, 0.06, 0.10, 0.15, 0.21, 0.28, 0.36, 0.45],
    SENSITIVITY: 1.0,     // multiplies the raw mic peak; raise if quiet mics never get past level 2
    SESSION_MS: 4000,     // how long a session listens for after the button is let go
    DECAY_MS: 500,        // time for the held peak to fall from full scale to zero
    RESULT_MS: 3000,      // hold the best level this long after a session
    HAYWIRE_MS: 3000,     // haywire: tower flicker, fast wheel spin and slide flipping all last this long
    HOLD_RAMP_MS: 3000,   // holding PUSH / Shout: time to ramp from silence to HOLD_MAX (= haywire)
    HOLD_MAX: 0.5,        // simulated peak at the end of the ramp (just past level 8)
    BLINK_MIN_MS: 800,    // idle flicker of the A: random gap between blinks...
    BLINK_MAX_MS: 3000,
    BLINK_OFF_MS: 150,    // ...and how long it goes dark
    FLICKER_MIN_MS: 340,  // haywire flicker: gap between changes (>= 334 ms keeps it to 3 flashes a second)
    FLICKER_MAX_MS: 520,

    WHEEL_SPEED: 1.0,     // fast spin, degrees per ms (about 2.8 turns a second)
    WHEEL_STOP_MS: 1600,  // roughly how long the wheel takes to coast to a stop
    LEVER_MIN_MS: 1000,   // lever: random fast-spin time between these
    LEVER_MAX_MS: 4000,
    FLIP_MS: 110,         // slides: time per flip while flipping fast
    FLIP_SLOWDOWN: [170, 250, 350, 460], // the last few, slower flips before settling

    CRYSTAL_BASE_Y: 206,  // crystal top (viewBox y) far from the pointer...
    CRYSTAL_RISE: 60,     // ...and how far the nearest one rises
    CRYSTAL_SIGMA: 70,    // width of the wave (viewBox units)
    CRYSTAL_EASE_MS: 140  // time constant for heights easing towards their targets
  };

  var COLORS = {
    idle: '#3b6ff0',
    off: '#d3dae7',
    // Bar colours from the bottom letter (level 1) to the top (level 8)
    levels: ['#3FA84B', '#74BC3C', '#A9C834', '#E3C22B', '#F0A52A', '#EE832D', '#E6612F', '#D93A30']
  };

  var SIGN_NAMES = ['You Alive?', 'Think You are Okay', 'Irritated', 'Not doing great',
    'Approaching Unhinged', 'Spiralling', 'Nearly Gone', 'Insanity Achieved']; // index = level - 1

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
  function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
  function approach(cur, target, dt, tau) { return target + (cur - target) * Math.exp(-dt / tau); }
  function isActivationKey(e) { return e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar'; }

  function levelFor(peak) {
    var n = 0;
    for (var i = 0; i < CONFIG.LEVEL_THRESHOLDS.length; i++) {
      if (peak >= CONFIG.LEVEL_THRESHOLDS[i]) n = i + 1;
    }
    return n;
  }

  // Press-and-hold wiring shared by PUSH, Shout and the lever: pointer (with capture, so a drag off the
  // element still releases cleanly), plus Enter/Space for keyboards
  function bindHold(el, onPress, onRelease, stage) {
    var down = false;
    var press = function () { if (!down) { down = true; onPress(); } };
    var release = function () { if (down) { down = false; onRelease(); } };
    el.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      if (e.pointerType !== 'touch') e.preventDefault(); // touch keeps its default so the page can scroll
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* not supported on this element */ }
      press();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { el.addEventListener(t, release); });
    el.addEventListener('keydown', function (e) {
      if (isActivationKey(e)) { e.preventDefault(); if (!e.repeat) press(); }
    });
    el.addEventListener('keyup', function (e) {
      if (isActivationKey(e)) { e.preventDefault(); release(); }
    });
    el.addEventListener('blur', release);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    stage.on('hidden', release);
  }

  // ------------------------------------------------------------------ Stage
  var Stage = {
    svg: null,
    root: null,
    statusEl: null,
    reducedMotion: false,
    onScreen: true,
    subsystems: [],
    listeners: {},
    raf: 0,
    last: 0,

    init: function (root) {
      var self = this;
      this.root = root;
      this.svg = root.querySelector('#vg-stage');
      this.statusEl = root.querySelector('#vg-status');

      var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      this.reducedMotion = !!(mq && mq.matches);
      if (mq) {
        var onMq = function (e) { self.reducedMotion = e.matches; self.emit('motionchange'); };
        if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
      }

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          self.onScreen = entries[entries.length - 1].isIntersecting;
          self.wake();
        }, { rootMargin: '100px' }).observe(this.svg);
      }
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) self.emit('hidden');
        self.wake();
      });
    },

    register: function (sub) {
      this.subsystems.push(sub);
      sub.init(this);
    },

    on: function (name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
    emit: function (name, data) {
      (this.listeners[name] || []).forEach(function (fn) { fn(data); });
    },

    status: function (msg) {
      // Clear first so repeating the same message is still announced
      var el = this.statusEl;
      if (!el) return;
      el.textContent = '';
      setTimeout(function () { el.textContent = msg; }, 30);
    },

    active: function () { return this.onScreen && !document.hidden; },

    // Start the loop if it should be running; it stops itself when nothing needs frames
    wake: function () {
      var paused = !this.active();
      this.root.classList.toggle('vg--paused', paused);
      if (paused || this.raf) return;
      var self = this;
      this.last = performance.now();
      this.raf = requestAnimationFrame(function step(now) {
        var dt = Math.min(now - self.last, 100); // clamp so a stalled frame doesn't skip states
        self.last = now;
        var wanted = false;
        self.subsystems.forEach(function (s) {
          s.update(dt, now);
          if (s.needsFrames()) wanted = true;
        });
        if (wanted && self.active()) {
          self.raf = requestAnimationFrame(step);
        } else {
          self.raf = 0;
          self.root.classList.toggle('vg--paused', !self.active());
        }
      });
    },

    // Client coordinates to viewBox coordinates
    toSvg: function (clientX, clientY) {
      var m = this.svg.getScreenCTM();
      if (!m) return null;
      var pt = this.svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      return pt.matrixTransform(m.inverse());
    }
  };

  // ------------------------------------------------------------------ Mic
  var Mic = {
    stream: null,
    ctx: null,
    analyser: null,
    buf: null,
    active: false,

    supported: function () {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
        (window.AudioContext || window.webkitAudioContext));
    },

    // Must be called from the press itself: the AudioContext is created and resumed synchronously,
    // inside the user gesture, which iOS Safari requires (otherwise it stays suspended and reads silence)
    start: function () {
      var self = this;
      if (!this.supported()) return Promise.reject(new Error('unsupported'));
      this.stop(); // close anything left from an earlier press
      var AC = window.AudioContext || window.webkitAudioContext;
      var ctx = new AC();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      this.ctx = ctx;
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      }).catch(function (err) {
        if (self.ctx === ctx) self.stop(); // denied or failed: don't leave the context open
        throw err;
      }).then(function (stream) {
        if (self.ctx !== ctx) { // stopped (or restarted) while the permission prompt was open
          stream.getTracks().forEach(function (t) { t.stop(); });
          throw new Error('cancelled');
        }
        self.stream = stream;
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        var src = ctx.createMediaStreamSource(stream);
        self.analyser = ctx.createAnalyser();
        self.analyser.fftSize = 2048;
        self.buf = new Uint8Array(self.analyser.fftSize);
        src.connect(self.analyser); // not connected to the speakers
        self.active = true;
      });
    },

    // Largest deviation from the 128 midline in the latest window, 0..1
    read: function () {
      if (!this.active) return 0;
      this.analyser.getByteTimeDomainData(this.buf);
      var max = 0;
      for (var i = 0; i < this.buf.length; i++) {
        var d = Math.abs(this.buf[i] - 128);
        if (d > max) max = d;
      }
      return max / 128;
    },

    stop: function () {
      this.active = false;
      if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
      if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
      this.stream = this.ctx = this.analyser = this.buf = null;
    }
  };

  // ------------------------------------------------------------------ Hold (PUSH and Shout)
  // Both buttons do the same thing: a press starts a session (and asks for the mic), and while either
  // is held a simulated peak ramps up, reaching haywire after HOLD_RAMP_MS.
  var Hold = {
    holders: 0,
    value: 0,
    progress: 0,
    rampStart: 0,   // performance.now() at which progress would have been 0

    get held() { return this.holders > 0; },

    init: function (stage) {
      var self = this;
      var shout = stage.root.querySelector('#vg-shout');
      var push = stage.svg.querySelector('#button');

      var bind = function (el, pressedClass) {
        if (!el) return;
        bindHold(el, function () {
          el.classList.add(pressedClass);
          if (self.holders++ === 0) {
            self.progress = Math.sqrt(self.value / CONFIG.HOLD_MAX); // carry on from the current level
            self.rampStart = performance.now() - self.progress * CONFIG.HOLD_RAMP_MS;
          }
          stage.emit('hold:press');
          stage.wake();
        }, function () {
          el.classList.remove(pressedClass);
          self.holders = Math.max(0, self.holders - 1);
          stage.wake();
        }, stage);
      };

      if (shout) shout.hidden = false;
      bind(shout, 'is-held');
      bind(push, 'is-pressed');
    },

    update: function (dt, now) {
      // Eased ramp so each level gets a moment, rather than racing through the low ones. Timed from
      // the clock rather than summed frame times, so slow frames on a phone don't stretch the hold.
      if (this.held) {
        this.progress = Math.min(1, (now - this.rampStart) / CONFIG.HOLD_RAMP_MS);
        this.value = CONFIG.HOLD_MAX * this.progress * this.progress;
      } else {
        this.value = Math.max(0, this.value - dt / CONFIG.DECAY_MS);
      }
    },

    needsFrames: function () { return this.held || this.value > 0; }
  };

  // ------------------------------------------------------------------ Tower
  var Tower = {
    state: 'IDLE',
    stage: null,
    letters: [],    // [0] = top I ... [7] = bottom Y
    signs: [],      // [0] = top "Insanity Achieved" ... [7] = bottom "You Alive?"
    signsGroup: null,
    touchA: null,
    listeningEl: null,
    nomicEl: null,

    timer: 0,        // ms left in the current timed state
    peak: 0,
    level: 0,
    best: 0,
    sessionId: 0,
    shownLevel: -1,

    // Idle flicker of the A
    blinkIn: 0,
    blinkOff: 0,
    hover: false,
    focused: false,
    latched: false,  // tapped on touch, or toggled with Space/Enter

    // Rainbow while the lever is pulled / held down (like the real machine's LEDs)
    leverDown: false,
    rainbowT: 0,

    // Haywire flicker
    hayT: 0,
    flickerIn: 0,
    dark: [],

    init: function (stage) {
      var self = this;
      this.stage = stage;
      var svg = stage.svg;
      for (var i = 1; i <= 8; i++) {
        this.letters.push(svg.querySelector('#letter-' + i));
        this.signs.push(svg.querySelector('#sign-' + i));
      }
      this.signsGroup = svg.querySelector('#signs');
      this.touchA = svg.querySelector('#touch-a');
      this.listeningEl = stage.root.querySelector('#vg-listening');
      this.nomicEl = stage.root.querySelector('#vg-nomic');

      // The A: hover, focus or a latched tap stops the flicker, like the capacitive sensor
      var lastPointer = 'mouse';
      var a = this.touchA;
      a.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') { self.hover = true; self.paintIdle(); } });
      a.addEventListener('pointerleave', function () { self.hover = false; stage.wake(); });
      a.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; });
      a.addEventListener('click', function () { if (lastPointer === 'touch') self.toggleLatch(); });
      // Only keyboard focus counts; a tap also focuses the A but should only toggle the latch
      a.addEventListener('focus', function () {
        var kb = true;
        try { kb = a.matches(':focus-visible'); } catch (e) { /* older browsers: treat as keyboard */ }
        self.focused = kb;
        self.paintIdle();
      });
      a.addEventListener('blur', function () { self.focused = false; stage.wake(); });
      a.addEventListener('keydown', function (e) {
        if (isActivationKey(e)) { e.preventDefault(); if (!e.repeat) self.toggleLatch(); }
      });

      stage.on('hold:press', function () {
        if (self.state === 'IDLE' || self.state === 'RESULT') self.startSession();
      });
      // Never leave the mic on in a background tab
      stage.on('hidden', function () { if (self.state === 'LISTENING') self.endSession(); });
      stage.on('motionchange', function () { if (self.state === 'IDLE') self.paintIdle(); });
      stage.on('lever:down', function () { self.leverDown = true; self.rainbowT = 0; stage.wake(); });
      stage.on('lever:up', function () { self.leverDown = false; self.paintIdle(); stage.wake(); });

      this.enter('IDLE', true);
    },

    touched: function () { return this.hover || this.focused || this.latched; },

    toggleLatch: function () {
      this.latched = !this.latched;
      this.touchA.setAttribute('aria-pressed', String(this.latched));
      this.stage.status(this.latched ? 'Flicker stopped' : 'Flicker on');
      this.paintIdle();
      this.stage.wake();
    },

    // ---- state changes
    enter: function (state, silent) {
      var root = this.stage.root;
      this.state = state;
      root.classList.toggle('vg--haywire', state === 'HAYWIRE');
      root.classList.remove('vg--fading');
      this.listeningEl.hidden = state !== 'LISTENING' || !Mic.active;
      this.shownLevel = -1;

      if (state === 'IDLE') {
        this.peak = this.level = this.best = 0;
        this.blinkOff = 0;
        this.blinkIn = rand(CONFIG.BLINK_MIN_MS, CONFIG.BLINK_MAX_MS);
        this.lightSigns(0);
        this.paintIdle();
        if (!silent) this.stage.status('Ready');
      } else if (state === 'RESULT') {
        this.timer = CONFIG.RESULT_MS;
        this.paintLevel(this.best);
        this.stage.status(this.best
          ? 'Insanity level ' + this.best + ' of 8: ' + SIGN_NAMES[this.best - 1]
          : 'Insanity level 0 of 8: too quiet to register');
      } else if (state === 'HAYWIRE') {
        this.timer = CONFIG.HAYWIRE_MS;
        this.hayT = 0;
        this.flickerIn = 0;
        this.dark = [];
        this.lightSigns(0);
        this.stage.status('Haywire');
        this.stage.emit('tower:haywire');
      }
      this.stage.emit('tower:state', state);
      this.stage.wake();
    },

    startSession: function () {
      var self = this;
      var id = ++this.sessionId;
      this.peak = this.level = this.best = 0;
      this.timer = CONFIG.SESSION_MS;
      this.enter('LISTENING');
      this.paintLevel(0);
      this.stage.status('Listening');

      Mic.start().then(function () {
        if (id !== self.sessionId || self.state !== 'LISTENING') { Mic.stop(); return; }
        self.nomicEl.hidden = true;
        self.timer = Math.max(self.timer, CONFIG.SESSION_MS); // a full session once the mic is on
        self.listeningEl.hidden = false;
        self.stage.wake();
      }, function () {
        // Denied or no mic: say so; holding the button still works and can still reach haywire
        if (id !== self.sessionId) return;
        self.nomicEl.hidden = false;
        self.stage.status('No microphone. Hold the button for 3 seconds to go haywire.');
      });
    },

    endSession: function () {
      Mic.stop();
      this.listeningEl.hidden = true;
      this.enter('RESULT');
    },

    // ---- per-frame
    update: function (dt) {
      switch (this.state) {
        case 'IDLE': return this.updateIdle(dt);
        case 'LISTENING': return this.updateListening(dt);
        case 'RESULT':
          this.timer -= dt;
          this.paintLevel(this.best);
          if (this.timer <= 0) {
            var root = this.stage.root;
            this.enter('IDLE');
            root.classList.add('vg--fading'); // slow colour transition back to blue
            setTimeout(function () { root.classList.remove('vg--fading'); }, 800);
          }
          return;
        case 'HAYWIRE': return this.updateHaywire(dt);
      }
    },

    updateIdle: function (dt) {
      // Lever down: the letters drift through the rainbow (smoothly, no flashing; still for reduced motion)
      if (this.leverDown) {
        this.rainbowT += dt;
        var t = this.stage.reducedMotion ? 0 : this.rainbowT / 1000;
        for (var i = 0; i < 8; i++) {
          this.letters[i].style.fill = 'hsl(' + ((i * 45 + t * 120) % 360).toFixed(0) + ', 80%, 55%)';
        }
        return;
      }
      if (this.stage.reducedMotion || this.touched()) {
        if (this.blinkOff > 0) { this.blinkOff = 0; this.paintIdle(); }
        return;
      }
      if (this.blinkOff > 0) {
        this.blinkOff -= dt;
        if (this.blinkOff <= 0) {
          this.blinkIn = rand(CONFIG.BLINK_MIN_MS, CONFIG.BLINK_MAX_MS);
          this.paintIdle();
        }
      } else {
        this.blinkIn -= dt;
        if (this.blinkIn <= 0) {
          this.blinkOff = CONFIG.BLINK_OFF_MS;
          this.letters[3].style.fill = COLORS.off;
        }
      }
    },

    updateListening: function (dt) {
      // Peak hold and decay: jump up to any louder input, otherwise fall steadily
      var input = Math.max(clamp(Mic.read() * CONFIG.SENSITIVITY, 0, 1), Hold.value);
      this.peak = Math.max(input, this.peak - dt / CONFIG.DECAY_MS);
      this.level = levelFor(this.peak);
      if (this.level > this.best) this.best = this.level;
      this.paintLevel(this.level);

      if (this.level >= 8) {
        Mic.stop();
        this.enter('HAYWIRE');
        return;
      }
      // The session runs on while a button is held, then for SESSION_MS after it's let go
      if (!Hold.held) {
        this.timer -= dt;
        if (this.timer <= 0) this.endSession();
      } else {
        this.timer = Math.max(this.timer, CONFIG.SESSION_MS);
      }
    },

    // Erratic flicker: every 340-520 ms (never more than 3 changes a second) a random handful of
    // letters, the A included, drop out while the rest drift through the rainbow. Reduced motion:
    // a steady rainbow instead.
    updateHaywire: function (dt) {
      this.timer -= dt;
      this.hayT += dt;
      var reduced = this.stage.reducedMotion;
      if (!reduced) {
        this.flickerIn -= dt;
        if (this.flickerIn <= 0) {
          this.flickerIn = rand(CONFIG.FLICKER_MIN_MS, CONFIG.FLICKER_MAX_MS);
          for (var k = 0; k < 8; k++) this.dark[k] = Math.random() < (k === 3 ? 0.5 : 0.3);
        }
      }
      var t = reduced ? 0 : this.hayT / 1000;
      for (var i = 0; i < 8; i++) {
        var hue = (i * 45 + t * 140) % 360;
        this.letters[i].style.fill = !reduced && this.dark[i] ? COLORS.off : 'hsl(' + hue.toFixed(0) + ', 80%, 55%)';
      }
      if (this.timer <= 0) this.enter('IDLE');
    },

    // ---- painting
    paintIdle: function () {
      if (this.state !== 'IDLE' || this.leverDown) return;
      for (var i = 0; i < 8; i++) this.letters[i].style.fill = COLORS.idle;
    },

    // Level n lights the bottom n letters, green at the bottom to red at the top, and the matching
    // signs on the ladder
    paintLevel: function (n) {
      if (n === this.shownLevel) return;
      this.shownLevel = n;
      for (var i = 0; i < 8; i++) {
        var lvl = 8 - i; // letter i sits at level 8 - i
        this.letters[i].style.fill = lvl <= n ? COLORS.levels[lvl - 1] : COLORS.off;
      }
      this.lightSigns(n);
    },

    // Ladder: signs from "You Alive?" up to level n are lit, the top one lifted; the rest dim.
    // n = 0 outside a session leaves the ladder as drawn.
    lightSigns: function (n) {
      var inSession = this.state === 'LISTENING' || this.state === 'RESULT';
      this.signsGroup.classList.toggle('vg-signs--focus', inSession);
      for (var i = 0; i < 8; i++) {
        var lvl = 8 - i;
        this.signs[i].classList.toggle('is-lit', inSession && lvl <= n);
        this.signs[i].classList.toggle('is-hi', inSession && lvl === n);
      }
    },

    needsFrames: function () {
      if (this.state !== 'IDLE' || this.leverDown) return true;
      return !this.stage.reducedMotion && !this.touched();
    }
  };

  // ------------------------------------------------------------------ Wheel of Luck
  var WHEEL_CX = 420, WHEEL_CY = 470;
  var WHEEL_SEGMENTS = ['Super Luck', 'Good Luck', 'Super Bad Luck', 'Bad Luck',
    'Good Luck', 'Super Bad Luck', 'Good Luck', 'Bad Luck']; // clockwise from the top, as drawn

  var Wheel = {
    disc: null,
    stage: null,
    angle: 0,
    phase: 'idle',   // idle | fast | stop
    t: 0,
    fastMs: 0,
    from: 0,
    dist: 0,
    dur: 0,

    init: function (stage) {
      this.stage = stage;
      this.disc = stage.svg.querySelector('#wheel-disc');
    },

    busy: function () { return this.phase !== 'idle'; },

    spin: function (fastMs) {
      if (this.busy() || !this.disc) return false;
      this.t = 0;
      if (this.stage.reducedMotion) {
        this.planStop(1, 900); // one short eased turn instead of a fast spin
      } else {
        this.phase = 'fast';
        this.fastMs = fastMs;
      }
      this.stage.wake();
      return true;
    },

    // Pick a random landing spot (anywhere inside a random segment, not always dead centre) and the
    // eased stop that reaches it. Ease-out cubic starts at 3 x average speed, so for the stop to
    // match the fast spin's speed it covers WHEEL_SPEED x duration / 3.
    planStop: function (minTurns, fixedMs) {
      var v = CONFIG.WHEEL_SPEED;
      var natural = this.angle + (fixedMs ? minTurns * 360 : v * CONFIG.WHEEL_STOP_MS / 3);
      var seg = Math.floor(Math.random() * 8);
      // Segment k is under the top pointer when the disc angle is -(k * 45) (mod 360)
      var landing = -(seg * 45 + rand(-15, 15));
      var target = natural + (((landing - natural) % 360) + 360) % 360;
      this.from = this.angle;
      this.dist = target - this.angle;
      this.dur = fixedMs || 3 * this.dist / v;
      this.t = 0;
      this.phase = 'stop';
    },

    update: function (dt) {
      if (this.phase === 'fast') {
        this.angle += CONFIG.WHEEL_SPEED * dt;
        this.t += dt;
        if (this.t >= this.fastMs) this.planStop();
      } else if (this.phase === 'stop') {
        this.t += dt;
        var p = Math.min(1, this.t / this.dur);
        this.angle = this.from + this.dist * easeOutCubic(p);
        if (p >= 1) {
          this.phase = 'idle';
          this.angle %= 360;
          this.stage.emit('wheel:landed', this.result());
        }
      } else {
        return;
      }
      this.disc.setAttribute('transform', 'rotate(' + this.angle.toFixed(2) + ' ' + WHEEL_CX + ' ' + WHEEL_CY + ')');
    },

    result: function () {
      var k = Math.round(((-this.angle % 360) + 360) % 360 / 45) % 8;
      return WHEEL_SEGMENTS[k];
    },

    needsFrames: function () { return this.busy(); }
  };

  // ------------------------------------------------------------------ Slides of Emotion
  // Faces drawn in the slide window (x 570-670, y 416-522), in the same line style as the smiley.
  // Face 0 is the one already in the page.
  function ring(cx, cy, r) {
    return 'M' + (cx - r) + ' ' + cy + ' a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0 a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0';
  }
  var FACES = [
    { name: 'Happy', color: '#e8b92a', d: ['M590 446 q8 -10 16 0', 'M634 446 q8 -10 16 0', 'M592 482 q28 30 56 0'] },
    { name: 'Sad', color: '#3b6ff0', d: ['M592 448 q6 -6 12 0', 'M636 448 q6 -6 12 0', 'M596 504 q24 -22 48 0'] },
    { name: 'Surprised', color: '#1f8a8a', d: [ring(598, 446, 7), ring(642, 446, 7), ring(620, 494, 11)] },
    { name: 'Angry', color: '#e5533d', d: ['M588 436 l18 8', 'M652 436 l-18 8', ring(598, 452, 2), ring(642, 452, 2), 'M598 500 q22 -12 44 0'] },
    { name: 'Laughing', color: '#ee832d', d: ['M590 450 l8 -9 l8 9', 'M634 450 l8 -9 l8 9', 'M592 478 h56 q-2 30 -28 30 q-26 0 -28 -30 Z'] },
    { name: 'Sleepy', color: '#8a7fd0', d: ['M590 446 q8 7 16 0', 'M634 446 q8 7 16 0', ring(620, 494, 5)] },
    { name: 'Meh', color: '#3FA84B', d: [ring(598, 448, 2), ring(642, 448, 2), 'M600 496 h40'] }
  ];

  var Slides = {
    face: null,
    stage: null,
    current: 0,
    schedule: [],    // remaining flip durations
    t: 0,
    swapped: false,
    finalFace: 0,

    init: function (stage) {
      this.stage = stage;
      this.face = stage.svg.querySelector('#slide-face');
    },

    busy: function () { return this.schedule.length > 0; },

    flip: function (ms) {
      if (this.busy() || !this.face) return false;
      var list = [];
      if (this.stage.reducedMotion) {
        list = [500]; // a single, slower flip straight to the result
      } else {
        for (var sum = 0; sum < ms; sum += CONFIG.FLIP_MS) list.push(CONFIG.FLIP_MS);
        list = list.concat(CONFIG.FLIP_SLOWDOWN);
      }
      this.schedule = list;
      this.finalFace = this.pick(this.current);
      this.t = 0;
      this.swapped = false;
      this.stage.wake();
      return true;
    },

    pick: function (not) {
      var k = Math.floor(Math.random() * (FACES.length - 1));
      return k >= not ? k + 1 : k;
    },

    show: function (k) {
      var f = FACES[k];
      this.current = k;
      this.face.setAttribute('stroke', f.color);
      this.face.innerHTML = f.d.map(function (d) { return '<path d="' + d + '"/>'; }).join('');
    },

    // Each flip squashes the card to nothing about the window's middle line and back,
    // swapping the face at the halfway point
    update: function (dt) {
      if (!this.busy()) return;
      this.t += dt;
      var dur = this.schedule[0];
      var p = Math.min(1, this.t / dur);
      if (p >= 0.5 && !this.swapped) {
        this.swapped = true;
        this.show(this.schedule.length === 1 ? this.finalFace : this.pick(this.current));
      }
      var s = Math.abs(Math.cos(Math.PI * p));
      this.face.setAttribute('transform', 'translate(0 469) scale(1 ' + s.toFixed(3) + ') translate(0 -469)');
      if (p >= 1) {
        this.schedule.shift();
        this.t = 0;
        this.swapped = false;
        if (!this.busy()) {
          this.face.removeAttribute('transform');
          this.stage.emit('slides:landed', FACES[this.current].name);
        }
      }
    },

    needsFrames: function () { return this.busy(); }
  };

  // Wheel and slides always run together (lever or haywire); announce both results once both stop
  var Luck = {
    pending: 0,
    results: {},

    init: function (stage) {
      var self = this;
      this.stage = stage;
      stage.on('tower:haywire', function () { self.spin(CONFIG.HAYWIRE_MS); });
      var done = function (key) {
        return function (value) {
          self.results[key] = value;
          if (--self.pending === 0) {
            stage.status('Wheel of Luck: ' + self.results.wheel + '. Emotion: ' + self.results.slides + '.');
            stage.emit('luck:done');
          }
        };
      };
      stage.on('wheel:landed', done('wheel'));
      stage.on('slides:landed', done('slides'));
    },

    busy: function () { return Wheel.busy() || Slides.busy(); },

    spin: function (ms) {
      if (this.busy()) return false; // already spinning: let it finish
      this.results = {};
      this.pending = 0;
      if (Wheel.spin(ms)) this.pending++;
      if (Slides.flip(ms)) this.pending++;
      return this.pending > 0;
    },

    update: function () {},
    needsFrames: function () { return false; }
  };

  // ------------------------------------------------------------------ Lever
  var LEVER_PIVOT = '736 492';
  var LEVER_PULL = 95; // degrees, clockwise: the ball swings down and out to the right

  var Lever = {
    el: null,
    arm: null,
    stage: null,
    angle: 0,
    vel: 0,
    state: 'rest',   // rest | pulling | down | spring
    held: false,

    init: function (stage) {
      var self = this;
      this.stage = stage;
      this.el = stage.svg.querySelector('#lever');
      this.arm = stage.svg.querySelector('#lever-arm');
      if (!this.el || !this.arm) return;
      bindHold(this.el, function () { self.pull(); }, function () { self.release(); }, stage);
      var sync = function () { self.el.classList.toggle('is-busy', Luck.busy()); };
      stage.on('luck:done', sync);
      stage.on('tower:haywire', sync);
    },

    pull: function () {
      // Ignore pulls while the wheel and slides are still going (or the lever is still moving)
      if (Luck.busy() || this.state !== 'rest') return;
      this.held = true;
      this.state = 'pulling';
      Luck.spin(rand(CONFIG.LEVER_MIN_MS, CONFIG.LEVER_MAX_MS));
      this.el.classList.add('is-busy');
      this.stage.emit('lever:down');
      this.stage.wake();
    },

    release: function () {
      this.held = false;
      if (this.state === 'down') this.springBack();
      this.stage.wake();
    },

    springBack: function () {
      this.state = 'spring';
      this.vel = 0;
      this.stage.emit('lever:up');
    },

    update: function (dt) {
      if (this.state === 'rest' || !this.arm) return;
      if (this.state === 'pulling') {
        this.angle = Math.min(LEVER_PULL, this.angle + dt * 0.7);
        if (this.angle >= LEVER_PULL) {
          this.state = 'down';
          if (!this.held) this.springBack();
        }
      } else if (this.state === 'spring') {
        if (this.stage.reducedMotion) {
          this.angle = Math.max(0, this.angle - dt * 0.5); // straight back, no bounce
        } else {
          // Damped spring back to upright, in small steps for stability
          for (var left = dt; left > 0; left -= 8) {
            var h = Math.min(8, left);
            this.vel += (-0.00016 * this.angle - 0.0095 * this.vel) * h;
            this.angle += this.vel * h;
          }
        }
        if (Math.abs(this.angle) < 0.3 && Math.abs(this.vel) < 0.01) {
          this.angle = 0;
          this.vel = 0;
          this.state = 'rest';
        }
      }
      this.arm.setAttribute('transform', 'rotate(' + this.angle.toFixed(2) + ' ' + LEVER_PIVOT + ')');
    },

    needsFrames: function () { return this.state !== 'rest' && this.state !== 'down'; }
  };

  // ------------------------------------------------------------------ Crystals
  // At rest they keep the wave drawn in the page. Over the area above them, each one's height follows
  // a Gaussian of its horizontal distance from the pointer, easing towards its target.
  var Crystals = {
    stage: null,
    items: [],       // { el, x, restTop, dy }
    pointerX: null,  // viewBox x of the pointer, or null at rest

    init: function (stage) {
      var self = this;
      this.stage = stage;
      for (var i = 1; i <= 6; i++) {
        var el = stage.svg.querySelector('#diamond-' + i);
        var head = el && el.querySelectorAll('path')[0];
        if (!head) return;
        var m = /^M([\d.]+) ([\d.]+)/.exec(head.getAttribute('d'));
        this.items.push({ el: el, x: +m[1], restTop: +m[2], dy: 0 });
      }
      var zone = stage.root.querySelector('#vg-crystal-zone');
      if (!zone) return;
      var move = function (e) {
        var p = stage.toSvg(e.clientX, e.clientY);
        if (!p) return;
        self.pointerX = p.x;
        stage.wake();
      };
      var leave = function () {
        self.pointerX = null;
        stage.wake();
      };
      zone.addEventListener('pointermove', move);
      zone.addEventListener('pointerdown', move);
      zone.addEventListener('pointerleave', leave);
      zone.addEventListener('pointercancel', leave);
      zone.addEventListener('pointerup', function (e) { if (e.pointerType === 'touch') leave(); });
    },

    target: function (item) {
      if (this.pointerX === null) return 0;
      var reduced = this.stage.reducedMotion;
      var d = item.x - this.pointerX;
      var g = Math.exp(-(d * d) / (2 * CONFIG.CRYSTAL_SIGMA * CONFIG.CRYSTAL_SIGMA));
      var top = CONFIG.CRYSTAL_BASE_Y - CONFIG.CRYSTAL_RISE * (reduced ? 0.5 : 1) * g;
      if (reduced) top = (top + item.restTop) / 2; // smaller movement around the resting wave
      return top - item.restTop;
    },

    update: function (dt) {
      var tau = this.stage.reducedMotion ? CONFIG.CRYSTAL_EASE_MS * 2 : CONFIG.CRYSTAL_EASE_MS;
      for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i];
        var goal = this.target(it);
        if (Math.abs(goal - it.dy) < 0.05) {
          if (it.dy === goal) continue;
          it.dy = goal;
        } else {
          it.dy = approach(it.dy, goal, dt, tau);
        }
        it.el.setAttribute('transform', 'translate(0 ' + it.dy.toFixed(2) + ')');
      }
    },

    needsFrames: function () {
      for (var i = 0; i < this.items.length; i++) {
        if (Math.abs(this.target(this.items[i]) - this.items[i].dy) >= 0.05) return true;
      }
      return false;
    }
  };

  // ------------------------------------------------------------------ boot
  function boot() {
    var root = document.querySelector('.vg');
    if (!root || !root.querySelector('#vg-stage') || !window.requestAnimationFrame) return;
    try {
      Stage.init(root);
      // Order matters only within a frame: inputs first, then the tower that reads them
      Stage.register(Hold);
      Stage.register(Tower);
      Stage.register(Wheel);
      Stage.register(Slides);
      Stage.register(Luck);
      Stage.register(Lever);
      Stage.register(Crystals);
      Stage.wake();
      window.addEventListener('pagehide', function () { Mic.stop(); });
    } catch (err) {
      // Leave the static illustration in place
      try { Mic.stop(); } catch (e) { /* nothing to clean up */ }
      if (window.console) console.warn('Virtual MindMeter disabled:', err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
