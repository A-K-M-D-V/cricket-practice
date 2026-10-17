/* bowler.js — procedural bowler animation in world coordinates.
 *
 * The bowler faces the camera (toward -z). A right-arm bowler's right side is
 * therefore on screen left (-x). Right-arm over the wicket runs in on +x and
 * releases close to the stumps; left-arm over mirrors that.
 *
 * The release point the physics uses is read from the bowler's hand at the
 * release frame, so the ball always leaves the hand it is drawn in.
 */
(function (CVT) {
  'use strict';

  var TYPES = CVT.Physics.TYPES;
  var D2R = Math.PI / 180;

  function lerp(a, b, u) { return a + (b - a) * u; }
  function clamp01(u) { return u < 0 ? 0 : u > 1 ? 1 : u; }
  function easeOut(u) { return 1 - (1 - u) * (1 - u); }
  function add(p, x, y, z) { return [p[0] + x, p[1] + y, p[2] + z]; }
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }

  function plan(typeKey, arm) {
    var T = TYPES[typeKey];
    var side = arm === 'left' ? -1 : 1;
    var p = {
      T: T, type: typeKey, side: side, bx: 0.5 * side,
      lead: 0.5,                       // pause at the mark before running
      runStartZ: T.runStart,
      releaseBz: 18.05,
      runDur: T.run, strideDur: T.stride, followDur: 1.1,
      stepLen: T.kind === 'spin' ? 0.62 : 0.85
    };
    p.strideStartZ = p.releaseBz + T.bound;
    p.runEndT = p.lead + p.runDur;
    p.releaseT = p.runEndT + p.strideDur;
    p.endT = p.releaseT + p.followDur;
    p.relA = 360 + T.relAngle;          // arm angle at release (deg)
    return p;
  }

  function runProgress(u) { return 0.55 * u + 0.45 * u * u; }

  /* Joint set: hips, knees, feet, shoulders, elbows, hands, neck, head. */
  function assemble(p, s) {
    var side = p.side;
    var neck = [s.bx, s.hipY + 0.52 * Math.cos(s.lean), s.bz - 0.52 * Math.sin(s.lean)];
    var head = add(neck, 0, 0.15 * Math.cos(s.lean), -0.15 * Math.sin(s.lean));
    var hip = [s.bx, s.hipY, s.bz];
    var bowlSh = add(neck, -0.19 * side, -0.03, 0);
    var freeSh = add(neck, 0.19 * side, -0.03, 0);
    var L = p.T.armLen;
    var a = s.armA * D2R;
    var bowlHand = [
      bowlSh[0] + side * 0.1 * Math.cos(a),
      bowlSh[1] + L * Math.cos(a),
      bowlSh[2] - L * Math.sin(a)
    ];
    var bowlElbow = s.straight ? mid(bowlSh, bowlHand) : add(mid(bowlSh, bowlHand), -0.04 * side, -0.05, 0.08);
    var freeHand = s.freeHand(freeSh);
    var freeElbow = add(mid(freeSh, freeHand), 0.05 * side, -0.06, 0.06);
    var bowlHip = add(hip, -0.1 * side, 0, 0);
    var freeHip = add(hip, 0.1 * side, 0, 0);
    function knee(h, f) { return add(mid(h, f), 0, 0.05, -0.15); }
    return {
      side: side, bz: s.bz,
      head: head, neck: neck, hip: hip,
      bowl: { sh: bowlSh, el: bowlElbow, ha: bowlHand, hi: bowlHip, kn: knee(bowlHip, s.bowlFoot), ft: s.bowlFoot },
      free: { sh: freeSh, el: freeElbow, ha: freeHand, hi: freeHip, kn: knee(freeHip, s.freeFoot), ft: s.freeFoot },
      hand: bowlHand
    };
  }

  function standing(p, bz, bx) {
    var side = p.side;
    return {
      bz: bz, bx: bx, hipY: 0.98, lean: 0.05, armA: 168, straight: false,
      bowlFoot: [bx - 0.13 * side, 0.03, bz],
      freeFoot: [bx + 0.13 * side, 0.03, bz],
      freeHand: function (sh) { return add(sh, 0.04 * side, -0.62, -0.05); }
    };
  }

  function pose(p, t) {
    var side = p.side, s;

    if (t < p.lead) {
      s = standing(p, p.runStartZ, p.bx);
    } else if (t < p.runEndT) {
      // run-up: accelerating approach, stride rate follows speed
      var u = (t - p.lead) / p.runDur;
      var dist = (p.runStartZ - p.strideStartZ) * runProgress(u);
      var bz = p.runStartZ - dist;
      var phi = dist / p.stepLen * Math.PI;
      var amp = Math.min(1, dist / 0.6);
      s = {
        bz: bz, bx: p.bx, hipY: 0.98 + 0.04 * Math.abs(Math.sin(phi)) * amp,
        lean: 0.18 * amp, armA: 150, straight: false,
        bowlFoot: [p.bx - 0.11 * side, 0.03 + 0.22 * amp * Math.max(0, Math.cos(phi + Math.PI)), bz - 0.45 * amp * Math.sin(phi + Math.PI)],
        freeFoot: [p.bx + 0.11 * side, 0.03 + 0.22 * amp * Math.max(0, Math.cos(phi)), bz - 0.45 * amp * Math.sin(phi)],
        freeHand: function (sh) { return add(sh, 0.03 * side, -0.45, 0.32 * amp * Math.sin(phi)); }
      };
    } else if (t < p.releaseT) {
      // delivery stride: bound, back foot, front foot, arm over
      var w = (t - p.runEndT) / p.strideDur;
      var bz2 = lerp(p.strideStartZ, p.releaseBz, w);
      var backLand = lerp(p.strideStartZ, p.releaseBz, 0.6) + 0.1;
      var frontLand = p.releaseBz - 0.5;
      var armA = w < 0.4 ? 150 + 60 * easeOut(w / 0.4) : lerp(210, p.relA, Math.pow((w - 0.4) / 0.6, 1.3));
      var wf = clamp01(w / 0.85), wb = clamp01(w / 0.6);
      var raise = w < 0.6 ? easeOut(w / 0.6) : 1 - (w - 0.6) / 0.4 * 0.8;
      s = {
        bz: bz2, bx: p.bx, hipY: 0.98 + 0.15 * Math.sin(Math.PI * clamp01(w * 1.25)),
        lean: lerp(-0.1, 0.22, w), armA: armA, straight: w > 0.35,
        bowlFoot: [p.bx - 0.12 * side, 0.03 + (w < 0.6 ? 0.28 * Math.sin(Math.PI * wb) : 0), lerp(p.strideStartZ + 0.3, backLand, wb)],
        freeFoot: [p.bx + 0.1 * side, 0.03 + (w < 0.85 ? 0.38 * Math.sin(Math.PI * wf) : 0), lerp(p.strideStartZ - 0.2, frontLand, wf)],
        freeHand: function (sh) {
          return add(sh, 0.02 * side, lerp(-0.5, 0.42, raise), lerp(0.1, -0.5, raise));
        }
      };
    } else {
      // follow-through: carry on, veer off the pitch, settle
      var v = clamp01((t - p.releaseT) / p.followDur);
      var e = easeOut(v);
      var bz3 = p.releaseBz - 1.9 * e;
      var bx3 = p.bx + side * 0.8 * v * v;
      var amp3 = 1 - v;
      var phi3 = (1.9 * e) / 0.7 * Math.PI;
      var armA3 = p.relA + 155 * easeOut(clamp01(v * 3));
      s = {
        bz: bz3, bx: bx3, hipY: 0.98, lean: 0.38 * amp3 + 0.08, armA: armA3, straight: v < 0.35,
        bowlFoot: [bx3 - 0.12 * side, 0.03 + 0.2 * amp3 * Math.max(0, Math.cos(phi3 + Math.PI)), bz3 - 0.4 * amp3 * Math.sin(phi3 + Math.PI)],
        freeFoot: [bx3 + 0.12 * side, 0.03 + 0.2 * amp3 * Math.max(0, Math.cos(phi3)), bz3 - 0.4 * amp3 * Math.sin(phi3)],
        freeHand: function (sh) { return add(sh, 0.06 * side, -0.55, lerp(0.35, 0.02, v)); }
      };
    }
    return assemble(p, s);
  }

  function releasePoint(p) {
    var h = pose(p, p.releaseT - 1e-6).hand;
    return { x: h[0], y: h[1], z: h[2] };
  }

  /* Umpire stands behind the bowler's stumps, on the side away from the run-up. */
  function umpire(side) {
    var x = -0.42 * side, z = 21.3;
    return {
      head: [x, 1.66, z], neck: [x, 1.5, z], hip: [x, 0.95, z],
      a: { sh: [x - 0.2, 1.47, z], el: [x - 0.24, 1.18, z - 0.03], ha: [x - 0.22, 0.92, z - 0.08], hi: [x - 0.1, 0.95, z], kn: [x - 0.13, 0.5, z - 0.03], ft: [x - 0.15, 0.03, z] },
      b: { sh: [x + 0.2, 1.47, z], el: [x + 0.24, 1.18, z - 0.03], ha: [x + 0.22, 0.92, z - 0.08], hi: [x + 0.1, 0.95, z], kn: [x + 0.13, 0.5, z - 0.03], ft: [x + 0.15, 0.03, z] }
    };
  }

  CVT.Bowler = { plan: plan, pose: pose, releasePoint: releasePoint, umpire: umpire };
})(window.CVT = window.CVT || {});
