/**
 * ============================================================
 *  PENGUJI OSCE VOKASI GIZI — Backend Google Apps Script
 *  Database: Google Sheets (file tempat script ini dipasang)
 * ============================================================
 *  Cara pakai singkat (lihat README untuk detail):
 *   1. Buka Google Sheet kosong > Ekstensi > Apps Script.
 *   2. Tempel seluruh isi file ini ke Code.gs, simpan.
 *   3. Jalankan fungsi `setup` sekali (izinkan akses).
 *   4. Terapkan > Deployment baru > Aplikasi web
 *      - Jalankan sebagai: Saya
 *      - Yang memiliki akses: Siapa saja
 *   5. Salin URL Web App ke js/config.js di aplikasi (GitHub).
 * ============================================================
 */

var VERSI_API = '1.2.0';
var MAKS_BUTIR = 8;

var SKEMA = {
  PERIODE: ['Kode Periode', 'Nama Periode', 'Program', 'Kode Paket', 'Tanggal', 'Status', 'Batas Cadangan (%)'],
  PAKET:   ['Kode Paket', 'Program', 'Keterangan', 'Terkunci'],
  STATION: ['Kode Paket', 'No Station', 'Judul', 'Kasus', 'Istirahat', 'Waktu (menit)'],
  RUBRIK:  ['Kode Paket', 'No Station', 'No Butir', 'Kompetensi', 'Skor 0', 'Skor 1', 'Skor 2', 'Skor 3', 'Bobot'],
  PESERTA: ['Kode Periode', 'No Urut', 'NIM', 'Nama', 'Sesi', 'Grup'],
  PENGUJI: ['PIN', 'Nama', 'Asal Institusi', 'Jenis', 'Peran', 'Kode Periode', 'No Station', 'Aktif'],
  NILAI:   ['Kunci', 'Kode Periode', 'No Station', 'NIM', 'Nama Peserta',
            'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8',
            'Global Rating', 'Catatan', 'Nama Penguji', 'Waktu Penilaian', 'Waktu Diterima', 'ID Klien', 'Keterangan'],
  LOG:     ['Waktu', 'Aksi', 'Oleh', 'Keterangan']
};

var KOLOM_TEKS = { PENGUJI: ['PIN'], PESERTA: ['NIM', 'Kode Periode'], NILAI: ['Kunci', 'NIM', 'Kode Periode', 'ID Klien'] };

/* ---------------- Utilitas Sheet ---------------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(nama) {
  var sh = ss_().getSheetByName(nama);
  if (!sh) throw new Error('Sheet "' + nama + '" tidak ditemukan. Jalankan fungsi setup terlebih dahulu.');
  return sh;
}

function s_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function n_(v) { var x = Number(v); return isNaN(x) ? 0 : x; }

/** Baca tabel menjadi array objek berdasar teks header baris 1. */
function baca_(nama) {
  var sh = sheet_(nama);
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var head = data[0].map(s_);
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var kosong = true;
    var o = { _baris: i + 1 };
    for (var j = 0; j < head.length; j++) {
      if (!head[j]) continue;
      var v = row[j];
      if (v instanceof Date) {
        var adaJam = v.getHours() || v.getMinutes() || v.getSeconds();
        v = Utilities.formatDate(v, Session.getScriptTimeZone(), adaJam ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
      }
      o[head[j]] = v;
      if (s_(v) !== '') kosong = false;
    }
    if (!kosong) out.push(o);
  }
  return out;
}

function headerIndex_(nama) {
  var sh = sheet_(nama);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(s_);
  var idx = {};
  head.forEach(function (h, i) { if (h) idx[h] = i; });
  return { sh: sh, idx: idx, lebar: head.length };
}

function barisDariObjek_(info, obj) {
  var row = [];
  for (var i = 0; i < info.lebar; i++) row.push('');
  Object.keys(obj).forEach(function (k) { if (info.idx[k] !== undefined) row[info.idx[k]] = obj[k]; });
  return row;
}

function log_(aksi, oleh, ket) {
  try { sheet_('LOG').appendRow([new Date(), aksi, oleh || '', ket || '']); } catch (e) { }
}

/* ---------------- HTTP ---------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return json_({ ok: true, app: 'Penguji OSCE Vokasi Gizi', versi: VERSI_API, waktu: new Date().toISOString() });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, pesan: 'Format permintaan tidak valid.' });
  }
  try {
    return json_(proses_(req));
  } catch (err) {
    return json_({ ok: false, pesan: String(err && err.message ? err.message : err) });
  }
}

function proses_(req) {
  var aksi = s_(req.aksi);
  if (aksi === 'ping') return { ok: true, versi: VERSI_API };
  if (aksi === 'login') return aksiLogin_(req);
  if (aksi === 'simpan') return aksiSimpan_(req);
  if (aksi === 'dataAdmin') return aksiDataAdmin_(req);
  if (aksi === 'imporPaket') return aksiImporPaket_(req);
  return { ok: false, pesan: 'Aksi tidak dikenal: ' + aksi };
}

/* ---------------- Otentikasi ---------------- */

function cariPenguji_(pin) {
  pin = s_(pin);
  if (!pin) return null;
  var semua = baca_('PENGUJI');
  for (var i = 0; i < semua.length; i++) {
    var p = semua[i];
    if (s_(p['PIN']) === pin && s_(p['Aktif']).toUpperCase() !== 'TIDAK') return p;
  }
  return null;
}

function isAdmin_(p) { return p && s_(p['Peran']).toUpperCase() === 'ADMIN'; }

function cariPeriode_(kode) {
  var semua = baca_('PERIODE');
  for (var i = 0; i < semua.length; i++) if (s_(semua[i]['Kode Periode']) === s_(kode)) return semua[i];
  return null;
}

function periodeKeObjek_(p) {
  return {
    kode: s_(p['Kode Periode']), nama: s_(p['Nama Periode']), program: s_(p['Program']).toUpperCase(),
    paket: s_(p['Kode Paket']), tanggal: s_(p['Tanggal']), status: s_(p['Status']).toUpperCase(),
    batasCadangan: n_(p['Batas Cadangan (%)']) || 60
  };
}

/* ---------------- Data paket ---------------- */

function stationPaket_(paket) {
  return baca_('STATION').filter(function (r) { return s_(r['Kode Paket']) === paket; }).map(function (r) {
    return {
      no: n_(r['No Station']), judul: s_(r['Judul']), kasus: s_(r['Kasus']),
      istirahat: s_(r['Istirahat']).toUpperCase() === 'YA', waktu: n_(r['Waktu (menit)'])
    };
  }).sort(function (a, b) { return a.no - b.no; });
}

function rubrikPaket_(paket, noStation) {
  return baca_('RUBRIK').filter(function (r) {
    return s_(r['Kode Paket']) === paket && (noStation === undefined || n_(r['No Station']) === noStation);
  }).map(function (r) {
    return {
      station: n_(r['No Station']), butir: n_(r['No Butir']), kompetensi: s_(r['Kompetensi']),
      skor: [s_(r['Skor 0']), s_(r['Skor 1']), s_(r['Skor 2']), s_(r['Skor 3'])],
      bobot: n_(r['Bobot']) || 1
    };
  }).sort(function (a, b) { return a.station - b.station || a.butir - b.butir; });
}

function pesertaPeriode_(kode) {
  return baca_('PESERTA').filter(function (r) { return s_(r['Kode Periode']) === kode; }).map(function (r) {
    return { urut: n_(r['No Urut']), nim: s_(r['NIM']), nama: s_(r['Nama']), sesi: s_(r['Sesi']), grup: s_(r['Grup']) };
  }).sort(function (a, b) { return a.urut - b.urut || (a.nama < b.nama ? -1 : 1); });
}

function nilaiKeObjek_(r) {
  var skor = [];
  for (var i = 1; i <= MAKS_BUTIR; i++) {
    var v = r['B' + i];
    if (s_(v) === '') break;
    skor.push(n_(v));
  }
  return {
    kunci: s_(r['Kunci']), periode: s_(r['Kode Periode']), station: n_(r['No Station']), nim: s_(r['NIM']),
    nama: s_(r['Nama Peserta']), skor: skor, gr: n_(r['Global Rating']), catatan: s_(r['Catatan']),
    penguji: s_(r['Nama Penguji']), waktuNilai: s_(r['Waktu Penilaian']), waktuTerima: s_(r['Waktu Diterima']),
    idKlien: s_(r['ID Klien']), keterangan: s_(r['Keterangan'])
  };
}

function nilaiPeriode_(kode, noStation) {
  return baca_('NILAI').filter(function (r) {
    return s_(r['Kode Periode']) === kode && (noStation === undefined || n_(r['No Station']) === noStation);
  }).map(nilaiKeObjek_);
}

/* ---------------- Aksi: login ---------------- */

function aksiLogin_(req) {
  var p = cariPenguji_(req.pin);
  if (!p) return { ok: false, pesan: 'PIN tidak dikenali atau tidak aktif.' };

  if (isAdmin_(p)) {
    var daftar = baca_('PERIODE').map(periodeKeObjek_);
    log_('login-admin', s_(p['Nama']), '');
    return { ok: true, peran: 'ADMIN', nama: s_(p['Nama']), periode: daftar, versi: VERSI_API };
  }

  var per = cariPeriode_(p['Kode Periode']);
  if (!per) return { ok: false, pesan: 'Periode "' + s_(p['Kode Periode']) + '" untuk PIN ini belum terdaftar di sheet PERIODE.' };
  var periode = periodeKeObjek_(per);
  if (periode.status !== 'AKTIF') return { ok: false, pesan: 'Periode ' + periode.kode + ' tidak berstatus AKTIF.' };

  var noSt = n_(p['No Station']);
  var st = stationPaket_(periode.paket).filter(function (x) { return x.no === noSt; })[0];
  if (!st) return { ok: false, pesan: 'Station ' + noSt + ' tidak ada di paket ' + periode.paket + '.' };
  if (st.istirahat) return { ok: false, pesan: 'Station ' + noSt + ' adalah station istirahat.' };

  var rubrik = rubrikPaket_(periode.paket, noSt);
  if (!rubrik.length) return { ok: false, pesan: 'Rubrik station ' + noSt + ' paket ' + periode.paket + ' belum diisi.' };

  var nilai = nilaiPeriode_(periode.kode, noSt).map(function (x) {
    return { nim: x.nim, skor: x.skor, gr: x.gr, penguji: x.penguji, waktuTerima: x.waktuTerima, idKlien: x.idKlien };
  });

  log_('login', s_(p['Nama']), periode.kode + ' / St ' + noSt);
  return {
    ok: true, peran: 'PENGUJI', versi: VERSI_API,
    penguji: { nama: s_(p['Nama']), asal: s_(p['Asal Institusi']), jenis: s_(p['Jenis']) },
    periode: periode, station: st, rubrik: rubrik,
    peserta: pesertaPeriode_(periode.kode), nilai: nilai,
    diambil: new Date().toISOString()
  };
}

/* ---------------- Aksi: simpan ---------------- */

function aksiSimpan_(req) {
  var p = cariPenguji_(req.pin);
  if (!p) return { ok: false, pesan: 'PIN tidak dikenali atau tidak aktif.' };
  var admin = isAdmin_(p);
  var timpa = admin && req.timpa === true; // admin hanya menimpa nilai lama bila diminta eksplisit
  var records = req.records || [];
  if (!records.length) return { ok: true, hasil: [] };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var info = headerIndex_('NILAI');
    var existing = {};
    baca_('NILAI').forEach(function (r) { existing[s_(r['Kunci'])] = r; });

    var cachePeriode = {}, cacheRubrik = {}, cachePeserta = {};
    var hasil = [];
    var baru = [];

    records.forEach(function (rec) {
      var idKlien = s_(rec.idKlien);
      var kodeP = s_(rec.periode);
      var noSt = n_(rec.station);
      var nim = s_(rec.nim);
      var res = { idKlien: idKlien, kunci: kodeP + '|' + noSt + '|' + nim };

      try {
        if (!admin) {
          if (s_(p['Kode Periode']) !== kodeP || n_(p['No Station']) !== noSt)
            throw new Error('PIN ini tidak berwenang menilai station/periode tersebut.');
        }
        if (!cachePeriode[kodeP]) {
          var per = cariPeriode_(kodeP);
          if (!per) throw new Error('Periode ' + kodeP + ' tidak ditemukan.');
          cachePeriode[kodeP] = periodeKeObjek_(per);
        }
        var periode = cachePeriode[kodeP];
        if (!admin && periode.status !== 'AKTIF') throw new Error('Periode ' + kodeP + ' sudah tidak aktif.');

        var kr = periode.paket + '|' + noSt;
        if (!cacheRubrik[kr]) cacheRubrik[kr] = rubrikPaket_(periode.paket, noSt);
        var rub = cacheRubrik[kr];
        if (!rub.length) throw new Error('Rubrik station ' + noSt + ' tidak ditemukan.');

        if (!cachePeserta[kodeP]) {
          cachePeserta[kodeP] = {};
          pesertaPeriode_(kodeP).forEach(function (x) { cachePeserta[kodeP][x.nim] = x; });
        }
        var ps = cachePeserta[kodeP][nim];
        if (!ps) throw new Error('NIM ' + nim + ' tidak terdaftar di periode ' + kodeP + '.');

        var skor = (rec.skor || []).map(Number);
        if (skor.length !== rub.length) throw new Error('Jumlah butir skor (' + skor.length + ') tidak sesuai rubrik (' + rub.length + ').');
        skor.forEach(function (v) { if (!(v === 0 || v === 1 || v === 2 || v === 3)) throw new Error('Skor harus 0-3.'); });
        var gr = Number(rec.gr);
        if ([1, 2, 3, 4].indexOf(gr) < 0) throw new Error('Global rating harus 1-4.');

        var lama = existing[res.kunci];
        if (lama) {
          if (s_(lama['ID Klien']) === idKlien) { res.status = 'duplikat'; hasil.push(res); return; }
          if (!timpa) {
            res.status = 'konflik';
            res.pesan = 'Peserta ini sudah dinilai (oleh ' + s_(lama['Nama Penguji']) + ').';
            hasil.push(res); return;
          }
        }

        var obj = {
          'Kunci': res.kunci, 'Kode Periode': kodeP, 'No Station': noSt, 'NIM': nim, 'Nama Peserta': ps.nama,
          'Global Rating': gr, 'Catatan': s_(rec.catatan),
          'Nama Penguji': admin ? (s_(rec.penguji) || s_(p['Nama'])) : s_(p['Nama']),
          'Waktu Penilaian': s_(rec.waktuNilai), 'Waktu Diterima': new Date(), 'ID Klien': idKlien,
          'Keterangan': admin ? ('Dikirim admin: ' + s_(p['Nama']) + (lama ? ' (menimpa nilai lama)' : '')) : ''
        };
        for (var i = 0; i < MAKS_BUTIR; i++) obj['B' + (i + 1)] = i < skor.length ? skor[i] : '';
        var row = barisDariObjek_(info, obj);

        if (lama) {
          info.sh.getRange(lama._baris, 1, 1, row.length).setValues([row]);
          res.status = 'ok'; res.pesan = 'Nilai lama ditimpa.';
        } else {
          baru.push(row);
          existing[res.kunci] = { 'ID Klien': idKlien, 'Nama Penguji': obj['Nama Penguji'], _baris: -1 };
          res.status = 'ok';
        }
      } catch (err) {
        res.status = 'ditolak';
        res.pesan = String(err && err.message ? err.message : err);
      }
      hasil.push(res);
    });

    if (baru.length) {
      var start = info.sh.getLastRow() + 1;
      info.sh.getRange(start, 1, baru.length, baru[0].length).setValues(baru);
    }
    var diterima = hasil.filter(function (h) { return h.status === 'ok'; }).length;
    if (diterima) {
      kunciPaket_(Object.keys(cachePeriode).map(function (k) { return cachePeriode[k].paket; }));
      log_('simpan', s_(p['Nama']), diterima + ' nilai diterima');
    }
    return { ok: true, hasil: hasil };
  } finally {
    lock.releaseLock();
  }
}

function kunciPaket_(daftar) {
  var info = headerIndex_('PAKET');
  var rows = baca_('PAKET');
  rows.forEach(function (r) {
    if (daftar.indexOf(s_(r['Kode Paket'])) >= 0 && s_(r['Terkunci']).toUpperCase() !== 'YA') {
      info.sh.getRange(r._baris, info.idx['Terkunci'] + 1).setValue('YA');
    }
  });
}

/* ---------------- Aksi: data admin ---------------- */

function aksiDataAdmin_(req) {
  var p = cariPenguji_(req.pin);
  if (!p || !isAdmin_(p)) return { ok: false, pesan: 'Hanya admin yang dapat mengakses rekap.' };
  var per = cariPeriode_(req.periode);
  if (!per) return { ok: false, pesan: 'Periode tidak ditemukan.' };
  var periode = periodeKeObjek_(per);
  var penguji = baca_('PENGUJI').filter(function (r) {
    return s_(r['Kode Periode']) === periode.kode && !isAdmin_(r);
  }).map(function (r) {
    return { nama: s_(r['Nama']), asal: s_(r['Asal Institusi']), jenis: s_(r['Jenis']), station: n_(r['No Station']), aktif: s_(r['Aktif']).toUpperCase() !== 'TIDAK' };
  });
  return {
    ok: true, periode: periode,
    station: stationPaket_(periode.paket), rubrik: rubrikPaket_(periode.paket),
    peserta: pesertaPeriode_(periode.kode), nilai: nilaiPeriode_(periode.kode), penguji: penguji,
    diambil: new Date().toISOString()
  };
}

/* ---------------- Aksi: impor paket rubrik (dari template soal docx) ---------------- */

function aksiImporPaket_(req) {
  var p = cariPenguji_(req.pin);
  if (!p || !isAdmin_(p)) return { ok: false, pesan: 'Hanya admin yang dapat mengimpor paket rubrik.' };
  var kode = s_(req.kode).toUpperCase();
  var program = s_(req.program).toUpperCase();
  if (!/^[A-Z0-9_\-]+$/.test(kode)) return { ok: false, pesan: 'Kode paket tidak valid.' };
  if (['D3', 'STR'].indexOf(program) < 0) return { ok: false, pesan: 'Program harus D3 atau STR.' };
  var station = req.station || [], rubrik = req.rubrik || [], salin = (req.salinStation || []).map(Number);
  if (!station.length) return { ok: false, pesan: 'Daftar station kosong.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (baca_('PAKET').some(function (r) { return s_(r['Kode Paket']).toUpperCase() === kode; }))
      return { ok: false, pesan: 'Kode paket ' + kode + ' sudah ada. Gunakan kode lain.' };

    var aktif = station.filter(function (st) { return !st.istirahat; }).map(function (st) { return n_(st.no); });
    var baris = rubrik.map(function (r) {
      var b = n_(r.bobot);
      if ([1, 2, 3].indexOf(b) < 0) throw new Error('Bobot station ' + r.station + ' butir ' + r.butir + ' harus 1-3.');
      if (aktif.indexOf(n_(r.station)) < 0) throw new Error('Station ' + r.station + ' bukan station aktif.');
      return [kode, n_(r.station), n_(r.butir), s_(r.kompetensi), s_(r.s0), s_(r.s1), s_(r.s2), s_(r.s3), b];
    });
    if (salin.length) {
      var basis = s_(req.basis);
      var lama = rubrikPaket_(basis).filter(function (r) { return salin.indexOf(r.station) >= 0; });
      salin.forEach(function (no) {
        if (!lama.some(function (r) { return r.station === no; })) throw new Error('Rubrik station ' + no + ' tidak ditemukan di paket ' + basis + '.');
      });
      lama.forEach(function (r) { baris.push([kode, r.station, r.butir, r.kompetensi, r.skor[0], r.skor[1], r.skor[2], r.skor[3], r.bobot]); });
    }
    aktif.forEach(function (no) {
      var n = baris.filter(function (b) { return b[1] === no; }).length;
      if (!n) throw new Error('Station ' + no + ' tidak memiliki butir rubrik.');
      if (n > MAKS_BUTIR) throw new Error('Station ' + no + ' memiliki lebih dari ' + MAKS_BUTIR + ' butir.');
    });
    baris.sort(function (a, b) { return a[1] - b[1] || a[2] - b[2]; });

    sheet_('PAKET').appendRow([kode, program, s_(req.keterangan) || 'Impor template soal', 'TIDAK']);
    tambahBaris_('STATION', station.map(function (st) {
      return [kode, n_(st.no), s_(st.judul), s_(st.kasus), st.istirahat ? 'YA' : 'TIDAK', n_(st.waktu)];
    }));
    tambahBaris_('RUBRIK', baris);
    rapikan_();
    log_('impor-paket', s_(p['Nama']), kode + ': ' + baris.length + ' butir');
    return { ok: true, kode: kode, jumlahButir: baris.length, jumlahStation: aktif.length };
  } catch (err) {
    return { ok: false, pesan: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Setup ---------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('OSCE')
    .addItem('Siapkan / perbaiki struktur sheet', 'setup')
    .addItem('Isi data contoh (uji coba)', 'isiContoh')
    .addToUi();
}

/** Membuat semua sheet + header + rubrik standar. Aman dijalankan ulang (tidak menghapus data). */
function setup() {
  var ss = ss_();
  Object.keys(SKEMA).forEach(function (nama) {
    var sh = ss.getSheetByName(nama);
    if (!sh) sh = ss.insertSheet(nama);
    var head = SKEMA[nama];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, head.length).setValues([head]);
    } else {
      var ada = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(s_);
      head.forEach(function (h) {
        if (ada.indexOf(h) < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue(h); }
      });
    }
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#0B2A5B').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    (KOLOM_TEKS[nama] || []).forEach(function (h) {
      var i = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(s_).indexOf(h);
      if (i >= 0) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  // Seed rubrik standar bila belum ada
  var paketAda = baca_('PAKET').map(function (r) { return s_(r['Kode Paket']); });
  var seed = SEED_RUBRIK;
  seed.paket.forEach(function (pk) {
    if (paketAda.indexOf(pk.kode) >= 0) return;
    sheet_('PAKET').appendRow([pk.kode, pk.program, pk.keterangan, 'TIDAK']);
    var st = seed.station.filter(function (x) { return x.paket === pk.kode; }).map(function (x) {
      return [x.paket, x.no, x.judul, x.kasus, x.istirahat, x.waktu];
    });
    tambahBaris_('STATION', st);
    var rb = seed.rubrik.filter(function (x) { return x.paket === pk.kode; }).map(function (x) {
      return [x.paket, x.station, x.butir, x.kompetensi, x.s0, x.s1, x.s2, x.s3, x.bobot];
    });
    tambahBaris_('RUBRIK', rb);
  });

  // Admin awal bila belum ada admin
  var adaAdmin = baca_('PENGUJI').some(isAdmin_);
  if (!adaAdmin) {
    sheet_('PENGUJI').appendRow(['909090', 'Administrator', '', '', 'ADMIN', '', '', 'YA']);
  }
  rapikan_();
  log_('setup', Session.getActiveUser().getEmail(), 'Struktur sheet disiapkan');
  try {
    SpreadsheetApp.getUi().alert('Setup selesai.\n\nPIN admin awal: 909090 (segera ganti di sheet PENGUJI).\nJalankan menu OSCE > Isi data contoh bila ingin uji coba.');
  } catch (e) { }
}

function tambahBaris_(nama, rows) {
  if (!rows.length) return;
  var sh = sheet_(nama);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function rapikan_() {
  try {
    var r = sheet_('RUBRIK');
    r.setColumnWidth(4, 260);
    for (var c = 5; c <= 8; c++) r.setColumnWidth(c, 280);
    r.getRange(2, 4, Math.max(r.getLastRow() - 1, 1), 5).setWrap(true).setVerticalAlignment('top');
  } catch (e) { }
}

/** Data contoh untuk uji coba: 2 periode, penguji per station, 10 peserta per periode. */
function isiContoh() {
  var tgl = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var perAda = baca_('PERIODE').map(function (r) { return s_(r['Kode Periode']); });
  var contoh = [
    { kode: 'UJICOBA-D3', nama: 'Uji Coba OSCE D3 Gizi', program: 'D3', paket: 'D3-STANDAR', awal: 3100 },
    { kode: 'UJICOBA-STR', nama: 'Uji Coba OSCE Sarjana Terapan Gizi', program: 'STR', paket: 'STR-STANDAR', awal: 4100 }
  ];
  contoh.forEach(function (c) {
    if (perAda.indexOf(c.kode) >= 0) return;
    sheet_('PERIODE').appendRow([c.kode, c.nama, c.program, c.paket, tgl, 'AKTIF', 60]);
    stationPaket_(c.paket).forEach(function (st) {
      if (st.istirahat) return;
      sheet_('PENGUJI').appendRow([String(c.awal + st.no), 'Penguji Station ' + st.no + ' (' + c.program + ')', 'Contoh', 'Internal', 'PENGUJI', c.kode, st.no, 'YA']);
    });
    var rows = [];
    for (var i = 1; i <= 10; i++) {
      rows.push([c.kode, i, (c.program === 'D3' ? 'D3' : 'ST') + ('000' + i).slice(-3), 'Peserta Contoh ' + i, '1', 'A']);
    }
    tambahBaris_('PESERTA', rows);
  });
  try {
    SpreadsheetApp.getUi().alert('Data contoh ditambahkan.\nPIN penguji D3: 3101, 3102, 3103, 3105, 3106, 3107\nPIN penguji S.Tr: 4101, 4102, 4103, 4105, 4106, 4107, 4108');
  } catch (e) { }
}

/* ============ RUBRIK STANDAR (Pedoman OSCE Vokasi Gizi 2023) ============ */
var SEED_RUBRIK = {
 "paket": [
  {
   "kode": "D3-STANDAR",
   "program": "D3",
   "keterangan": "Rubrik standar Pedoman OSCE Vokasi Gizi 2023"
  },
  {
   "kode": "STR-STANDAR",
   "program": "STR",
   "keterangan": "Rubrik standar Pedoman OSCE Vokasi Gizi 2023"
  }
 ],
 "station": [
  {
   "paket": "D3-STANDAR",
   "program": "D3",
   "no": 1,
   "judul": "Endokrin atau Sistem Perkemihan",
   "kasus": "DM Tipe 2",
   "istirahat": "TIDAK",
   "waktu": 10
  },
  {
   "paket": "D3-STANDAR",
   "program": "D3",
   "no": 2,
   "judul": "Sistem Pencernaan",
   "kasus": "Gastritis",
   "istirahat": "TIDAK",
   "waktu": 10
  },
  {
   "paket": "D3-STANDAR",
   "program": "D3",
   "no": 3,
   "judul": "Sistem Kardiovaskuler atau Neuromuskuler",
   "kasus": "Dislipidemia",
   "istirahat": "TIDAK",
   "waktu": 10
  },
  {
   "paket": "D3-STANDAR",
   "program": "D3",
   "no": 4,
   "judul": "ISTIRAHAT",
   "kasus": "",
   "istirahat": "YA",
   "waktu": 10
  },
  {
   "paket": "D3-STANDAR",
   "program": "D3",
   "no": 5,
   "judul": "Masalah Gizi pada Anak dan Remaja",
   "kasus": "Balita Stunting",
   "istirahat": "TIDAK",
   "waktu": 10
  },
  {
   "paket": "D3-STANDAR",
   "program": "D3",
   "no": 6,
   "judul": "Masalah Gizi pada Ibu",
   "kasus": "Ibu Hamil KEK",
   "istirahat": "TIDAK",
   "waktu": 10
  },
  {
   "paket": "D3-STANDAR",
   "program": "D3",
   "no": 7,
   "judul": "Penyelenggaraan Makanan",
   "kasus": "Penyelenggaraan Makanan di Rumah Sakit",
   "istirahat": "TIDAK",
   "waktu": 10
  },
  {
   "paket": "D3-STANDAR",
   "program": "D3",
   "no": 8,
   "judul": "ISTIRAHAT",
   "kasus": "",
   "istirahat": "YA",
   "waktu": 10
  },
  {
   "paket": "STR-STANDAR",
   "program": "STR",
   "no": 1,
   "judul": "Endokrin",
   "kasus": "DM Tipe 2",
   "istirahat": "TIDAK",
   "waktu": 12
  },
  {
   "paket": "STR-STANDAR",
   "program": "STR",
   "no": 2,
   "judul": "Sistem Perkemihan",
   "kasus": "Gagal Ginjal Kronik (GGK)",
   "istirahat": "TIDAK",
   "waktu": 12
  },
  {
   "paket": "STR-STANDAR",
   "program": "STR",
   "no": 3,
   "judul": "Sistem Pencernaan atau Pernapasan",
   "kasus": "Tipoid",
   "istirahat": "TIDAK",
   "waktu": 12
  },
  {
   "paket": "STR-STANDAR",
   "program": "STR",
   "no": 4,
   "judul": "ISTIRAHAT",
   "kasus": "",
   "istirahat": "YA",
   "waktu": 12
  },
  {
   "paket": "STR-STANDAR",
   "program": "STR",
   "no": 5,
   "judul": "Sistem Kardiovaskuler atau Neuromuskuler",
   "kasus": "Pasca Stroke",
   "istirahat": "TIDAK",
   "waktu": 12
  },
  {
   "paket": "STR-STANDAR",
   "program": "STR",
   "no": 6,
   "judul": "Masalah Gizi pada Anak dan Remaja",
   "kasus": "Anemia Remaja",
   "istirahat": "TIDAK",
   "waktu": 12
  },
  {
   "paket": "STR-STANDAR",
   "program": "STR",
   "no": 7,
   "judul": "Masalah Gizi pada Ibu",
   "kasus": "Ibu Hamil Hipertensi",
   "istirahat": "TIDAK",
   "waktu": 12
  },
  {
   "paket": "STR-STANDAR",
   "program": "STR",
   "no": 8,
   "judul": "Penyelenggaraan Makanan",
   "kasus": "Penyelenggaraan Makanan di Katering",
   "istirahat": "TIDAK",
   "waktu": 12
  },
  {
   "paket": "STR-STANDAR",
   "program": "STR",
   "no": 9,
   "judul": "ISTIRAHAT",
   "kasus": "",
   "istirahat": "YA",
   "waktu": 12
  }
 ],
 "rubrik": [
  {
   "paket": "D3-STANDAR",
   "station": 1,
   "butir": 1,
   "kompetensi": "Mampu melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia",
   "s0": "Tidak melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia",
   "s1": "Melakukan asesmen gizi menggunakan 1 dari 3 data/informasi, yaitu: 1) data subjektif riwayat diet; 2) data subjektif riwayat penyakit; 3) data obyektif biokimia",
   "s2": "Melakukan asesmen gizi menggunakan 2 dari 3 data/informasi, yaitu: 1) data subjektif riwayat diet; 2) data subjektif riwayat penyakit; 3) data obyektif biokimia",
   "s3": "Melakukan asesmen gizi menggunakan 3 data/informasi, yaitu: 1) data subjektif riwayat diet; 2) data subjektif riwayat penyakit; 3) data obyektif biokimia",
   "bobot": 1
  },
  {
   "paket": "D3-STANDAR",
   "station": 1,
   "butir": 2,
   "kompetensi": "Mampu melakukan edukasi gizi terkait kasus DM Tipe 2",
   "s0": "Tidak melakukan edukasi gizi terkait kasus DM Tipe 2",
   "s1": "Melakukan 1-2 dari 5 langkah edukasi gizi dengan tepat: 1) Mempelajari masalah gizi pasien sesuai diagnosis gizi; 2) Menjelaskan tujuan diet pasien menggunakan media leaflet DM Tipe 2; 3) Menjelaskan makanan yang boleh dikonsumsi menggunakan media food model; 4) Menjelaskan makanan yang tidak boleh dikonsumsi menggunakan media food model; 5) Melakukan evaluasi edukasi gizi dengan memberikan pertanyaan kepada pasien",
   "s2": "Melakukan 3-4 dari 5 langkah edukasi gizi dengan tepat: 1) Mempelajari masalah gizi pasien sesuai diagnosis gizi; 2) Menjelaskan tujuan diet pasien menggunakan media leaflet DM Tipe 2; 3) Menjelaskan makanan yang boleh dikonsumsi menggunakan media food model; 4) Menjelaskan makanan yang tidak boleh dikonsumsi menggunakan media food model; 5) Melakukan evaluasi edukasi gizi dengan memberikan pertanyaan kepada pasien",
   "s3": "Melakukan 5 langkah edukasi gizi dengan tepat: 1) Mempelajari masalah gizi pasien sesuai diagnosis gizi; 2) Menjelaskan tujuan diet pasien menggunakan media leaflet DM Tipe 2; 3) Menjelaskan makanan yang boleh dikonsumsi menggunakan media food model; 4) Menjelaskan makanan yang tidak boleh dikonsumsi menggunakan media food model; 5) Melakukan evaluasi edukasi gizi dengan memberikan pertanyaan kepada pasien",
   "bobot": 3
  },
  {
   "paket": "D3-STANDAR",
   "station": 1,
   "butir": 3,
   "kompetensi": "Mampu melakukan pendokumentasian asuhan gizi (ADIME) kasus DM Tipe 2",
   "s0": "Tidak melakukan pendokumentasian asuhan gizi untuk kasus DM Tipe 2",
   "s1": "Melakukan pendokumentasian asuhan gizi untuk 1-2 dari 5 aspek (ADIME): 1) Dokumentasi asesmen/pengkajian gizi; 2) Dokumentasi diagnosis gizi; 3) Dokumentasi intervensi gizi dan intervensi edukasi gizi; 4) Dokumentasi monitoring data ABCD (Antropometri, Biokimia, Clinik, Diet) sesuai data dominan kasus; 5) Dokumentasi evaluasi asuhan gizi",
   "s2": "Melakukan pendokumentasian asuhan gizi untuk 3-4 dari 5 aspek (ADIME): 1) Dokumentasi asesmen/pengkajian gizi; 2) Dokumentasi diagnosis gizi; 3) Dokumentasi intervensi gizi dan intervensi edukasi gizi; 4) Dokumentasi monitoring data ABCD (Antropometri, Biokimia, Clinik, Diet) sesuai data dominan kasus; 5) Dokumentasi evaluasi asuhan gizi",
   "s3": "Melakukan pendokumentasian asuhan gizi untuk 5 aspek (ADIME): 1) Dokumentasi asesmen/pengkajian gizi; 2) Dokumentasi diagnosis gizi; 3) Dokumentasi intervensi gizi dan intervensi edukasi gizi; 4) Dokumentasi monitoring data ABCD (Antropometri, Biokimia, Clinik, Diet) sesuai data dominan kasus; 5) Dokumentasi evaluasi asuhan gizi",
   "bobot": 1
  },
  {
   "paket": "D3-STANDAR",
   "station": 1,
   "butir": 4,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "D3-STANDAR",
   "station": 2,
   "butir": 1,
   "kompetensi": "Mampu melakukan/menentukan intervensi pemberian makanan",
   "s0": "Tidak menentukan intervensi pemberian makanan yang tepat",
   "s1": "Menentukan intervensi pemberian makanan hanya 1 dari 4 aspek: 1) Jenis diet; 2) Bentuk makanan; 3) Cara pemberian/rute makanan; 4) Prinsip diet",
   "s2": "Menentukan intervensi pemberian makanan hanya 2-3 dari 4 aspek: 1) Jenis diet; 2) Bentuk makanan; 3) Cara pemberian/rute makanan; 4) Prinsip diet",
   "s3": "Menentukan intervensi pemberian makanan semua aspek (4 aspek): 1) Jenis diet; 2) Bentuk makanan; 3) Cara pemberian/rute makanan; 4) Prinsip diet",
   "bobot": 3
  },
  {
   "paket": "D3-STANDAR",
   "station": 2,
   "butir": 2,
   "kompetensi": "Mampu melakukan edukasi gizi terkait kasus Gastritis",
   "s0": "Tidak melakukan edukasi gizi terkait kasus Gastritis",
   "s1": "Melakukan 1-2 dari 5 langkah edukasi gizi dengan tepat: 1) Mempelajari masalah gizi pasien sesuai diagnosis gizi; 2) Menjelaskan tujuan diet pasien menggunakan media leaflet Gastritis; 3) Menjelaskan makanan yang boleh dikonsumsi menggunakan media food model; 4) Menjelaskan makanan yang tidak boleh dikonsumsi menggunakan media food model; 5) Melakukan evaluasi edukasi gizi dengan memberikan pertanyaan kepada pasien",
   "s2": "Melakukan 3-4 dari 5 langkah edukasi gizi dengan tepat: 1) Mempelajari masalah gizi pasien sesuai diagnosis gizi; 2) Menjelaskan tujuan diet pasien menggunakan media leaflet Gastritis; 3) Menjelaskan makanan yang boleh dikonsumsi menggunakan media food model; 4) Menjelaskan makanan yang tidak boleh dikonsumsi menggunakan media food model; 5) Melakukan evaluasi edukasi gizi dengan memberikan pertanyaan kepada pasien",
   "s3": "Melakukan 5 langkah edukasi gizi dengan tepat: 1) Mempelajari masalah gizi pasien sesuai diagnosis gizi; 2) Menjelaskan tujuan diet pasien menggunakan media leaflet Gastritis; 3) Menjelaskan makanan yang boleh dikonsumsi menggunakan media food model; 4) Menjelaskan makanan yang tidak boleh dikonsumsi menggunakan media food model; 5) Melakukan evaluasi edukasi gizi dengan memberikan pertanyaan kepada pasien",
   "bobot": 3
  },
  {
   "paket": "D3-STANDAR",
   "station": 2,
   "butir": 3,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "D3-STANDAR",
   "station": 3,
   "butir": 1,
   "kompetensi": "Mampu melakukan pengukuran antropometri (BB dan TB) dan pengumpulan data objektif (pemeriksaan fisik keadaan umum, pemeriksaan klinis: tekanan darah dan suhu tubuh)",
   "s0": "Tidak melakukan pengukuran antropometri (BB dan TB) dan tidak mengumpulkan data objektif (pemeriksaan fisik keadaan umum dan pemeriksaan klinis seperti tekanan darah dan suhu tubuh)",
   "s1": "Melakukan 1 pengukuran antropometri (BB atau TB) dengan benar sesuai SOP; DAN melakukan pengumpulan 1 dari 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s2": "Melakukan 2 pengukuran antropometri (BB dan TB), salah satunya benar sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s3": "Melakukan 2 pengukuran antropometri (BB dan TB) dengan benar keduanya sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "bobot": 3
  },
  {
   "paket": "D3-STANDAR",
   "station": 3,
   "butir": 2,
   "kompetensi": "Mampu menetapkan diagnosis gizi",
   "s0": "Tidak menetapkan diagnosis gizi",
   "s1": "Menetapkan diagnosis gizi untuk 1 dari 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "s2": "Menetapkan diagnosis gizi untuk 2 dari 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "s3": "Menetapkan diagnosis gizi untuk 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "bobot": 1
  },
  {
   "paket": "D3-STANDAR",
   "station": 3,
   "butir": 3,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "D3-STANDAR",
   "station": 5,
   "butir": 1,
   "kompetensi": "Mampu melakukan pengukuran antropometri (BB dan TB) dan pengumpulan data objektif (pemeriksaan fisik keadaan umum, pemeriksaan klinis: tekanan darah dan suhu tubuh)",
   "s0": "Tidak melakukan pengukuran antropometri (BB dan TB) dan tidak mengumpulkan data objektif (pemeriksaan fisik keadaan umum dan pemeriksaan klinis seperti tekanan darah dan suhu tubuh)",
   "s1": "Melakukan 1 pengukuran antropometri (BB atau TB) dengan benar sesuai SOP; DAN melakukan pengumpulan 1 dari 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s2": "Melakukan 2 pengukuran antropometri (BB dan TB), salah satunya benar sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s3": "Melakukan 2 pengukuran antropometri (BB dan TB) dengan benar keduanya sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "bobot": 3
  },
  {
   "paket": "D3-STANDAR",
   "station": 5,
   "butir": 2,
   "kompetensi": "Mampu melakukan edukasi gizi terkait kasus Balita Stunting",
   "s0": "Tidak melakukan edukasi gizi terkait kasus Balita Stunting",
   "s1": "Melakukan 1-2 dari 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan pemeriksaan fisik, klinik, dan biokimia; 2) Menyampaikan masalah gizi berdasarkan asupan gizi; 3) Mendiskusikan perubahan pola makan mengikuti perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan",
   "s2": "Melakukan 3-4 dari 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan pemeriksaan fisik, klinik, dan biokimia; 2) Menyampaikan masalah gizi berdasarkan asupan gizi; 3) Mendiskusikan perubahan pola makan mengikuti perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan",
   "s3": "Melakukan 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan pemeriksaan fisik, klinik, dan biokimia; 2) Menyampaikan masalah gizi berdasarkan asupan gizi; 3) Mendiskusikan perubahan pola makan mengikuti perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan",
   "bobot": 3
  },
  {
   "paket": "D3-STANDAR",
   "station": 5,
   "butir": 3,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "D3-STANDAR",
   "station": 6,
   "butir": 1,
   "kompetensi": "Mampu melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia, serta menetapkan rumusan diagnosis gizi",
   "s0": "Tidak melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia",
   "s1": "Melakukan asesmen gizi melalui 1-3 dari 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: 1) Menyatakan masalah gizi berdasarkan pemeriksaan biokimia terkait gizi; 2) Menyatakan masalah gizi berdasarkan data pemeriksaan fisik terkait gizi; 3) Menyatakan masalah gizi berdasarkan analisis konsumsi makanan; 4) Menyatakan masalah gizi berdasarkan data riwayat pasien; 5) Mengidentifikasi etiologi masalah gizi; 6) Mengidentifikasi sign dan symptoms penunjuk spesifik masalah gizi; 7) Menyatakan rumusan diagnosis gizi dengan format PES (problem-etiologi-sign/symptom)",
   "s2": "Melakukan asesmen gizi melalui 4-5 dari 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: 1) Menyatakan masalah gizi berdasarkan pemeriksaan biokimia terkait gizi; 2) Menyatakan masalah gizi berdasarkan data pemeriksaan fisik terkait gizi; 3) Menyatakan masalah gizi berdasarkan analisis konsumsi makanan; 4) Menyatakan masalah gizi berdasarkan data riwayat pasien; 5) Mengidentifikasi etiologi masalah gizi; 6) Mengidentifikasi sign dan symptoms penunjuk spesifik masalah gizi; 7) Menyatakan rumusan diagnosis gizi dengan format PES (problem-etiologi-sign/symptom)",
   "s3": "Melakukan asesmen gizi melalui 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: 1) Menyatakan masalah gizi berdasarkan pemeriksaan biokimia terkait gizi; 2) Menyatakan masalah gizi berdasarkan data pemeriksaan fisik terkait gizi; 3) Menyatakan masalah gizi berdasarkan analisis konsumsi makanan; 4) Menyatakan masalah gizi berdasarkan data riwayat pasien; 5) Mengidentifikasi etiologi masalah gizi; 6) Mengidentifikasi sign dan symptoms penunjuk spesifik masalah gizi; 7) Menyatakan rumusan diagnosis gizi dengan format PES (problem-etiologi-sign/symptom)",
   "bobot": 1
  },
  {
   "paket": "D3-STANDAR",
   "station": 6,
   "butir": 2,
   "kompetensi": "Mampu melakukan pengukuran antropometri (BB dan TB) dan pengumpulan data objektif (pemeriksaan fisik keadaan umum, pemeriksaan klinis: tekanan darah dan suhu tubuh)",
   "s0": "Tidak melakukan pengukuran antropometri (BB dan TB) dan tidak mengumpulkan data objektif (pemeriksaan fisik keadaan umum dan pemeriksaan klinis seperti tekanan darah dan suhu tubuh)",
   "s1": "Melakukan 1 pengukuran antropometri (BB atau TB) dengan benar sesuai SOP; DAN melakukan pengumpulan 1 dari 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s2": "Melakukan 2 pengukuran antropometri (BB dan TB), salah satunya benar sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s3": "Melakukan 2 pengukuran antropometri (BB dan TB) dengan benar keduanya sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "bobot": 3
  },
  {
   "paket": "D3-STANDAR",
   "station": 6,
   "butir": 3,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "D3-STANDAR",
   "station": 7,
   "butir": 1,
   "kompetensi": "Mampu menetapkan diagnosis gizi (berdasarkan perilaku makan dan asupan gizi)",
   "s0": "Tidak menetapkan diagnosis gizi berdasarkan perilaku makan dan asupan gizi",
   "s1": "Menetapkan diagnosis gizi berdasarkan perilaku makan dan asupan gizi untuk 1 dari 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "s2": "Menetapkan diagnosis gizi berdasarkan perilaku makan dan asupan gizi untuk 2 dari 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "s3": "Menetapkan diagnosis gizi berdasarkan perilaku makan dan asupan gizi untuk 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "bobot": 1
  },
  {
   "paket": "D3-STANDAR",
   "station": 7,
   "butir": 2,
   "kompetensi": "Mampu menentukan intervensi pemberian makanan melalui penilaian sisa makanan metode Comstock",
   "s0": "Tidak menentukan intervensi pemberian makanan melalui penilaian sisa makanan dengan metode Comstock 6 poin",
   "s1": "Melakukan penilaian sisa makanan metode Comstock dengan 1-2 dari 5 langkah yang tepat: 1) Menyiapkan formulir penilaian sisa makanan metode Comstock 6 poin; 2) Menyiapkan peralatan yang diperlukan (sendok, garpu, alat tulis); 3) Menilai standar porsi makanan sebagai gold standard dari contoh yang disajikan di plato-1; 4) Melakukan penilaian sisa makanan pasien untuk 1 kali makan yang disajikan di plato-2; 5) Menganalisis sisa makanan berdasarkan jenis makanan dan keseluruhan makanan untuk 1 kali makan",
   "s2": "Melakukan penilaian sisa makanan metode Comstock dengan 3-4 dari 5 langkah yang tepat: 1) Menyiapkan formulir penilaian sisa makanan metode Comstock 6 poin; 2) Menyiapkan peralatan yang diperlukan (sendok, garpu, alat tulis); 3) Menilai standar porsi makanan sebagai gold standard dari contoh yang disajikan di plato-1; 4) Melakukan penilaian sisa makanan pasien untuk 1 kali makan yang disajikan di plato-2; 5) Menganalisis sisa makanan berdasarkan jenis makanan dan keseluruhan makanan untuk 1 kali makan",
   "s3": "Melakukan penilaian sisa makanan metode Comstock dengan semua (5) langkah yang tepat: 1) Menyiapkan formulir penilaian sisa makanan metode Comstock 6 poin; 2) Menyiapkan peralatan yang diperlukan (sendok, garpu, alat tulis); 3) Menilai standar porsi makanan sebagai gold standard dari contoh yang disajikan di plato-1; 4) Melakukan penilaian sisa makanan pasien untuk 1 kali makan yang disajikan di plato-2; 5) Menganalisis sisa makanan berdasarkan jenis makanan dan keseluruhan makanan untuk 1 kali makan",
   "bobot": 3
  },
  {
   "paket": "D3-STANDAR",
   "station": 7,
   "butir": 3,
   "kompetensi": "Mampu melakukan edukasi gizi terkait kasus Penyelenggaraan Makanan di RS (berdasarkan hasil penilaian sisa makanan)",
   "s0": "Tidak melakukan edukasi gizi terkait kasus Penyelenggaraan Makanan di RS",
   "s1": "Melakukan 1-2 dari 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan; 2) Menyampaikan masalah gizi berdasarkan asupan gizi dari makanan yang dikonsumsi; 3) Mendiskusikan perubahan pola makan mengikuti hasil penilaian sisa makanan dan perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien, berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien, berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan, berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan",
   "s2": "Melakukan 3-4 dari 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan; 2) Menyampaikan masalah gizi berdasarkan asupan gizi dari makanan yang dikonsumsi; 3) Mendiskusikan perubahan pola makan mengikuti hasil penilaian sisa makanan dan perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien, berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien, berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan, berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan",
   "s3": "Melakukan 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan; 2) Menyampaikan masalah gizi berdasarkan asupan gizi dari makanan yang dikonsumsi; 3) Mendiskusikan perubahan pola makan mengikuti hasil penilaian sisa makanan dan perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien, berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien, berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan, berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan",
   "bobot": 3
  },
  {
   "paket": "D3-STANDAR",
   "station": 7,
   "butir": 4,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "STR-STANDAR",
   "station": 1,
   "butir": 1,
   "kompetensi": "Mampu melakukan pengukuran antropometri (BB dan TB) dan pengumpulan data objektif (pemeriksaan fisik keadaan umum, pemeriksaan klinis: tekanan darah dan suhu tubuh)",
   "s0": "Tidak melakukan pengukuran antropometri (BB dan TB) dan tidak mengumpulkan data objektif (pemeriksaan fisik keadaan umum dan pemeriksaan klinis seperti tekanan darah dan suhu tubuh)",
   "s1": "Melakukan 1 pengukuran antropometri (BB atau TB) dengan benar sesuai SOP; DAN melakukan pengumpulan 1 dari 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s2": "Melakukan 2 pengukuran antropometri (BB dan TB), salah satunya benar sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s3": "Melakukan 2 pengukuran antropometri (BB dan TB) dengan benar keduanya sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 1,
   "butir": 2,
   "kompetensi": "Mampu melakukan/menentukan intervensi pemberian makanan",
   "s0": "Tidak menentukan intervensi pemberian makanan yang tepat",
   "s1": "Menentukan intervensi pemberian makanan hanya 1 dari 4 aspek: 1) Jenis diet; 2) Bentuk makanan; 3) Cara pemberian/rute makanan; 4) Prinsip diet",
   "s2": "Menentukan intervensi pemberian makanan hanya 2-3 dari 4 aspek: 1) Jenis diet; 2) Bentuk makanan; 3) Cara pemberian/rute makanan; 4) Prinsip diet",
   "s3": "Menentukan intervensi pemberian makanan semua aspek (4 aspek): 1) Jenis diet; 2) Bentuk makanan; 3) Cara pemberian/rute makanan; 4) Prinsip diet",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 1,
   "butir": 3,
   "kompetensi": "Mampu melakukan kolaborasi interprofesional",
   "s0": "Tidak melakukan kolaborasi dengan profesi atau pihak lain dalam penanganan kasus, hanya bekerja sendiri",
   "s1": "1) Melakukan kolaborasi dengan profesi atau pihak lain dalam penanganan kasus; 2) Mendapat penolakan dari profesi/pihak lain, atau terdapat penilaian negatif dari profesi/pihak lain",
   "s2": "1) Melakukan kolaborasi dengan profesi atau pihak lain dalam penanganan kasus; 2) Diterima oleh pihak lain, tetapi ada komplain atau belum mendapatkan kesepakatan menjadi tim bersama penanganan kasus berikutnya (bersifat insidental)",
   "s3": "1) Melakukan kolaborasi dengan profesi atau pihak lain dalam penanganan kasus; 2) Tidak ada komplain dan dapat diterima dalam kesepakatan sebagai tim bersama penanganan kasus dengan profesi/pihak lain selanjutnya",
   "bobot": 1
  },
  {
   "paket": "STR-STANDAR",
   "station": 1,
   "butir": 4,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "STR-STANDAR",
   "station": 2,
   "butir": 1,
   "kompetensi": "Mampu melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia",
   "s0": "Tidak melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia",
   "s1": "Melakukan asesmen gizi menggunakan 1 dari 3 data/informasi, yaitu: 1) data subjektif riwayat diet; 2) data subjektif riwayat penyakit; 3) data obyektif biokimia",
   "s2": "Melakukan asesmen gizi menggunakan 2 dari 3 data/informasi, yaitu: 1) data subjektif riwayat diet; 2) data subjektif riwayat penyakit; 3) data obyektif biokimia",
   "s3": "Melakukan asesmen gizi menggunakan 3 data/informasi, yaitu: 1) data subjektif riwayat diet; 2) data subjektif riwayat penyakit; 3) data obyektif biokimia",
   "bobot": 1
  },
  {
   "paket": "STR-STANDAR",
   "station": 2,
   "butir": 2,
   "kompetensi": "Mampu melakukan pengukuran antropometri (BB dan TB) dan pengumpulan data objektif (pemeriksaan fisik keadaan umum, pemeriksaan klinis: tekanan darah dan suhu tubuh)",
   "s0": "Tidak melakukan pengukuran antropometri (BB dan TB) dan tidak mengumpulkan data objektif (pemeriksaan fisik keadaan umum dan pemeriksaan klinis seperti tekanan darah dan suhu tubuh)",
   "s1": "Melakukan 1 pengukuran antropometri (BB atau TB) dengan benar sesuai SOP; DAN melakukan pengumpulan 1 dari 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s2": "Melakukan 2 pengukuran antropometri (BB dan TB), salah satunya benar sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s3": "Melakukan 2 pengukuran antropometri (BB dan TB) dengan benar keduanya sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 2,
   "butir": 3,
   "kompetensi": "Mampu menetapkan diagnosis gizi",
   "s0": "Tidak menetapkan diagnosis gizi",
   "s1": "Menetapkan diagnosis gizi untuk 1 dari 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "s2": "Menetapkan diagnosis gizi untuk 2 dari 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "s3": "Menetapkan diagnosis gizi untuk 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "bobot": 1
  },
  {
   "paket": "STR-STANDAR",
   "station": 2,
   "butir": 4,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "STR-STANDAR",
   "station": 3,
   "butir": 1,
   "kompetensi": "Mampu melakukan pengukuran antropometri (BB dan TB) dan pengumpulan data objektif (pemeriksaan fisik keadaan umum, pemeriksaan klinis: tekanan darah dan suhu tubuh)",
   "s0": "Tidak melakukan pengukuran antropometri (BB dan TB) dan tidak mengumpulkan data objektif (pemeriksaan fisik keadaan umum dan pemeriksaan klinis seperti tekanan darah dan suhu tubuh)",
   "s1": "Melakukan 1 pengukuran antropometri (BB atau TB) dengan benar sesuai SOP; DAN melakukan pengumpulan 1 dari 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s2": "Melakukan 2 pengukuran antropometri (BB dan TB), salah satunya benar sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s3": "Melakukan 2 pengukuran antropometri (BB dan TB) dengan benar keduanya sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 3,
   "butir": 2,
   "kompetensi": "Mampu melakukan edukasi gizi terkait kasus Tipoid",
   "s0": "Tidak melakukan edukasi gizi terkait kasus Tipoid",
   "s1": "Melakukan 1-2 dari 5 langkah edukasi gizi dengan tepat: 1) Mempelajari masalah gizi pasien sesuai diagnosis gizi; 2) Menjelaskan tujuan diet pasien menggunakan media leaflet Tipoid; 3) Menjelaskan makanan yang boleh dikonsumsi menggunakan media food model; 4) Menjelaskan makanan yang tidak boleh dikonsumsi menggunakan media food model; 5) Melakukan evaluasi edukasi gizi dengan memberikan pertanyaan kepada pasien",
   "s2": "Melakukan 3-4 dari 5 langkah edukasi gizi dengan tepat: 1) Mempelajari masalah gizi pasien sesuai diagnosis gizi; 2) Menjelaskan tujuan diet pasien menggunakan media leaflet Tipoid; 3) Menjelaskan makanan yang boleh dikonsumsi menggunakan media food model; 4) Menjelaskan makanan yang tidak boleh dikonsumsi menggunakan media food model; 5) Melakukan evaluasi edukasi gizi dengan memberikan pertanyaan kepada pasien",
   "s3": "Melakukan 5 langkah edukasi gizi dengan tepat: 1) Mempelajari masalah gizi pasien sesuai diagnosis gizi; 2) Menjelaskan tujuan diet pasien menggunakan media leaflet Tipoid; 3) Menjelaskan makanan yang boleh dikonsumsi menggunakan media food model; 4) Menjelaskan makanan yang tidak boleh dikonsumsi menggunakan media food model; 5) Melakukan evaluasi edukasi gizi dengan memberikan pertanyaan kepada pasien",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 3,
   "butir": 3,
   "kompetensi": "Mampu melakukan pendokumentasian asuhan gizi (ADIME) kasus Tipoid",
   "s0": "Tidak melakukan pendokumentasian asuhan gizi untuk kasus Tipoid",
   "s1": "Melakukan pendokumentasian asuhan gizi untuk 1-2 dari 5 aspek (ADIME): 1) Dokumentasi asesmen/pengkajian gizi; 2) Dokumentasi diagnosis gizi; 3) Dokumentasi intervensi gizi dan intervensi edukasi gizi; 4) Dokumentasi monitoring data ABCD (Antropometri, Biokimia, Clinik, Diet) sesuai data dominan kasus; 5) Dokumentasi evaluasi asuhan gizi",
   "s2": "Melakukan pendokumentasian asuhan gizi untuk 3-4 dari 5 aspek (ADIME): 1) Dokumentasi asesmen/pengkajian gizi; 2) Dokumentasi diagnosis gizi; 3) Dokumentasi intervensi gizi dan intervensi edukasi gizi; 4) Dokumentasi monitoring data ABCD (Antropometri, Biokimia, Clinik, Diet) sesuai data dominan kasus; 5) Dokumentasi evaluasi asuhan gizi",
   "s3": "Melakukan pendokumentasian asuhan gizi untuk 5 aspek (ADIME): 1) Dokumentasi asesmen/pengkajian gizi; 2) Dokumentasi diagnosis gizi; 3) Dokumentasi intervensi gizi dan intervensi edukasi gizi; 4) Dokumentasi monitoring data ABCD (Antropometri, Biokimia, Clinik, Diet) sesuai data dominan kasus; 5) Dokumentasi evaluasi asuhan gizi",
   "bobot": 1
  },
  {
   "paket": "STR-STANDAR",
   "station": 3,
   "butir": 4,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "STR-STANDAR",
   "station": 5,
   "butir": 1,
   "kompetensi": "Mampu menetapkan diagnosis gizi",
   "s0": "Tidak menetapkan diagnosis gizi",
   "s1": "Menetapkan diagnosis gizi untuk 1 dari 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "s2": "Menetapkan diagnosis gizi untuk 2 dari 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "s3": "Menetapkan diagnosis gizi untuk 3 aspek dengan benar: 1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)",
   "bobot": 1
  },
  {
   "paket": "STR-STANDAR",
   "station": 5,
   "butir": 2,
   "kompetensi": "Mampu melakukan/menentukan intervensi pemberian makanan",
   "s0": "Tidak menentukan intervensi pemberian makanan yang tepat",
   "s1": "Menentukan intervensi pemberian makanan hanya 1 dari 4 aspek: 1) Jenis diet; 2) Bentuk makanan; 3) Cara pemberian/rute makanan; 4) Prinsip diet",
   "s2": "Menentukan intervensi pemberian makanan hanya 2-3 dari 4 aspek: 1) Jenis diet; 2) Bentuk makanan; 3) Cara pemberian/rute makanan; 4) Prinsip diet",
   "s3": "Menentukan intervensi pemberian makanan semua aspek (4 aspek): 1) Jenis diet; 2) Bentuk makanan; 3) Cara pemberian/rute makanan; 4) Prinsip diet",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 5,
   "butir": 3,
   "kompetensi": "Mampu melakukan pendokumentasian asuhan gizi (ADIME) kasus Pasca Stroke",
   "s0": "Tidak melakukan pendokumentasian asuhan gizi untuk kasus Pasca Stroke",
   "s1": "Melakukan pendokumentasian asuhan gizi untuk 1-2 dari 5 aspek (ADIME): 1) Dokumentasi asesmen/pengkajian gizi; 2) Dokumentasi diagnosis gizi; 3) Dokumentasi intervensi gizi dan intervensi edukasi gizi; 4) Dokumentasi monitoring data ABCD (Antropometri, Biokimia, Clinik, Diet) sesuai data dominan kasus; 5) Dokumentasi evaluasi asuhan gizi",
   "s2": "Melakukan pendokumentasian asuhan gizi untuk 3-4 dari 5 aspek (ADIME): 1) Dokumentasi asesmen/pengkajian gizi; 2) Dokumentasi diagnosis gizi; 3) Dokumentasi intervensi gizi dan intervensi edukasi gizi; 4) Dokumentasi monitoring data ABCD (Antropometri, Biokimia, Clinik, Diet) sesuai data dominan kasus; 5) Dokumentasi evaluasi asuhan gizi",
   "s3": "Melakukan pendokumentasian asuhan gizi untuk 5 aspek (ADIME): 1) Dokumentasi asesmen/pengkajian gizi; 2) Dokumentasi diagnosis gizi; 3) Dokumentasi intervensi gizi dan intervensi edukasi gizi; 4) Dokumentasi monitoring data ABCD (Antropometri, Biokimia, Clinik, Diet) sesuai data dominan kasus; 5) Dokumentasi evaluasi asuhan gizi",
   "bobot": 1
  },
  {
   "paket": "STR-STANDAR",
   "station": 5,
   "butir": 4,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "STR-STANDAR",
   "station": 6,
   "butir": 1,
   "kompetensi": "Mampu melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia, serta menetapkan rumusan diagnosis gizi",
   "s0": "Tidak melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia",
   "s1": "Melakukan asesmen gizi melalui 1-3 dari 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: 1) Menyatakan masalah gizi berdasarkan pemeriksaan biokimia terkait gizi; 2) Menyatakan masalah gizi berdasarkan data pemeriksaan fisik terkait gizi; 3) Menyatakan masalah gizi berdasarkan analisis konsumsi makanan; 4) Menyatakan masalah gizi berdasarkan data riwayat pasien; 5) Mengidentifikasi etiologi masalah gizi; 6) Mengidentifikasi sign dan symptoms penunjuk spesifik masalah gizi; 7) Menyatakan rumusan diagnosis gizi dengan format PES (problem-etiologi-sign/symptom)",
   "s2": "Melakukan asesmen gizi melalui 4-5 dari 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: 1) Menyatakan masalah gizi berdasarkan pemeriksaan biokimia terkait gizi; 2) Menyatakan masalah gizi berdasarkan data pemeriksaan fisik terkait gizi; 3) Menyatakan masalah gizi berdasarkan analisis konsumsi makanan; 4) Menyatakan masalah gizi berdasarkan data riwayat pasien; 5) Mengidentifikasi etiologi masalah gizi; 6) Mengidentifikasi sign dan symptoms penunjuk spesifik masalah gizi; 7) Menyatakan rumusan diagnosis gizi dengan format PES (problem-etiologi-sign/symptom)",
   "s3": "Melakukan asesmen gizi melalui 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: 1) Menyatakan masalah gizi berdasarkan pemeriksaan biokimia terkait gizi; 2) Menyatakan masalah gizi berdasarkan data pemeriksaan fisik terkait gizi; 3) Menyatakan masalah gizi berdasarkan analisis konsumsi makanan; 4) Menyatakan masalah gizi berdasarkan data riwayat pasien; 5) Mengidentifikasi etiologi masalah gizi; 6) Mengidentifikasi sign dan symptoms penunjuk spesifik masalah gizi; 7) Menyatakan rumusan diagnosis gizi dengan format PES (problem-etiologi-sign/symptom)",
   "bobot": 1
  },
  {
   "paket": "STR-STANDAR",
   "station": 6,
   "butir": 2,
   "kompetensi": "Mampu melakukan intervensi pemberian makanan (penyusunan menu sehari)",
   "s0": "Tidak dapat menentukan intervensi pemberian makanan yang tepat",
   "s1": "Melakukan intervensi pemberian makanan hanya 1-3 dari 6 aspek: 1) Menyiapkan form dalam penyusunan menu sehari; 2) Menggunakan TKPI atau sejenisnya untuk menentukan bahan makanan yang disarankan untuk dikonsumsi setiap hari; 3) Memanfaatkan buku bahan penukar atau konversi ke URT untuk menerjemahkan jumlah bahan yang dikonsumsi; 4) Menanyakan pantangan makanan yang harus dihindari maupun makanan yang disukai; 5) Melakukan pembagian waktu makan dan makanan selingan dalam menu makan sehari; 6) Mempertimbangkan bahan makanan yang disarankan dan yang harus dihindari sesuai prinsip diet yang diberikan",
   "s2": "Melakukan intervensi pemberian makanan hanya 4-5 dari 6 aspek: 1) Menyiapkan form dalam penyusunan menu sehari; 2) Menggunakan TKPI atau sejenisnya untuk menentukan bahan makanan yang disarankan untuk dikonsumsi setiap hari; 3) Memanfaatkan buku bahan penukar atau konversi ke URT untuk menerjemahkan jumlah bahan yang dikonsumsi; 4) Menanyakan pantangan makanan yang harus dihindari maupun makanan yang disukai; 5) Melakukan pembagian waktu makan dan makanan selingan dalam menu makan sehari; 6) Mempertimbangkan bahan makanan yang disarankan dan yang harus dihindari sesuai prinsip diet yang diberikan",
   "s3": "Melakukan intervensi pemberian makanan yang terdiri dari 6 aspek: 1) Menyiapkan form dalam penyusunan menu sehari; 2) Menggunakan TKPI atau sejenisnya untuk menentukan bahan makanan yang disarankan untuk dikonsumsi setiap hari; 3) Memanfaatkan buku bahan penukar atau konversi ke URT untuk menerjemahkan jumlah bahan yang dikonsumsi; 4) Menanyakan pantangan makanan yang harus dihindari maupun makanan yang disukai; 5) Melakukan pembagian waktu makan dan makanan selingan dalam menu makan sehari; 6) Mempertimbangkan bahan makanan yang disarankan dan yang harus dihindari sesuai prinsip diet yang diberikan",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 6,
   "butir": 3,
   "kompetensi": "Mampu melakukan edukasi gizi terkait kasus Anemia Remaja",
   "s0": "Tidak melakukan edukasi gizi terkait kasus Anemia Remaja",
   "s1": "Melakukan 1-2 dari 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan pemeriksaan fisik, klinik, dan biokimia; 2) Menyampaikan masalah gizi berdasarkan asupan gizi; 3) Mendiskusikan perubahan pola makan mengikuti perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan",
   "s2": "Melakukan 3-4 dari 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan pemeriksaan fisik, klinik, dan biokimia; 2) Menyampaikan masalah gizi berdasarkan asupan gizi; 3) Mendiskusikan perubahan pola makan mengikuti perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan",
   "s3": "Melakukan 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan pemeriksaan fisik, klinik, dan biokimia; 2) Menyampaikan masalah gizi berdasarkan asupan gizi; 3) Mendiskusikan perubahan pola makan mengikuti perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 6,
   "butir": 4,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "STR-STANDAR",
   "station": 7,
   "butir": 1,
   "kompetensi": "Mampu melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia, serta menetapkan rumusan diagnosis gizi",
   "s0": "Tidak melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia",
   "s1": "Melakukan asesmen gizi melalui 1-3 dari 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: 1) Menyatakan masalah gizi berdasarkan pemeriksaan biokimia terkait gizi; 2) Menyatakan masalah gizi berdasarkan data pemeriksaan fisik terkait gizi; 3) Menyatakan masalah gizi berdasarkan analisis konsumsi makanan; 4) Menyatakan masalah gizi berdasarkan data riwayat pasien; 5) Mengidentifikasi etiologi masalah gizi; 6) Mengidentifikasi sign dan symptoms penunjuk spesifik masalah gizi; 7) Menyatakan rumusan diagnosis gizi dengan format PES (problem-etiologi-sign/symptom)",
   "s2": "Melakukan asesmen gizi melalui 4-5 dari 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: 1) Menyatakan masalah gizi berdasarkan pemeriksaan biokimia terkait gizi; 2) Menyatakan masalah gizi berdasarkan data pemeriksaan fisik terkait gizi; 3) Menyatakan masalah gizi berdasarkan analisis konsumsi makanan; 4) Menyatakan masalah gizi berdasarkan data riwayat pasien; 5) Mengidentifikasi etiologi masalah gizi; 6) Mengidentifikasi sign dan symptoms penunjuk spesifik masalah gizi; 7) Menyatakan rumusan diagnosis gizi dengan format PES (problem-etiologi-sign/symptom)",
   "s3": "Melakukan asesmen gizi melalui 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: 1) Menyatakan masalah gizi berdasarkan pemeriksaan biokimia terkait gizi; 2) Menyatakan masalah gizi berdasarkan data pemeriksaan fisik terkait gizi; 3) Menyatakan masalah gizi berdasarkan analisis konsumsi makanan; 4) Menyatakan masalah gizi berdasarkan data riwayat pasien; 5) Mengidentifikasi etiologi masalah gizi; 6) Mengidentifikasi sign dan symptoms penunjuk spesifik masalah gizi; 7) Menyatakan rumusan diagnosis gizi dengan format PES (problem-etiologi-sign/symptom)",
   "bobot": 1
  },
  {
   "paket": "STR-STANDAR",
   "station": 7,
   "butir": 2,
   "kompetensi": "Mampu melakukan pengukuran antropometri (BB dan TB) dan pengumpulan data objektif (pemeriksaan fisik keadaan umum, pemeriksaan klinis: tekanan darah dan suhu tubuh)",
   "s0": "Tidak melakukan pengukuran antropometri (BB dan TB) dan tidak mengumpulkan data objektif (pemeriksaan fisik keadaan umum dan pemeriksaan klinis seperti tekanan darah dan suhu tubuh)",
   "s1": "Melakukan 1 pengukuran antropometri (BB atau TB) dengan benar sesuai SOP; DAN melakukan pengumpulan 1 dari 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s2": "Melakukan 2 pengukuran antropometri (BB dan TB), salah satunya benar sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "s3": "Melakukan 2 pengukuran antropometri (BB dan TB) dengan benar keduanya sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 7,
   "butir": 3,
   "kompetensi": "Mampu melakukan edukasi gizi terkait kasus Ibu Hamil Hipertensi",
   "s0": "Tidak melakukan edukasi gizi terkait kasus Ibu Hamil Hipertensi",
   "s1": "Melakukan 1-2 dari 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan pemeriksaan fisik, klinik, dan biokimia; 2) Menyampaikan masalah gizi berdasarkan asupan gizi; 3) Mendiskusikan perubahan pola makan mengikuti perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan",
   "s2": "Melakukan 3-4 dari 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan pemeriksaan fisik, klinik, dan biokimia; 2) Menyampaikan masalah gizi berdasarkan asupan gizi; 3) Mendiskusikan perubahan pola makan mengikuti perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan",
   "s3": "Melakukan 6 langkah edukasi gizi dengan tepat: 1) Menyampaikan masalah gizi berdasarkan pemeriksaan fisik, klinik, dan biokimia; 2) Menyampaikan masalah gizi berdasarkan asupan gizi; 3) Mendiskusikan perubahan pola makan mengikuti perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; 4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien; 5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien; 6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 7,
   "butir": 4,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  },
  {
   "paket": "STR-STANDAR",
   "station": 8,
   "butir": 1,
   "kompetensi": "Pendokumentasian: Perencanaan kebutuhan bahan makanan",
   "s0": "Tidak melakukan perhitungan perencanaan kebutuhan bahan makanan",
   "s1": "Melakukan perhitungan perencanaan kebutuhan bahan makanan menggunakan: 1) jumlah konsumen; 2) standar porsi",
   "s2": "Melakukan perhitungan perencanaan kebutuhan bahan makanan menggunakan: 1) jumlah konsumen; 2) standar porsi; 3) frekuensi penggunaan bahan makanan dalam satu siklus menu",
   "s3": "Melakukan perhitungan perencanaan kebutuhan bahan makanan menggunakan: 1) jumlah konsumen; 2) standar porsi; 3) frekuensi penggunaan bahan makanan dalam satu siklus menu; 4) jumlah putaran siklus menu dalam satu bulan",
   "bobot": 2
  },
  {
   "paket": "STR-STANDAR",
   "station": 8,
   "butir": 2,
   "kompetensi": "Pendokumentasian: Kegiatan sebagai penyelia terhadap kinerja petugas (penerimaan/persiapan/pengolahan/pemorsian/distribusi)",
   "s0": "Tidak melakukan kegiatan sebagai penyelia terhadap kinerja petugas bagian penerimaan/persiapan/pengolahan/pemorsian/distribusi",
   "s1": "Melakukan kegiatan sebagai penyelia tanpa menyiapkan/menggunakan instrumen penyelia atau SOP",
   "s2": "Melakukan kegiatan sebagai penyelia dengan menyiapkan/menggunakan instrumen penyelia atau SOP, tetapi instrumen/SOP belum terisi lengkap (hanya sebagian)",
   "s3": "Melakukan kegiatan sebagai penyelia dengan menyiapkan/menggunakan instrumen penyelia atau SOP, dan instrumen/SOP terisi lengkap",
   "bobot": 2
  },
  {
   "paket": "STR-STANDAR",
   "station": 8,
   "butir": 3,
   "kompetensi": "Pendokumentasian: Uji mutu bahan makanan atau makanan secara fisik dan organoleptik",
   "s0": "Tidak melakukan uji mutu bahan makanan atau makanan secara fisik dan organoleptik",
   "s1": "Melakukan uji mutu: 1) tanpa menyiapkan/menggunakan instrumen atau SOP; 2) hanya salah satu uji mutu (fisik atau organoleptik) dengan benar",
   "s2": "Melakukan uji mutu: 1) tanpa menyiapkan/menggunakan instrumen atau SOP; 2) uji mutu secara fisik dan organoleptik dengan benar",
   "s3": "Melakukan uji mutu: 1) dengan menyiapkan/menggunakan instrumen atau SOP; 2) uji mutu secara fisik dan organoleptik dengan benar",
   "bobot": 3
  },
  {
   "paket": "STR-STANDAR",
   "station": 8,
   "butir": 4,
   "kompetensi": "Pendokumentasian: Kesimpulan hasil praktik pengamatan dan praktik tindakan",
   "s0": "Tidak membuat kesimpulan hasil praktik pengamatan dan praktik tindakan",
   "s1": "Membuat kesimpulan hanya 1 dari 3 tindakan: 1) Perencanaan kebutuhan bahan makanan; 2) Penyelia kegiatan; 3) Uji mutu secara fisik dan organoleptik",
   "s2": "Membuat kesimpulan hanya 2 dari 3 tindakan: 1) Perencanaan kebutuhan bahan makanan; 2) Penyelia kegiatan; 3) Uji mutu secara fisik dan organoleptik",
   "s3": "Membuat kesimpulan untuk 3 tindakan: 1) Perencanaan kebutuhan bahan makanan; 2) Penyelia kegiatan; 3) Uji mutu secara fisik dan organoleptik",
   "bobot": 1
  },
  {
   "paket": "STR-STANDAR",
   "station": 8,
   "butir": 5,
   "kompetensi": "Mampu menunjukkan perilaku profesional",
   "s0": "Tidak memiliki perilaku profesional sama sekali",
   "s1": "Menunjukkan 1-2 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s2": "Menunjukkan 3-4 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "s3": "Menunjukkan 5-6 perilaku profesional, meliputi: 1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; 3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; 5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup",
   "bobot": 2
  }
 ]
};
