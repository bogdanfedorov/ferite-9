const test = require('node:test');
const assert = require('node:assert');
const { loadStore, settle, spill, makeFakeBackend } = require('./fake-disk.js');

function storeWithDisk() {
  const store = loadStore();
  const fake = makeFakeBackend();
  store.setDiskBackend(fake.backend);
  return { store, fake };
}

function chunkValuesInRam(tier) {
  const seen = new Set();
  for (const part of Object.values(tier)) {
    if (Object.prototype.toString.call(part) !== '[object Map]') continue;
    for (const v of part.values()) if (v && typeof v === 'object' && 'mat' in v) seen.add(v);
  }
  return seen.size;
}

test('a spilled chunk read back is reported as arrived', async () => {
  const { store } = storeWithDisk();
  const [key] = await spill(store, store.chunkTier, 1);
  assert.strictEqual(store.tierWaiting(store.chunkTier, key), true);
  await settle();
  assert.deepStrictEqual(store.reports, [['chunkArrived', key]]);
  assert.strictEqual(store.tierTake(store.chunkTier, key).mat, 0);
});

test('a chunk the disk does not have is reported missing and forgotten', async () => {
  const { store, fake } = storeWithDisk();
  const [key] = await spill(store, store.chunkTier, 1);
  fake.table('chunks').delete(key);
  store.tierRead(store.chunkTier, key);
  await settle();
  assert.deepStrictEqual(store.reports, [['chunkMissing', key]]);
  assert.strictEqual(store.tierWaiting(store.chunkTier, key), false);
});

test('a failed chunk read is reported as failed, never as missing', async () => {
  const { store, fake } = storeWithDisk();
  const [key] = await spill(store, store.chunkTier, 1);
  fake.failing.add('get');
  store.tierRead(store.chunkTier, key);
  await settle();
  assert.deepStrictEqual(store.reports, [['chunkFailed', key]]);
});

test('a failed fog read is reported as failed, never as missing', async () => {
  const { store, fake } = storeWithDisk();
  const [key] = await spill(store, store.fogTier, 1);
  fake.failing.add('get');
  store.tierRead(store.fogTier, key);
  await settle();
  assert.deepStrictEqual(store.reports, [['fogFailed', key]]);
});

test('a failed read keeps the saved chunk listed and the next read finds it', async () => {
  const { store, fake } = storeWithDisk();
  const [key] = await spill(store, store.chunkTier, 1);
  fake.failing.add('get');
  store.tierRead(store.chunkTier, key);
  await settle();
  fake.failing.clear();
  store.reports.length = 0;
  assert.strictEqual(store.tierWaiting(store.chunkTier, key), true);
  await settle();
  assert.deepStrictEqual(store.reports, [['chunkArrived', key]]);
  assert.strictEqual(store.tierTake(store.chunkTier, key).mat, 0);
});

test('a write failure ends reads in flight as failed, then reports the disk lost once', async () => {
  const { store, fake } = storeWithDisk();
  const [key] = await spill(store, store.chunkTier, 1);
  fake.holding = true;
  store.tierRead(store.chunkTier, key);
  store.tierPut(store.chunkTier, store.chunkKey(-1, -1), { mat: -1 });
  await settle();
  fake.held.find((op) => op.kind === 'put').fail();
  await settle();
  for (const op of fake.held) op.ok();
  await settle();
  assert.deepStrictEqual(store.reports, [
    ['chunkFailed', key],
    ['diskLost', undefined]
  ]);
  assert.strictEqual(store.tierWaiting(store.chunkTier, key), false);
});

test('replies released in reverse order each reach their own key', async () => {
  const { store, fake } = storeWithDisk();
  const [a, b] = await spill(store, store.chunkTier, 2);
  fake.holding = true;
  store.tierRead(store.chunkTier, a);
  store.tierRead(store.chunkTier, b);
  fake.held[1].ok();
  fake.held[0].ok();
  await settle();
  assert.deepStrictEqual(store.reports, [
    ['chunkArrived', b],
    ['chunkArrived', a]
  ]);
  assert.strictEqual(store.tierTake(store.chunkTier, a).mat, 0);
  assert.strictEqual(store.tierTake(store.chunkTier, b).mat, 1);
});

test('replies that arrive after storeReset are ignored', async () => {
  const { store, fake } = storeWithDisk();
  const [a, b] = await spill(store, store.chunkTier, 2);
  fake.holding = true;
  store.tierRead(store.chunkTier, a);
  store.tierRead(store.chunkTier, b);
  store.storeReset();
  await settle();
  fake.held[0].ok();
  fake.held[1].fail();
  for (const op of fake.held.slice(2)) op.ok();
  await settle();
  assert.deepStrictEqual(store.reports, []);
  assert.strictEqual(store.tierWaiting(store.chunkTier, a), false);
});

test('chunks written to disk do not stay in RAM', async () => {
  const { store } = storeWithDisk();
  const tier = store.chunkTier;
  if (typeof store.storeSnapshot === 'function') await store.storeSnapshot({});
  for (let i = 0; i < 3 * tier.memMax; i++) store.tierPut(tier, store.chunkKey(i, 1), { mat: i });
  await settle();
  assert.ok(chunkValuesInRam(tier) <= tier.memMax + tier.cacheMax, `${chunkValuesInRam(tier)}`);
});

test('the store has no save layer and no browser backend', () => {
  const store = loadStore();
  const gone = [
    'storeSnapshot',
    'storeLoadIndex',
    'storeWarm',
    'tierMigrate',
    'storeLayer',
    'storeResumable',
    'storeStartup',
    'makeIdbBackend'
  ];
  assert.deepStrictEqual(
    gone.filter((name) => name in store),
    []
  );
  assert.strictEqual('over' in store.chunkTier, false);
});

test('a write from before storeReset that fails does not turn the disk off', async () => {
  const { store, fake } = storeWithDisk();
  fake.holding = true;
  await spill(store, store.chunkTier, 1, 'old game');
  const put = fake.held.find((op) => op.kind === 'put');
  assert.ok(put, 'spill started a write');
  store.storeReset();
  put.fail();
  await settle();
  for (const op of fake.held) if (op !== put) op.ok();
  await settle();
  assert.deepStrictEqual(store.reports, []);
  assert.strictEqual(store.diskBackend, fake.backend, 'old write failure killed the new disk');
});
