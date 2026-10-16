var WORLD_W = 480,
  WORLD_H = 320;

var W = WORLD_W,
  H = WORLD_H,
  LEN = W * H;

var mat;
var shade;
var life;
var clk;
var flow;
var temp;
var temp2;
var dmg;
var dmgT;
var dmgList = [];

var simFrame = 0;
var thermoTick = 0;
var produced = new Uint32Array(MAT_COUNT);
var nearHot = new Uint32Array(MAT_COUNT);
var geothermalGradient;

function producedOf(name) {
  return produced[matId(name)];
}
function nearHotOf(name) {
  return nearHot[matId(name)];
}

var FCS = 8,
  FSHIFT = 3,
  FCW,
  FCH;
var seen;
var fogVal;
var seenCount = 0;

function revealChunk(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= FCW || cy >= FCH) return;
  const i = cy * FCW + cx;
  if (seen[i]) return;
  seen[i] = 1;
  seenCount++;
  markHot(cx << FSHIFT, cy << FSHIFT);
}

function revealAt(x, y) {
  revealChunk(x >> FSHIFT, y >> FSHIFT);
}

var RAYS = 220;
var raySin = new Float32Array(RAYS),
  rayCos = new Float32Array(RAYS);
(() => {
  for (let a = 0; a < RAYS; a++) {
    const ang = a * ((Math.PI * 2) / RAYS);
    rayCos[a] = Math.cos(ang);
    raySin[a] = Math.sin(ang);
  }
})();

function revealAround(px, py, R) {
  const pcx = px >> FSHIFT,
    pcy = py >> FSHIFT;
  for (let cy = pcy - 1; cy <= pcy + 1; cy++) {
    for (let cx = pcx - 1; cx <= pcx + 1; cx++) revealChunk(cx, cy);
  }
  for (let a = 0; a < RAYS; a++) {
    const dx = rayCos[a],
      dy = raySin[a];
    let x = px + 0.5,
      y = py + 0.5;
    for (let s = 0; s < R; s++) {
      x += dx;
      y += dy;
      const ix = x | 0,
        iy = y | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) break;
      revealAt(ix, iy);
      if (BLOCKING[mat[iy * W + ix]]) break;
    }
  }
}

function updateFog() {
  for (let i = 0; i < fogVal.length; i++) {
    const target = seen[i] ? 1 : 0;
    const v = fogVal[i];
    if (v !== target) fogVal[i] = v + (target - v) * 0.1;
  }
}

var TCS = 16,
  TCSHIFT = 4,
  TCW,
  TCH;
var hotA, hotB;
function markHot(x, y) {
  const c = (y >> TCSHIFT) * TCW + (x >> TCSHIFT);
  hotA[c] = 1;
  hotB[c] = 1;
}

function resizeGrid(w, h) {
  W = w;
  H = h;
  LEN = w * h;

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

var _seed = 0x9e3779b9;
function srand(s) {
  _seed = s >>> 0;
}
function rnd() {
  _seed ^= _seed << 13;
  _seed >>>= 0;
  _seed ^= _seed >> 17;
  _seed ^= _seed << 5;
  _seed >>>= 0;
  return _seed / 4294967296;
}
function rndInt(n) {
  return (rnd() * n) | 0;
}

function hash2(x, y, s) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 362437;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}
function noise2(x, y, s) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const tx = smooth(x - xi),
    ty = smooth(y - yi);
  const a = hash2(xi, yi, s),
    b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s),
    d = hash2(xi + 1, yi + 1, s);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
function fbm(x, y, s, oct) {
  let v = 0,
    amp = 0.5,
    f = 1;
  for (let i = 0; i < oct; i++) {
    v += noise2(x * f, y * f, s + i * 31) * amp;
    amp *= 0.5;
    f *= 2;
  }
  return v;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < W && y < H;
}
function idx(x, y) {
  return y * W + x;
}
function matAt(x, y) {
  return inBounds(x, y) ? mat[y * W + x] : EDGE_ID;
}
function tempAt(x, y) {
  return inBounds(x, y) ? temp[y * W + x] : 22;
}

function lifeOf(m) {
  return LIFE_RND[m] ? LIFE_BASE[m] + rndInt(LIFE_RND[m]) : LIFE_BASE[m];
}

function setCell(x, y, m) {
  if (!inBounds(x, y)) return;
  const i = y * W + x;
  mat[i] = m;
  shade[i] = (rnd() * 256) | 0;
  dmg[i] = 0;
  life[i] = lifeOf(m);
  markHot(x, y);
}

function setCellHot(x, y, m, t) {
  setCell(x, y, m);
  if (inBounds(x, y)) temp[y * W + x] = t;
}

function putCell(i, m, t) {
  setCellHot(i % W, (i / W) | 0, m, t);
}

function paintCell(i, m) {
  mat[i] = m;
  life[i] = lifeOf(m);
}

function moveCell(i, j) {
  putCell(j, mat[i], temp[i]);
  setCell(i % W, (i / W) | 0, VOID_ID);
}

function openAt(x, y) {
  if (!inBounds(x, y)) return -1;
  const i = y * W + x;
  return OPEN[mat[i]] ? i : -1;
}

function isOpenCell(i) {
  return OPEN[mat[i]] === 1;
}

function ringFind(x, y, r, fit) {
  for (let dy = -r; dy <= r; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= H) continue;
    const step = dy === -r || dy === r ? 1 : 2 * r;
    for (let dx = -r; dx <= r; dx += step) {
      const nx = x + dx;
      if (nx >= 0 && nx < W && fit(ny * W + nx)) return ny * W + nx;
    }
  }
  return -1;
}

function findNear(x, y, r0, r1, fit) {
  for (let r = r0; r <= r1; r++) {
    const j = ringFind(x, y, r, fit);
    if (j >= 0) return j;
  }
  return -1;
}

function openNear(x, y, r0, r1) {
  return findNear(x, y, r0, r1, isOpenCell);
}

function scatterOpen(x, y, maxR, tries) {
  for (let r = 0; r <= maxR; r++) {
    for (let a = 0; a < tries; a++) {
      const j = openAt(x + rndInt(r * 2 + 1) - r, y + rndInt(r * 2 + 1) - r);
      if (j >= 0) return j;
    }
  }
  return -1;
}

function displaceCell(x, y) {
  if (!inBounds(x, y)) return false;
  const i = y * W + x;
  const m = mat[i];
  if (OPEN[m]) return true;
  if (STATE[m] !== MT.LIQUID) return false;
  const j = openNear(x, y, 1, 4);
  if (j < 0) return false;
  moveCell(i, j);
  return true;
}

function dropLoose(x, y, m, hot) {
  const j = scatterOpen(x, y, 2, 12);
  if (j < 0) {
    setCellHot(x, y, m, hot);
    return false;
  }
  putCell(j, m, hot);
  return true;
}

function spawnNear(x, y, m, radius) {
  const j = scatterOpen(x, y, radius, 10);
  if (j < 0) return false;
  setCell(j % W, (j / W) | 0, m);
  return true;
}

function markDamage(i) {
  if (dmg[i] === 0) dmgList.push(i);
  dmgT[i] = simFrame;
}

function decayDamage() {
  if (!dmgList.length) return;
  const keep = [];
  for (let n = 0; n < dmgList.length; n++) {
    const i = dmgList[n];
    if (dmg[i] === 0) continue;
    if (simFrame - dmgT[i] > 120) dmg[i] = 0;
    else keep.push(i);
  }
  dmgList = keep;
}

var cargoPad = null;

function setCargoPad(rect) {
  cargoPad = rect;
}

var surfaceTop = 40;

function beginWorld(seed, w, h) {
  if (w > 0 && h > 0 && (w !== W || h !== H)) resizeGrid(w, h);
  srand(seed);
  mat.fill(VOID_ID);
  life.fill(LIFE_BASE[VOID_ID]);
  flow.fill(0);
  dmg.fill(0);
  dmgList.length = 0;
  produced.fill(0);
  nearHot.fill(0);
  seen.fill(0);
  fogVal.fill(0);
  seenCount = 0;
}

function randomizeShade() {
  for (let i = 0; i < LEN; i++) shade[i] = (rnd() * 256) | 0;
}

function finishWorld(tempOf) {
  cargoPad = null;
  for (let y = 0; y < H; y++) {
    for (let i = y * W; i < (y + 1) * W; i++) {
      temp[i] = tempOf(mat[i], y);
      temp2[i] = temp[i];
    }
  }
  clk.fill(0);
  hotA.fill(1);
  hotB.fill(1);
}

function paintRect(x0, y0, x1, y1, m) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (inBounds(x, y)) paintCell(y * W + x, m);
    }
  }
}

var CHUNK_SHIFT = 6,
  CHUNK_SIZE = 1 << CHUNK_SHIFT,
  CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
var REF_W = 480,
  REF_H = 320;
var SURFACE_BASE = 52;
var CAVE_FLOOR_MARGIN = 14;
var SAND_ID = matId('sand'),
  HARDPAN_ID = matId('hardpan'),
  ROCK_ID = matId('rock');
var DEPOSIT_SLOTS = 3;
var DEPOSIT_KINDS = [
  { id: SAND_ID, n: 46, y0: 90, y1: 280, r0: 7, rn: 9, mask: [ROCK_ID, HARDPAN_ID] },
  { id: matId('coal_seam'), n: 44, y0: 105, y1: 280, r0: 5, rn: 7, mask: [ROCK_ID, HARDPAN_ID] },
  { id: matId('ore_seam'), n: 38, y0: 140, y1: 285, r0: 4, rn: 6, mask: [ROCK_ID, HARDPAN_ID] },
  { id: matId('water'), n: 16, y0: 120, y1: 240, r0: 5, rn: 6, mask: [VOID_ID] },
  { id: matId('lava'), n: 12, y0: 260, y1: 300, r0: 4, rn: 7, mask: [VOID_ID, ROCK_ID] },
];
var BLOB_REACH = 1.3;

function regionRand(seed, rx, ry, salt) {
  return hash2(rx, ry, (seed ^ Math.imul(salt + 1, 0x9e3779b1)) | 0);
}

function geothermalAt(wy) {
  return 18 + Math.max(0, wy) * (46 / REF_H);
}

function surfaceAt(seed, wx) {
  const s = fbm(wx * 0.018, 0.5, seed + 11, 3);
  const dune = Math.sin(wx * 0.07) * 3;
  return Math.round(SURFACE_BASE + s * 26 + dune);
}

function sandDepthAt(seed, wx) {
  return 7 + fbm(wx * 0.05, 3, seed + 21, 2) * 9;
}

function hardpanDepthAt(seed, wx) {
  return 22 + fbm(wx * 0.04, 9, seed + 33, 2) * 14;
}

function isCaveAt(seed, wx, wy) {
  const n = fbm(wx * 0.028, wy * 0.045, seed + 51, 3);
  const n2 = fbm(wx * 0.013, wy * 0.02, seed + 77, 2);
  return (n > 0.47 && n < 0.565 && n2 > 0.33) || (n2 > 0.68 && n > 0.42 && n < 0.62);
}

function regionBlobs(seed, rx, ry, k, out) {
  const kind = DEPOSIT_KINDS[k];
  const perRegion = (kind.n * CHUNK_AREA) / (REF_W * (kind.y1 - kind.y0));
  const p = Math.min(1, perRegion / DEPOSIT_SLOTS);
  for (let s = 0; s < DEPOSIT_SLOTS; s++) {
    const salt = k * 16 + s * 4;
    if (regionRand(seed, rx, ry, salt) >= p) continue;
    const x = rx * CHUNK_SIZE + ((regionRand(seed, rx, ry, salt + 1) * CHUNK_SIZE) | 0);
    const y = ry * CHUNK_SIZE + ((regionRand(seed, rx, ry, salt + 2) * CHUNK_SIZE) | 0);
    if (y < kind.y0 || y >= kind.y1) continue;
    const r = kind.r0 + ((regionRand(seed, rx, ry, salt + 3) * kind.rn) | 0);
    out.push({ id: kind.id, mask: kind.mask, x, y, r, r2: r * r });
  }
}

function blobsNear(seed, cx, cy) {
  const found = [];
  for (let k = 0; k < DEPOSIT_KINDS.length; k++) {
    for (let ry = cy - 1; ry <= cy + 1; ry++) {
      for (let rx = cx - 1; rx <= cx + 1; rx++) regionBlobs(seed, rx, ry, k, found);
    }
  }
  const x0 = cx * CHUNK_SIZE,
    y0 = cy * CHUNK_SIZE;
  return found.filter((b) => {
    const reach = b.r * BLOB_REACH + 1;
    return (
      b.x + reach >= x0 &&
      b.x - reach < x0 + CHUNK_SIZE &&
      b.y + reach >= y0 &&
      b.y - reach < y0 + CHUNK_SIZE
    );
  });
}

function applyBlobs(seed, blobs, wx, wy, m) {
  for (let n = 0; n < blobs.length; n++) {
    const b = blobs[n];
    const dx = wx - b.x,
      dy = wy - b.y;
    const d = dx * dx + dy * dy * 1.35;
    if (d > b.r2 * 1.27 || b.mask.indexOf(m) < 0) continue;
    const wob = fbm(wx * 0.12, wy * 0.12, seed + 707, 2) * 0.55 + 0.72;
    if (d <= b.r2 * wob) m = b.id;
  }
  return m;
}

function layerAt(wy, surf, sandD, panD) {
  if (wy < surf) return VOID_ID;
  const depth = wy - surf;
  if (depth < sandD) return SAND_ID;
  if (depth < panD) return HARDPAN_ID;
  return ROCK_ID;
}

function generateChunk(seed, cx, cy, caveFloor) {
  const S = CHUNK_SIZE;
  const chunk_mat = new Uint8Array(CHUNK_AREA).fill(VOID_ID);
  const chunk_shade = new Uint8Array(CHUNK_AREA);
  const floorY = caveFloor === undefined ? Infinity : caveFloor;
  const blobs = blobsNear(seed, cx, cy);
  const x0 = cx * S,
    y0 = cy * S;
  for (let x = 0; x < S; x++) {
    const wx = x0 + x;
    const surf = surfaceAt(seed, wx);
    const sandD = sandDepthAt(seed, wx),
      panD = hardpanDepthAt(seed, wx);
    for (let y = 0; y < S; y++) {
      const wy = y0 + y;
      let m = layerAt(wy, surf, sandD, panD);
      if (m !== VOID_ID && wy >= surf + 16 && wy <= floorY && isCaveAt(seed, wx, wy)) m = VOID_ID;
      chunk_mat[y * S + x] = applyBlobs(seed, blobs, wx, wy, m);
      chunk_shade[y * S + x] = (hash2(wx, wy, seed + 999) * 256) | 0;
    }
  }
  return { mat: chunk_mat, shade: chunk_shade };
}

function stampChunk(chunk, cx, cy) {
  const S = CHUNK_SIZE;
  const x0 = cx * S,
    y0 = cy * S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inBounds(x0 + x, y0 + y)) continue;
      const i = (y0 + y) * W + x0 + x;
      paintCell(i, chunk.mat[y * S + x]);
      shade[i] = chunk.shade[y * S + x];
    }
  }
}

function stampWorld(seed) {
  const caveFloor = H - CAVE_FLOOR_MARGIN;
  const cw = Math.ceil(W / CHUNK_SIZE),
    ch = Math.ceil(H / CHUNK_SIZE);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) stampChunk(generateChunk(seed, cx, cy, caveFloor), cx, cy);
  }
}

function surfaceRow(seed) {
  const surf = new Int32Array(W);
  for (let x = 0; x < W; x++) surf[x] = surfaceAt(seed, x);
  return surf;
}

function revealSurface(surf) {
  for (let x = 0; x < W; x++) {
    const limit = surf[x] + 10;
    for (let y = 0; y <= limit && y < H; y += FCS) revealChunk(x >> FSHIFT, y >> FSHIFT);
    revealChunk(x >> FSHIFT, limit >> FSHIFT);
  }
  for (let i = 0; i < seen.length; i++) if (seen[i]) fogVal[i] = 1;
}

function worldTemp(m, y) {
  return EMITS[m] > 0 ? EMITS[m] : geothermalGradient[y];
}

function generateWorld(seed, w, h) {
  beginWorld(seed, w, h);
  const ROCK = matId('rock');
  for (let y = 0; y < H; y++) geothermalGradient[y] = geothermalAt(y);

  const surf = surfaceRow(seed);
  surfaceTop = 999;
  for (let x = 0; x < W; x++) if (surf[x] < surfaceTop) surfaceTop = surf[x];

  stampWorld(seed);

  paintRect(0, 0, 2, H - 1, EDGE_ID);
  paintRect(W - 3, 0, W - 1, H - 1, EDGE_ID);
  paintRect(0, H - 4, W - 1, H - 1, EDGE_ID);

  const bx = (W >> 1) - 12,
    by = surf[W >> 1] - 1;
  paintRect(bx, by, bx + 23, by + 2, ROCK);
  paintRect(bx, by - 9, bx + 23, by - 1, VOID_ID);

  finishWorld(worldTemp);
  revealSurface(surf);
  return { spawnX: W >> 1, spawnY: by - 6 };
}

function sinksInto(m, target) {
  return ISVOID[target] || (FLUID[target] && DENS[m] > DENS[target]);
}

function risesInto(m, target) {
  return ISVOID[target] || (FLUID[target] && DENS[m] < DENS[target]);
}

function swapCells(x1, y1, x2, y2, par) {
  const i = y1 * W + x1,
    j = y2 * W + x2;
  let t = mat[i];
  mat[i] = mat[j];
  mat[j] = t;
  t = shade[i];
  shade[i] = shade[j];
  shade[j] = t;
  t = life[i];
  life[i] = life[j];
  life[j] = t;
  t = flow[i];
  flow[i] = flow[j];
  flow[j] = t;
  const f = temp[i];
  temp[i] = temp[j];
  temp[j] = f;
  t = dmg[i];
  dmg[i] = dmg[j];
  dmg[j] = t;
  clk[i] = par;
  clk[j] = par;
  const c = (y2 >> FSHIFT) * FCW + (x2 >> FSHIFT);
  if (!seen[c]) {
    seen[c] = 1;
    seenCount++;
    markHot(x2, y2);
  }
}

function stepLiquid(i, x, y, m, par) {
  if (y + 1 < H) {
    const under = mat[i + W];
    if (MOLTEN[m] && MOVABLE[under] && POROUS[under] && rnd() < 0.3) {
      swapCells(x, y, x, y + 1, par);
      return;
    }
    if (sinksInto(m, under)) {
      swapCells(x, y, x, y + 1, par);
      return;
    }
  }

  let d = flow[i] ? 1 : -1;
  if (y + 1 < H) {
    for (let s = 0; s < 2; s++) {
      if (x + d >= 0 && x + d < W && sinksInto(m, mat[i + W + d])) {
        swapCells(x, y, x + d, y + 1, par);
        return;
      }
      d = -d;
    }
  }

  d = flow[i] ? 1 : -1;
  const reach = FLOW_REACH[m];
  let best = 0;
  for (let r = 1; r <= reach; r++) {
    const tx = x + d * r;
    if (tx < 0 || tx >= W) break;
    const j = y * W + tx;
    if (!sinksInto(m, mat[j])) break;
    best = r;
    if (y + 1 < H && sinksInto(m, mat[j + W])) break;
  }
  if (best) swapCells(x, y, x + d * best, y, par);
  else flow[i] = flow[i] ? 0 : 1;
}

function stepGas(i, x, y, m, par) {
  const l = life[i];
  if (l <= 1) {
    const into = EXPIRE_INTO[m];
    setCell(x, y, into && rnd() < EXPIRE_P[m] ? into : VOID_ID);
    return;
  }
  life[i] = l - 1;

  if (y > 0 && risesInto(m, mat[i - W]) && rnd() < 0.8) {
    swapCells(x, y, x, y - 1, par);
    return;
  }
  let d = rnd() < 0.5 ? 1 : -1;
  for (let s = 0; s < 2; s++) {
    if (x + d >= 0 && x + d < W) {
      if (y > 0 && risesInto(m, mat[i - W + d])) {
        swapCells(x, y, x + d, y - 1, par);
        return;
      }
      if (risesInto(m, mat[i + d])) {
        swapCells(x, y, x + d, y, par);
        return;
      }
    }
    d = -d;
  }
}

function produceCell(x, y, to) {
  setCell(x, y, to);
  produced[to]++;
}

var NB_DX = new Int8Array([-1, 1, 0, 0]);
var NB_DY = new Int8Array([0, 0, -1, 1]);

function reactAt(i, x, y, base, nt) {
  for (let k = 0; k < 4; k++) {
    const j = i + NB_DX[k] + NB_DY[k] * W;
    const p = base + mat[j];
    const into = REACT_INTO[p];
    if (!into) continue;
    const gives = REACT_GIVES[p];
    const gt = REACT_GIVES_T[p] || temp[j];
    const rt = REACT_T[p] || nt;
    produceCell(x, y, into);
    temp[i] = rt;
    temp2[i] = rt;
    if (gives) {
      produceCell(x + NB_DX[k], y + NB_DY[k], gives);
      temp[j] = gt;
      temp2[j] = gt;
    }
    return true;
  }
  return false;
}

function thermoPass() {
  thermoTick++;
  const _mat = mat,
    _t = temp,
    _n = temp2,
    _coef = HEAT_COEF,
    _rad = RAD_COEF,
    _relax = RELAX,
    _emit = EMITS,
    _hot = HOT_T,
    _cold = COLD_T,
    _life = life,
    _mc = MAT_COUNT;

  _n.set(_t);
  hotB.fill(0);

  for (let cy = 0; cy < TCH; cy++) {
    for (let cx = 0; cx < TCW; cx++) {
      let live = 0;
      for (let oy = -1; oy <= 1 && !live; oy++) {
        const ny = cy + oy;
        if (ny < 0 || ny >= TCH) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx2 = cx + ox;
          if (nx2 < 0 || nx2 >= TCW) continue;
          if (hotA[ny * TCW + nx2]) {
            live = 1;
            break;
          }
        }
      }
      if (!live) continue;

      const f0 = (cy << 1) * FCW + (cx << 1);
      if (!seen[f0] && !seen[f0 + 1] && !seen[f0 + FCW] && !seen[f0 + FCW + 1]) continue;

      let x0 = cx * TCS,
        y0 = cy * TCS;
      let x1 = x0 + TCS,
        y1 = y0 + TCS;
      if (x0 < 1) x0 = 1;
      if (y0 < 1) y0 = 1;
      if (x1 > W - 1) x1 = W - 1;
      if (y1 > H - 1) y1 = H - 1;
      let stillHot = 0;

      for (let y = y0; y < y1; y++) {
        const row = y * W;
        const amb = geothermalGradient[y];
        let ambK = (amb + 273) * 0.001;
        ambK *= ambK;
        ambK *= ambK;
        for (let x = x0; x < x1; x++) {
          const i = row + x;
          const m = _mat[i];
          const t = _t[i];
          const base = m * _mc;
          const ml = _mat[i - 1],
            mr = _mat[i + 1],
            mu = _mat[i - W],
            md = _mat[i + W];
          let nt =
            t +
            _coef[base + ml] * (_t[i - 1] - t) +
            _coef[base + mr] * (_t[i + 1] - t) +
            _coef[base + mu] * (_t[i - W] - t) +
            _coef[base + md] * (_t[i + W] - t);
          nt += (amb - nt) * _relax[m];

          if (nt > RAD_MIN) {
            const rad = _rad[base + ml] + _rad[base + mr] + _rad[base + mu] + _rad[base + md];
            if (rad > 0) {
              let k = (nt + 273) * 0.001;
              k *= k;
              k *= k;
              nt -= rad * (k - ambK);
              if (nt < amb) nt = amb;
            }
          }
          const hs = _emit[m];
          if (hs > nt) nt = hs;
          _n[i] = nt;

          const diff = nt - amb;
          if (diff > 1.2 || diff < -1.2) stillHot = 1;

          if (REACTIVE[m] && reactAt(i, x, y, base, nt)) continue;

          const hp = _hot[m];
          if (hp > 0) {
            if (nt > hp) {
              produceCell(x, y, HOT_INTO[m]);
              continue;
            }
            if (nt > hp * NEAR_HOT) nearHot[m]++;
          }

          const cp = _cold[m];
          const hold = LATENT[m];
          if (cp > 0 && nt < cp) {
            if (hold > 0) {
              const lat = _life[i] + 1;
              if (lat >= hold) {
                produceCell(x, y, COLD_INTO[m]);
                continue;
              }
              _life[i] = lat;
              _n[i] = cp - 4;
              stillHot = 1;
            } else {
              produceCell(x, y, COLD_INTO[m]);
              continue;
            }
          } else if (hold > 0 && _life[i]) {
            _life[i] = 0;
          }

          const every = BURN_EVERY[m];
          if (every > 0 && thermoTick % every === 0) {
            if (_life[i] <= 1) {
              produceCell(x, y, BURN_INTO[m]);
              continue;
            }
            _life[i]--;
          }
        }
      }
      if (stillHot) hotB[cy * TCW + cx] = 1;
    }
  }

  const tmp = temp;
  temp = temp2;
  temp2 = tmp;
  const th = hotA;
  hotA = hotB;
  hotB = th;
}

function simulate() {
  simFrame++;
  const par = simFrame & 1;
  const ltr = (simFrame & 1) === 0;
  const _mat = mat,
    _clk = clk,
    _state = STATE,
    _seen = seen,
    _block = BLOCKING,
    _rigid = RIGID;
  let lcg = (simFrame * 1103515245 + 12345) | 0;

  for (let fy = FCH - 1; fy >= 0; fy--) {
    for (let fk = 0; fk < FCW; fk++) {
      const fx = ltr ? fk : FCW - 1 - fk;
      if (!_seen[fy * FCW + fx]) continue;
      const cx0 = fx << FSHIFT,
        cy0 = fy << FSHIFT;

      for (let y = cy0 + FCS - 1; y >= cy0; y--) {
        const row = y * W;
        const down = y + 1 < H;
        for (let k = 0; k < FCS; k++) {
          const x = ltr ? cx0 + k : cx0 + FCS - 1 - k;
          const i = row + x;
          const m = _mat[i];
          if (ISVOID[m] || _rigid[m]) continue;
          if (_clk[i] === par) continue;
          const st = _state[m];

          if (st === MT.POWDER) {
            if (!down) continue;
            const bm = _mat[i + W];
            if (sinksInto(m, bm)) {
              swapCells(x, y, x, y + 1, par);
              continue;
            }
            if (GRIPS[bm]) continue;
            lcg = (lcg * 1664525 + 1013904223) | 0;
            let d = lcg & 1024 ? 1 : -1;
            for (let s = 0; s < 2; s++) {
              const nx = x + d;
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
