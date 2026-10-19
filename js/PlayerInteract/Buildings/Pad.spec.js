const test = require('node:test');
const assert = require('node:assert');
const { core } = require('../../../test/core.js');

const SITE = 400;
const NEAR_EDGE = 120;
const SETTLE = 1500;
const heard = [];

function listen(sound, text) {
  heard.push([sound, text]);
}

function freshWorld() {
  core.resetMarket(false);
  core.resetPieces();
  core.resetBuild();
  core.resetToolbelt(false);
  const spawn = core.generateWorld(42);
  core.spawnPlayer(spawn.spawnX, spawn.spawnY);
  core.setNoticeHook(listen);
  heard.length = 0;
}

function ground() {
  return core.H - 2 * core.PILE_MAX - 10;
}

function leftOf(cx) {
  return cx - Math.floor((core.PAD_WIDTH - 1) / 2);
}

function zoneBox(cx, bottom) {
  const left = leftOf(cx);
  const top = bottom - core.PAD_THICK + 1;
  return {
    left: left,
    right: left + core.PAD_WIDTH - 1,
    top: top,
    bottom: bottom,
    boxTop: top - core.CARGO_BOX_H
  };
}

function pileOffsets() {
  const out = [];
  for (let o = 0; o + core.PILE_WIDTH <= core.PAD_WIDTH; o += core.PILE_SPACING) out.push(o);
  const last = core.PAD_WIDTH - core.PILE_WIDTH;
  if (!out.includes(last)) out.push(last);
  return out;
}

function fill(x0, x1, y0, y1, m) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) core.setCell(x, y, m);
  }
}

function reveal(x0, x1) {
  for (let y = 0; y < core.H; y += core.FCS) {
    for (let x = x0; x <= x1; x += core.FCS) core.revealAt(x, y);
  }
}

function flatGround(x0, x1) {
  const g = ground();
  fill(x0, x1, 0, g - 1, core.VOID_ID);
  fill(x0, x1, g, core.H - 1, core.matId('rock'));
  reveal(x0, x1);
}

function arena(x0, x1) {
  flatGround(x0, x1);
  const bedrock = core.matId('bedrock');
  fill(x0, x0 + 3, 0, core.H - 1, bedrock);
  fill(x1 - 3, x1, 0, core.H - 1, bedrock);
}

function siteArena() {
  arena(SITE - 5 * core.PAD_WIDTH, SITE + 5 * core.PAD_WIDTH);
}

function edgeArena() {
  arena(NEAR_EDGE - 2 * core.PAD_WIDTH, NEAR_EDGE + 6 * core.PAD_WIDTH);
}

function dig(cx, o0, o1, depth) {
  const left = leftOf(cx);
  const g = ground();
  fill(left + o0, left + o1, g, g + depth - 1, core.VOID_ID);
}

function trenchUnderPiles(cx, depth) {
  dig(cx, core.PILE_SPACING - 2, 2 * core.PILE_SPACING + core.PILE_WIDTH + 2, depth);
}

function overTrench(depth) {
  return (o) => (o === core.PILE_SPACING || o === 2 * core.PILE_SPACING ? depth : 0);
}

function noPiles() {
  return 0;
}

function zoneCells(cx, bottom, pileLen) {
  const b = zoneBox(cx, bottom);
  const out = new Set();
  for (let y = b.top; y <= bottom; y++) {
    for (let x = b.left; x <= b.right; x++) out.add(y * core.W + x);
  }
  for (const o of pileOffsets()) {
    const len = pileLen(o);
    for (let y = bottom + 1; y <= bottom + len; y++) {
      for (let x = b.left + o; x < b.left + o + core.PILE_WIDTH; x++) out.add(y * core.W + x);
    }
  }
  return out;
}

function padCells() {
  const id = core.matId('pad');
  const out = new Set();
  for (let i = 0; i < core.mat.length; i++) if (core.mat[i] === id) out.add(i);
  return out;
}

function snapshot() {
  return Uint8Array.from(core.mat);
}

function assertSameSet(actual, expected) {
  const missing = [...expected].filter((i) => !actual.has(i));
  const extra = [...actual].filter((i) => !expected.has(i));
  assert.deepStrictEqual(
    { missing: missing.length, extra: extra.length },
    { missing: 0, extra: 0 }
  );
}

function assertOnly(before, zone) {
  const id = core.matId('pad');
  let wrong = 0;
  for (let i = 0; i < core.mat.length; i++) {
    const want = zone.has(i) ? id : before[i];
    if (core.mat[i] !== want) wrong++;
  }
  assert.strictEqual(wrong, 0);
}

function click(x, y) {
  core.setBuildId('pad');
  core.startBuildDrag(x, y, false);
  const report = core.finishBuild([x, y], [x, y]);
  core.reportBuild(report);
  core.endBuildDrag();
  return report;
}

function rightClick(x, y) {
  core.setBuildId('pad');
  core.startBuildDrag(x, y, true);
  const report = core.finishBuild([x, y], [x, y]);
  core.reportBuild(report);
  core.endBuildDrag();
  return report;
}

function verdictAt(x, y) {
  core.setBuildId('pad');
  return core.buildVerdict(core.buildPlan([x, y], [x, y]));
}

function placeFlat(cx) {
  const r = click(cx, ground() - 1);
  assert.strictEqual(r, core.PIECES.pad.done);
  heard.length = 0;
  return zoneBox(cx, ground() - 1);
}

function plateau() {
  const g = ground();
  const b = zoneBox(SITE, g - 1);
  const depth = 2 * core.PILE_MAX;
  fill(SITE - 5 * core.PAD_WIDTH + 4, b.left - 1, g, g + depth - 1, core.VOID_ID);
  fill(b.right + 1, SITE + 5 * core.PAD_WIDTH - 4, g, g + depth - 1, core.VOID_ID);
}

function pour(x, y, m, count) {
  let poured = 0;
  for (let k = 0; poured < count && k < count * 4; k++) {
    if (core.mat[y * core.W + x] === core.VOID_ID) {
      core.setCell(x, y, m);
      poured++;
    }
    core.simulate();
  }
  for (let k = 0; k < SETTLE; k++) core.simulate();
}

function countIn(x0, x1, y0, y1, m) {
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (core.mat[y * core.W + x] === m) n++;
  }
  return n;
}

function lastHeard() {
  return heard[heard.length - 1];
}

function denied(key) {
  return ['denied', core.t(key)];
}

function ticks(n) {
  for (let k = 0; k < n; k++) core.tickMarket();
}

test('every refusal has a denied sound and its own translated text', () => {
  const reasons = ['exists', 'room', 'sky', 'high'];
  const texts = new Set();
  for (const v of reasons) {
    const r = core.BUILD_REPORTS[v];
    assert.strictEqual(r.sound, 'denied');
    assert.notStrictEqual(core.t(r.text), r.text);
    texts.add(r.text);
  }
  assert.strictEqual(texts.size, reasons.length);
  const drone = ['msg.noPad', 'msg.padFar', 'msg.droneSky'];
  const aborts = ['msg.abortGone', 'msg.abortFar', 'msg.abortSky', 'msg.droneEmpty'];
  for (const key of drone.concat(aborts)) assert.notStrictEqual(core.t(key), key);
});

test('the cargo box is tall enough for the largest natural heap', () => {
  assert.ok(core.CARGO_BOX_H >= Math.ceil(core.PAD_WIDTH / 2));
});

test('A1 a click on flat ground places a free platform on the ground, centred, no piles', () => {
  freshWorld();
  siteArena();
  const before = snapshot();
  core.market.money = 7;
  const report = click(SITE, ground() - 1);
  assert.strictEqual(report, core.PIECES.pad.done);
  assertOnly(before, zoneCells(SITE, ground() - 1, noPiles));
  assert.strictEqual(core.market.money, 7);
  assert.strictEqual(core.padState(), 'ready');
  assert.deepStrictEqual(heard, [[report.sound, core.t(report.text)]]);
});

test('A2 a click high in the air settles the platform onto the ground', () => {
  freshWorld();
  siteArena();
  const before = snapshot();
  assert.strictEqual(click(SITE, Math.floor(ground() / 2)), core.PIECES.pad.done);
  assertOnly(before, zoneCells(SITE, ground() - 1, noPiles));
});

test('A3 a click inside the ground is refused as no room and changes nothing', () => {
  freshWorld();
  siteArena();
  const before = snapshot();
  assert.strictEqual(click(SITE, ground() + 1), core.BUILD_REPORTS.room);
  assertOnly(before, new Set());
  assert.deepStrictEqual(heard, [denied(core.BUILD_REPORTS.room.text)]);
  assert.strictEqual(core.padState(), 'none');
});

test('A4 piles over a trench reach its floor; the platform rests beside it', () => {
  freshWorld();
  siteArena();
  trenchUnderPiles(SITE, core.PILE_MAX);
  const before = snapshot();
  assert.strictEqual(click(SITE, ground() - 1), core.PIECES.pad.done);
  assertOnly(before, zoneCells(SITE, ground() - 1, overTrench(core.PILE_MAX)));
});

test('A5 a trench deeper than max height under a pile is refused as too high', () => {
  freshWorld();
  siteArena();
  trenchUnderPiles(SITE, core.PILE_MAX + 1);
  const before = snapshot();
  assert.strictEqual(click(SITE, ground() - 1), core.BUILD_REPORTS.high);
  assertOnly(before, new Set());
  assert.deepStrictEqual(heard, [denied(core.BUILD_REPORTS.high.text)]);
});

test('A6 a pile stops on sand and another passes through water to the floor', () => {
  freshWorld();
  siteArena();
  const s = core.PILE_SPACING;
  const depth = core.PILE_MAX;
  const left = leftOf(SITE);
  const g = ground();
  dig(SITE, s - 2, 3 * s + core.PILE_WIDTH + 2, depth);
  fill(left + s - 2, left + 2 * s - 2, g + 2, g + depth - 1, core.matId('sand'));
  fill(
    left + 2 * s - 1,
    left + 3 * s + core.PILE_WIDTH + 2,
    g + 2,
    g + depth - 1,
    core.matId('water')
  );
  const before = snapshot();
  const lengths = (o) => (o === s ? 2 : o === 2 * s || o === 3 * s ? depth : 0);
  assert.strictEqual(click(SITE, g - 1), core.PIECES.pad.done);
  assertOnly(before, zoneCells(SITE, g - 1, lengths));
});

test('A7 smoke and steam count as empty', () => {
  freshWorld();
  siteArena();
  const b = zoneBox(SITE, ground() - 1);
  fill(b.left, b.right, b.top, b.bottom, core.matId('smoke'));
  for (let y = 0; y < b.top; y += 3) fill(b.left, b.right, y, y, core.matId('steam'));
  const before = snapshot();
  assert.strictEqual(click(SITE, ground() - 1), core.PIECES.pad.done);
  assertOnly(before, zoneCells(SITE, ground() - 1, noPiles));
});

test('A8 rock above a platform column blocks the sky; one column outside does not', () => {
  freshWorld();
  siteArena();
  const b = zoneBox(SITE, ground() - 1);
  const rock = core.matId('rock');
  core.setCell(b.left + 5, 2, rock);
  assert.strictEqual(click(SITE, ground() - 1), core.BUILD_REPORTS.sky);
  core.setCell(b.left + 5, 2, core.VOID_ID);
  core.setCell(b.right, b.boxTop + 1, rock);
  assert.strictEqual(click(SITE, ground() - 1), core.BUILD_REPORTS.sky);
  core.setCell(b.right, b.boxTop + 1, core.VOID_ID);
  assert.strictEqual(core.padState(), 'none');
  core.setCell(b.left - 1, 2, rock);
  core.setCell(b.right + 1, b.top - 1, rock);
  assert.strictEqual(click(SITE, ground() - 1), core.PIECES.pad.done);
  assert.deepStrictEqual(heard[0], denied(core.BUILD_REPORTS.sky.text));
});

test('A9 sand in the column above does not block', () => {
  freshWorld();
  siteArena();
  const b = zoneBox(SITE, ground() - 1);
  const sand = core.matId('sand');
  core.setCell(b.left + 5, 2, sand);
  core.setCell(b.left + 20, b.boxTop + 3, sand);
  core.setCell(b.right, b.top - 1, sand);
  const before = snapshot();
  assert.strictEqual(click(SITE, ground() - 1), core.PIECES.pad.done);
  assertOnly(before, zoneCells(SITE, ground() - 1, noPiles));
});

test('A10 a platform reaching past the window edge is refused as no room', () => {
  freshWorld();
  flatGround(0, 3 * core.PAD_WIDTH);
  flatGround(core.W - 3 * core.PAD_WIDTH, core.W - 1);
  const before = snapshot();
  assert.strictEqual(click(5, ground() - 1), core.BUILD_REPORTS.room);
  assert.strictEqual(click(core.W - 5, ground() - 1), core.BUILD_REPORTS.room);
  assertOnly(before, new Set());
});

test('A11 a second zone is refused and the first stays unchanged', () => {
  freshWorld();
  siteArena();
  placeFlat(SITE);
  const before = snapshot();
  assert.strictEqual(click(SITE + 2 * core.PAD_WIDTH, ground() - 1), core.BUILD_REPORTS.exists);
  assertOnly(before, new Set());
  assert.deepStrictEqual(heard, [denied(core.BUILD_REPORTS.exists.text)]);
});

test('A12 an existing zone is the only reason reported over a blocked sky', () => {
  freshWorld();
  siteArena();
  placeFlat(SITE);
  const other = SITE + 2 * core.PAD_WIDTH;
  core.setCell(other, 2, core.matId('rock'));
  click(other, ground() - 1);
  assert.deepStrictEqual(heard, [denied(core.BUILD_REPORTS.exists.text)]);
});

test('A13 right-click on a pile removes the whole zone and its cargo falls', () => {
  freshWorld();
  siteArena();
  const s = core.PILE_SPACING;
  trenchUnderPiles(SITE, core.PILE_MAX);
  const b = placeFlat(SITE);
  const sand = core.matId('sand');
  fill(b.left + s, b.left + 3 * s - 1, b.top - 5, b.top - 1, sand);
  assert.strictEqual(rightClick(b.left + s, ground() + 1), core.BUILD_REPORTS.removed);
  assert.strictEqual(padCells().size, 0);
  assert.strictEqual(core.padState(), 'none');
  assert.strictEqual(click(SITE + 2 * core.PAD_WIDTH, ground() - 1), core.PIECES.pad.done);
  for (let k = 0; k < 300; k++) core.simulate();
  assert.ok(countIn(b.left, b.right, b.bottom + 1, core.H - 1, sand) > 0);
});

test('A14 removal also clears zone cells stored outside the window', () => {
  freshWorld();
  edgeArena();
  const b = placeFlat(NEAR_EDGE);
  core.shiftWindow(2);
  assert.ok(b.left - 2 * core.CHUNK_SIZE < 0);
  assert.strictEqual(rightClick(1, b.top), core.BUILD_REPORTS.removed);
  core.shiftWindow(-2);
  assert.strictEqual(padCells().size, 0);
  assert.strictEqual(core.padState(), 'none');
});

test('A15 the zone stays put when the sand under it is dug away', () => {
  freshWorld();
  siteArena();
  const s = core.PILE_SPACING;
  const g = ground();
  const left = leftOf(SITE);
  const sand = core.matId('sand');
  fill(left - 2, left + core.PAD_WIDTH + 1, g - 3, g - 1, sand);
  fill(left + s + 2, left + 2 * s + 7, g - 8, g - 4, sand);
  const before = snapshot();
  const zone = zoneCells(SITE, g - 9, (o) => (o === 2 * s ? 0 : 5));
  assert.strictEqual(click(SITE, g - 20), core.PIECES.pad.done);
  assertOnly(before, zone);
  fill(left - 2, left + core.PAD_WIDTH + 1, g - 8, g - 1, core.VOID_ID);
  for (const i of zone) assert.strictEqual(core.mat[i], core.matId('pad'));
  for (let k = 0; k < 120; k++) core.simulate();
  assertSameSet(padCells(), zone);
});

test('A16 drilling, lava, falling sand and other buildings leave the zone unchanged', () => {
  freshWorld();
  siteArena();
  const b = placeFlat(SITE);
  const zone = padCells();
  const sand = core.matId('sand');
  core.player.x = SITE;
  core.player.y = b.top - 8;
  fill(b.left - 6, b.left - 1, b.bottom - 5, b.bottom, core.matId('lava'));
  for (let k = 0; k < 600; k++) {
    if (k < 120) core.drillHold([SITE, b.top + 1]);
    const x = b.left + (k % core.PAD_WIDTH);
    if (core.mat[b.boxTop * core.W + x] === core.VOID_ID) core.setCell(x, b.boxTop, sand);
    core.simulate();
  }
  core.setBuildId('wall');
  core.startBuildDrag(SITE, b.top, false);
  assert.strictEqual(core.finishBuild([SITE, b.top], [SITE, b.top]), core.BUILD_REPORTS.room);
  core.endBuildDrag();
  assertSameSet(padCells(), zone);
});

test('A17 sand poured past overflow stays inside the cargo box and spills on both sides', () => {
  freshWorld();
  siteArena();
  plateau();
  const b = placeFlat(SITE);
  const sand = core.matId('sand');
  const capacity = (core.PAD_WIDTH * core.PAD_WIDTH) / 4;
  pour(SITE, b.boxTop - 5, sand, 3 * capacity);
  const g = ground();
  assert.ok(countIn(SITE - 5 * core.PAD_WIDTH, b.left - 1, g, core.H - 1, sand) > 0);
  assert.ok(countIn(b.right + 1, SITE + 5 * core.PAD_WIDTH, g, core.H - 1, sand) > 0);
  assert.ok(countIn(b.left, b.right, b.boxTop, b.top - 1, sand) > 0);
  assert.strictEqual(countIn(b.left, b.right, 0, b.boxTop - 1, sand), 0);
  assert.strictEqual(core.padState(), 'ready');
});

test('A18 water poured on the zone runs off', () => {
  freshWorld();
  siteArena();
  plateau();
  const b = placeFlat(SITE);
  const water = core.matId('water');
  pour(SITE, b.boxTop - 5, water, 2 * core.PAD_WIDTH);
  assert.strictEqual(countIn(b.left, b.right, 0, b.top - 1, water), 0);
});

test('A19 a call with no zone is refused and changes nothing', () => {
  freshWorld();
  core.market.money = 100;
  core.callDrone();
  assert.deepStrictEqual(heard, [denied('msg.noPad')]);
  assert.strictEqual(core.market.money, 100);
  assert.strictEqual(core.market.drone, 0);
});

test('A19 a call to a zone partly outside the window is refused as too far', () => {
  freshWorld();
  edgeArena();
  placeFlat(NEAR_EDGE);
  core.shiftWindow(2);
  assert.strictEqual(core.padState(), 'away');
  core.market.money = 100;
  core.callDrone();
  assert.deepStrictEqual(heard, [denied('msg.padFar')]);
  assert.strictEqual(core.market.money, 100);
  assert.strictEqual(core.market.drone, 0);
});

test('A19 a wall across the sky column refuses the call before money is checked', () => {
  freshWorld();
  siteArena();
  const b = placeFlat(SITE);
  fill(b.left, b.right, b.boxTop - 6, b.boxTop - 6, core.matId('wall'));
  assert.strictEqual(core.padState(), 'blocked');
  core.market.money = 0;
  core.callDrone();
  assert.deepStrictEqual(heard, [denied('msg.droneSky')]);
  assert.strictEqual(core.market.money, 0);
  assert.strictEqual(core.market.drone, 0);
});

test('A19 a ready zone without the fee is refused with the fee', () => {
  freshWorld();
  siteArena();
  placeFlat(SITE);
  core.market.money = core.DRONE_FEE - 1;
  core.callDrone();
  assert.deepStrictEqual(heard, [['denied', core.tf('msg.cantAfford', { cost: core.DRONE_FEE })]]);
  assert.strictEqual(core.market.drone, 0);
});

test('A20 a wall inside the cargo box does not block; a second call is ignored', () => {
  freshWorld();
  siteArena();
  const b = placeFlat(SITE);
  fill(b.left + 5, b.left + 8, b.top - 3, b.top - 1, core.matId('wall'));
  assert.strictEqual(core.padState(), 'ready');
  core.market.money = 100;
  core.callDrone();
  core.callDrone();
  assert.deepStrictEqual(heard, [['launch', core.t('msg.droneOn')]]);
  assert.strictEqual(core.market.money, 100 - core.DRONE_FEE);
  assert.ok(core.market.drone > 0);
});

test('A21 a fixed thing in the sky column during the approach turns the drone back', () => {
  freshWorld();
  siteArena();
  const b = placeFlat(SITE);
  core.market.money = 100;
  core.callDrone();
  ticks(core.DRONE_TRIP / 4);
  core.setCell(SITE, b.boxTop - 6, core.matId('wall'));
  core.tickMarket();
  assert.strictEqual(core.market.money, 100);
  assert.strictEqual(core.market.drone, 0);
  assert.deepStrictEqual(lastHeard(), denied('msg.abortSky'));
});

test('A22 removing the zone during the approach turns the drone back', () => {
  freshWorld();
  siteArena();
  const b = placeFlat(SITE);
  core.market.money = 100;
  core.callDrone();
  ticks(core.DRONE_TRIP / 4);
  rightClick(SITE, b.top);
  core.tickMarket();
  assert.strictEqual(core.market.money, 100);
  assert.strictEqual(core.market.drone, 0);
  assert.deepStrictEqual(lastHeard(), denied('msg.abortGone'));
});

test('A22 the zone leaving the window during the approach turns the drone back', () => {
  freshWorld();
  edgeArena();
  placeFlat(NEAR_EDGE);
  core.market.money = 100;
  core.callDrone();
  ticks(core.DRONE_TRIP / 4);
  core.shiftWindow(2);
  core.tickMarket();
  assert.strictEqual(core.market.money, 100);
  assert.strictEqual(core.market.drone, 0);
  assert.deepStrictEqual(lastHeard(), denied('msg.abortFar'));
});

test('A23 the drone takes and pays only priced cargo inside the box', () => {
  freshWorld();
  siteArena();
  const b = placeFlat(SITE);
  const iron = core.matId('iron_scrap');
  const soil = core.matId('dirt');
  fill(b.left + 2, b.left + 11, b.top - 2, b.top - 1, iron);
  fill(b.left + 20, b.left + 24, b.top - 1, b.top - 1, soil);
  core.setCell(b.left + 3, b.boxTop - 1, iron);
  core.setCell(b.left - 2, b.bottom, iron);
  core.setCell(b.right + 2, b.bottom, iron);
  const inBox = countIn(b.left, b.right, b.boxTop, b.top - 1, iron);
  core.market.money = 100;
  core.callDrone();
  ticks(core.DRONE_TRIP / 2);
  const sum = inBox * core.priceOf(core.GOOD_OF.iron);
  assert.strictEqual(core.market.sold.iron, inBox);
  assert.strictEqual(core.market.money, 100 - core.DRONE_FEE + sum);
  assert.deepStrictEqual(lastHeard(), ['sale', core.tf('msg.droneSold', { sum: sum })]);
  assert.strictEqual(countIn(b.left, b.right, b.boxTop, b.top - 1, iron), 0);
  assert.strictEqual(countIn(b.left + 20, b.left + 24, b.top - 1, b.top - 1, soil), 5);
  assert.strictEqual(core.matAt(b.left + 3, b.boxTop - 1), iron);
  assert.strictEqual(core.matAt(b.left - 2, b.bottom), iron);
  assert.strictEqual(core.matAt(b.right + 2, b.bottom), iron);
});

test('A23 a box holding only unpriced material sends the drone back empty', () => {
  freshWorld();
  siteArena();
  const b = placeFlat(SITE);
  const soil = core.matId('dirt');
  fill(b.left, b.right, b.top - 1, b.top - 1, soil);
  core.market.money = 100;
  core.callDrone();
  ticks(core.DRONE_TRIP / 2);
  assert.strictEqual(core.market.money, 100 - core.DRONE_FEE);
  assert.deepStrictEqual(lastHeard(), denied('msg.droneEmpty'));
  assert.strictEqual(countIn(b.left, b.right, b.top - 1, b.top - 1, soil), core.PAD_WIDTH);
});

test('A24 the zone and its cargo survive the window moving away and back', () => {
  freshWorld();
  edgeArena();
  const b = placeFlat(NEAR_EDGE);
  fill(b.left + 2, b.left + 11, b.top - 2, b.top - 1, core.matId('iron_scrap'));
  const region = () => {
    const out = [];
    for (let y = 0; y <= b.bottom + 2; y++) {
      for (let x = b.left - 2; x <= b.right + 2; x++) out.push(core.matAt(x, y));
    }
    return out;
  };
  const before = region();
  core.shiftWindow(3);
  assert.ok(b.right - 3 * core.CHUNK_SIZE < 0);
  assert.strictEqual(core.padState(), 'away');
  core.shiftWindow(-3);
  assert.deepStrictEqual(region(), before);
  assert.strictEqual(core.padState(), 'ready');
});

test('A25 a new world has no zone and accepts a new one', () => {
  freshWorld();
  siteArena();
  placeFlat(SITE);
  core.resetMarket(false);
  core.resetPieces();
  core.resetBuild();
  core.generateWorld(7);
  assert.strictEqual(core.padState(), 'none');
  assert.strictEqual(padCells().size, 0);
  siteArena();
  assert.strictEqual(click(SITE, ground() - 1), core.PIECES.pad.done);
});

test('A26 the preview verdict ignores money and reach and names the click refusal', () => {
  freshWorld();
  siteArena();
  const b = zoneBox(SITE, ground() - 1);
  core.market.money = 0;
  core.player.x = SITE + 10 * core.PAD_WIDTH;
  assert.strictEqual(verdictAt(SITE, ground() - 1), 'ok');
  core.setCell(b.left + 5, 2, core.matId('rock'));
  assert.strictEqual(verdictAt(SITE, ground() - 1), 'sky');
  assert.strictEqual(click(SITE, ground() - 1), core.BUILD_REPORTS.sky);
  core.setCell(b.left + 5, 2, core.VOID_ID);
  const deep = SITE - 3 * core.PAD_WIDTH;
  trenchUnderPiles(deep, core.PILE_MAX + 1);
  assert.strictEqual(verdictAt(deep, ground() - 1), 'high');
  assert.strictEqual(click(deep, ground() - 1), core.BUILD_REPORTS.high);
  placeFlat(SITE);
  const other = SITE + 2 * core.PAD_WIDTH;
  assert.strictEqual(verdictAt(other, ground() - 1), 'exists');
  assert.strictEqual(click(other, ground() - 1), core.BUILD_REPORTS.exists);
});

test('A27 the preview shape is the settled platform with piles down to the trench floor', () => {
  freshWorld();
  siteArena();
  trenchUnderPiles(SITE, core.PILE_MAX);
  core.setBuildId('pad');
  const at = [SITE, Math.floor(ground() / 2)];
  const plan = core.buildPlan(at, at);
  const cells = new Set(plan.cells.map((c) => c.y * core.W + c.x));
  assertSameSet(cells, zoneCells(SITE, ground() - 1, overTrench(core.PILE_MAX)));
  assert.strictEqual(padCells().size, 0);
});
