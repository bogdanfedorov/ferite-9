var SPILL_PREFIX = 'ferit9.spill.';
var LEGACY_DB = 'ferit9.world';
var SPILL_STORES = ['chunks', 'fog'];

function idbTx(db, stores, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const req = work(tx);
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function holdLock(name) {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve();
  return new Promise((granted) => {
    navigator.locks.request(name, () => {
      granted();
      return new Promise(() => {});
    });
  });
}

function openSpill(name) {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const rq = indexedDB.open(name, 1);
    rq.onupgradeneeded = () => {
      for (let k = 0; k < SPILL_STORES.length; k++) rq.result.createObjectStore(SPILL_STORES[k]);
    };
    rq.onsuccess = () => {
      if (blocked) {
        rq.result.close();
        return;
      }
      rq.result.onversionchange = () => rq.result.close();
      resolve(rq.result);
    };
    rq.onerror = () => reject(rq.error);
    rq.onblocked = () => {
      blocked = true;
      reject(new Error('spill database blocked'));
    };
  });
}

function makeIdbBackend(name) {
  let opening = null;
  const open = () => {
    if (!opening) opening = holdLock(name).then(() => openSpill(name));
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
    clear: () =>
      open().then((db) =>
        idbTx(db, SPILL_STORES, 'readwrite', (tx) => {
          for (let k = 0; k < SPILL_STORES.length; k++) tx.objectStore(SPILL_STORES[k]).clear();
          return null;
        })
      )
  };
}

function dropIfOrphan(name) {
  navigator.locks.request(name, { ifAvailable: true }, (lock) => {
    if (!lock) return null;
    return new Promise((done) => {
      const rq = indexedDB.deleteDatabase(name);
      rq.onsuccess = done;
      rq.onerror = done;
    });
  });
}

function sweepSpill() {
  if (!indexedDB.databases || typeof navigator === 'undefined' || !navigator.locks) return;
  indexedDB
    .databases()
    .then((list) => {
      for (let k = 0; k < list.length; k++) {
        const name = list[k].name;
        if (name === LEGACY_DB || name.startsWith(SPILL_PREFIX)) dropIfOrphan(name);
      }
    })
    .catch(() => {});
}

function spillName() {
  return SPILL_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

if (typeof indexedDB !== 'undefined') {
  sweepSpill();
  setDiskBackend(makeIdbBackend(spillName()));
}
