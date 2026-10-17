const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const REPORTS = [
  'chunkArrived',
  'chunkMissing',
  'chunkFailed',
  'fogArrived',
  'fogMissing',
  'fogFailed'
];
const TAB_FILES = new Set(['js/store.js', 'js/disk.js']);

function pageFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map((m) => m[1])
    .filter((file) => TAB_FILES.has(file));
}

function makeContext(globals) {
  const reports = [];
  const ctx = vm.createContext({ setTimeout, clearTimeout, reports, ...globals });
  for (const name of REPORTS) ctx[name] = (key) => reports.push([name, key]);
  ctx.fault = (_what, err) => reports.push(['fault', err?.message]);
  return ctx;
}

function runFiles(ctx, files) {
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  }
  return ctx;
}

function loadStore() {
  return runFiles(makeContext({}), ['js/store.js']);
}

function loadTab(shared) {
  const globals = {
    indexedDB: shared.idb,
    navigator: { locks: shared.locks }
  };
  return runFiles(makeContext(globals), pageFiles());
}

async function settle() {
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setTimeout(resolve, 1));
}

async function spill(store, tier, count, tag) {
  const keys = [];
  for (let i = 0; i < tier.memMax + count; i++) {
    const key = store.chunkKey(i, 0);
    keys.push(key);
    store.tierPut(tier, key, { mat: i, tag });
  }
  await settle();
  return keys.slice(0, count);
}

function makeFakeBackend() {
  const fake = { data: new Map(), held: [], holding: false, failing: new Set() };
  const table = (name) => {
    if (!fake.data.has(name)) fake.data.set(name, new Map());
    return fake.data.get(name);
  };
  const call = (kind, run) =>
    new Promise((resolve, reject) => {
      const op = {
        kind,
        ok: () => resolve(run()),
        fail: () => reject(new Error(`${kind} failed`))
      };
      if (fake.holding) fake.held.push(op);
      else if (fake.failing.has(kind)) op.fail();
      else op.ok();
    });
  fake.table = table;
  fake.backend = {
    get: (store, key) => call('get', () => table(store).get(key)),
    put: (store, pairs) =>
      call('put', () => {
        for (const [key, v] of pairs) table(store).set(key, v);
      }),
    clear: () => call('clear', () => fake.data.clear())
  };
  return fake;
}

function makeTransaction(db) {
  const tx = {};
  const request = (run) => ({ result: run() });
  tx.objectStore = (name) => {
    const rows = db.stores.get(name);
    return {
      put: (v, key) => request(() => rows.set(key, v)),
      get: (key) => request(() => rows.get(key)),
      getAllKeys: () => request(() => [...rows.keys()]),
      clear: () => request(() => rows.clear())
    };
  };
  setTimeout(() => tx.oncomplete?.(), 0);
  return tx;
}

function makeConnection(db) {
  const conn = {
    closed: false,
    objectStoreNames: { contains: (name) => db.stores.has(name) },
    createObjectStore: (name) => db.stores.set(name, new Map()),
    transaction: () => makeTransaction(db),
    close: () => {
      conn.closed = true;
    }
  };
  return conn;
}

function makeFakeIdb() {
  const dbs = new Map();
  const blocked = [];
  const idb = { connections: [], blockNext: false };
  const connect = (name, version, rq) => {
    if (!dbs.has(name)) dbs.set(name, { version: 0, stores: new Map() });
    const db = dbs.get(name);
    const conn = makeConnection(db);
    idb.connections.push(conn);
    rq.result = conn;
    if (db.version < version) {
      db.version = version;
      rq.onupgradeneeded?.();
    }
    rq.onsuccess?.();
  };
  idb.names = () => [...dbs.keys()];
  idb.rows = (name, store) => dbs.get(name).stores.get(store);
  idb.create = (name) => dbs.set(name, { version: 1, stores: new Map([['chunks', new Map()]]) });
  idb.unblock = () => {
    for (const go of blocked.splice(0)) go();
  };
  idb.open = (name, version) => {
    const rq = {};
    setTimeout(() => {
      const go = () => connect(name, version, rq);
      if (!idb.blockNext) return go();
      idb.blockNext = false;
      blocked.push(go);
      rq.onblocked?.();
    }, 0);
    return rq;
  };
  idb.deleteDatabase = (name) => {
    const rq = {};
    setTimeout(() => {
      dbs.delete(name);
      rq.onsuccess?.();
    }, 0);
    return rq;
  };
  idb.databases = () =>
    Promise.resolve([...dbs].map(([name, db]) => ({ name, version: db.version })));
  return idb;
}

function makeFakeLocks() {
  const held = new Set();
  const request = (name, ...args) => {
    const work = args.pop();
    const options = args[0] || {};
    if (held.has(name) && options.ifAvailable) return Promise.resolve(work(null));
    if (held.has(name)) throw new Error(`fake lock ${name} is already held`);
    held.add(name);
    return Promise.resolve(work({ name })).finally(() => held.delete(name));
  };
  return { held, request };
}

function makeSharedDisk() {
  return { idb: makeFakeIdb(), locks: makeFakeLocks() };
}

module.exports = { loadStore, loadTab, settle, spill, makeFakeBackend, makeSharedDisk };
