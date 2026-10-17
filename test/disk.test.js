const test = require('node:test');
const assert = require('node:assert');
const { loadTab, settle, spill, makeSharedDisk } = require('./fake-disk.js');

const SPILL_PREFIX = 'ferit9.spill.';

function spillNames(shared) {
  return shared.idb.names().filter((name) => name.startsWith(SPILL_PREFIX));
}

test('two tabs spill into two databases of their own', async () => {
  const shared = makeSharedDisk();
  const a = loadTab(shared);
  const b = loadTab(shared);
  await spill(a, a.chunkTier, 1, 'a');
  await spill(b, b.chunkTier, 1, 'b');
  assert.strictEqual(spillNames(shared).length, 2, shared.idb.names().join(', '));
});

test('two tabs spilling the same chunk keys each read back their own', async () => {
  const shared = makeSharedDisk();
  const a = loadTab(shared);
  const b = loadTab(shared);
  const [key] = await spill(a, a.chunkTier, 1, 'a');
  await spill(b, b.chunkTier, 1, 'b');
  a.tierRead(a.chunkTier, key);
  await settle();
  assert.deepStrictEqual(a.reports, [['chunkArrived', key]]);
  assert.strictEqual(a.tierTake(a.chunkTier, key).tag, 'a');
});

test('a new world in one tab keeps the spilled chunks of another tab', async () => {
  const shared = makeSharedDisk();
  const a = loadTab(shared);
  const b = loadTab(shared);
  const [key] = await spill(a, a.chunkTier, 1, 'a');
  b.storeReset();
  await settle();
  a.tierRead(a.chunkTier, key);
  await settle();
  assert.deepStrictEqual(a.reports, [['chunkArrived', key]]);
});

test('startup deletes spill databases of closed tabs and keeps live ones', async () => {
  const shared = makeSharedDisk();
  shared.idb.create(`${SPILL_PREFIX}gone`);
  shared.idb.create(`${SPILL_PREFIX}alive`);
  shared.locks.held.add(`${SPILL_PREFIX}alive`);
  loadTab(shared);
  await settle();
  const names = spillNames(shared);
  assert.strictEqual(names.includes(`${SPILL_PREFIX}gone`), false, names.join(', '));
  assert.strictEqual(names.includes(`${SPILL_PREFIX}alive`), true, names.join(', '));
});

test('a blocked open fails the disk and closes the connection that arrives later', async () => {
  const shared = makeSharedDisk();
  shared.idb.blockNext = true;
  const tab = loadTab(shared);
  const keys = await spill(tab, tab.chunkTier, 1);
  assert.strictEqual(tab.tierInRam(tab.chunkTier, keys[0]), true);
  shared.idb.unblock();
  await settle();
  const open = shared.idb.connections.filter((conn) => !conn.closed);
  assert.strictEqual(open.length, 0);
});
