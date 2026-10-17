const test = require('node:test');
const assert = require('node:assert');
const { core } = require('./core.js');

const C = core;
const S = C.CHUNK_SIZE;
const MARK = C.matId('wall');
const AWAY = 30;

function makeDisk() {
  const disk = { tables: new Map(), mode: 'auto', held: [] };
  const table = (name) => {
    if (!disk.tables.has(name)) disk.tables.set(name, new Map());
    return disk.tables.get(name);
  };
  disk.backend = {
    get(name, key) {
      if (disk.mode === 'fail') return Promise.reject(new Error('read failed'));
      if (disk.mode === 'auto') return Promise.resolve(structuredClone(table(name).get(key)));
      return new Promise((resolve, reject) => disk.held.push({ name, key, resolve, reject }));
    },
    put(name, batch) {
      for (const [key, v] of batch) table(name).set(key, structuredClone(v));
      return Promise.resolve();
    },
    clear() {
      disk.tables.clear();
      return Promise.resolve();
    }
  };
  disk.release = () => {
    for (const r of disk.held.splice(0)) r.resolve(structuredClone(table(r.name).get(r.key)));
  };
  disk.releaseKey = (name, key) => {
    const k = disk.held.findIndex((r) => r.name === name && r.key === key);
    const [r] = disk.held.splice(k, 1);
    r.resolve(structuredClone(table(r.name).get(r.key)));
  };
  disk.failHeld = () => {
    for (const r of disk.held.splice(0)) r.reject(new Error('read failed'));
  };
  disk.has = (name, key) => table(name).has(key);
  return disk;
}

async function settle() {
  for (let k = 0; k < 4; k++) await new Promise((r) => setTimeout(r, 2));
}

async function freshWorld(disk, seed) {
  C.setDiskBackend(disk.backend);
  C.chunkTier.memMax = 0;
  C.fogTier.memMax = 0;
  C.resetObjects();
  C.beltCells.clear();
  const spawn = C.generateWorld(seed);
  await settle();
  return spawn;
}

function keyAt(lx, ly) {
  return C.chunkKey((C.originX + lx) >> C.CHUNK_SHIFT, (C.originY + ly) >> C.CHUNK_SHIFT);
}

function slotCells(lx, ly, visit) {
  for (let y = ly; y < ly + S; y++) {
    for (let x = lx; x < lx + S; x++) visit(y * C.W + x, y);
  }
}

function inertCount(lx, ly) {
  let n = 0;
  slotCells(lx, ly, (i) => {
    if (C.HARD[C.mat[i]] < 0) n++;
  });
  return n;
}

function assertInert(lx, ly, why) {
  assert.strictEqual(inertCount(lx, ly), S * S, `${why}: slot ${lx},${ly} holds diggable cells`);
}

function mark(lx, ly) {
  C.setCell(lx + 8, ly + 8, MARK);
  C.setCell(lx + 9, ly + 8, MARK);
}

function hasMark(lx, ly) {
  return C.mat[(ly + 8) * C.W + lx + 8] === MARK && C.mat[(ly + 8) * C.W + lx + 9] === MARK;
}

async function awayAndHome(disk, mode) {
  C.moveWindow(AWAY, 0);
  await settle();
  disk.mode = mode;
  C.moveWindow(-AWAY, 0);
}

const NEAR = { lx: 640, ly: 128 };
const FAR = { lx: 128, ly: 256 };

test('F1: a near chunk whose disk read is pending is not editable terrain', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 101);
  mark(NEAR.lx, NEAR.ly);
  const key = keyAt(NEAR.lx, NEAR.ly);
  C.moveWindow(AWAY, 0);
  await settle();
  assert.ok(disk.has('chunks', key), 'edited chunk spilled to disk');
  disk.mode = 'hold';
  C.moveWindow(-AWAY, 0);
  assertInert(NEAR.lx, NEAR.ly, 'read pending');
  disk.release();
  await settle();
  assert.ok(hasMark(NEAR.lx, NEAR.ly), 'stored edits shown once the read lands');
});

test('F1: a chunk that leaves before its read lands keeps its disk copy', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 102);
  mark(NEAR.lx, NEAR.ly);
  await awayAndHome(disk, 'hold');
  C.moveWindow(AWAY, 0);
  disk.release();
  await settle();
  disk.mode = 'auto';
  C.moveWindow(-AWAY, 0);
  await settle();
  assert.ok(hasMark(NEAR.lx, NEAR.ly));
});

test('F1: the window is not settled while a near chunk is loading', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 103);
  mark(NEAR.lx, NEAR.ly);
  await awayAndHome(disk, 'hold');
  assert.strictEqual(C.windowSettled(), false);
  disk.release();
  await settle();
  assert.strictEqual(C.windowSettled(), true);
});

function objectPrint(o) {
  const cells = o.cells.map((c) => `${c.dx},${c.dy},${c.mat}`).join(' ');
  return `${C.worldX(o.x)},${C.worldY(o.y)}: ${cells}`;
}

function liveObject(print) {
  return C.objects.find((o) => objectPrint(o) === print);
}

function pair(m) {
  return [
    { dx: 0, dy: 0, mat: m, temp: 20 },
    { dx: 1, dy: 0, mat: m, temp: 20 }
  ];
}

function looseObject(x, y, cells) {
  const o = C.makeObject(x, y, cells);
  o.held = false;
  assert.strictEqual(C.objBlocked(o, x, y, false), false, `object at ${x},${y} starts blocked`);
  return objectPrint(o);
}

function moveWithObjects(dcx) {
  C.moveWindow(dcx, 0);
  C.shiftObjects(dcx * S, 0);
}

test('F3: shelved objects are not placed into a loading chunk', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 104);
  C.moveWindow(0, -2);
  C.buildDeferred();
  const cells = [
    { dx: 0, dy: 0, mat: C.SAND_ID, temp: 20 },
    { dx: 1, dy: 0, mat: C.SAND_ID, temp: 20 }
  ];
  const o = C.makeObject(650, 90, cells);
  o.held = false;
  const want = objectPrint(o);
  mark(640, 64);
  C.moveWindow(AWAY, 0);
  C.shiftObjects(AWAY * S, 0);
  await settle();
  assert.strictEqual(liveObject(want), undefined, 'object still live after its chunk left');
  disk.mode = 'hold';
  C.moveWindow(-AWAY, 0);
  C.shiftObjects(-AWAY * S, 0);
  assert.strictEqual(liveObject(want), undefined, 'object placed while its chunk is loading');
  disk.release();
  await settle();
  const back = liveObject(want);
  assert.ok(back, 'object placed once its chunk arrived');
  assert.strictEqual(C.objBlocked(back, back.x, back.y, false), false, 'object inside solid cells');
});

test('F7: placeholder chunks are inert to heat and motion', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 105);
  mark(FAR.lx, FAR.ly);
  await awayAndHome(disk, 'hold');
  C.seen.fill(1);
  slotCells(FAR.lx, FAR.ly, (i, y) => {
    const ambient = C.geothermalGradient[y];
    assert.ok(
      Math.abs(C.temp[i] - ambient) < 0.01,
      `placeholder cell at y=${y} holds ${C.temp[i]}, ambient is ${ambient}`
    );
  });
  const m = C.mat[FAR.ly * C.W + FAR.lx];
  for (let k = 0; k < C.MAT_COUNT; k++) {
    assert.ok(C.HEAT_COEF[m * C.MAT_COUNT + k] < 1e-6, `placeholder conducts heat to ${k}`);
  }
  const before = C.mat.slice();
  for (let k = 0; k < 40; k++) C.simulate();
  const T = S >> C.TCSHIFT;
  for (let r = 0; r < T; r++) {
    for (let c = 0; c < T; c++) {
      const t = ((FAR.ly >> C.TCSHIFT) + r) * C.TCW + (FAR.lx >> C.TCSHIFT) + c;
      assert.strictEqual(C.dirtyT[t], 0, 'placeholder tile marked dirty');
    }
  }
  slotCells(FAR.lx, FAR.ly, (i) =>
    assert.strictEqual(C.mat[i], before[i], 'placeholder cell changed')
  );
  assertInert(FAR.lx, FAR.ly, 'placeholder');
});

test('chunkFailed: a failed read never regenerates the chunk or overwrites its disk copy', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 106);
  mark(NEAR.lx, NEAR.ly);
  mark(FAR.lx, FAR.ly);
  await awayAndHome(disk, 'fail');
  await settle();
  for (let k = 0; k < 40; k++) C.streamWorld();
  assertInert(FAR.lx, FAR.ly, 'failed far read');
  assertInert(NEAR.lx, NEAR.ly, 'failed near read');
  assert.strictEqual(C.chunkStateAt(FAR.lx, FAR.ly), C.CHUNK_FAILED);
  assert.strictEqual(C.chunkStateAt(NEAR.lx, NEAR.ly), C.CHUNK_FAILED);
  C.moveWindow(AWAY, 0);
  await settle();
  disk.mode = 'auto';
  C.moveWindow(-AWAY, 0);
  await settle();
  assert.ok(hasMark(FAR.lx, FAR.ly), 'far disk copy survived');
  assert.ok(hasMark(NEAR.lx, NEAR.ly), 'near disk copy survived');
});

test('diskLost: failed chunks are regenerated and the player is told', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 110);
  mark(FAR.lx, FAR.ly);
  await awayAndHome(disk, 'fail');
  await settle();
  const sent = [];
  C.setNoticeHook((sound, text) => sent.push([sound, text]));
  C.diskLost();
  C.setNoticeHook(null);
  assert.strictEqual(C.chunkStateAt(FAR.lx, FAR.ly), C.CHUNK_QUEUED);
  C.buildDeferred();
  assert.strictEqual(C.chunkStateAt(FAR.lx, FAR.ly), C.CHUNK_READY);
  assert.notStrictEqual(inertCount(FAR.lx, FAR.ly), S * S, 'regenerated from the seed');
  assert.deepStrictEqual(sent, [[null, C.t('msg.diskLost')]]);
});

test('fogFailed: a failed fog read never overwrites the saved slice', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 107);
  const fx = FAR.lx >> C.FSHIFT,
    fy = FAR.ly >> C.FSHIFT;
  C.revealQuiet(fx, fy);
  await awayAndHome(disk, 'fail');
  await settle();
  C.revealQuiet(fx + 1, fy + 1);
  C.moveWindow(AWAY, 0);
  await settle();
  disk.mode = 'auto';
  C.moveWindow(-AWAY, 0);
  await settle();
  assert.strictEqual(C.seen[fy * C.FCW + fx], 1, 'bit seen before the failed read lost');
  assert.strictEqual(C.seen[(fy + 1) * C.FCW + fx + 1], 1, 'bit seen after the failed read lost');
});

function lcg(seed) {
  let s = seed >>> 0;
  return (n) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

function eachSlot(visit) {
  for (let ly = 0; ly < C.H; ly += S) {
    for (let lx = 0; lx < C.W; lx += S) visit(lx, ly);
  }
}

function markBelt(lx, ly) {
  C.beltPlace({ dx: 1, dy: 0, cells: [{ x: lx + 5, y: ly + 5 }] });
}

function hasBelt(lx, ly) {
  const i = (ly + 5) * C.W + lx + 5;
  return C.mat[i] === C.matId('belt') && C.beltCells.has(i);
}

function checkEdits(marked) {
  eachSlot((lx, ly) => {
    const key = keyAt(lx, ly);
    if (!marked.has(key)) return;
    if (hasBelt(lx, ly)) return;
    assertInert(lx, ly, `edited chunk ${key} shown without its edit`);
  });
}

function markReady(marked) {
  eachSlot((lx, ly) => {
    const key = keyAt(lx, ly);
    if (marked.has(key) || inertCount(lx, ly) === S * S) return;
    markBelt(lx, ly);
    marked.add(key);
  });
}

async function randomStep(disk, rnd) {
  const modes = ['auto', 'hold', 'fail'];
  disk.mode = modes[rnd(3)];
  const far = rnd(4) === 0;
  const dcx = far ? rnd(61) - 30 : rnd(5) - 2;
  const dcy = far ? rnd(13) - 6 : rnd(3) - 1;
  C.moveWindow(dcx, dcy);
  if (rnd(2)) disk.release();
  else if (rnd(3) === 0) disk.failHeld();
  await settle();
  for (let k = 0; k < 6; k++) C.streamWorld();
}

test('edits survive any sequence of moves and read outcomes', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 108);
  const rnd = lcg(108);
  const marked = new Set();
  markReady(marked);
  for (let step = 0; step < 60; step++) {
    await randomStep(disk, rnd);
    checkEdits(marked);
    markReady(marked);
  }
});

function checkSlot(lx, ly) {
  const state = C.chunkStateAt(lx, ly);
  const states = [C.CHUNK_READY, C.CHUNK_QUEUED, C.CHUNK_LOADING, C.CHUNK_FAILED];
  assert.ok(states.includes(state), `slot ${lx},${ly} has unknown state ${state}`);
  if (state === C.CHUNK_READY) return;
  slotCells(lx, ly, (i) => {
    assert.strictEqual(C.mat[i], C.EDGE_ID, 'non-ready slot holds a non-placeholder cell');
    assert.ok(!C.beltCells.has(i), 'non-ready slot holds a belt');
  });
  const T = S >> C.TCSHIFT;
  for (let r = 0; r < T; r++) {
    for (let c = 0; c < T; c++) {
      const t = ((ly >> C.TCSHIFT) + r) * C.TCW + (lx >> C.TCSHIFT) + c;
      assert.strictEqual(C.dirtyT[t], 0, 'non-ready slot has a dirty tile');
    }
  }
}

function checkObjects() {
  for (const o of C.objects) {
    for (const c of o.cells) {
      const x = Math.floor(o.x + c.dx),
        y = Math.floor(o.y + c.dy);
      const lx = x - (x % S),
        ly = y - (y % S);
      assert.strictEqual(C.chunkStateAt(lx, ly), C.CHUNK_READY, 'object in a non-ready slot');
    }
  }
}

function checkBelts() {
  for (const i of C.beltCells.keys()) {
    assert.strictEqual(C.mat[i], C.matId('belt'), 'beltCells entry on a non-belt cell');
  }
}

test('state invariants hold after any sequence of moves and read outcomes', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 109);
  const rnd = lcg(109);
  const marked = new Set();
  markReady(marked);
  for (let step = 0; step < 40; step++) {
    await randomStep(disk, rnd);
    eachSlot(checkSlot);
    checkObjects();
    checkBelts();
    markReady(marked);
  }
});

const OBJ_SLOT = { lx: 128, ly: 0 };

test('objects: more than eight loose objects all survive leaving the window through a disk spill', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 120);
  const kinds = [C.SAND_ID, C.matId('coal'), C.matId('iron')];
  const want = [];
  for (let k = 0; k < 12; k++) {
    want.push(looseObject(OBJ_SLOT.lx + 2 + 4 * k, 12, pair(kinds[k % 3])));
  }
  const key = keyAt(OBJ_SLOT.lx, OBJ_SLOT.ly);
  moveWithObjects(AWAY);
  await settle();
  assert.ok(disk.has('chunks', key), 'chunk owning the objects was not spilled to disk');
  moveWithObjects(-AWAY);
  await settle();
  for (let k = 0; k < 6; k++) C.streamWorld();
  const lost = want.filter((print) => !liveObject(print));
  assert.deepStrictEqual(lost, [], 'objects lost or moved');
});

const BORDER = { x: 304, y: 62 };

function carvePocket() {
  for (let y = BORDER.y - 6; y < BORDER.y + 10; y++) {
    for (let x = BORDER.x - 4; x < BORDER.x + 8; x++) C.setCell(x, y, C.VOID_ID);
  }
}

function column(m, n) {
  const cells = [];
  for (let dy = 0; dy < n; dy++) cells.push({ dx: 0, dy, mat: m, temp: 20 });
  return cells;
}

test('objects: an object across a chunk border waits for every slot it covers and is never lifted', async () => {
  const disk = makeDisk();
  await freshWorld(disk, 121);
  carvePocket();
  mark(BORDER.x - (BORDER.x % S), 0);
  const want = looseObject(BORDER.x, BORDER.y, column(C.SAND_ID, 4));
  const owner = keyAt(BORDER.x, BORDER.y);
  moveWithObjects(AWAY);
  await settle();
  disk.mode = 'hold';
  moveWithObjects(-AWAY);
  disk.releaseKey('chunks', owner);
  await settle();
  assert.strictEqual(C.chunkStateAt(BORDER.x - (BORDER.x % S), 0), C.CHUNK_READY);
  assert.strictEqual(C.chunkStateAt(BORDER.x - (BORDER.x % S), S), C.CHUNK_LOADING);
  const early = C.objects.filter((o) => C.worldX(o.x) === C.worldX(BORDER.x));
  assert.deepStrictEqual(
    early.map(objectPrint),
    [],
    'object placed while a slot it covers is loading'
  );
  disk.release();
  await settle();
  assert.ok(liveObject(want), 'object not placed at its own position once every slot is ready');
});

function spawnSlot() {
  const lx = Math.floor(C.localX(C.player.spawnX)),
    ly = Math.floor(C.localY(C.player.spawnY));
  return { lx: lx - (lx % S), ly: ly - (ly % S) };
}

async function spawnAwayAndBack(disk, seed, mode) {
  const sp = await freshWorld(disk, seed);
  C.spawnPlayer(sp.spawnX, sp.spawnY);
  const slot = spawnSlot();
  const keep = { x: slot.lx + 40, y: slot.ly + 20 };
  C.setCell(keep.x, keep.y, MARK);
  C.moveWindow(AWAY, 0);
  await settle();
  disk.mode = mode;
  C.beginRespawn();
  C.moveWindow(-AWAY, 0);
  await settle();
  return { slot, keep };
}

function assertPlayable(keep) {
  assert.strictEqual(C.boxBlocked(C.player.x, C.player.y), false, 'player placed inside cells');
  const lx = Math.floor(C.player.x),
    ly = Math.floor(C.player.y);
  assert.strictEqual(C.chunkStateAt(lx - (lx % S), ly - (ly % S)), C.CHUNK_READY);
  if (keep) assert.strictEqual(C.mat[keep.y * C.W + keep.x], MARK, 'spawn chunk regenerated');
}

test('respawn: a failed spawn read is retried, never stood on and never regenerated', async () => {
  const disk = makeDisk();
  const { slot, keep } = await spawnAwayAndBack(disk, 130, 'fail');
  assert.strictEqual(C.chunkStateAt(slot.lx, slot.ly), C.CHUNK_FAILED);
  assert.strictEqual(C.respawnStep(), false, 'player placed over a failed spawn slot');
  disk.mode = 'auto';
  await settle();
  let placed = C.respawnStep();
  for (let k = 0; k < 4 && !placed; k++) {
    await settle();
    placed = C.respawnStep();
  }
  assert.strictEqual(placed, true, 'respawn never finished after the read recovered');
  assertPlayable(keep);
});

test('respawn: a spawn read still loading after SETTLE_MS is waited for', async () => {
  const disk = makeDisk();
  const { slot, keep } = await spawnAwayAndBack(disk, 131, 'hold');
  assert.strictEqual(C.chunkStateAt(slot.lx, slot.ly), C.CHUNK_LOADING);
  for (let k = 0; k < 5; k++) {
    assert.strictEqual(C.respawnStep(), false, 'player placed over a loading spawn slot');
    await settle();
  }
  disk.release();
  await settle();
  assert.strictEqual(C.respawnStep(), true);
  assertPlayable(keep);
});

test('respawn: a spawn read that keeps failing ends as a lost disk and a playable spawn', async () => {
  const disk = makeDisk();
  await spawnAwayAndBack(disk, 132, 'fail');
  const sent = [];
  C.setNoticeHook((sound, text) => sent.push([sound, text]));
  let placed = false;
  for (let k = 0; k < 12 && !placed; k++) {
    placed = C.respawnStep();
    C.streamWorld();
    await settle();
  }
  C.setNoticeHook(null);
  assert.strictEqual(placed, true, 'respawn never finished with a failing disk');
  assert.deepStrictEqual(sent, [[null, C.t('msg.diskLost')]]);
  assertPlayable(null);
});

test('respawn: a respawn pending when a new world is made does nothing there', async () => {
  const disk = makeDisk();
  await spawnAwayAndBack(disk, 133, 'hold');
  const sp = await freshWorld(disk, 134);
  C.spawnPlayer(sp.spawnX, sp.spawnY);
  const at = [C.player.x, C.player.y, C.player.arriving];
  C.player.arriving = false;
  assert.strictEqual(C.respawnStep(), false, 'old respawn fired in the new world');
  assert.deepStrictEqual([C.player.x, C.player.y, C.player.arriving], [at[0], at[1], false]);
});
