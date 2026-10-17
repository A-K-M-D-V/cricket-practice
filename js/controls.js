/* controls.js — reads and writes the settings panel, remembers the last
 * settings in this browser, and relabels options to suit the bowling type. */
(function (CVT) {
  'use strict';

  var Phys = CVT.Physics;
  var KEY = 'cvt-settings-v1';

  function $(id) { return document.getElementById(id); }

  function Controls(handlers) {
    this.h = handlers;
    this.el = {
      modes: document.querySelectorAll('input[name="mode"]'),
      type: $('bowlType'), arm: $('arm'), speed: $('speed'), speedOut: $('speedOut'),
      movement: $('movement'), length: $('length'), ball: $('ballColor'),
      auto: $('auto'), autoState: $('autoState'), interval: $('interval'), intervalOut: $('intervalOut'),
      sound: $('sound'), randomNote: $('randomNote'),
      bowl: $('btnBowl'), next: $('btnNext'), full: $('btnFull'),
      fsBowl: $('fsBowl'), fsExit: $('fsExit')
    };
    this.restore();
    this.bind();
    this.relabelMovement();
    this.syncMode();
    this.syncOutputs();
  }

  Controls.prototype.get = function () {
    var e = this.el, mode = 'normal';
    e.modes.forEach(function (m) { if (m.checked) mode = m.value; });
    return {
      mode: mode, type: e.type.value, arm: e.arm.value,
      speed: +e.speed.value, movement: e.movement.value, length: e.length.value,
      ball: e.ball.value, auto: e.auto.checked, interval: +e.interval.value,
      sound: e.sound.checked
    };
  };

  Controls.prototype.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(this.get())); } catch (err) { /* storage unavailable */ }
  };

  Controls.prototype.restore = function () {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (err) { s = null; }
    if (!s) return;
    var e = this.el;
    e.modes.forEach(function (m) { m.checked = m.value === s.mode; });
    ['type', 'arm', 'movement', 'length', 'ball'].forEach(function (k) {
      var key = k === 'type' ? 'type' : k;
      var sel = e[k];
      if (s[key] && sel.querySelector('option[value="' + s[key] + '"]')) sel.value = s[key];
    });
    if (s.speed) e.speed.value = s.speed;
    if (s.interval) e.interval.value = s.interval;
    // auto bowling and sound always start off
  };

  Controls.prototype.syncOutputs = function () {
    var e = this.el;
    e.speedOut.textContent = e.speed.value;
    e.intervalOut.textContent = e.interval.value + ' s';
    e.autoState.textContent = e.auto.checked ? 'On' : 'Off';
  };

  Controls.prototype.relabelMovement = function () {
    var type = this.el.type.value;
    var opts = this.el.movement.options;
    for (var i = 0; i < opts.length; i++) {
      opts[i].textContent = Phys.movementLabel(type, opts[i].value);
    }
  };

  Controls.prototype.syncMode = function () {
    var s = this.get();
    var fixed = s.mode === 'normal';
    var e = this.el;
    [e.speed, e.movement, e.length].forEach(function (c) {
      c.disabled = !fixed;
      c.closest('.field').classList.toggle('is-random', !fixed);
    });
    e.randomNote.hidden = fixed;
    document.body.dataset.mode = s.mode;
  };

  Controls.prototype.setRunning = function (running) {
    this.el.bowl.disabled = running;
  };

  Controls.prototype.bind = function () {
    var self = this, e = this.el, h = this.h;

    e.modes.forEach(function (m) {
      m.addEventListener('change', function () { self.syncMode(); self.save(); h.onModeChange(); });
    });
    e.type.addEventListener('change', function () {
      var T = Phys.TYPES[e.type.value];
      e.speed.value = T.def;
      if (T.natural) e.movement.value = T.natural;
      self.relabelMovement();
      self.syncOutputs(); self.save(); h.onSettings();
    });
    [e.arm, e.movement, e.length, e.ball].forEach(function (c) {
      c.addEventListener('change', function () { self.save(); h.onSettings(); });
    });
    e.speed.addEventListener('input', function () { self.syncOutputs(); });
    e.speed.addEventListener('change', function () { self.save(); h.onSettings(); });
    e.interval.addEventListener('input', function () { self.syncOutputs(); });
    e.interval.addEventListener('change', function () { self.save(); h.onAuto(); });
    e.auto.addEventListener('change', function () { self.syncOutputs(); h.onAuto(); });
    e.sound.addEventListener('change', function () { h.onSound(e.sound.checked); });

    e.bowl.addEventListener('click', function () { h.onBowl(); });
    e.next.addEventListener('click', function () { h.onNext(); });
    e.full.addEventListener('click', function () { h.onFullscreen(); });
    e.fsBowl.addEventListener('click', function () { h.onNext(); });
    e.fsExit.addEventListener('click', function () { h.onFullscreen(); });

    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target && ev.target.tagName) || '';
      if (ev.code === 'Space' || ev.key === ' ') {
        if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT') return;
        ev.preventDefault();
        h.onKeyBowl();
      } else if ((ev.key === 'f' || ev.key === 'F') && tag !== 'INPUT' && tag !== 'SELECT') {
        h.onFullscreen();
      }
    });
  };

  CVT.Controls = Controls;
})(window.CVT = window.CVT || {});
