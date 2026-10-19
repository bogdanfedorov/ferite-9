const test = require('node:test');
const assert = require('node:assert');
const { core } = require('../test/core.js');

const FRAMES_PER_MINUTE = 3600;
const heard = [];

function listen(sound, text) {
  heard.push([sound, text]);
}

function freshWorld() {
  const spawn = core.generateWorld(42);
  core.spawnPlayer(spawn.spawnX, spawn.spawnY);
  core.resetMarket(false);
  core.resetToolbelt(false);
  core.setNoticeHook(listen);
  heard.length = 0;
}

function groundBelowPlayer() {
  const x = Math.round(core.player.x);
  let y = 0;
  while (core.mat[y * core.W + x] === core.VOID_ID) y++;
  return [x, y];
}

function fill(x0, x1, y0, y1, m) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) core.setCell(x, y, m);
  }
}

function zoneWithCargo(cx, good) {
  const g = core.H - 2 * core.PILE_MAX - 10;
  const left = cx - Math.floor((core.PAD_WIDTH - 1) / 2);
  const right = left + core.PAD_WIDTH - 1;
  const top = g - core.PAD_THICK;
  fill(left - 4, right + 4, 0, g - 1, core.VOID_ID);
  fill(left - 4, right + 4, g, g + 4, core.matId('rock'));
  core.setBuildId('pad');
  core.startBuildDrag(cx, g - 1, false);
  core.finishBuild([cx, g - 1], [cx, g - 1]);
  core.endBuildDrag();
  fill(left, left + 3, top - 2, top - 1, core.matId(good));
}

test('calling the drone without a pad is denied with a message', () => {
  freshWorld();
  core.callDrone();
  assert.deepStrictEqual(heard, [['denied', core.t('msg.noPad')]]);
});

test('a drone sale pays out and reports launch then sale', () => {
  freshWorld();
  zoneWithCargo(400, 'iron_scrap');
  core.market.money = 100;
  core.callDrone();
  for (let k = 0; k < core.DRONE_TRIP / 2; k++) core.tickMarket();
  const sum = core.market.money - (100 - core.DRONE_FEE);
  assert.ok(sum > 0);
  assert.strictEqual(core.market.sold.iron, 8);
  assert.deepStrictEqual(heard, [
    ['launch', core.t('msg.droneOn')],
    ['sale', core.tf('msg.droneSold', { sum: sum })]
  ]);
});

test('buying a tool unlocks it and reports unlock', () => {
  freshWorld();
  core.market.money = 1000;
  core.buyTool('ignite');
  assert.ok(core.toolOpen('ignite'));
  const name = core.t(core.PIECES.ignite.hud.name);
  assert.deepStrictEqual(heard, [['unlock', core.tf('msg.bought', { tool: name })]]);
});

test('buying a tool without money is denied with its cost', () => {
  freshWorld();
  core.market.money = 0;
  core.buyTool('ignite');
  assert.ok(!core.toolOpen('ignite'));
  const cost = core.pieceCost('ignite');
  assert.deepStrictEqual(heard, [['denied', core.tf('msg.cantAfford', { cost: cost })]]);
});

test('drilling ground reports the drill sound and no text', () => {
  freshWorld();
  const ground = groundBelowPlayer();
  core.player.y = ground[1] - 16;
  for (let k = 0; k < 120; k++) {
    core.drillHold([ground[0], ground[1] + 2]);
    core.simulate();
  }
  assert.ok(heard.length > 0);
  for (const entry of heard) assert.deepStrictEqual(entry, ['drill', null]);
});

test('grabbing empty air reports a message and no sound', () => {
  freshWorld();
  core.handPress([core.player.x, core.player.y]);
  assert.deepStrictEqual(heard, [[null, core.t('msg.nothingToGrab')]]);
});

test('igniting air reports the ignite sound and no text', () => {
  freshWorld();
  core.igniteHold([core.player.x, core.player.y]);
  assert.deepStrictEqual(heard, [['ignite', null]]);
});

test('a build report reaches the hook with its sound and text', () => {
  freshWorld();
  core.reportBuild(core.BUILD_REPORTS.room);
  core.reportBuild(core.BUILD_REPORTS.nothing);
  assert.deepStrictEqual(heard, [
    ['denied', core.t('msg.beltRoom')],
    [null, core.t('msg.nothingToRemove')]
  ]);
});

test('prices decay with market frames, not the wall clock', () => {
  freshWorld();
  const iron = core.GOOD_OF.iron;
  assert.strictEqual(core.priceOf(iron), iron.base);
  for (let k = 0; k < iron.half * FRAMES_PER_MINUTE; k++) core.tickMarket();
  assert.strictEqual(core.priceOf(iron), Math.round(iron.base / 2));
  core.resetMarket(false);
  assert.strictEqual(core.priceOf(iron), iron.base);
});

function freshWorldNoHook() {
  const spawn = core.generateWorld(42);
  core.spawnPlayer(spawn.spawnX, spawn.spawnY);
  core.resetMarket(false);
  core.resetToolbelt(false);
  core.market.money = 1000;
}

const SILENT_ACTIONS = [
  ['callDrone without a pad', () => core.callDrone()],
  ['buyTool', () => core.buyTool('ignite')],
  ['handPress', () => core.handPress([core.player.x, core.player.y])],
  ['igniteHold', () => core.igniteHold([core.player.x, core.player.y])],
  ['reportBuild', () => core.reportBuild(core.BUILD_REPORTS.room)],
  ['priceOf', () => core.priceOf(core.GOOD_OF.iron)]
];

for (const [name, action] of SILENT_ACTIONS) {
  test(`${name} runs without a notice hook`, () => {
    freshWorldNoHook();
    assert.doesNotThrow(action);
  });
}
