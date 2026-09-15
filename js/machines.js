/* Логістика: насоси, труби, сховища, генератори та енергомережа.
   Піч тут навмисно відсутня — її гравець складає руками з каменю. */

var KIND = { PUMP: 0, GENERATOR: 1, SILO: 2 };

/* Назви беруться з локалізації за ключем: t('tool.' + key). */
var DEF = [];
var COSTS = {};

var MACHINE_CELL = matId('machine');
var PIPE_CELL = matId('pipe');
var FUEL_SLOTS = 24;

function priceOf(cost) {
  var out = [];
  for (var i = 0; i < cost.length; i++) out.push([matId(cost[i][0]), cost[i][1]]);
  return out;
}

function defMachine(id, o) {
  o.id = id;
  o.cost = o.cost === undefined ? [] : priceOf(o.cost);
  if (o.draw === undefined) o.draw = 0;
  if (o.w === undefined) o.w = 3;
  if (o.h === undefined) o.h = 3;
  DEF[id] = o;
  COSTS[o.key] = o.cost;
}

function defPart(key, cost) { COSTS[key] = priceOf(cost); }

defMachine(KIND.PUMP, {
  key: 'pump', w: 3, h: 3, draw: 8, reach: 20,
  cost: [['rock', 60]]
});

defMachine(KIND.GENERATOR, {
  key: 'generator', w: 3, h: 3,
  cost: [['rock', 90], ['glass', 12]]
});

defMachine(KIND.SILO, {
  key: 'silo', w: 3, h: 3, draw: 1,
  cost: [['rock', 40]]
});

defPart('pipe', [['rock', 2]]);
defPart('wall', [['rock', 1]]);

var BASE_POWER = 15;
var GEN_OUTPUT = 30;
var GEN_EXHAUST = matId('smoke');
var PIPE_DELAY = 4;

var machines = [];
var machineMeta, pipeItem, pipeDest, pipeWait, routes;
var pipeList = [];
var netDirty = true;

var power = { cap: BASE_POWER, use: 0, sat: 1 };
var inv = {};
var stats = { processed: 0, built: 0, smelted: 0 };

var visitStamp;
var stampId = 0;

function resizeFactory() {
  machineMeta = new Int32Array(LEN);
  pipeItem = new Uint8Array(LEN);
  pipeDest = new Uint8Array(LEN);
  pipeWait = new Uint8Array(LEN);
  routes = [null, new Int32Array(LEN), new Int32Array(LEN)];
  visitStamp = new Int32Array(LEN);
  stampId = 0;
}

resizeFactory();

function resetFactory() {
  machines.length = 0;
  machineMeta.fill(0);
  pipeItem.fill(0); pipeDest.fill(0); pipeWait.fill(0);
  pipeList.length = 0;
  visitStamp.fill(0); stampId = 0;
  netDirty = true;
  power.cap = BASE_POWER; power.use = 0; power.sat = 1;
  inv = {};
  stats.processed = 0; stats.built = 0; stats.smelted = 0;
}

function have(m) { return inv[m] || 0; }
function addInv(m, n) { inv[m] = (inv[m] || 0) + n; }

function canAfford(toolKey) {
  var c = COSTS[toolKey];
  if (!c) return true;
  for (var i = 0; i < c.length; i++) if (have(c[i][0]) < c[i][1]) return false;
  return true;
}
function pay(toolKey) {
  var c = COSTS[toolKey];
  if (!c) return;
  for (var i = 0; i < c.length; i++) addInv(c[i][0], -c[i][1]);
}
function refund(toolKey) {
  var c = COSTS[toolKey];
  if (!c) return;
  for (var i = 0; i < c.length; i++) addInv(c[i][0], Math.floor(c[i][1] * 0.5));
}

/* ---------- розміщення ---------- */

function machineAt(x, y) {
  if (!inBounds(x, y)) return null;
  var id = machineMeta[y * W + x];
  return id ? machines[id - 1] : null;
}

function areaFree(x, y, w, h) {
  for (var yy = y; yy < y + h; yy++) {
    for (var xx = x; xx < x + w; xx++) {
      if (!inBounds(xx, yy)) return false;
      var m = mat[yy * W + xx];
      if (FIXED[m]) return false;
    }
  }
  return true;
}

function ringCells(m) {
  var out = [], x, y;
  for (x = m.x - 1; x <= m.x + m.w; x++) {
    out.push([x, m.y - 1]);
    out.push([x, m.y + m.h]);
  }
  for (y = m.y; y < m.y + m.h; y++) {
    out.push([m.x - 1, y]);
    out.push([m.x + m.w, y]);
  }
  return out.filter(function (c) { return inBounds(c[0], c[1]); });
}

function placeMachine(kind, x, y) {
  var d = DEF[kind];
  if (!areaFree(x, y, d.w, d.h)) return false;
  var m = {
    id: machines.length, kind: kind, x: x, y: y, w: d.w, h: d.h,
    buf: {}, out: [], prog: 0, burn: 0, burnMax: 1,
    beam: -1, beamT: 0, active: false, ring: null, ringTick: 0
  };
  machines.push(m);
  for (var yy = y; yy < y + d.h; yy++) {
    for (var xx = x; xx < x + d.w; xx++) {
      displaceCell(xx, yy);          // рідину виштовхуємо, а не знищуємо
      var i = yy * W + xx;
      mat[i] = MACHINE_CELL;
      machineMeta[i] = m.id + 1;
      dmg[i] = 0;
    }
  }
  m.ring = ringCells(m);
  netDirty = true;
  stats.built++;
  return true;
}

function removeMachine(m) {
  for (var yy = m.y; yy < m.y + m.h; yy++) {
    for (var xx = m.x; xx < m.x + m.w; xx++) {
      mat[yy * W + xx] = VOID_ID;
      machineMeta[yy * W + xx] = 0;
    }
  }
  machines[m.id] = null;
  netDirty = true;
}

function placePipe(x, y) {
  if (!inBounds(x, y)) return false;
  var i = y * W + x;
  var cur = mat[i];
  if (FIXED[cur]) return false;
  if (STATE[cur] === MT.LIQUID && !displaceCell(x, y)) return false;
  mat[i] = PIPE_CELL;
  pipeItem[i] = 0; pipeDest[i] = 0; pipeWait[i] = 0;
  netDirty = true;
  return true;
}

function removePipe(x, y) {
  var i = y * W + x;
  mat[i] = VOID_ID;
  pipeItem[i] = 0;
  netDirty = true;
}

/* ---------- маршрути вантажу ---------- */

function rebuildRoutes() {
  netDirty = false;
  pipeList.length = 0;
  for (var i = 0; i < LEN; i++) if (CARRIES[mat[i]]) pipeList.push(i);

  for (var ki = 1; ki <= 2; ki++) {
    var nx = routes[ki];
    nx.fill(-1);
    var q = [], head = 0;

    for (var mi = 0; mi < machines.length; mi++) {
      var m = machines[mi];
      if (!m || m.kind !== ki) continue;
      for (var r = 0; r < m.ring.length; r++) {
        var c = m.ring[r], ci = c[1] * W + c[0];
        if (!CARRIES[mat[ci]] || nx[ci] !== -1) continue;
        nx[ci] = -(m.id + 2);
        q.push(ci);
      }
    }
    while (head < q.length) {
      var cur = q[head++];
      var cx = cur % W, cy = (cur / W) | 0;
      for (var k = 0; k < 4; k++) {
        var ax = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        var ay = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (!inBounds(ax, ay)) continue;
        var ni = ay * W + ax;
        if (!CARRIES[mat[ni]] || nx[ni] !== -1) continue;
        nx[ni] = cur;
        q.push(ni);
      }
    }
  }
}

function destOrder(item) {
  if (FUEL_TICKS[settled(item)] > 0) return [KIND.GENERATOR, KIND.SILO];
  return [KIND.SILO];
}

function chooseDest(cell, item, exclude) {
  var order = destOrder(item);
  for (var i = 0; i < order.length; i++) {
    var k = order[i];
    if (k === exclude) continue;
    if (routes[k] && routes[k][cell] !== -1) return k;
  }
  return -1;
}

/* Вантаж застигає дорогою: труба віддає вже тверде. */
function settled(item) { return SETTLE_INTO[item] || item; }

function bufLoad(m) {
  var n = 0;
  for (var key in m.buf) n += m.buf[key];
  return n;
}

function takeFuel(m) {
  for (var key in m.buf) {
    if (m.buf[key] > 0 && FUEL_TICKS[key] > 0) {
      m.buf[key]--;
      return FUEL_TICKS[key];
    }
  }
  return 0;
}

function accepts(m, item) {
  if (!m) return false;
  if (m.kind === KIND.SILO) return true;
  if (m.kind === KIND.GENERATOR) return FUEL_TICKS[settled(item)] > 0 && bufLoad(m) < FUEL_SLOTS;
  return false;
}

function deliver(m, item) {
  if (!accepts(m, item)) return false;
  var s = settled(item);
  if (m.kind === KIND.SILO) {
    addInv(s, 1);
    stats.processed++;
    return true;
  }
  m.buf[s] = (m.buf[s] || 0) + 1;
  stats.processed++;
  return true;
}

function pushOut(m, item) {
  var ring = m.ring;
  var start = (m.ringTick++) % ring.length;
  for (var n = 0; n < ring.length; n++) {
    var c = ring[(start + n) % ring.length];
    var i = c[1] * W + c[0];
    if (!CARRIES[mat[i]] || pipeItem[i]) continue;
    var dest = chooseDest(i, item, -1);
    if (dest < 0) continue;
    pipeItem[i] = item;
    pipeDest[i] = dest;
    pipeWait[i] = PIPE_DELAY;
    return true;
  }
  return false;
}

/* ---------- всмоктування ---------- */

function findSuction(m) {
  stampId++;
  var q = [], qd = [], head = 0;
  var R = DEF[KIND.PUMP].reach;
  var ring = m.ring, i, c;
  for (var r = 0; r < ring.length; r++) {
    c = ring[r];
    i = c[1] * W + c[0];
    if (visitStamp[i] === stampId) continue;
    visitStamp[i] = stampId;
    var mm = mat[i];
    if (MOVABLE[mm]) return i;
    if (OPEN[mm]) { q.push(i); qd.push(1); }
  }
  var guard = 0;
  while (head < q.length && guard++ < 3000) {
    var cur = q[head], d = qd[head]; head++;
    if (d >= R) continue;
    var cx = cur % W, cy = (cur / W) | 0;
    for (var k = 0; k < 4; k++) {
      var ax = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      var ay = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!inBounds(ax, ay)) continue;
      var ni = ay * W + ax;
      if (visitStamp[ni] === stampId) continue;
      visitStamp[ni] = stampId;
      if (!isSeen(ax, ay)) continue;        // з нерозвіданого не тягнемо
      var nm = mat[ni];
      if (MOVABLE[nm]) return ni;
      if (OPEN[nm]) { q.push(ni); qd.push(d + 1); }
    }
  }
  return -1;
}

/* ---------- такти ---------- */

function tickPower() {
  var cap = BASE_POWER, use = 0;
  for (var i = 0; i < machines.length; i++) {
    var m = machines[i];
    if (!m) continue;
    if (m.kind === KIND.GENERATOR) { if (m.burn > 0) cap += GEN_OUTPUT; }
    else use += DEF[m.kind].draw;
  }
  power.cap = cap;
  power.use = use;
  power.sat = use > 0 ? Math.min(1, cap / use) : 1;
}

function tickMachines() {
  if (netDirty) rebuildRoutes();
  tickPower();
  var sat = power.sat;

  for (var i = 0; i < machines.length; i++) {
    var m = machines[i];
    if (!m) continue;
    if (m.beamT > 0) m.beamT--;

    if (m.kind === KIND.PUMP) {
      while (m.out.length && pushOut(m, m.out[0])) m.out.shift();
      m.active = false;
      if (m.out.length >= 12) {
        if (simFrame % 45 === 0) spawnNear(m.x + (m.w >> 1), m.y - 1, m.out.shift(), 3);
        continue;
      }
      m.prog += 0.2 * sat;
      if (m.prog >= 1) {
        m.prog -= 1;
        var target = findSuction(m);
        if (target >= 0) {
          var item = mat[target];
          setCell(target % W, (target / W) | 0, VOID_ID);
          m.beam = target; m.beamT = 6;
          m.active = true;
          if (!pushOut(m, item)) m.out.push(item);
        }
      }

    } else if (m.kind === KIND.GENERATOR) {
      if (m.burn > 0) {
        m.burn--;
        m.active = true;
        var ci = (m.y + 1) * W + m.x + 1;
        if (temp[ci] < 320) temp[ci] = 320;
        if (rnd() < 0.1) spawnNear(m.x + 1, m.y - 1, GEN_EXHAUST, 1);
      } else {
        var ticks = takeFuel(m);
        if (ticks > 0) { m.burn = ticks; m.burnMax = ticks; }
        else m.active = false;
      }

    } else if (m.kind === KIND.SILO) {
      m.active = true;
    }
  }
}

function tickPipes() {
  for (var n = 0; n < pipeList.length; n++) {
    var i = pipeList[n];
    if (!CARRIES[mat[i]]) continue;
    var item = pipeItem[i];
    if (!item) continue;
    if (pipeWait[i] > 0) { pipeWait[i]--; continue; }

    var dest = pipeDest[i];
    var nx = routes[dest] ? routes[dest][i] : -1;
    if (nx === -1) {
      var alt = chooseDest(i, item, -1);
      if (alt < 0) { pipeWait[i] = 20; continue; }
      pipeDest[i] = alt;
      dest = alt;
      nx = routes[alt][i];
    }

    if (nx <= -2) {
      var m = machines[-nx - 2];
      if (m && deliver(m, item)) pipeItem[i] = 0;
      else {
        pipeWait[i] = 12;
        var other = chooseDest(i, item, dest);
        if (other >= 0) pipeDest[i] = other;
      }
      continue;
    }

    if (!pipeItem[nx] && CARRIES[mat[nx]]) {
      pipeItem[nx] = item;
      pipeDest[nx] = dest;
      pipeWait[nx] = PIPE_DELAY;
      pipeItem[i] = 0;
    } else {
      pipeWait[i] = 3;
    }
  }
}

/* Ручне завантаження вугілля в найближчий генератор. */
function stockFuel() {
  for (var key in inv) {
    if (inv[key] > 0 && FUEL_TICKS[key] > 0) return key | 0;
  }
  return -1;
}

function manualFuel(px, py) {
  var fuel = stockFuel();
  if (fuel < 0) return 0;
  var best = null, bestD = 26 * 26;
  for (var i = 0; i < machines.length; i++) {
    var m = machines[i];
    if (!m || !accepts(m, fuel)) continue;
    var dx = m.x + m.w / 2 - px, dy = m.y + m.h / 2 - py;
    var d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = m; }
  }
  if (!best) return 0;
  var n = Math.min(FUEL_SLOTS - bufLoad(best), have(fuel), 20);
  if (n <= 0) return 0;
  best.buf[fuel] = (best.buf[fuel] || 0) + n;
  addInv(fuel, -n);
  return n;
}
