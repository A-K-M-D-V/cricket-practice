/* app.js — delivery state machine, animation loop, auto bowling,
 * reaction-training calls, fullscreen and synthesized sound. */
(function (CVT) {
  'use strict';

  var Phys = CVT.Physics, Bowler = CVT.Bowler;
  var PAUSE = 1.1;   // seconds the scene holds after the ball has gone past

  /* ---------- sound: a short thud when the ball pitches ---------- */
  var Sound = {
    ctx: null, on: false,
    enable: function (on) {
      if (on && !this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
      this.on = on && !!this.ctx;
    },
    thud: function (strength) {
      if (!this.on) return;
      var c = this.ctx, len = Math.floor(c.sampleRate * 0.09);
      var buf = c.createBuffer(1, len, c.sampleRate), data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      var src = c.createBufferSource(); src.buffer = buf;
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      var g = c.createGain(); g.gain.value = 0.5 * strength;
      src.connect(lp); lp.connect(g); g.connect(c.destination);
      src.start();
    }
  };

  /* ---------- delivery options per mode ---------- */
  function pick(weights) {
    var total = 0, k;
    for (k in weights) total += weights[k];
    var r = Math.random() * total;
    for (k in weights) { r -= weights[k]; if (r <= 0) return k; }
    return k;
  }

  function lengthWeights(type) {
    var spin = Phys.TYPES[type].kind === 'spin';
    return spin
      ? { yorker: 8, full: 30, good: 42, short: 17, bouncer: 3 }
      : { yorker: 12, full: 22, good: 34, short: 19, bouncer: 13 };
  }

  function makeOpts(s) {
    var T = Phys.TYPES[s.type];
    if (s.mode === 'normal') {
      return {
        type: s.type, arm: s.arm,
        speedKmh: Math.round((s.speed + (Math.random() - 0.5) * 2.4) * 10) / 10,
        movement: s.movement,
        length: s.length === 'random' ? pick(lengthWeights(s.type)) : s.length
      };
    }
    var moveW = T.kind === 'spin'
      ? (T.natural === 'in' ? { in: 65, straight: 22, out: 13 } : { out: 62, in: 18, straight: 20 })
      : { in: 38, out: 42, straight: 20 };
    return {
      type: s.type, arm: s.arm,
      speedKmh: Math.round(Phys.between(T.range, Math.random) * 10) / 10,
      movement: pick(moveW),
      length: pick(lengthWeights(s.type))
    };
  }

  function describe(o) {
    return Phys.TYPES[o.type].label + ' · ' + Phys.movementLabel(o.type, o.movement) +
      ' · ' + Phys.LENGTHS[o.length].label;
  }

  /* ---------- app ---------- */
  function $(id) { return document.getElementById(id); }

  var stage = $('stage');
  var canvas = $('view');
  var renderer = new CVT.Renderer(canvas);
  var session = new CVT.Session();
  var ui = {
    status: $('status'), statusText: $('statusText'),
    hudInfo: $('hudInfo'), hudSpeed: $('hudSpeed'), hudSpeedVal: $('hudSpeedVal'),
    hudArrival: $('hudArrival'),
    judge: $('judge'), judgeResult: $('judgeResult'),
    sess: {
      balls: $('statBalls'), avg: $('statAvg'), top: $('statTop'), calls: $('statCalls'),
      over: $('overSlots'), overLabel: $('overLabel'), log: $('log')
    }
  };

  var cur = null;            // current delivery
  var autoAt = 0;            // performance.now() when the next auto ball fires
  var awaitingCall = false;
  var call = { length: null, movement: null };
  var lastStatus = '';

  var controls = new CVT.Controls({
    onBowl: function () { if (!isRunning()) startDelivery(); },
    onNext: function () { startDelivery(); },
    onKeyBowl: function () { if (isRunning()) return; startDelivery(); },
    onModeChange: function () { if (!isRunning()) idleHud(); },
    onSettings: function () { if (!isRunning()) idleHud(); },
    onAuto: function () { scheduleAuto(); },
    onSound: function (on) { Sound.enable(on); },
    onFullscreen: toggleFullscreen
  });

  function isRunning() { return !!cur && !cur.done; }

  function setStatus(text, state) {
    var key = text + '|' + state;
    if (key === lastStatus) return;
    lastStatus = key;
    ui.statusText.textContent = text;
    ui.status.dataset.state = state;
  }

  function idleHud() {
    var s = controls.get();
    ui.hudInfo.textContent = s.mode === 'normal'
      ? 'Normal tracking · next: ' + Phys.TYPES[s.type].label + ', ' +
        Phys.movementLabel(s.type, s.movement) + ', ' +
        (s.length === 'random' ? 'random length' : Phys.LENGTHS[s.length].label.toLowerCase()) +
        ', ' + s.speed + ' km/h'
      : s.mode === 'random' ? 'Random delivery · revealed after the ball'
      : 'Reaction training · watch the release';
  }

  function startDelivery() {
    var s = controls.get();
    autoAt = 0;
    awaitingCall = false;
    ui.judge.hidden = true;
    ui.hudSpeed.hidden = true;
    ui.hudArrival.hidden = true;

    var opts = makeOpts(s);
    var plan = Bowler.plan(opts.type, opts.arm);
    var d = Phys.buildDelivery(opts, Bowler.releasePoint(plan));
    cur = { opts: opts, plan: plan, d: d, mode: s.mode, look: s.ball, t0: performance.now(), bounced: false, done: false, rec: null };

    ui.hudInfo.textContent =
      s.mode === 'normal' ? describe(opts) + ' · ' + opts.speedKmh.toFixed(1) + ' km/h'
      : s.mode === 'random' ? 'Random delivery · watch it all the way'
      : 'Reaction training';
    controls.setRunning(true);
  }

  function finishDelivery() {
    cur.done = true;
    controls.setRunning(false);
    cur.rec = session.record(cur.d, cur.mode);
    if (cur.mode === 'reaction') {
      awaitingCall = true;
      call = { length: null, movement: null };
      ui.judge.querySelectorAll('.chip').forEach(function (b) {
        b.setAttribute('aria-pressed', 'false');
        b.disabled = false;
        if (b.dataset.group === 'movement') b.textContent = Phys.movementLabel(cur.opts.type, b.dataset.value);
      });
      ui.judgeResult.textContent = '';
      ui.judgeResult.className = 'judge-result';
      ui.judge.hidden = false;
    } else {
      reveal();
    }
    session.render(ui.sess);
    scheduleAuto();
  }

  function reveal() {
    ui.hudSpeedVal.textContent = cur.opts.speedKmh.toFixed(1);
    ui.hudSpeed.hidden = false;
    ui.hudArrival.textContent = (cur.mode === 'normal' ? '' : describe(cur.opts) + ' · ') +
      'Arrived at ' + cur.d.arrival.height + ', ' + cur.d.arrival.line;
    ui.hudArrival.hidden = false;
  }

  function onChip(ev) {
    var b = ev.target.closest('.chip');
    if (!b || !awaitingCall) return;
    var group = b.dataset.group;
    call[group] = b.dataset.value;
    ui.judge.querySelectorAll('.chip[data-group="' + group + '"]').forEach(function (c) {
      c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
    });
    if (call.length && call.movement) {
      awaitingCall = false;
      var res = session.recordCall(cur.rec, call.length, call.movement);
      ui.judge.querySelectorAll('.chip').forEach(function (c) { c.disabled = true; });
      var parts = [];
      parts.push(res.lenOk ? 'Length right' : 'Length was ' + Phys.LENGTHS[cur.rec.length].label.toLowerCase());
      parts.push(res.moveOk ? 'movement right' : 'movement was ' + Phys.movementLabel(cur.rec.type, cur.rec.movement).toLowerCase());
      ui.judgeResult.textContent = parts.join(', ') + '.';
      ui.judgeResult.className = 'judge-result ' + (res.lenOk && res.moveOk ? 'hit' : 'miss');
      reveal();
      session.render(ui.sess);
      scheduleAuto();
    }
  }
  ui.judge.addEventListener('click', onChip);

  function scheduleAuto() {
    var s = controls.get();
    if (!s.auto || awaitingCall || isRunning()) { autoAt = 0; return; }
    autoAt = performance.now() + s.interval * 1000;
  }

  canvas.addEventListener('click', function () { if (!isRunning() && !awaitingCall) startDelivery(); });

  /* ---------- fullscreen, with an in-page fallback ---------- */
  function isFull() { return document.fullscreenElement === stage || stage.classList.contains('focus'); }
  function toggleFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; }
    if (stage.classList.contains('focus')) { stage.classList.remove('focus'); document.body.classList.remove('has-focus'); onResize(); return; }
    var req = stage.requestFullscreen ? stage.requestFullscreen() : null;
    if (req && req.catch) {
      req.catch(function () { stage.classList.add('focus'); document.body.classList.add('has-focus'); onResize(); });
    } else if (!req) {
      stage.classList.add('focus'); document.body.classList.add('has-focus'); onResize();
    }
  }
  document.addEventListener('fullscreenchange', function () {
    stage.classList.toggle('is-full', isFull());
    onResize();
  });

  function onResize() { renderer.resize(); }
  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);

  /* ---------- main loop ---------- */
  function frame(now) {
    var s = controls.get();
    var scene;

    if (cur) {
      var t = (now - cur.t0) / 1000;
      var p = cur.plan, d = cur.d;
      var bowler = Bowler.pose(p, t);
      var ball = null;
      var ft = t - p.releaseT;

      if (ft < 0) {
        if (t >= p.lead) ball = { pos: { x: bowler.hand[0], y: bowler.hand[1], z: bowler.hand[2] }, alpha: 1, inHand: true };
        if (!cur.done) setStatus('Bowler running in', 'run');
      } else if (ft <= d.tEnd) {
        var pos = Phys.positionAt(d, ft);
        var fade = pos.z < Phys.PITCH.fadeStartZ
          ? Math.max(0, 1 - (Phys.PITCH.fadeStartZ - pos.z) / (Phys.PITCH.fadeStartZ - Phys.PITCH.endZ))
          : 1;
        ball = { pos: pos, alpha: fade, inHand: false };
        if (!cur.bounced && ft >= d.t1) {
          cur.bounced = true;
          Sound.thud(Math.min(1, d.v / 40));
        }
        if (!cur.done) setStatus('Ball in flight', 'flight');
      } else if (!cur.done) {
        setStatus('Tracking through', 'flight');
        if (ft > d.tEnd + PAUSE) finishDelivery();
      }

      scene = {
        look: cur.look,
        bowler: bowler,
        umpire: Bowler.umpire(p.side),
        ball: ball,
        trace: cur.done && cur.mode === 'normal' ? d : null
      };
    } else {
      var idle = Bowler.plan(s.type, s.arm);
      scene = { look: s.ball, bowler: Bowler.pose(idle, 0), umpire: Bowler.umpire(idle.side), ball: null, trace: null };
    }

    if (!isRunning()) {
      if (awaitingCall) setStatus('Make your call', 'call');
      else if (autoAt) setStatus('Next ball in ' + Math.max(1, Math.ceil((autoAt - now) / 1000)) + ' s', 'wait');
      else setStatus('Ready', 'ready');
      if (autoAt && now >= autoAt) startDelivery();
    }

    renderer.draw(scene);
    requestAnimationFrame(frame);
  }

  idleHud();
  session.render(ui.sess);
  requestAnimationFrame(frame);

  CVT.app = { start: startDelivery, session: session };
})(window.CVT = window.CVT || {});
