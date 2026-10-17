/* ballPhysics.js — delivery model in pitch coordinates (metres, seconds).
 *
 * Axes
 *   z : distance from the batter's popping crease (z = 0) toward the bowler.
 *       Batting stumps sit at z = -1.22, bowling stumps at z = 18.90.
 *   x : lateral. +x is the off side for a right-handed batter (screen right
 *       from the batter's eye), -x is the leg side.
 *   y : height above the pitch surface.
 *
 * The model is deliberately simple but internally consistent: constant
 * horizontal speed before the bounce, gravity, a coefficient of restitution
 * at the bounce, constant lateral acceleration for swing and a post-bounce
 * deflection angle for seam or spin. Ball speed sets real flight time.
 */
(function (CVT) {
  'use strict';

  var g = 9.81;

  var PITCH = {
    length: 20.12,          // stump to stump
    popping: 1.22,          // popping crease to stumps
    width: 3.05,
    stumpHalf: 0.114,       // half the width of the wicket (22.86 cm)
    stumpHeight: 0.711,
    battingStumpsZ: -1.22,
    bowlingStumpsZ: 18.90,
    bowlingPoppingZ: 17.68,
    fadeStartZ: -0.9,       // ball starts to fade as it passes the batter
    endZ: -2.1,             // end of simulated flight
    r: 0.036                // ball radius (≈ 72 mm diameter)
  };

  /* Bowling types. swingAcc is lateral acceleration in the air (m/s²),
     seamDeg / turnDeg is the deflection off the pitch in degrees. */
  var TYPES = {
    fast: {
      label: 'Fast', kind: 'pace', range: [128, 152], def: 140,
      swingAcc: [2.5, 6.0], seamDeg: [0.2, 0.7], e: 0.52, keep: 0.88,
      run: 2.1, stride: 0.40, runStart: 31, bound: 2.5, armLen: 0.78, relAngle: 16
    },
    medium: {
      label: 'Medium', kind: 'pace', range: [105, 128], def: 118,
      swingAcc: [3.5, 8.0], seamDeg: [0.3, 0.9], e: 0.50, keep: 0.87,
      run: 1.75, stride: 0.42, runStart: 27, bound: 2.2, armLen: 0.77, relAngle: 18
    },
    offspin: {
      label: 'Off-spin', kind: 'spin', range: [78, 95], def: 86, natural: 'in',
      swingAcc: [0.4, 1.2], turnDeg: [2.0, 5.0], e: 0.46, keep: 0.83,
      run: 1.0, stride: 0.50, runStart: 22.6, bound: 1.3, armLen: 0.72, relAngle: 28
    },
    legspin: {
      label: 'Leg-spin', kind: 'spin', range: [72, 92], def: 82, natural: 'out',
      swingAcc: [0.4, 1.2], turnDeg: [2.5, 6.0], e: 0.46, keep: 0.82,
      run: 1.05, stride: 0.50, runStart: 22.8, bound: 1.3, armLen: 0.72, relAngle: 30
    }
  };

  /* Bounce distance from the batter's popping crease, in metres. */
  var LENGTHS = {
    yorker:  { label: 'Yorker',      short: 'Y', z: 0.35 },
    full:    { label: 'Full',        short: 'F', z: 2.4 },
    good:    { label: 'Good length', short: 'G', z: 5.4 },
    short:   { label: 'Short',       short: 'S', z: 8.4 },
    bouncer: { label: 'Bouncer',     short: 'B', z: 11.0 }
  };

  function movementLabel(type, movement) {
    var T = TYPES[type];
    if (T.kind === 'pace') {
      return { in: 'Inswing', out: 'Outswing', straight: 'Straight' }[movement];
    }
    if (type === 'offspin') {
      return { in: 'Off-break', out: 'Away-drifter', straight: 'Arm ball' }[movement];
    }
    return { in: 'Googly', out: 'Leg-break', straight: 'Top-spinner' }[movement];
  }

  function between(range, rng) { return range[0] + (range[1] - range[0]) * rng(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /**
   * Build a delivery.
   * @param {object} o   { type, speedKmh, length, movement, arm }
   * @param {object} rel release point {x, y, z} from the bowler's hand
   */
  function buildDelivery(o, rel, rng) {
    rng = rng || Math.random;
    var T = TYPES[o.type];
    var v = o.speedKmh / 3.6;              // release speed, m/s
    var v2 = v * T.keep;                    // speed after the bounce
    var zB = Math.max(0.12, LENGTHS[o.length].z + (rng() - 0.5) * 0.6);
    var t1 = (rel.z - zB) / v;              // release to bounce
    var vy = (PITCH.r - rel.y + 0.5 * g * t1 * t1) / t1;
    var dir = o.movement === 'out' ? 1 : o.movement === 'in' ? -1 : 0;

    var S = 0, deflect = 0;
    if (T.kind === 'pace') {
      S = clamp(dir * 0.5 * between(T.swingAcc, rng) * t1 * t1, -0.6, 0.6);
      var seamSign = dir !== 0 ? (rng() < 0.75 ? dir : -dir) : (rng() < 0.5 ? 1 : -1);
      deflect = seamSign * between(T.seamDeg, rng) * (dir === 0 ? 0.6 : 1);
    } else {
      // spinners drift the opposite way to the turn
      var driftSign = dir !== 0 ? -dir : (rng() < 0.5 ? 1 : -1);
      S = driftSign * 0.25 * between(T.swingAcc, rng) * t1 * t1;
      deflect = dir * between(T.turnDeg, rng);
    }

    var t2 = zB / v2;                        // bounce to batter's crease
    var k = t2 / t1;
    var vxT = v2 * Math.tan(deflect * Math.PI / 180);
    var xe = 0.13 + (rng() - 0.5) * 0.26;   // aim: around off stump
    var xp = (xe - (S - rel.x) * k - vxT * t2) / (1 + k);
    var A = xp - rel.x - S;
    var vxPre = (A + 2 * S) / t1;
    var up = T.e * -(vy - g * t1);

    var d = {
      opts: o, x0: rel.x, y0: rel.y, z0: rel.z,
      v: v, v2: v2, vy: vy, t1: t1, zB: zB, xp: xp, A: A, S: S,
      vxPost: vxPre + vxT, up: up,
      tBat: t1 + zB / v2,
      tEnd: t1 + (zB - PITCH.endZ) / v2
    };
    d.arrival = describeArrival(positionAt(d, d.tBat));
    return d;
  }

  function positionAt(d, t) {
    if (t <= d.t1) {
      var s = t / d.t1;
      return {
        x: d.x0 + d.A * s + d.S * s * s,
        y: d.y0 + d.vy * t - 0.5 * g * t * t,
        z: d.z0 - d.v * t,
        bounced: false
      };
    }
    var dt = t - d.t1;
    var up = d.up, seg = 2 * up / g;
    while (dt > seg && up > 0.25) { dt -= seg; up *= 0.42; seg = 2 * up / g; }
    var y = up > 0.25 ? PITCH.r + up * dt - 0.5 * g * dt * dt : PITCH.r;
    return {
      x: d.xp + d.vxPost * (t - d.t1),
      y: Math.max(PITCH.r, y),
      z: d.zB - d.v2 * (t - d.t1),
      bounced: true
    };
  }

  function describeArrival(p) {
    var h = p.y;
    var height =
      h < 0.2 ? 'toe height' : h < 0.45 ? 'shin height' : h < 0.65 ? 'knee height' :
      h < 0.9 ? 'thigh height' : h < 1.15 ? 'waist height' : h < 1.4 ? 'chest height' :
      h < 1.65 ? 'shoulder height' : 'head height';
    var x = p.x;
    var line =
      x > 0.38 ? 'well outside off' : x > PITCH.stumpHalf + 0.05 ? 'outside off' :
      x >= -PITCH.stumpHalf - 0.03 ? 'on the stumps' : 'down leg';
    return { height: height, line: line, y: h, x: x };
  }

  CVT.Physics = {
    g: g, PITCH: PITCH, TYPES: TYPES, LENGTHS: LENGTHS,
    buildDelivery: buildDelivery, positionAt: positionAt,
    movementLabel: movementLabel, between: between
  };
})(window.CVT = window.CVT || {});
