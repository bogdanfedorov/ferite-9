const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { core, CORE_FILES } = require('./core.js');

const STEPS = 120;

function worldHash(seed) {
  core.generateWorld(seed);
  for (let i = 0; i < STEPS; i++) core.simulate();
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from(core.mat.buffer));
  hash.update(Buffer.from(core.temp.buffer));
  return hash.digest('hex');
}

test('core and piece files load without a browser', () => {
  assert.ok(CORE_FILES.includes('js/world.js'));
  assert.ok(core.PIECE_IDS.length > 0);
});

test('the same seed gives the same world', () => {
  assert.strictEqual(worldHash(12345), worldHash(12345));
});

test('different seeds give different worlds', () => {
  assert.notStrictEqual(worldHash(1), worldHash(2));
});

test('every cell holds a known material after simulation', () => {
  worldHash(777);
  const unknown = core.mat.findIndex((m) => m >= core.MAT_COUNT);
  assert.strictEqual(unknown, -1);
});
