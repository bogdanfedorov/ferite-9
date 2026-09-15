var WORLD_W = 480, WORLD_H = 320;

var W = WORLD_W, H = WORLD_H, LEN = W * H;

var mat;      // речовина
var shade;    // піксельний шум
var life;     // ресурс газів і жару
var clk;      // мітка кадру
var flow;     // напрямок розтікання рідини
var temp;     // температура, °C
var temp2;    // буфер дифузії
var dmg;      // накопичена робота бура
var dmgT;     // коли востаннє били
var dmgList = [];

var simFrame = 0;
var thermoTick = 0;
var produced = new Uint32Array(MAT_COUNT);
var nearHot = new Uint32Array(MAT_COUNT);
var geothermalGradient;

function producedOf(name) { return produced[matId(name)]; }
function nearHotOf(name) { return nearHot[matId(name)]; }

/* Теплові чанки 16x16: дифузію рахуємо лише там, де є перепад. */
/* Туман війни: нерозвідані ділянки не симулюються взагалі.
   Щойно гравець їх відкрив — вони живуть назавжди, навіть коли він пішов. */
var FCS = 8, FSHIFT = 3, FCW, FCH;
var seen;
var fogVal;   // згладжена видимість 0..1
var seenCount = 0;

function isSeen(x, y) { return seen[(y >> FSHIFT) * FCW + (x >> FSHIFT)] === 1; }

function revealChunk(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= FCW || cy >= FCH) return;
  var i = cy * FCW + cx;
  if (seen[i]) return;
  seen[i] = 1;
  seenCount++;
  markHot(cx << FSHIFT, cy << FSHIFT);      // теплове поле тут має ожити
}

function revealAt(x, y) { revealChunk(x >> FSHIFT, y >> FSHIFT); }

/* Радіальні промені від модуля: порода зупиняє погляд, але сама стає видимою.
   Промені йдуть по клітинках, тож пролазять і в штрек завтовшки в одну. */
var RAYS = 220;
var raySin = new Float32Array(RAYS), rayCos = new Float32Array(RAYS);
(function () {
  for (var a = 0; a < RAYS; a++) {
    var ang = a * (Math.PI * 2 / RAYS);
    rayCos[a] = Math.cos(ang);
    raySin[a] = Math.sin(ang);
  }
})();

function revealAround(px, py, R) {
  var pcx = px >> FSHIFT, pcy = py >> FSHIFT;
  for (var cy = pcy - 1; cy <= pcy + 1; cy++) {
    for (var cx = pcx - 1; cx <= pcx + 1; cx++) revealChunk(cx, cy);
  }
  for (var a = 0; a < RAYS; a++) {
    var dx = rayCos[a], dy = raySin[a];
    var x = px + 0.5, y = py + 0.5;
    for (var s = 0; s < R; s++) {
      x += dx; y += dy;
      var ix = x | 0, iy = y | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) break;
      revealAt(ix, iy);
      if (BLOCKING[mat[iy * W + ix]]) break;
    }
  }
}

/* М'яка межа туману: значення підтягуються до 0/1 і згладжуються при рендері. */
function updateFog() {
  for (var i = 0; i < fogVal.length; i++) {
    var target = seen[i] ? 1 : 0;
    var v = fogVal[i];
    if (v !== target) fogVal[i] = v + (target - v) * 0.1;
  }
}

var TCS = 16, TCSHIFT = 4, TCW, TCH;
var hotA, hotB;
function markHot(x, y) {
  var c = (y >> TCSHIFT) * TCW + (x >> TCSHIFT);
  hotA[c] = 1; hotB[c] = 1;
}

function resizeGrid(w, h) {
  W = w; H = h; LEN = w * h;

  mat = new Uint8Array(LEN);
  shade = new Uint8Array(LEN);
  life = new Uint8Array(LEN);
  clk = new Uint8Array(LEN);
  flow = new Uint8Array(LEN);
  temp = new Float32Array(LEN);
  temp2 = new Float32Array(LEN);
  dmg = new Uint16Array(LEN);
  dmgT = new Int32Array(LEN);
  dmgList = [];
  geothermalGradient = new Float32Array(H);

  FCW = (W + FCS - 1) >> FSHIFT;
  FCH = (H + FCS - 1) >> FSHIFT;
  seen = new Uint8Array(FCW * FCH);
  fogVal = new Float32Array(FCW * FCH);
  seenCount = 0;

  TCW = (W + TCS - 1) >> TCSHIFT;
  TCH = (H + TCS - 1) >> TCSHIFT;
  hotA = new Uint8Array(TCW * TCH);
  hotB = new Uint8Array(TCW * TCH);
}

resizeGrid(WORLD_W, WORLD_H);

/* ---------- випадковість ---------- */

var _seed = 0x9e3779b9;
function srand(s) { _seed = s >>> 0; }
function rnd() {
  _seed ^= _seed << 13; _seed >>>= 0;
  _seed ^= _seed >> 17;
  _seed ^= _seed << 5; _seed >>>= 0;
  return _seed / 4294967296;
}
function rndInt(n) { return (rnd() * n) | 0; }

function hash2(x, y, s) {
  var h = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 362437;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noise2(x, y, s) {
  var xi = Math.floor(x), yi = Math.floor(y);
  var tx = smooth(x - xi), ty = smooth(y - yi);
  var a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  var c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
function fbm(x, y, s, oct) {
  var v = 0, amp = 0.5, f = 1;
  for (var i = 0; i < oct; i++) { v += noise2(x * f, y * f, s + i * 31) * amp; amp *= 0.5; f *= 2; }
  return v;
}

function inBounds(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
function idx(x, y) { return y * W + x; }
function getMat(index) { return mat[index] }
function getMatByCords(x, y) { return mat[idx(x, y)] }
function matAt(x, y) { return inBounds(x, y) ? mat[y * W + x] : EDGE_ID; }
function tempAt(x, y) { return inBounds(x, y) ? temp[y * W + x] : 22; }

function setCell(x, y, m) {
  if (!inBounds(x, y)) return;
  var i = y * W + x;
  mat[i] = m;
  shade[i] = (rnd() * 256) | 0;
  dmg[i] = 0;
  life[i] = LIFE_RND[m] ? LIFE_BASE[m] + rndInt(LIFE_RND[m]) : LIFE_BASE[m];
  markHot(x, y);
}

function setCellHot(x, y, m, t) {
  setCell(x, y, m);
  if (inBounds(x, y)) temp[y * W + x] = t;
}

function displaceCell(x, y) {
  if (!inBounds(x, y)) return false;
  var i = y * W + x;
  var m = mat[i];
  if (OPEN[m]) return true;
  if (STATE[m] !== MT.LIQUID) return false;
  var hot = temp[i];
  for (var r = 1; r <= 4; r++) {
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (dx !== -r && dx !== r && dy !== -r && dy !== r) continue;
        var nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        if (OPEN[mat[ny * W + nx]]) {
          setCellHot(nx, ny, m, hot);
          setCell(x, y, VOID_ID);
          return true;
        }
      }
    }
  }
  return false;
}

function dropLoose(x, y, m, hot) {
  for (var r = 0; r <= 2; r++) {
    for (var a = 0; a < 12; a++) {
      var px = x + rndInt(r * 2 + 1) - r;
      var py = y + rndInt(r * 2 + 1) - r;
      if (!inBounds(px, py)) continue;
      if (OPEN[mat[py * W + px]]) {
        setCellHot(px, py, m, hot);
        return true;
      }
    }
  }
  setCellHot(x, y, m, hot);
  return false;
}

function spawnNear(x, y, m, radius) {
  for (var r = 0; r <= radius; r++) {
    for (var a = 0; a < 10; a++) {
      var px = x + rndInt(r * 2 + 1) - r;
      var py = y + rndInt(r * 2 + 1) - r;
      if (!inBounds(px, py)) continue;
      if (OPEN[mat[py * W + px]]) { setCell(px, py, m); return true; }
    }
  }
  return false;
}


function markDamage(i) {
  if (dmg[i] === 0) dmgList.push(i);
  dmgT[i] = simFrame;
}

function decayDamage() {
  if (!dmgList.length) return;
  var keep = [];
  for (var n = 0; n < dmgList.length; n++) {
    var i = dmgList[n];
    if (dmg[i] === 0) continue;
    if (simFrame - dmgT[i] > 120) dmg[i] = 0;
    else keep.push(i);
  }
  dmgList = keep;
}

var cargoPad = { x: 0, y: 0, w: 0, h: 0 };
var cargo = {};

function resetCargo() {
  cargo = {};
  var d = questDeliver();
  for (var i = 0; i < d.length; i++) cargo[d[i].key] = 0;
}

function tickCargoPad() {
  for (var y = cargoPad.y; y < cargoPad.y + cargoPad.h; y++) {
    for (var x = cargoPad.x; x < cargoPad.x + cargoPad.w; x++) {
      if (!inBounds(x, y)) continue;
      var m = mat[y * W + x];
      var group = CARGO[m];
      if (!group) continue;
      var want = questDeliver();
      for (var c = 0; c < want.length; c++) {
        if (want[c].key !== group) continue;
        cargo[group]++;
        setCell(x, y, VOID_ID);
        break;
      }
    }
  }
}

var surfaceTop = 40;

function blob(cx, cy, r, m, mask) {
  var r2 = r * r;
  for (var y = cy - r; y <= cy + r; y++) {
    for (var x = cx - r; x <= cx + r; x++) {
      if (!inBounds(x, y)) continue;
      var dx = x - cx, dy = y - cy;
      var d = dx * dx + dy * dy * 1.35;
      var wob = fbm(x * 0.12, y * 0.12, 707, 2) * 0.55 + 0.72;
      if (d > r2 * wob) continue;
      var cur = mat[y * W + x];
      if (mask && mask.indexOf(cur) < 0) continue;
      setCell(x, y, m);
    }
  }
}

function bandY(f0, f1) {
  var top = Math.round(H * f0);
  return top + rndInt(Math.round(H * f1) - top);
}

function deposits(n) {
  return Math.max(1, Math.round(n * LEN / (WORLD_W * WORLD_H)));
}

function generateWorld(seed, w, h) {
  if (w > 0 && h > 0 && (w !== W || h !== H)) {
    resizeGrid(w, h);
    resizeFactory();
  }
  srand(seed);
  var VOID = VOID_ID;
  var ROCK = matId('rock'), SAND = matId('sand'), HARDPAN = matId('hardpan');
  var COAL_SEAM = matId('coal_seam'), ORE_SEAM = matId('ore_seam');
  var WATER = matId('water'), LAVA = matId('lava');

  mat.fill(VOID);
  life.fill(0);
  flow.fill(0);
  dmg.fill(0);
  dmgList.length = 0;
  produced.fill(0);
  nearHot.fill(0);
  var x, y, i;

  for (i = 0; i < LEN; i++) shade[i] = (rnd() * 256) | 0;

  for (y = 0; y < H; y++) geothermalGradient[y] = 18 + (y / H) * 46;

  var surf = new Int32Array(W);
  for (x = 0; x < W; x++) {
    var s = fbm(x * 0.018, 0.5, 11, 3);
    var dune = Math.sin(x * 0.07) * 3;
    surf[x] = Math.round(H * 0.1625 + s * 26 + dune);
  }
  surfaceTop = 999;
  for (x = 0; x < W; x++) if (surf[x] < surfaceTop) surfaceTop = surf[x];

  for (x = 0; x < W; x++) {
    var top = surf[x];
    for (y = top; y < H; y++) {
      var depth = y - top;
      var m;
      if (depth < 7 + fbm(x * 0.05, 3, 21, 2) * 9) m = SAND;
      else if (depth < 22 + fbm(x * 0.04, 9, 33, 2) * 14) m = HARDPAN;
      else m = ROCK;
      mat[y * W + x] = m;
    }
  }

  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      if (y < surf[x] + 16 || y > H - 14) continue;
      var n = fbm(x * 0.028, y * 0.045, 51, 3);
      var n2 = fbm(x * 0.013, y * 0.02, 77, 2);
      if (n > 0.47 && n < 0.565 && n2 > 0.33) mat[y * W + x] = VOID;
      else if (n2 > 0.68 && n > 0.42 && n < 0.62) mat[y * W + x] = VOID;
    }
  }

  var rockOnly = [ROCK, HARDPAN];
  var nSand = deposits(46), nCoal = deposits(44), nOre = deposits(38);
  var nWater = deposits(16), nLava = deposits(12);
  for (i = 0; i < nSand; i++) blob(rndInt(W), bandY(0.28125, 0.875), 7 + rndInt(9), SAND, rockOnly);
  for (i = 0; i < nCoal; i++) blob(rndInt(W), bandY(0.328125, 0.875), 5 + rndInt(7), COAL_SEAM, rockOnly);
  for (i = 0; i < nOre; i++) blob(rndInt(W), bandY(0.4375, 0.890625), 4 + rndInt(6), ORE_SEAM, rockOnly);
  for (i = 0; i < nWater; i++) blob(rndInt(W), bandY(0.375, 0.75), 5 + rndInt(6), WATER, [VOID]);
  for (i = 0; i < nLava; i++) blob(rndInt(W), bandY(0.8125, 0.9375), 4 + rndInt(7), LAVA, [VOID, ROCK]);

  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    if (x < 3 || x > W - 4 || y > H - 5) mat[y * W + x] = EDGE_ID;
  }

  var bx = (W >> 1) - 12, by = surf[W >> 1] - 1;
  for (x = bx; x < bx + 24; x++) {
    for (y = by; y < by + 3; y++) if (inBounds(x, y)) mat[y * W + x] = ROCK;
    for (y = by - 9; y < by; y++) if (inBounds(x, y)) mat[y * W + x] = VOID;
  }

  cargoPad = { x: bx + 8, y: by - 3, w: 8, h: 3 };
  for (y = by - 3; y < by; y++) {
    if (inBounds(cargoPad.x - 1, y)) mat[y * W + cargoPad.x - 1] = ROCK;
    if (inBounds(cargoPad.x + cargoPad.w, y)) mat[y * W + cargoPad.x + cargoPad.w] = ROCK;
  }
  resetCargo();

  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      i = y * W + x;
      var mm = mat[i];
      temp[i] = EMITS[mm] > 0 ? EMITS[mm] : geothermalGradient[y];
      temp2[i] = temp[i];
    }
  }

  clk.fill(0);
  hotA.fill(1);
  hotB.fill(1);

  seen.fill(0);
  fogVal.fill(0);
  seenCount = 0;
  for (x = 0; x < W; x++) {
    var limit = surf[x] + 10;
    for (y = 0; y <= limit && y < H; y += FCS) revealChunk(x >> FSHIFT, y >> FSHIFT);
    revealChunk(x >> FSHIFT, limit >> FSHIFT);
  }
  for (x = 0; x < FCW; x++) fogVal[x] = 0;
  for (var fi = 0; fi < seen.length; fi++) if (seen[fi]) fogVal[fi] = 1;

  return { spawnX: W >> 1, spawnY: by - 6 };
}


function sinksInto(m, target) {
  return ISVOID[target] || (FLUID[target] && DENS[m] > DENS[target]);
}

function risesInto(m, target) {
  return ISVOID[target] || (FLUID[target] && DENS[m] < DENS[target]);
}

function swapCells(x1, y1, x2, y2, par) {
  var i = y1 * W + x1, j = y2 * W + x2;
  var t = mat[i]; mat[i] = mat[j]; mat[j] = t;
  t = shade[i]; shade[i] = shade[j]; shade[j] = t;
  t = life[i]; life[i] = life[j]; life[j] = t;
  t = flow[i]; flow[i] = flow[j]; flow[j] = t;
  var f = temp[i]; temp[i] = temp[j]; temp[j] = f;
  t = dmg[i]; dmg[i] = dmg[j]; dmg[j] = t;
  clk[i] = par; clk[j] = par;
  var c = (y2 >> FSHIFT) * FCW + (x2 >> FSHIFT);
  if (!seen[c]) { seen[c] = 1; seenCount++; markHot(x2, y2); }
}

function stepLiquid(i, x, y, m, par) {
  if (y + 1 < H) {
    var under = mat[i + W];
    if (MOLTEN[m] && MOVABLE[under] && POROUS[under] && rnd() < 0.3) {
      swapCells(x, y, x, y + 1, par);
      return;
    }
    if (sinksInto(m, under)) { swapCells(x, y, x, y + 1, par); return; }
  }

  var d = flow[i] ? 1 : -1;
  if (y + 1 < H) {
    for (var s = 0; s < 2; s++) {
      if (x + d >= 0 && x + d < W && sinksInto(m, mat[i + W + d])) {
        swapCells(x, y, x + d, y + 1, par); return;
      }
      d = -d;
    }
  }

  d = flow[i] ? 1 : -1;
  var reach = FLOW_REACH[m];
  var best = 0;
  for (var r = 1; r <= reach; r++) {
    var tx = x + d * r;
    if (tx < 0 || tx >= W) break;
    var j = y * W + tx;
    if (!sinksInto(m, mat[j])) break;
    best = r;
    if (y + 1 < H && sinksInto(m, mat[j + W])) break;
  }
  if (best) swapCells(x, y, x + d * best, y, par);
  else flow[i] = flow[i] ? 0 : 1;
}

function stepGas(i, x, y, m, par) {
  var l = life[i];
  if (l <= 1) {
    var into = EXPIRE_INTO[m];
    setCell(x, y, into && rnd() < EXPIRE_P[m] ? into : VOID_ID);
    return;
  }
  life[i] = l - 1;

  if (y > 0 && risesInto(m, mat[i - W]) && rnd() < 0.8) { swapCells(x, y, x, y - 1, par); return; }
  var d = rnd() < 0.5 ? 1 : -1;
  for (var s = 0; s < 2; s++) {
    if (x + d >= 0 && x + d < W) {
      if (y > 0 && risesInto(m, mat[i - W + d])) { swapCells(x, y, x + d, y - 1, par); return; }
      if (risesInto(m, mat[i + d])) { swapCells(x, y, x + d, y, par); return; }
    }
    d = -d;
  }
}

function produceCell(x, y, to) {
  setCell(x, y, to);
  produced[to]++;
}

function reactAt(i, x, y, base, nt) {
  for (var k = 0; k < 4; k++) {
    var j = k === 0 ? i - 1 : (k === 1 ? i + 1 : (k === 2 ? i - W : i + W));
    var p = base + mat[j];
    var into = REACT_INTO[p];
    if (!into) continue;
    var gives = REACT_GIVES[p];
    var gt = REACT_GIVES_T[p] || temp[j];
    var rt = REACT_T[p] || nt;
    produceCell(x, y, into);
    temp[i] = rt; temp2[i] = rt;
    if (gives) {
      produceCell(j % W, (j / W) | 0, gives);
      temp[j] = gt; temp2[j] = gt;
    }
    return true;
  }
  return false;
}

function thermoPass() {
  thermoTick++;
  var _mat = mat, _t = temp, _n = temp2, _coef = HEAT_COEF, _rad = RAD_COEF, _relax = RELAX,
    _emit = EMITS, _hot = HOT_T, _cold = COLD_T, _life = life, _mc = MAT_COUNT;

  _n.set(_t);
  hotB.fill(0);

  for (var cy = 0; cy < TCH; cy++) {
    for (var cx = 0; cx < TCW; cx++) {
      var live = 0;
      for (var oy = -1; oy <= 1 && !live; oy++) {
        var ny = cy + oy;
        if (ny < 0 || ny >= TCH) continue;
        for (var ox = -1; ox <= 1; ox++) {
          var nx2 = cx + ox;
          if (nx2 < 0 || nx2 >= TCW) continue;
          if (hotA[ny * TCW + nx2]) { live = 1; break; }
        }
      }
      if (!live) continue;

      var f0 = (cy << 1) * FCW + (cx << 1);
      if (!seen[f0] && !seen[f0 + 1] && !seen[f0 + FCW] && !seen[f0 + FCW + 1]) continue;

      var x0 = cx * TCS, y0 = cy * TCS;
      var x1 = x0 + TCS, y1 = y0 + TCS;
      if (x0 < 1) x0 = 1;
      if (y0 < 1) y0 = 1;
      if (x1 > W - 1) x1 = W - 1;
      if (y1 > H - 1) y1 = H - 1;
      var stillHot = 0;

      for (var y = y0; y < y1; y++) {
        var row = y * W;
        var amb = geothermalGradient[y];
        var ambK = (amb + 273) * 0.001;
        ambK *= ambK; ambK *= ambK;
        for (var x = x0; x < x1; x++) {
          var i = row + x;
          var m = _mat[i];
          var t = _t[i];
          var base = m * _mc;
          var ml = _mat[i - 1], mr = _mat[i + 1], mu = _mat[i - W], md = _mat[i + W];
          var nt = t
            + _coef[base + ml] * (_t[i - 1] - t)
            + _coef[base + mr] * (_t[i + 1] - t)
            + _coef[base + mu] * (_t[i - W] - t)
            + _coef[base + md] * (_t[i + W] - t);
          nt += (amb - nt) * _relax[m];

          if (nt > RAD_MIN) {
            var rad = _rad[base + ml] + _rad[base + mr] + _rad[base + mu] + _rad[base + md];
            if (rad > 0) {
              var k = (nt + 273) * 0.001;
              k *= k; k *= k;
              nt -= rad * (k - ambK);
              if (nt < amb) nt = amb;
            }
          }
          var hs = _emit[m];
          if (hs > nt) nt = hs;
          _n[i] = nt;

          var diff = nt - amb;
          if (diff > 1.2 || diff < -1.2) stillHot = 1;

          if (REACTIVE[m] && reactAt(i, x, y, base, nt)) continue;

          var hp = _hot[m];
          if (hp > 0) {
            if (nt > hp) { produceCell(x, y, HOT_INTO[m]); continue; }
            if (nt > hp * NEAR_HOT) nearHot[m]++;
          }

          var cp = _cold[m];
          var hold = LATENT[m];
          if (cp > 0 && nt < cp) {
            if (hold > 0) {
              var lat = _life[i] + 1;
              if (lat >= hold) { produceCell(x, y, COLD_INTO[m]); continue; }
              _life[i] = lat;
              _n[i] = cp - 4;
              stillHot = 1;
            } else { produceCell(x, y, COLD_INTO[m]); continue; }
          } else if (hold > 0 && _life[i]) {
            _life[i] = 0;
          }

          var every = BURN_EVERY[m];
          if (every > 0 && thermoTick % every === 0) {
            if (_life[i] <= 1) { produceCell(x, y, BURN_INTO[m]); continue; }
            _life[i]--;
          }
        }
      }
      if (stillHot) hotB[cy * TCW + cx] = 1;
    }
  }

  var tmp = temp; temp = temp2; temp2 = tmp;
  var th = hotA; hotA = hotB; hotB = th;
}

function simulate() {
  simFrame++;
  var par = simFrame & 1;
  var ltr = (simFrame & 1) === 0;
  var _mat = mat, _clk = clk, _state = STATE, _seen = seen, _block = BLOCKING, _rigid = RIGID;
  var lcg = (simFrame * 1103515245 + 12345) | 0;

  for (var fy = FCH - 1; fy >= 0; fy--) {
    for (var fk = 0; fk < FCW; fk++) {
      var fx = ltr ? fk : FCW - 1 - fk;
      if (!_seen[fy * FCW + fx]) continue;
      var cx0 = fx << FSHIFT, cy0 = fy << FSHIFT;

      for (var y = cy0 + FCS - 1; y >= cy0; y--) {
        var row = y * W;
        var down = y + 1 < H;
        for (var k = 0; k < FCS; k++) {
          var x = ltr ? cx0 + k : cx0 + FCS - 1 - k;
          var i = row + x;
          var m = _mat[i];
          if (ISVOID[m] || _rigid[m]) continue;
          if (_clk[i] === par) continue;
          var st = _state[m];

          if (st === MT.POWDER) {
            if (!down) continue;
            var bm = _mat[i + W];
            if (sinksInto(m, bm)) {
              swapCells(x, y, x, y + 1, par);
              continue;
            }
            if (GRIPS[bm]) continue;
            lcg = (lcg * 1664525 + 1013904223) | 0;
            var d = (lcg & 1024) ? 1 : -1;
            for (var s = 0; s < 2; s++) {
              var nx = x + d;
              if (nx >= 0 && nx < W && sinksInto(m, _mat[i + W + d]) && !_block[_mat[i + d]]) {
                swapCells(x, y, nx, y + 1, par);
                break;
              }
              d = -d;
            }
          } else if (st === MT.LIQUID) stepLiquid(i, x, y, m, par);
          else stepGas(i, x, y, m, par);
        }
      }

    }
  }

  if (simFrame & 1) thermoPass();
  if ((simFrame & 63) === 0) decayDamage();
}
