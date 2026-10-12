/* Penyimpanan lokal (IndexedDB) — nilai tetap aman walau offline / aplikasi ditutup. */
(function () {
  var DB_NAMA = 'penguji-osce', DB_VERSI = 1, _db = null;

  function buka() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAMA, DB_VERSI);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('nilai')) {
          var st = db.createObjectStore('nilai', { keyPath: 'kunci' });
          st.createIndex('status', 'status');
        }
      };
      req.onsuccess = function () { _db = req.result; res(_db); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function tx(store, mode, fn) {
    return buka().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode), s = t.objectStore(store), out;
        var r = fn(s);
        if (r && 'onsuccess' in r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error || new Error('Transaksi dibatalkan')); };
      });
    });
  }

  window.DB = {
    get: function (k) { return tx('kv', 'readonly', function (s) { return s.get(k); }); },
    set: function (k, v) { return tx('kv', 'readwrite', function (s) { return s.put(v, k); }); },
    del: function (k) { return tx('kv', 'readwrite', function (s) { return s.delete(k); }); },
    simpanNilai: function (rec) { return tx('nilai', 'readwrite', function (s) { return s.put(rec); }); },
    ambilNilai: function (kunci) { return tx('nilai', 'readonly', function (s) { return s.get(kunci); }); },
    semuaNilai: function () { return tx('nilai', 'readonly', function (s) { return s.getAll(); }); },
    hapusNilai: function (kunci) { return tx('nilai', 'readwrite', function (s) { return s.delete(kunci); }); },
    mintaPermanen: function () {
      if (navigator.storage && navigator.storage.persist) {
        return navigator.storage.persisted().then(function (sudah) {
          return sudah ? true : navigator.storage.persist();
        }).catch(function () { return false; });
      }
      return Promise.resolve(false);
    }
  };
})();
