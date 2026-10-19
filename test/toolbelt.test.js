const test = require('node:test');
const assert = require('node:assert');
const { core } = require('./core.js');

function freshToolbelt() {
  core.resetMarket(false);
  core.resetToolbelt(false);
  core.market.money = 500;
}

function changes(what, change) {
  assert.strictEqual(typeof core.toolbeltKey, 'function', 'core has no toolbelt redraw key');
  freshToolbelt();
  const money = core.market.money;
  const before = core.toolbeltKey();
  change();
  assert.strictEqual(core.market.money, money, `${what} changed money`);
  assert.notStrictEqual(core.toolbeltKey(), before, `${what} leaves the drawn toolbelt stale`);
}

test('a free unlock changes what the toolbelt draws', () => {
  changes('a free unlock', () => core.openTool('ignite'));
});

test('a level change at no cost changes what the toolbelt draws', () => {
  changes('a level change', () => {
    core.openTool('belt');
    const key = core.toolbeltKey();
    core.toolbelt.level.belt = 1;
    assert.notStrictEqual(core.toolbeltKey(), key, 'level change leaves the toolbelt stale');
  });
});

test('slot and pick changes change what the toolbelt draws', () => {
  changes('a pick', () => core.pickForSlot('drill'));
  changes('a slot swap', () => core.assignSlot(5, 'drill'));
});

test('opening every tool for the test room changes what the toolbelt draws', () => {
  changes('a room reset', () => core.resetToolbelt(true));
});

test('a money change still changes what the toolbelt draws', () => {
  assert.strictEqual(typeof core.toolbeltKey, 'function', 'core has no toolbelt redraw key');
  freshToolbelt();
  const before = core.toolbeltKey();
  core.market.money += 1;
  assert.notStrictEqual(core.toolbeltKey(), before);
});
