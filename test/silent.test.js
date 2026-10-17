const test = require('node:test');
const assert = require('node:assert');
const { core } = require('./core.js');

function freshWorld() {
  const spawn = core.generateWorld(42);
  core.spawnPlayer(spawn.spawnX, spawn.spawnY);
  core.resetMarket(false);
  core.resetToolbelt(false);
  core.market.money = 1000;
}

const ACTIONS = [
  ['callDrone without a pad', () => core.callDrone()],
  ['buyTool', () => core.buyTool('ignite')],
  ['handPress', () => core.handPress([core.player.x, core.player.y])],
  ['igniteHold', () => core.igniteHold([core.player.x, core.player.y])],
  ['reportBuild', () => core.reportBuild(core.BUILD_REPORTS.room)],
  ['priceOf', () => core.priceOf(core.GOOD_OF.iron)]
];

for (const [name, action] of ACTIONS) {
  test(`${name} runs without a notice hook`, () => {
    freshWorld();
    assert.doesNotThrow(action);
  });
}
