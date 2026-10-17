/* session.js — balls bowled, speeds, calls made in reaction training, and the
 * over-by-over strip. Session data lives in memory for the current visit. */
(function (CVT) {
  'use strict';

  var Phys = CVT.Physics;

  function Session() { this.reset(); }

  Session.prototype.reset = function () {
    this.balls = [];
    this.calls = { length: [0, 0], move: [0, 0] };
  };

  Session.prototype.record = function (d, mode) {
    var o = d.opts;
    var rec = {
      n: this.balls.length + 1, mode: mode, type: o.type, arm: o.arm,
      speed: o.speedKmh, length: o.length, movement: o.movement,
      arrival: d.arrival, call: null
    };
    this.balls.push(rec);
    return rec;
  };

  Session.prototype.recordCall = function (rec, lengthCall, moveCall) {
    var lenOk = lengthCall === rec.length;
    var moveOk = moveCall === rec.movement;
    rec.call = { length: lengthCall, movement: moveCall, lenOk: lenOk, moveOk: moveOk };
    this.calls.length[1]++; this.calls.move[1]++;
    if (lenOk) this.calls.length[0]++;
    if (moveOk) this.calls.move[0]++;
    return rec.call;
  };

  Session.prototype.oversText = function () {
    var n = this.balls.length;
    return Math.floor(n / 6) + '.' + (n % 6);
  };

  Session.prototype.render = function (els) {
    var b = this.balls;
    els.balls.textContent = this.oversText();
    if (b.length) {
      var sum = 0, max = 0;
      b.forEach(function (r) { sum += r.speed; if (r.speed > max) max = r.speed; });
      els.avg.textContent = (sum / b.length).toFixed(1);
      els.top.textContent = max.toFixed(1);
    } else {
      els.avg.textContent = '—';
      els.top.textContent = '—';
    }
    var c = this.calls;
    els.calls.textContent = c.length[1]
      ? c.length[0] + '/' + c.length[1] + ' · ' + c.move[0] + '/' + c.move[1]
      : '—';

    // current over: six slots
    var start = b.length === 0 ? 0 : Math.floor((b.length - 1) / 6) * 6;
    var over = b.slice(start, start + 6);
    els.overLabel.textContent = 'Over ' + (Math.floor(start / 6) + 1);
    els.over.innerHTML = '';
    for (var i = 0; i < 6; i++) {
      var slot = document.createElement('span');
      slot.className = 'slot';
      var r = over[i];
      if (r) {
        slot.classList.add('filled');
        slot.textContent = Phys.LENGTHS[r.length].short;
        slot.title = r.speed.toFixed(1) + ' km/h · ' + Phys.LENGTHS[r.length].label;
        if (r.call) slot.classList.add(r.call.lenOk && r.call.moveOk ? 'hit' : 'miss');
      }
      els.over.appendChild(slot);
    }

    // last deliveries, newest first
    els.log.innerHTML = '';
    if (!b.length) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No balls yet. Press Bowl or the space bar to start.';
      els.log.appendChild(empty);
      return;
    }
    b.slice(-8).reverse().forEach(function (r) {
      var li = document.createElement('li');
      var sp = document.createElement('span');
      sp.className = 'log-speed';
      sp.textContent = r.speed.toFixed(1);
      var tx = document.createElement('span');
      tx.className = 'log-text';
      tx.textContent = Phys.movementLabel(r.type, r.movement) + ', ' +
        Phys.LENGTHS[r.length].label.toLowerCase() + ' · ' + r.arrival.height + ', ' + r.arrival.line;
      li.appendChild(sp); li.appendChild(tx);
      if (r.call) {
        var mk = document.createElement('span');
        mk.className = 'log-call ' + (r.call.lenOk && r.call.moveOk ? 'hit' : 'miss');
        mk.textContent = (r.call.lenOk ? '✓' : '✗') + (r.call.moveOk ? '✓' : '✗');
        mk.title = 'Your call: length ' + (r.call.lenOk ? 'right' : 'wrong') + ', movement ' + (r.call.moveOk ? 'right' : 'wrong');
        li.appendChild(mk);
      }
      els.log.appendChild(li);
    });
  };

  CVT.Session = Session;
})(window.CVT = window.CVT || {});
