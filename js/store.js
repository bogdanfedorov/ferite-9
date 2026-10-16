var CHUNK_MEM_MAX = 256;
var CHUNK_CACHE_MAX = 128;
var FOG_MEM_MAX = 8192;
var FOG_CACHE_MAX = 512;
var KEY_SPAN = 1048576;
var KEY_BIAS = 524288;
var DB_NAME = 'ferit9.world';
var DB_STORES = ['chunks', 'fog', 'meta'];

function makeTier(name, memMax, cacheMax) {
  return {
    name,
    memMax,
    cacheMax,
    mem: new Map(),
    spill: new Map(),
    sent: new Map(),
    cache: new Map(),
    reading: new Map(),
    disk: new Set()
  };
}

var chunkTier = makeTier('chunks', CHUNK_MEM_MAX, CHUNK_CACHE_MAX);
var fogTier = makeTier('fog', FOG_MEM_MAX, FOG_CACHE_MAX);
var diskBackend = null;
var diskEpoch = 0;
var diskChain = Promise.resolve();
var flushQueued = false;

function chunkKey(cx, cy) {
  return (cx + KEY_BIAS) * KEY_SPAN + (cy + KEY_BIAS);
}

function keyCx(key) {
  return Math.floor(key / KEY_SPAN) - KEY_BIAS;
}

function keyCy(key) {
  return (key % KEY_SPAN) - KEY_BIAS;
}

function idbTx(db, stores, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const req = work(tx);
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function makeIdbBackend(name) {
  let opening = null;
  const open = () => {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const rq = indexedDB.open(name, 1);
      rq.onupgradeneeded = () => {
        for (let k = 0; k < DB_STORES.length; k++) rq.result.createObjectStore(DB_STORES[k]);
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    return opening;
  };
  return {
    put: (store, pairs) =>
      open().then((db) =>
        idbTx(db, [store], 'readwrite', (tx) => {
          const os = tx.objectStore(store);
          for (let k = 0; k < pairs.length; k++) os.put(pairs[k][1], pairs[k][0]);
          return null;
        })
      ),
    get: (store, key) =>
      open().then((db) => idbTx(db, [store], 'readonly', (tx) => tx.objectStore(store).get(key))),
    keys: (store) =>
      open().then((db) =>
        idbTx(db, [store], 'readonly', (tx) => tx.objectStore(store).getAllKeys())
      ),
    clear: () =>
      open().then((db) =>
        idbTx(db, DB_STORES, 'readwrite', (tx) => {
          for (let k = 0; k < DB_STORES.length; k++) tx.objectStore(DB_STORES[k]).clear();
          return null;
        })
      )
  };
}

function setDiskBackend(backend) {
  diskBackend = backend;
}

if (typeof indexedDB !== 'undefined') setDiskBackend(makeIdbBackend(DB_NAME));

function diskRun(work) {
  const p = diskChain.then(work);
  diskChain = p.catch(() => {});
  return p;
}

function diskFailed() {
  diskBackend = null;
  const tiers = [chunkTier, fogTier];
  for (let k = 0; k < tiers.length; k++) {
    const tier = tiers[k];
    for (const [key, v] of tier.spill) tier.mem.set(key, v);
    tier.spill.clear();
    tier.sent.clear();
  }
}

function tierInRam(tier, key) {
  return tier.mem.has(key) || tier.spill.has(key) || tier.cache.has(key);
}

function tierTake(tier, key) {
  const maps = [tier.mem, tier.spill, tier.cache];
  let found = null;
  for (let k = 0; k < maps.length; k++) {
    const hit = maps[k].get(key);
    maps[k].delete(key);
    if (found === null && hit !== undefined) found = hit;
  }
  if (found !== null) tier.reading.delete(key);
  return found;
}

function tierPut(tier, key, v) {
  tier.cache.delete(key);
  tier.spill.delete(key);
  tier.reading.delete(key);
  tier.mem.delete(key);
  tier.mem.set(key, v);
  tierEvict(tier);
}

function tierEvict(tier) {
  if (!diskBackend || tier.mem.size <= tier.memMax) return;
  for (const key of tier.mem.keys()) {
    if (tier.mem.size <= tier.memMax) break;
    tier.spill.set(key, tier.mem.get(key));
    tier.mem.delete(key);
  }
  scheduleFlush();
}

function scheduleFlush() {
  if (flushQueued) return;
  flushQueued = true;
  setTimeout(() => {
    flushQueued = false;
    flushSpill();
  }, 0);
}

function flushSpill() {
  return Promise.all([tierFlush(chunkTier), tierFlush(fogTier)]);
}

function tierFlush(tier) {
  const backend = diskBackend;
  const batch = [];
  for (const [key, v] of tier.spill) {
    if (tier.sent.get(key) !== v) batch.push([key, v]);
  }
  if (!backend || !batch.length) return Promise.resolve();
  const epoch = diskEpoch;
  for (let k = 0; k < batch.length; k++) tier.sent.set(batch[k][0], batch[k][1]);
  return diskRun(() => backend.put(tier.name, batch)).then(() => {
    if (epoch !== diskEpoch) return;
    for (let k = 0; k < batch.length; k++) {
      const key = batch[k][0];
      if (tier.sent.get(key) === batch[k][1]) tier.sent.delete(key);
      if (tier.spill.get(key) === batch[k][1]) tier.spill.delete(key);
      tier.disk.add(key);
    }
    if (tier.spill.size) scheduleFlush();
  }, diskFailed);
}

function tierWaiting(tier, key) {
  if (!diskBackend || !tier.disk.has(key) || tierInRam(tier, key)) return false;
  tierRead(tier, key);
  return true;
}

function tierRead(tier, key) {
  const backend = diskBackend;
  const skip = !backend || !tier.disk.has(key) || tier.reading.has(key) || tierInRam(tier, key);
  if (skip) return Promise.resolve();
  const epoch = diskEpoch;
  const token = {};
  tier.reading.set(key, token);
  return backend.get(tier.name, key).then(
    (v) => {
      if (tier.reading.get(key) !== token) return;
      tier.reading.delete(key);
      if (epoch !== diskEpoch || v === undefined) return;
      tier.cache.set(key, v);
      if (tier === chunkTier) chunkArrived(key);
      else fogArrived(key);
      tierTrimCache(tier);
    },
    () => {
      if (tier.reading.get(key) === token) tier.reading.delete(key);
    }
  );
}

function tierTrimCache(tier) {
  for (const key of tier.cache.keys()) {
    if (tier.cache.size <= tier.cacheMax) break;
    tier.cache.delete(key);
  }
}

function storeReset() {
  diskEpoch++;
  const tiers = [chunkTier, fogTier];
  for (let k = 0; k < tiers.length; k++) {
    const tier = tiers[k];
    tier.mem.clear();
    tier.spill.clear();
    tier.sent.clear();
    tier.cache.clear();
    tier.reading.clear();
    tier.disk.clear();
  }
  const backend = diskBackend;
  if (backend) diskRun(() => backend.clear()).catch(diskFailed);
}

function storeLoadIndex() {
  const backend = diskBackend;
  if (!backend) return Promise.resolve(null);
  const epoch = diskEpoch;
  const load = () =>
    Promise.all([backend.keys('chunks'), backend.keys('fog'), backend.get('meta', 'world')]);
  return diskRun(load).then(([chunks, fog, meta]) => {
    if (epoch !== diskEpoch) return null;
    for (let k = 0; k < chunks.length; k++) chunkTier.disk.add(chunks[k]);
    for (let k = 0; k < fog.length; k++) fogTier.disk.add(fog[k]);
    return meta === undefined ? null : meta;
  }, () => null);
}

function storeWarm(keys) {
  const jobs = [];
  for (let k = 0; k < keys.length; k++) {
    jobs.push(tierRead(chunkTier, keys[k]));
    jobs.push(tierRead(fogTier, keys[k]));
  }
  return Promise.all(jobs);
}

function storeFlushAll(meta) {
  const backend = diskBackend;
  if (!backend) return Promise.resolve(false);
  const tiers = [chunkTier, fogTier];
  for (let k = 0; k < tiers.length; k++) {
    for (const [key, v] of tiers[k].mem) tiers[k].spill.set(key, v);
    tiers[k].mem.clear();
  }
  const epoch = diskEpoch;
  return flushSpill()
    .then(() => diskRun(() => backend.put('meta', [['world', meta]])))
    .then(() => epoch === diskEpoch && diskBackend === backend, () => false);
}
