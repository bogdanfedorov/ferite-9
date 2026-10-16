var CHUNK_MEM_MAX = 256;
var CHUNK_CACHE_MAX = 128;
var FOG_MEM_MAX = 8192;
var FOG_CACHE_MAX = 512;
var KEY_SPAN = 1048576;
var KEY_BIAS = 524288;
var DB_NAME = 'ferit9.world';
var DB_STORES = ['chunks', 'fog', 'chunks_live', 'fog_live', 'meta'];
var DB_VERSION = 2;

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
    disk: new Set(),
    over: new Map()
  };
}

var chunkTier = makeTier('chunks', CHUNK_MEM_MAX, CHUNK_CACHE_MAX);
var fogTier = makeTier('fog', FOG_MEM_MAX, FOG_CACHE_MAX);
var diskBackend = null;
var diskEpoch = 0;
var diskChain = Promise.resolve();
var flushQueued = false;
var storeLayer = 'base';
var storeResumable = originIsStable();

function originIsStable() {
  if (typeof location === 'undefined') return true;
  const loopback = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  return !(location.protocol === 'http:' && loopback && location.port !== '');
}

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

function clearStores(opening, names) {
  return opening.then((db) =>
    idbTx(db, names, 'readwrite', (tx) => {
      for (let k = 0; k < names.length; k++) tx.objectStore(names[k]).clear();
      return null;
    })
  );
}

function makeIdbBackend(name) {
  let opening = null;
  const open = () => {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const rq = indexedDB.open(name, DB_VERSION);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        for (let k = 0; k < DB_STORES.length; k++) {
          if (!db.objectStoreNames.contains(DB_STORES[k])) db.createObjectStore(DB_STORES[k]);
        }
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
    clear: () => clearStores(open(), DB_STORES),
    clearNamed: (names) => clearStores(open(), names)
  };
}

function setDiskBackend(backend) {
  diskBackend = backend;
}

if (typeof indexedDB !== 'undefined') setDiskBackend(makeIdbBackend(DB_NAME));

function storeStartup() {
  const backend = diskBackend;
  if (backend && !storeResumable) diskRun(() => backend.clear()).catch(diskFailed);
}

storeStartup();

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
    tier.over.clear();
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

function tierOnDisk(tier, key) {
  return tier.over.has(key) || tier.disk.has(key);
}

function tierDiskName(tier, key) {
  return tier.over.has(key) ? tier.name + '_live' : tier.name;
}

function tierFlush(tier, toBase) {
  const backend = diskBackend;
  const batch = [];
  for (const [key, v] of tier.spill) {
    if (toBase || tier.sent.get(key) !== v) batch.push([key, v]);
  }
  if (!backend || !batch.length) return Promise.resolve();
  const epoch = diskEpoch;
  const base = toBase || storeLayer === 'base';
  const name = base ? tier.name : tier.name + '_live';
  for (let k = 0; k < batch.length; k++) tier.sent.set(batch[k][0], batch[k][1]);
  return diskRun(() => backend.put(name, batch)).then(() => {
    if (epoch !== diskEpoch) return;
    for (let k = 0; k < batch.length; k++) {
      const key = batch[k][0];
      if (tier.sent.get(key) === batch[k][1]) tier.sent.delete(key);
      if (tier.spill.get(key) === batch[k][1]) tier.spill.delete(key);
      if (base) {
        tier.disk.add(key);
        tier.over.delete(key);
      } else tier.over.set(key, batch[k][1]);
    }
    if (tier.spill.size) scheduleFlush();
  }, diskFailed);
}

function tierMissing(tier, key) {
  tier.disk.delete(key);
  tier.over.delete(key);
  if (tier === chunkTier) chunkMissing(key);
  else fogMissing(key);
}

function tierWaiting(tier, key) {
  if (!diskBackend || !tierOnDisk(tier, key) || tierInRam(tier, key)) return false;
  tierRead(tier, key);
  return true;
}

function tierRead(tier, key) {
  const backend = diskBackend;
  const skip = !backend || !tierOnDisk(tier, key) || tier.reading.has(key) || tierInRam(tier, key);
  if (skip) return Promise.resolve();
  const epoch = diskEpoch;
  const token = {};
  tier.reading.set(key, token);
  return backend.get(tierDiskName(tier, key), key).then(
    (v) => {
      if (tier.reading.get(key) !== token) return;
      tier.reading.delete(key);
      if (epoch !== diskEpoch) return;
      if (v === undefined) {
        tierMissing(tier, key);
        return;
      }
      tier.cache.set(key, v);
      if (tier === chunkTier) chunkArrived(key);
      else fogArrived(key);
      tierTrimCache(tier);
    },
    () => {
      if (tier.reading.get(key) !== token) return;
      tier.reading.delete(key);
      if (tier === chunkTier) chunkMissing(key);
      else fogMissing(key);
    }
  );
}

function tierTrimCache(tier) {
  for (const key of tier.cache.keys()) {
    if (tier.cache.size <= tier.cacheMax) break;
    tier.cache.delete(key);
  }
}

function storeHasDisk() {
  return chunkTier.disk.size + chunkTier.over.size + fogTier.disk.size + fogTier.over.size > 0;
}

function storeReset() {
  diskEpoch++;
  storeLayer = 'base';
  const tiers = [chunkTier, fogTier];
  for (let k = 0; k < tiers.length; k++) {
    const tier = tiers[k];
    tier.mem.clear();
    tier.spill.clear();
    tier.sent.clear();
    tier.cache.clear();
    tier.reading.clear();
    tier.disk.clear();
    tier.over.clear();
  }
  const backend = diskBackend;
  if (backend) diskRun(() => backend.clear()).catch(diskFailed);
}

function storeLoadIndex() {
  const backend = diskBackend;
  if (!backend || !storeResumable) return Promise.resolve(null);
  const epoch = diskEpoch;
  const load = () =>
    Promise.all([backend.keys('chunks'), backend.keys('fog'), backend.get('meta', 'world')]);
  return diskRun(load).then(
    ([chunks, fog, meta]) => {
      if (epoch !== diskEpoch || meta === undefined) return null;
      for (let k = 0; k < chunks.length; k++) chunkTier.disk.add(chunks[k]);
      for (let k = 0; k < fog.length; k++) fogTier.disk.add(fog[k]);
      storeLayer = 'over';
      diskRun(() => backend.clearNamed(['chunks_live', 'fog_live'])).catch(diskFailed);
      return meta;
    },
    () => null
  );
}

function storeWarm(keys) {
  const jobs = [];
  for (let k = 0; k < keys.length; k++) {
    jobs.push(tierRead(chunkTier, keys[k]));
    jobs.push(tierRead(fogTier, keys[k]));
  }
  return Promise.all(jobs);
}

function tierMigrate(tier, backend, keys, epoch) {
  if (!keys.length) return Promise.resolve();
  const marks = keys.map((key) => tier.over.get(key));
  const work = () =>
    Promise.all(keys.map((key) => backend.get(tier.name + '_live', key))).then((values) => {
      const pairs = [];
      for (let k = 0; k < keys.length; k++) {
        if (values[k] !== undefined) pairs.push([keys[k], values[k]]);
      }
      return backend.put(tier.name, pairs);
    });
  return diskRun(work).then(() => {
    if (epoch !== diskEpoch) return;
    for (let k = 0; k < keys.length; k++) {
      if (tier.over.get(keys[k]) !== marks[k]) continue;
      tier.over.delete(keys[k]);
      tier.disk.add(keys[k]);
    }
  });
}

function storeSnapshot(meta) {
  const backend = diskBackend;
  if (!backend) return Promise.resolve(false);
  const epoch = diskEpoch;
  const tiers = [chunkTier, fogTier];
  const jobs = [];
  for (let k = 0; k < tiers.length; k++) {
    const tier = tiers[k];
    for (const [key, v] of tier.mem) tier.spill.set(key, v);
    tier.mem.clear();
    const flush = tierFlush(tier, true);
    const stale = Array.from(tier.over.keys()).filter((key) => !tier.spill.has(key));
    jobs.push(flush, tierMigrate(tier, backend, stale, epoch));
  }
  storeLayer = 'over';
  return Promise.all(jobs)
    .then(() => {
      if (diskBackend !== backend) throw new Error('disk layer lost');
      return diskRun(() => backend.put('meta', [['world', meta]]));
    })
    .then(
      () => epoch === diskEpoch && diskBackend === backend,
      () => false
    );
}
