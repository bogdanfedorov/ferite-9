var CHUNK_MEM_MAX = 256;
var CHUNK_CACHE_MAX = 128;
var FOG_MEM_MAX = 8192;
var FOG_CACHE_MAX = 512;
var KEY_SPAN = 1048576;
var KEY_BIAS = 524288;
var READ_TRIES = 3;

function makeTier(name, memMax, cacheMax, report) {
  return {
    name,
    memMax,
    cacheMax,
    report,
    mem: new Map(),
    spill: new Map(),
    sent: new Map(),
    cache: new Map(),
    reading: new Map(),
    disk: new Set()
  };
}

var chunkTier = makeTier('chunks', CHUNK_MEM_MAX, CHUNK_CACHE_MAX, {
  found: (key) => chunkArrived(key),
  absent: (key) => chunkMissing(key),
  error: (key) => chunkFailed(key)
});
var fogTier = makeTier('fog', FOG_MEM_MAX, FOG_CACHE_MAX, {
  found: (key) => fogArrived(key),
  absent: (key) => fogMissing(key),
  error: (key) => fogFailed(key)
});
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

function setDiskBackend(backend) {
  diskBackend = backend;
}

function diskRun(work) {
  const p = diskChain.then(work);
  diskChain = p.catch(() => {});
  return p;
}

function diskFailed(err) {
  if (!diskBackend) return;
  diskBackend = null;
  diskEpoch++;
  fault('disk write failed', err);
  tierDetach(chunkTier);
  tierDetach(fogTier);
}

function tierDetach(tier) {
  for (const [key, v] of tier.spill) tier.mem.set(key, v);
  tier.spill.clear();
  tier.sent.clear();
  tier.disk.clear();
  const waiting = Array.from(tier.reading.keys());
  tier.reading.clear();
  for (let k = 0; k < waiting.length; k++) tier.report.error(waiting[k]);
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
    tierFlush(chunkTier);
    tierFlush(fogTier);
  }, 0);
}

function tierFlush(tier) {
  const backend = diskBackend;
  const batch = [];
  for (const [key, v] of tier.spill) {
    if (tier.sent.get(key) !== v) batch.push([key, v]);
  }
  if (!backend || !batch.length) return;
  const epoch = diskEpoch;
  for (let k = 0; k < batch.length; k++) tier.sent.set(batch[k][0], batch[k][1]);
  diskRun(() => backend.put(tier.name, batch)).then(
    () => tierWritten(tier, batch, epoch),
    (err) => {
      if (epoch === diskEpoch) diskFailed(err);
    }
  );
}

function tierWritten(tier, batch, epoch) {
  if (epoch !== diskEpoch) return;
  for (let k = 0; k < batch.length; k++) {
    const [key, v] = batch[k];
    if (tier.sent.get(key) === v) tier.sent.delete(key);
    if (tier.spill.get(key) === v) tier.spill.delete(key);
    tier.disk.add(key);
  }
  if (tier.spill.size) scheduleFlush();
}

function tierWaiting(tier, key) {
  if (!diskBackend || !tier.disk.has(key) || tierInRam(tier, key)) return false;
  tierRead(tier, key);
  return true;
}

function tierRead(tier, key) {
  const backend = diskBackend;
  if (!backend || !tier.disk.has(key) || tier.reading.has(key) || tierInRam(tier, key)) return;
  const token = { tries: 0 };
  tier.reading.set(key, token);
  tierAsk(tier, key, token, backend);
}

function tierAsk(tier, key, token, backend) {
  token.tries++;
  backend.get(tier.name, key).then(
    (v) => tierReply(tier, key, token, v, null),
    (err) => tierReply(tier, key, token, undefined, err || new Error(`${tier.name} read failed`))
  );
}

function tierReply(tier, key, token, v, err) {
  if (tier.reading.get(key) !== token) return;
  if (err && token.tries < READ_TRIES && diskBackend) {
    tierAsk(tier, key, token, diskBackend);
    return;
  }
  tier.reading.delete(key);
  if (err) {
    fault(`${tier.name} read ${keyCx(key)},${keyCy(key)}`, err);
    tier.report.error(key);
    return;
  }
  if (v === undefined) {
    tier.disk.delete(key);
    tier.report.absent(key);
    return;
  }
  tier.cache.set(key, v);
  tier.report.found(key);
  tierTrimCache(tier);
}

function tierTrimCache(tier) {
  for (const key of tier.cache.keys()) {
    if (tier.cache.size <= tier.cacheMax) break;
    tier.cache.delete(key);
  }
}

function storeHasDisk() {
  return chunkTier.disk.size + fogTier.disk.size > 0;
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
