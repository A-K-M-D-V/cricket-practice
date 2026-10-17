/* renderer.js — batter's-eye Canvas renderer.
 * A fixed pinhole camera sits just behind the batting crease at eye height,
 * tilted slightly down. World points are projected with project(x, y, z).
 * Static scenery is cached to an offscreen canvas and redrawn on resize or
 * when the ball colour (and so the sightscreen and kit) changes.
 */
(function (CVT) {
  'use strict';

  var P = CVT.Physics.PITCH;

  var LOOKS = {
    red: {   // Test match: red ball, white sightscreen, whites
      sight: '#f3f2ec', sightEdge: '#c9c7bb',
      kit: '#f1eee4', kitShade: '#cfc9b8', trousers: '#e8e3d4',
      ball: ['#e0574a', '#a11d17', '#4d0a07'], seam: 'rgba(255,236,214,0.9)'
    },
    white: { // limited overs: white ball, black sightscreen, coloured kit
      sight: '#16191b', sightEdge: '#2a3033',
      kit: '#2a5596', kitShade: '#1b3c70', trousers: '#1f4683',
      ball: ['#ffffff', '#e7e3d8', '#9f9a8b'], seam: 'rgba(150,45,35,0.85)'
    }
  };

  function seeded(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function Renderer(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0.06, y: 1.62, z: -2.7, tilt: 7.5 * Math.PI / 180 };
    this.ct = Math.cos(this.cam.tilt);
    this.st = Math.sin(this.cam.tilt);
    this.bg = document.createElement('canvas');
    this.bgKey = '';
    this.resize();
  }

  Renderer.prototype.resize = function () {
    var r = this.cv.getBoundingClientRect();
    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var W = Math.max(2, Math.round(r.width * dpr));
    var H = Math.max(2, Math.round(r.height * dpr));
    if (W !== this.cv.width || H !== this.cv.height) {
      this.cv.width = W; this.cv.height = H;
    }
    this.W = W; this.H = H; this.dpr = dpr;
    this.f = 0.92 * Math.min(W, H * 16 / 9);
    this.cx = W / 2;
    this.cy = H * 0.47;
    this.bgKey = '';
  };

  Renderer.prototype.project = function (x, y, z) {
    var c = this.cam;
    var X = x - c.x, Y = y - c.y, D = z - c.z;
    var Yp = Y * this.ct + D * this.st;
    var Dp = -Y * this.st + D * this.ct;
    if (Dp < 0.05) return null;
    return { x: this.cx + this.f * X / Dp, y: this.cy - this.f * Yp / Dp, s: this.f / Dp };
  };

  Renderer.prototype.poly = function (ctx, pts, fill) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var q = this.project(pts[i][0], pts[i][1], pts[i][2]);
      if (!q) return;
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  /* Flat strip on the ground between two z values. */
  Renderer.prototype.groundRect = function (ctx, x0, x1, z0, z1, fill, y) {
    y = y || 0;
    this.poly(ctx, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill);
  };

  Renderer.prototype.groundEllipse = function (ctx, cx, cz, rx, rz, fill) {
    var pts = [];
    for (var i = 0; i < 28; i++) {
      var a = i / 28 * Math.PI * 2;
      pts.push([cx + rx * Math.cos(a), 0.002, cz + rz * Math.sin(a)]);
    }
    this.poly(ctx, pts, fill);
  };

  Renderer.prototype.drawBackground = function (look) {
    var key = this.W + 'x' + this.H + ':' + look;
    if (key === this.bgKey) return;
    this.bgKey = key;
    var L = LOOKS[look];
    var bg = this.bg;
    bg.width = this.W; bg.height = this.H;
    var ctx = bg.getContext('2d');
    var W = this.W, H = this.H;
    var horizon = this.cy - this.f * Math.tan(this.cam.tilt);
    var rnd = seeded(7);

    // sky
    var sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#7fa8c9');
    sky.addColorStop(1, '#cfdde4');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon + 2);

    // stands: crowd tiers and roof, far behind the bowler
    var zS = 150;
    this.poly(ctx, [[-400, 0, zS], [400, 0, zS], [400, 26, zS], [-400, 26, zS]], '#4c5560');
    this.poly(ctx, [[-400, 22, zS], [400, 22, zS], [400, 27.5, zS - 6], [-400, 27.5, zS - 6]], '#39414a');
    var tiers = ['#56606b', '#5d6772', '#535c66'];
    for (var t = 0; t < 3; t++) {
      this.poly(ctx, [[-400, 2 + t * 6.5, zS - 1], [400, 2 + t * 6.5, zS - 1], [400, 2.4 + t * 6.5, zS - 1], [-400, 2.4 + t * 6.5, zS - 1]], tiers[t]);
    }
    var crowd = ['#c9b79c', '#8f9fb4', '#b26a5a', '#d8d2c4', '#6d7c64', '#a48c6c'];
    for (var i = 0; i < 2600; i++) {
      var cxw = -230 + rnd() * 460, cyw = 1 + rnd() * 20;
      var q = this.project(cxw, cyw, zS - 1.5);
      if (!q || q.x < -4 || q.x > W + 4) continue;
      ctx.fillStyle = crowd[(rnd() * crowd.length) | 0];
      ctx.globalAlpha = 0.55;
      var sz = Math.max(1, 0.45 * q.s);
      ctx.fillRect(q.x, q.y, sz, sz);
    }
    ctx.globalAlpha = 1;

    // outfield with mowing stripes
    var grass = ctx.createLinearGradient(0, horizon, 0, H);
    grass.addColorStop(0, '#4f7d3c');
    grass.addColorStop(1, '#3d6d2f');
    ctx.fillStyle = grass;
    ctx.fillRect(0, horizon - 1, W, H - horizon + 1);
    for (var zb = -2.6, k = 0; zb < 140; zb += 4.2, k++) {
      if (k % 2) this.groundRect(ctx, -300, 300, zb, zb + 4.2, 'rgba(255,255,230,0.055)');
    }

    // boundary rope
    this.groundRect(ctx, -300, 300, 72, 72.25, 'rgba(245,245,240,0.7)', 0.05);

    // sightscreen behind the bowler's arm
    this.poly(ctx, [[-13.5, 0, 80], [13.5, 0, 80], [13.5, 8.8, 80], [-13.5, 8.8, 80]], L.sightEdge);
    this.poly(ctx, [[-13, 0.6, 79.9], [13, 0.6, 79.9], [13, 8.4, 79.9], [-13, 8.4, 79.9]], L.sight);

    // pitch strip
    var pg = ctx.createLinearGradient(0, horizon, 0, H);
    pg.addColorStop(0, '#c6b386');
    pg.addColorStop(1, '#d2bf93');
    this.groundRect(ctx, -P.width / 2, P.width / 2, -2.5, 22.4, pg);
    // texture
    for (var n = 0; n < 1400; n++) {
      var px = (rnd() - 0.5) * P.width, pz = -2.4 + rnd() * 24.6;
      var pq = this.project(px, 0, pz);
      if (!pq) continue;
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(120,95,55,0.18)' : 'rgba(255,248,225,0.18)';
      var ps = Math.max(1, 0.03 * pq.s);
      ctx.fillRect(pq.x, pq.y, ps, ps * 0.5);
    }
    // wear: good-length patches and the bowler's foot holes
    this.groundEllipse(ctx, 0.12, 5.6, 0.75, 2.6, 'rgba(120,96,58,0.16)');
    this.groundEllipse(ctx, 0.0, 14.2, 0.7, 2.4, 'rgba(120,96,58,0.12)');
    this.groundEllipse(ctx, 0.42, 17.5, 0.32, 0.45, 'rgba(95,72,40,0.28)');
    this.groundEllipse(ctx, -0.42, 17.5, 0.32, 0.45, 'rgba(95,72,40,0.22)');

    // crease markings (5 cm white lines)
    var w = 'rgba(250,250,245,0.92)', lw = 0.05;
    // batting end
    this.groundRect(ctx, -1.83, 1.83, 0, lw, w);
    this.groundRect(ctx, -1.32, 1.32, -1.22, -1.22 + lw, w);
    this.groundRect(ctx, -1.32 - lw, -1.32, -2.5, 0, w);
    this.groundRect(ctx, 1.32, 1.32 + lw, -2.5, 0, w);
    // bowling end
    this.groundRect(ctx, -1.83, 1.83, 17.68 - lw, 17.68, w);
    this.groundRect(ctx, -1.32, 1.32, 18.9 - lw / 2, 18.9 + lw / 2, w);
    this.groundRect(ctx, -1.32 - lw, -1.32, 17.68, 21.34, w);
    this.groundRect(ctx, 1.32, 1.32 + lw, 17.68, 21.34, w);
  };

  Renderer.prototype.drawStumps = function (ctx, z) {
    var xs = [-P.stumpHalf + 0.018, 0, P.stumpHalf - 0.018];
    for (var i = 0; i < 3; i++) {
      var x = xs[i];
      this.poly(ctx, [[x - 0.018, 0, z], [x + 0.018, 0, z], [x + 0.018, P.stumpHeight, z], [x - 0.018, P.stumpHeight, z]], '#efe4c8');
      this.poly(ctx, [[x + 0.004, 0, z - 0.001], [x + 0.018, 0, z - 0.001], [x + 0.018, P.stumpHeight, z - 0.001], [x + 0.004, P.stumpHeight, z - 0.001]], 'rgba(120,96,60,0.35)');
    }
    this.poly(ctx, [[xs[0], P.stumpHeight, z], [xs[2], P.stumpHeight, z], [xs[2], P.stumpHeight + 0.014, z], [xs[0], P.stumpHeight + 0.014, z]], '#d9c9a2');
  };

  Renderer.prototype.limb = function (ctx, a, b, width, color) {
    var p = this.project(a[0], a[1], a[2]);
    var q = this.project(b[0], b[1], b[2]);
    if (!p || !q) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * (p.s + q.s) / 2);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  };

  Renderer.prototype.shadow = function (ctx, x, z, rx, alpha) {
    var q = this.project(x, 0, z);
    if (!q) return;
    ctx.fillStyle = 'rgba(30,35,20,' + alpha + ')';
    ctx.beginPath();
    ctx.ellipse(q.x, q.y, rx * q.s, rx * q.s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  Renderer.prototype.drawUmpire = function (ctx, u) {
    ctx.lineCap = 'round';
    this.shadow(ctx, u.hip[0], u.hip[2], 0.4, 0.22);
    var trousers = '#3b4048', shirt = '#dfe6ee', skin = '#c99a77';
    var legs = [u.a, u.b];
    for (var i = 0; i < 2; i++) {
      this.limb(ctx, legs[i].hi, legs[i].kn, 0.15, trousers);
      this.limb(ctx, legs[i].kn, legs[i].ft, 0.13, trousers);
    }
    this.limb(ctx, u.hip, u.neck, 0.42, shirt);
    for (var j = 0; j < 2; j++) {
      this.limb(ctx, legs[j].sh, legs[j].el, 0.1, shirt);
      this.limb(ctx, legs[j].el, legs[j].ha, 0.08, skin);
    }
    var h = this.project(u.head[0], u.head[1], u.head[2]);
    if (h) {
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(h.x, h.y, 0.105 * h.s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e9e4d6';
      ctx.beginPath(); ctx.ellipse(h.x, h.y - 0.07 * h.s, 0.2 * h.s, 0.045 * h.s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(h.x - 0.1 * h.s, h.y - 0.16 * h.s, 0.2 * h.s, 0.09 * h.s);
    }
  };

  Renderer.prototype.drawBowler = function (ctx, j, look) {
    var L = LOOKS[look];
    var skin = '#a87656', shoe = '#ebe8df';
    ctx.lineCap = 'round';
    this.shadow(ctx, j.hip[0], j.hip[2], 0.45, 0.25);

    var free = j.free, bowl = j.bowl;
    // far side first
    this.limb(ctx, free.hi, free.kn, 0.16, L.kitShade);
    this.limb(ctx, free.kn, free.ft, 0.13, L.kitShade);
    this.limb(ctx, free.ft, [free.ft[0], free.ft[1], free.ft[2] - 0.12], 0.1, shoe);
    this.limb(ctx, bowl.hi, bowl.kn, 0.16, L.trousers);
    this.limb(ctx, bowl.kn, bowl.ft, 0.13, L.trousers);
    this.limb(ctx, bowl.ft, [bowl.ft[0], bowl.ft[1], bowl.ft[2] - 0.12], 0.1, shoe);

    this.limb(ctx, free.sh, free.el, 0.1, L.kitShade);
    this.limb(ctx, free.el, free.ha, 0.08, skin);

    // torso
    var a = this.project(free.hi[0], free.hi[1], free.hi[2]);
    var b = this.project(bowl.hi[0], bowl.hi[1], bowl.hi[2]);
    var c = this.project(bowl.sh[0], bowl.sh[1], bowl.sh[2]);
    var d = this.project(free.sh[0], free.sh[1], free.sh[2]);
    if (a && b && c && d) {
      ctx.fillStyle = L.kit;
      ctx.strokeStyle = L.kit;
      ctx.lineWidth = Math.max(1, 0.1 * a.s);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    var h = this.project(j.head[0], j.head[1], j.head[2]);
    if (h) {
      this.limb(ctx, j.neck, j.head, 0.08, skin);
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(h.x, h.y, 0.11 * h.s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b2420';
      ctx.beginPath(); ctx.arc(h.x, h.y - 0.03 * h.s, 0.11 * h.s, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    }

    this.limb(ctx, bowl.sh, bowl.el, 0.1, L.kit);
    this.limb(ctx, bowl.el, bowl.ha, 0.08, skin);
  };

  Renderer.prototype.drawBall = function (ctx, pos, look, alpha, inHand) {
    var q = this.project(pos.x, pos.y, pos.z);
    if (!q) return;
    var L = LOOKS[look];
    var r = Math.max(1.3 * this.dpr, P.r * q.s);
    ctx.globalAlpha = alpha;

    if (!inHand) {
      var sh = this.project(pos.x, 0, pos.z);
      if (sh) {
        var sa = Math.max(0, 0.35 - pos.y * 0.12) * alpha;
        ctx.fillStyle = 'rgba(30,25,15,' + sa.toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(sh.x, sh.y, P.r * sh.s * 1.1, P.r * sh.s * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    var gr = ctx.createRadialGradient(q.x - r * 0.35, q.y - r * 0.4, r * 0.1, q.x, q.y, r);
    gr.addColorStop(0, L.ball[0]);
    gr.addColorStop(0.65, L.ball[1]);
    gr.addColorStop(1, L.ball[2]);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
    if (r > 3.5 * this.dpr) {
      ctx.strokeStyle = L.seam;
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, r * 0.92, r * 0.32, -0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  /* Faint post-ball guide: the path and the pitching mark. */
  Renderer.prototype.drawTrace = function (ctx, d) {
    var pos = CVT.Physics.positionAt;
    ctx.save();
    ctx.setLineDash([4 * this.dpr, 5 * this.dpr]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2 * this.dpr;
    ctx.beginPath();
    var first = true;
    for (var t = 0; t <= d.tBat + 1e-6; t += 0.008) {
      var p = pos(d, t), q = this.project(p.x, p.y, p.z);
      if (!q) continue;
      if (first) { ctx.moveTo(q.x, q.y); first = false; } else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.restore();
    var m = this.project(d.xp, 0, d.zB);
    if (m) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2 * this.dpr;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 0.09 * m.s, 0.09 * m.s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  };

  /**
   * scene = { look, bowler (joints), umpire (joints), ball: {pos, alpha, inHand}|null, trace: delivery|null }
   */
  Renderer.prototype.draw = function (scene) {
    this.drawBackground(scene.look);
    var ctx = this.ctx;
    ctx.drawImage(this.bg, 0, 0);

    // painter's order, far to near
    var items = [
      { z: 21.3, fn: function (r) { r.drawUmpire(ctx, scene.umpire); } },
      { z: P.bowlingStumpsZ, fn: function (r) { r.drawStumps(ctx, P.bowlingStumpsZ); } },
      { z: scene.bowler.bz, fn: function (r) { r.drawBowler(ctx, scene.bowler, scene.look); } }
    ];
    items.sort(function (a, b) { return b.z - a.z; });
    for (var i = 0; i < items.length; i++) items[i].fn(this);

    if (scene.trace) this.drawTrace(ctx, scene.trace);
    if (scene.ball) this.drawBall(ctx, scene.ball.pos, scene.look, scene.ball.alpha, scene.ball.inHand);
  };

  CVT.Renderer = Renderer;
})(window.CVT = window.CVT || {});
