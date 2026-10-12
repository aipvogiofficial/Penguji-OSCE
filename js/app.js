/* Penguji OSCE Vokasi Gizi — logika aplikasi (PWA) */
(function () {
  'use strict';
  var CFG = window.OSCE_CONFIG || {};
  var VERSI_APP = '1.2.0';
  var GR_LABEL = { 1: 'Tidak Lulus', 2: 'Borderline', 3: 'Lulus', 4: 'Superior' };

  var S = {
    sesi: null,        // { pin, peran, data }
    lokal: {},         // kunci -> record lokal
    draf: {},          // kunci -> true
    filter: '',
    form: null,        // { peserta, kunci, skor[], gr, catatan, terkunci }
    admin: { data: null, hasil: null, tab: 'progres' },
    sinkronJalan: false,
    promptPasang: null
  };

  /* ---------------- Util ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function kunciDari(periode, station, nim) { return periode + '|' + station + '|' + nim; }
  /* Waktu mengikuti jam perangkat (WIB/WITA/WIT otomatis sesuai lokasi perangkat). */
  function zonaWaktu(d) {
    var m = -(d || new Date()).getTimezoneOffset();
    var nama = { 420: 'WIB', 480: 'WITA', 540: 'WIT' }[m];
    if (nama) return nama;
    var t = m >= 0 ? '+' : '-', a = Math.abs(m);
    return 'UTC' + t + ('0' + Math.floor(a / 60)).slice(-2) + ':' + ('0' + a % 60).slice(-2);
  }
  function waktuSetempat(d) {
    d = d || new Date();
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + ' ' + zonaWaktu(d);
  }
  function waktuLokal(iso) {
    if (!iso) return '-';
    if (!/^\d{4}-\d\d-\d\dT/.test(iso)) return iso; // sudah berupa teks waktu setempat
    try { var d = new Date(iso); return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) + ' ' + zonaWaktu(d); } catch (e) { return iso; }
  }
  function stempel() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }

  var toastTimer;
  function toast(pesan, jenis, lama) {
    var t = $('toast'); t.textContent = pesan; t.className = 'tampil' + (jenis ? ' ' + jenis : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = ''; }, lama || 2800);
  }

  function tampil(id) {
    ['layar-cover', 'layar-login', 'layar-penguji', 'layar-nilai', 'layar-admin', 'layar-impor'].forEach(function (x) { $(x).classList.toggle('tersembunyi', x !== id); });
    window.scrollTo(0, 0);
  }

  function dialog(html, opsi) {
    opsi = opsi || {};
    var w = $('dialog-wadah');
    w.innerHTML = '<div class="latar-dialog"><div class="dialog" role="dialog" aria-modal="true">' + html + '</div></div>';
    var latar = w.firstChild;
    if (!opsi.wajib) latar.addEventListener('click', function (e) { if (e.target === latar) tutupDialog(); });
    return latar.firstChild;
  }
  function tutupDialog() { $('dialog-wadah').innerHTML = ''; }

  function konfirmasi(judul, pesan, labelYa) {
    return new Promise(function (res) {
      var d = dialog('<h3>' + esc(judul) + '</h3><p class="sub">' + pesan + '</p><div class="aksi-dialog"><button class="btn btn-garis" data-x="0">Batal</button><button class="btn btn-utama" data-x="1">' + esc(labelYa || 'Ya') + '</button></div>');
      d.addEventListener('click', function (e) { var b = e.target.closest('[data-x]'); if (!b) return; tutupDialog(); res(b.getAttribute('data-x') === '1'); });
    });
  }

  /* ---------------- API ---------------- */
  function apiSiap() { return CFG.API_URL && /^https?:\/\//.test(CFG.API_URL); }

  function api(aksi, payload) {
    if (!apiSiap()) return Promise.reject(new Error('URL server (API_URL) belum diatur di js/config.js.'));
    var body = Object.assign({ aksi: aksi }, payload || {});
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);
    return fetch(CFG.API_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error('Server merespons ' + r.status);
      return r.json();
    }).catch(function (e) {
      clearTimeout(t);
      if (e.name === 'AbortError') throw new Error('Koneksi ke server terlalu lama (timeout).');
      if (e instanceof TypeError) throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.');
      throw e;
    });
  }

  /* ---------------- Sesi ---------------- */
  function muatLokal() {
    return DB.semuaNilai().then(function (arr) {
      S.lokal = {}; (arr || []).forEach(function (r) { S.lokal[r.kunci] = r; });
    });
  }

  function simpanSesi() { return DB.set('sesi', S.sesi); }

  function login(pin) {
    return api('login', { pin: pin }).then(function (res) {
      if (!res.ok) throw new Error(res.pesan || 'Login gagal.');
      S.sesi = { pin: pin, peran: res.peran, data: res, masuk: new Date().toISOString() };
      return simpanSesi().then(function () {
        return DB.mintaPermanen().then(function (p) { S.sesi.permanen = !!p; return simpanSesi(); });
      }).then(function () { return res; });
    });
  }

  function masukKeBeranda() {
    if (!S.sesi) { tampil('layar-cover'); return; }
    if (S.sesi.peran === 'ADMIN') { bukaAdmin(); } else { bukaPenguji(); }
  }

  /* ---------------- Cover & login ---------------- */
  function initCover() {
    $('versi-app').textContent = 'Versi ' + VERSI_APP + '.';
    if (CFG.PENYELENGGARA) $('cover-penyelenggara').textContent = CFG.PENYELENGGARA;
    $('btn-mulai').addEventListener('click', function () {
      if (S.sesi) { masukKeBeranda(); return; }
      tampil('layar-login'); setTimeout(function () { $('input-pin').focus(); }, 50);
    });
    $('btn-kembali-cover').addEventListener('click', function () { tampil('layar-cover'); });
    $('form-login').addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = $('input-pin').value.trim();
      if (!pin) return;
      var btn = $('btn-login'); btn.disabled = true; btn.innerHTML = '<span class="memuat"></span> Memeriksa…';
      $('login-galat').classList.add('tersembunyi');
      login(pin).then(function () {
        $('input-pin').value = '';
        perbaruiCover();
        masukKeBeranda();
        if (S.sesi.peran !== 'ADMIN') sinkron();
      }).catch(function (err) {
        $('login-galat').textContent = err.message; $('login-galat').classList.remove('tersembunyi');
      }).then(function () { btn.disabled = false; btn.textContent = 'Masuk'; });
    });

    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (ios && !standalone) $('petunjuk-ios').classList.remove('tersembunyi');
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); S.promptPasang = e; $('btn-pasang').classList.remove('tersembunyi');
    });
    $('btn-pasang').addEventListener('click', function () {
      if (!S.promptPasang) return;
      S.promptPasang.prompt();
      S.promptPasang.userChoice.then(function () { S.promptPasang = null; $('btn-pasang').classList.add('tersembunyi'); });
    });
    window.addEventListener('appinstalled', function () { $('btn-pasang').classList.add('tersembunyi'); toast('Aplikasi terpasang.', 'sukses'); });
  }

  function perbaruiCover() {
    var b = $('btn-mulai');
    if (S.sesi) {
      var nm = S.sesi.peran === 'ADMIN' ? S.sesi.data.nama : S.sesi.data.penguji.nama;
      b.textContent = 'Lanjutkan sebagai ' + nm;
    } else b.textContent = 'Masuk dengan PIN';
  }

  /* ---------------- Beranda penguji ---------------- */
  function D() { return S.sesi.data; }
  function maksSkor() { return D().rubrik.reduce(function (t, r) { return t + 3 * r.bobot; }, 0); }
  function nilaiServer(nim) {
    var arr = D().nilai || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].nim === nim) return arr[i];
    return null;
  }

  function statusPeserta(p) {
    var k = kunciDari(D().periode.kode, D().station.no, p.nim);
    var lk = S.lokal[k];
    if (lk) return { kode: lk.status, rec: lk };
    var sv = nilaiServer(p.nim);
    if (sv) return { kode: 'server', rec: sv };
    if (S.draf[k]) return { kode: 'draf' };
    return { kode: 'belum' };
  }

  function bukaPenguji() {
    var d = D();
    $('pg-no-station').textContent = d.station.no;
    $('pg-periode').textContent = d.periode.nama + ' · ' + (d.periode.program === 'D3' ? 'D3 Gizi' : 'Sarjana Terapan Gizi');
    $('pg-penguji').textContent = d.penguji.nama;
    $('pg-judul-station').textContent = d.station.judul;
    $('pg-meta-station').textContent = 'Kasus: ' + d.station.kasus + ' · ' + d.station.waktu + ' menit · ' + d.rubrik.length + ' butir · skor maks ' + maksSkor();
    tampil('layar-penguji');
    muatDraf().then(renderPenguji);
  }

  function muatDraf() {
    return DB.get('draf-index').then(function (x) { S.draf = x || {}; });
  }

  function renderPenguji() {
    if (!S.sesi || S.sesi.peran === 'ADMIN') return;
    var d = D(), f = S.filter.toLowerCase();
    var dinilai = 0;
    var html = d.peserta.map(function (p) {
      var st = statusPeserta(p);
      if (st.kode !== 'belum' && st.kode !== 'draf' && st.kode !== 'ditolak') dinilai++;
      if (f && (p.nama + ' ' + p.nim + ' ' + p.urut).toLowerCase().indexOf(f) < 0) return '';
      var chip = {
        belum: '<span class="chip chip-belum">Belum</span>',
        draf: '<span class="chip chip-belum">Draf</span>',
        antri: '<span class="chip chip-antri">Belum terkirim</span>',
        terkirim: '<span class="chip chip-terkirim">Terkirim ✓</span>',
        server: '<span class="chip chip-terkirim">Terkirim ✓</span>',
        konflik: '<span class="chip chip-konflik">Konflik</span>',
        ditolak: '<span class="chip chip-konflik">Ditolak</span>'
      }[st.kode];
      return '<button class="item-peserta" data-nim="' + esc(p.nim) + '"><div class="urut">' + esc(p.urut || '-') + '</div>' +
        '<div class="tengah"><div class="nama">' + esc(p.nama) + '</div><div class="nim">' + esc(p.nim) + (p.sesi ? ' · Sesi ' + esc(p.sesi) : '') + (p.grup ? ' · Grup ' + esc(p.grup) : '') + '</div></div>' + chip + '</button>';
    }).join('');
    $('daftar-peserta').innerHTML = html || '<div class="kosong">' + (d.peserta.length ? 'Tidak ada peserta yang cocok.' : 'Belum ada peserta di periode ini.') + '</div>';
    $('pg-jml-dinilai').textContent = dinilai;
    $('pg-jml-sisa').textContent = d.peserta.length - dinilai;
    $('pg-jml-peserta').textContent = d.peserta.length;
    renderBilahSinkron();
  }

  function jumlahAntri() { return Object.keys(S.lokal).filter(function (k) { return S.lokal[k].status === 'antri'; }).length; }

  function renderBilahSinkron() {
    var on = navigator.onLine, n = jumlahAntri();
    var h = '<span class="titik' + (on ? '' : ' off') + '"></span><span>' + (on ? 'Online' : 'Offline') + '</span>';
    if (S.sinkronJalan) h += '<span class="memuat gelap"></span><span>Mengirim…</span>';
    else if (n) h += '<span class="antri">' + n + ' nilai belum terkirim</span>';
    else h += '<span class="aman">Semua nilai sudah terkirim</span>';
    h += '<span class="spacer"></span>';
    if (n && on && !S.sinkronJalan) h += '<button class="btn btn-garis btn-kecil" id="btn-sinkron-cepat">Kirim sekarang</button>';
    $('bilah-sinkron').innerHTML = h;
    var b = $('btn-sinkron-cepat'); if (b) b.addEventListener('click', function () { sinkron(true); });
  }

  function initPenguji() {
    $('cari-peserta').addEventListener('input', function (e) { S.filter = e.target.value; renderPenguji(); });
    $('daftar-peserta').addEventListener('click', function (e) {
      var b = e.target.closest('.item-peserta'); if (!b) return;
      var nim = b.getAttribute('data-nim');
      var p = D().peserta.filter(function (x) { return x.nim === nim; })[0];
      if (p) bukaForm(p);
    });
    $('btn-menu-penguji').addEventListener('click', menuPenguji);
  }

  function menuPenguji() {
    var n = jumlahAntri();
    var d = dialog('<h3>Menu</h3><p class="sub">' + esc(D().penguji.nama) + ' · Station ' + D().station.no + '</p><div class="menu-daftar">' +
      '<button class="btn btn-garis" data-m="sinkron">Kirim nilai sekarang' + (n ? ' (' + n + ')' : '') + '</button>' +
      '<button class="btn btn-garis" data-m="muat">Muat ulang data peserta &amp; rubrik</button>' +
      '<button class="btn btn-garis" data-m="cadangan">Unduh file cadangan nilai</button>' +
      '<button class="btn btn-garis" data-m="rubrik">Lihat rubrik station</button>' +
      '<button class="btn btn-garis" data-m="info">Info penyimpanan perangkat</button>' +
      '<button class="btn btn-garis" data-m="keluar" style="color:var(--merah)">Keluar</button>' +
      '</div>');
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return;
      var m = b.getAttribute('data-m'); tutupDialog();
      if (m === 'sinkron') sinkron(true);
      if (m === 'muat') muatUlangData();
      if (m === 'cadangan') unduhCadangan();
      if (m === 'rubrik') lihatRubrik();
      if (m === 'info') infoPenyimpanan();
      if (m === 'keluar') keluar();
    });
  }

  function muatUlangData() {
    if (!navigator.onLine) { toast('Perlu koneksi internet untuk memuat ulang data.', 'galat'); return; }
    toast('Memuat ulang data…');
    login(S.sesi.pin).then(function () { bukaPenguji(); toast('Data peserta & rubrik diperbarui.', 'sukses'); })
      .catch(function (e) { toast(e.message, 'galat', 4500); });
  }

  function lihatRubrik() {
    var r = D().rubrik;
    var html = '<h3>Rubrik Station ' + D().station.no + '</h3><p class="sub">' + esc(D().station.judul) + ' · ' + esc(D().station.kasus) + '</p>';
    r.forEach(function (b) {
      html += '<div class="kartu-butir terisi" style="box-shadow:none;border:1px solid var(--garis);border-left-width:4px"><div class="butir-kepala"><span class="butir-no">' + b.butir + '</span><span class="butir-judul">' + esc(b.kompetensi) + '</span><span class="bobot bobot-' + b.bobot + '">Bobot ' + b.bobot + '</span></div>' +
        '<ol class="semua-kriteria" style="list-style:none;padding:0;display:grid;gap:6px">' + b.skor.map(function (s, i) { return '<li style="font-size:13.5px;border:1px solid var(--garis);border-radius:8px;padding:8px 10px"><b style="color:var(--navy)">Skor ' + i + ':</b> ' + esc(s) + '</li>'; }).join('') + '</ol></div>';
    });
    html += '<button class="btn btn-utama btn-penuh" data-x="1">Tutup</button>';
    var d = dialog(html);
    d.querySelector('[data-x]').addEventListener('click', tutupDialog);
  }

  function infoPenyimpanan() {
    var est = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null);
    var per = navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false);
    Promise.all([est, per]).then(function (x) {
      var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      var total = Object.keys(S.lokal).length;
      var html = '<h3>Info penyimpanan</h3><table class="tabel">' +
        '<tr><td>Nilai tersimpan di perangkat</td><td class="angka-sel"><b>' + total + '</b></td></tr>' +
        '<tr><td>Belum terkirim</td><td class="angka-sel"><b>' + jumlahAntri() + '</b></td></tr>' +
        '<tr><td>Penyimpanan permanen</td><td class="angka-sel">' + (x[1] ? '✅ Aktif' : '⚠️ Tidak aktif') + '</td></tr>' +
        '<tr><td>Dibuka sebagai aplikasi terpasang</td><td class="angka-sel">' + (standalone ? '✅ Ya' : '⚠️ Tidak') + '</td></tr>' +
        (x[0] ? '<tr><td>Ruang terpakai</td><td class="angka-sel">' + Math.round((x[0].usage || 0) / 1024) + ' KB</td></tr>' : '') +
        '<tr><td>Data diambil</td><td class="angka-sel">' + esc(waktuLokal(D().diambil)) + '</td></tr></table>' +
        '<p class="catatan-kecil" style="margin-top:12px">Agar data aman: pasang aplikasi ke layar utama, jangan gunakan mode penyamaran/incognito, jangan hapus data browser sebelum semua nilai terkirim, dan unduh file cadangan di akhir sesi.</p>' +
        '<button class="btn btn-utama btn-penuh" data-x="1">Tutup</button>';
      var d = dialog(html); d.querySelector('[data-x]').addEventListener('click', tutupDialog);
    });
  }

  function keluar() {
    var n = jumlahAntri();
    if (n) {
      var d = dialog('<h3>Belum bisa keluar</h3><p class="sub">Masih ada <b>' + n + ' nilai</b> yang belum terkirim ke server. Sambungkan perangkat ke internet lalu kirim terlebih dahulu, atau unduh file cadangan dan serahkan ke admin.</p><div class="aksi-dialog"><button class="btn btn-garis" data-x="c">Unduh cadangan</button><button class="btn btn-utama" data-x="s">Kirim sekarang</button></div>');
      d.addEventListener('click', function (e) {
        var b = e.target.closest('[data-x]'); if (!b) return; tutupDialog();
        if (b.getAttribute('data-x') === 'c') unduhCadangan(); else sinkron(true);
      });
      return;
    }
    konfirmasi('Keluar?', 'Semua nilai sudah terkirim. Data penilaian di perangkat ini akan dibersihkan.', 'Keluar').then(function (ya) {
      if (!ya) return;
      var hapus = Object.keys(S.lokal).filter(function (k) { return S.lokal[k].status === 'terkirim'; });
      Promise.all(hapus.map(DB.hapusNilai)).then(function () {
        return Promise.all([DB.del('sesi'), DB.del('draf-index')]);
      }).then(muatLokal).then(function () {
        S.sesi = null; S.draf = {}; perbaruiCover(); tampil('layar-cover');
      });
    });
  }

  /* ---------------- Form nilai ---------------- */
  function bukaForm(p) {
    var d = D();
    var k = kunciDari(d.periode.kode, d.station.no, p.nim);
    var st = statusPeserta(p);
    var terkunci = ['antri', 'terkirim', 'server', 'konflik'].indexOf(st.kode) >= 0;
    S.form = { peserta: p, kunci: k, skor: d.rubrik.map(function () { return null; }), gr: null, catatan: '', terkunci: terkunci, status: st };
    if (st.rec) {
      S.form.skor = d.rubrik.map(function (r, i) { return st.rec.skor && st.rec.skor[i] !== undefined ? Number(st.rec.skor[i]) : null; });
      S.form.gr = st.rec.gr || null; S.form.catatan = st.rec.catatan || '';
    }
    var lanjut = Promise.resolve();
    if (!terkunci) {
      lanjut = DB.get('draf-' + k).then(function (dr) { if (dr) { S.form.skor = dr.skor; S.form.gr = dr.gr; S.form.catatan = dr.catatan || ''; } });
    }
    lanjut.then(function () {
      $('nl-station').textContent = 'Station ' + d.station.no + ' · ' + d.station.kasus;
      $('nl-urut').textContent = p.urut || '-';
      $('nl-nama').textContent = p.nama;
      $('nl-nim').textContent = p.nim;
      var kk = $('nl-kunci');
      if (terkunci) {
        var info = {
          antri: 'Nilai sudah dikunci dan tersimpan di perangkat. Akan otomatis terkirim saat online.',
          terkirim: 'Nilai sudah terkirim ke server dan dikunci.',
          server: 'Nilai sudah tercatat di server' + (st.rec.penguji ? ' (oleh ' + esc(st.rec.penguji) + ')' : '') + ' dan dikunci.',
          konflik: 'Server menolak: ' + esc(st.rec.pesan || 'peserta sudah dinilai.') + ' Hubungi admin.'
        }[st.kode];
        kk.innerHTML = '🔒 ' + info + ' Koreksi hanya dapat dilakukan admin.'; kk.classList.remove('tersembunyi');
      } else if (st.kode === 'ditolak') {
        kk.innerHTML = '⚠️ Pengiriman sebelumnya ditolak server: ' + esc(st.rec.pesan || '') + ' Periksa lalu simpan ulang.'; kk.classList.remove('tersembunyi');
      } else kk.classList.add('tersembunyi');
      renderButir();
      $('nl-catatan').value = S.form.catatan; $('nl-catatan').disabled = terkunci;
      $('btn-periksa').classList.toggle('tersembunyi', terkunci);
      tampil('layar-nilai');
      history.pushState({ layar: 'nilai' }, '');
    });
  }

  function renderButir() {
    var f = S.form, d = D();
    $('nl-butir').innerHTML = d.rubrik.map(function (r, i) {
      var v = f.skor[i];
      var desk = v === null ? '<div class="deskripsi kosong-pilih">Pilih skor 0–3 sesuai kriteria.</div>' : '<div class="deskripsi"><b>Skor ' + v + ':</b> ' + esc(r.skor[v]) + '</div>';
      return '<div class="kartu-butir' + (v !== null ? ' terisi' : '') + '" data-i="' + i + '">' +
        '<div class="butir-kepala"><span class="butir-no">' + r.butir + '</span><span class="butir-judul">' + esc(r.kompetensi) + '</span><span class="bobot bobot-' + r.bobot + '">Bobot ' + r.bobot + '</span></div>' +
        '<div class="pilihan-skor">' + [0, 1, 2, 3].map(function (s) {
          return '<button class="skor-btn' + (v === s ? ' aktif' : '') + '" data-s="' + s + '"' + (f.terkunci ? ' disabled' : '') + '>' + s + '</button>';
        }).join('') + '</div>' + desk +
        '<details class="semua-kriteria"><summary>Lihat semua kriteria</summary><ol>' +
        r.skor.map(function (t, s) { return '<li><b>Skor ' + s + ':</b> ' + esc(t) + '</li>'; }).join('') + '</ol></details></div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#nl-gr .gr-btn'), function (b) {
      b.classList.toggle('aktif', Number(b.getAttribute('data-gr')) === f.gr);
      b.disabled = f.terkunci;
    });
    renderTotal();
  }

  function hitungAM() {
    return D().rubrik.reduce(function (t, r, i) { return t + (S.form.skor[i] === null ? 0 : S.form.skor[i] * r.bobot); }, 0);
  }
  function renderTotal() { $('nl-total').textContent = hitungAM() + ' / ' + maksSkor(); }

  function simpanDraf() {
    var f = S.form; if (!f || f.terkunci) return;
    var ada = f.gr !== null || f.catatan || f.skor.some(function (x) { return x !== null; });
    var p = ada ? DB.set('draf-' + f.kunci, { skor: f.skor, gr: f.gr, catatan: f.catatan }) : DB.del('draf-' + f.kunci);
    if (ada) S.draf[f.kunci] = true; else delete S.draf[f.kunci];
    p.then(function () { return DB.set('draf-index', S.draf); });
  }

  function initForm() {
    $('nl-butir').addEventListener('click', function (e) {
      var b = e.target.closest('.skor-btn'); if (!b || S.form.terkunci) return;
      var i = Number(b.closest('.kartu-butir').getAttribute('data-i'));
      S.form.skor[i] = Number(b.getAttribute('data-s'));
      var kartu = b.closest('.kartu-butir');
      var y = kartu.getBoundingClientRect().top;
      renderButir(); simpanDraf();
      var baru = document.querySelector('.kartu-butir[data-i="' + i + '"]');
      if (baru) window.scrollBy(0, baru.getBoundingClientRect().top - y);
    });
    $('nl-gr').addEventListener('click', function (e) {
      var b = e.target.closest('.gr-btn'); if (!b || S.form.terkunci) return;
      S.form.gr = Number(b.getAttribute('data-gr')); renderButir(); simpanDraf();
    });
    $('nl-catatan').addEventListener('input', function (e) { S.form.catatan = e.target.value; simpanDraf(); });
    $('btn-kembali-daftar').addEventListener('click', function () { history.back(); });
    window.addEventListener('popstate', function () {
      if (!$('layar-nilai').classList.contains('tersembunyi')) { tutupDialog(); S.form = null; tampil('layar-penguji'); renderPenguji(); }
    });
    $('btn-periksa').addEventListener('click', ringkasan);
  }

  function ringkasan() {
    var f = S.form, d = D();
    var kosong = []; f.skor.forEach(function (v, i) { if (v === null) kosong.push('butir ' + d.rubrik[i].butir); });
    if (f.gr === null) kosong.push('global performance');
    if (kosong.length) { toast('Belum diisi: ' + kosong.join(', ') + '.', 'galat', 3800); return; }
    var am = hitungAM(), maks = maksSkor();
    var html = '<h3>Periksa kembali penilaian</h3><p class="sub"><b>' + esc(f.peserta.nama) + '</b> · ' + esc(f.peserta.nim) + ' · Station ' + d.station.no + '</p>' +
      '<table class="tabel"><thead><tr><th>Butir</th><th class="angka-sel">Skor</th><th class="angka-sel">Bobot</th><th class="angka-sel">Nilai</th></tr></thead><tbody>' +
      d.rubrik.map(function (r, i) { return '<tr><td>' + r.butir + '. ' + esc(r.kompetensi) + '</td><td class="angka-sel">' + f.skor[i] + '</td><td class="angka-sel">' + r.bobot + '</td><td class="angka-sel">' + (f.skor[i] * r.bobot) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Actual Mark</td><td></td><td></td><td class="angka-sel">' + am + ' / ' + maks + '</td></tr><tr><td>Global Performance</td><td colspan="3" class="angka-sel">' + f.gr + ' – ' + GR_LABEL[f.gr] + '</td></tr></tfoot></table>' +
      (f.catatan ? '<p class="catatan-kecil" style="margin-top:8px"><b>Catatan:</b> ' + esc(f.catatan) + '</p>' : '') +
      '<label class="centang"><input type="checkbox" id="cek-teliti"><span>Saya sudah meneliti kembali penilaian ini. Setelah disimpan, nilai <b>dikunci</b> dan hanya dapat dikoreksi admin.</span></label>' +
      '<div class="aksi-dialog"><button class="btn btn-garis" data-x="0">Kembali</button><button class="btn btn-utama" data-x="1" id="btn-simpan-final" disabled>Simpan &amp; Kunci</button></div>';
    var dl = dialog(html);
    dl.querySelector('#cek-teliti').addEventListener('change', function (e) { $('btn-simpan-final').disabled = !e.target.checked; });
    dl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x]'); if (!b || b.disabled) return;
      if (b.getAttribute('data-x') === '0') { tutupDialog(); return; }
      b.disabled = true; simpanNilai();
    });
  }

  function simpanNilai() {
    var f = S.form, d = D();
    var rec = {
      kunci: f.kunci, idKlien: uuid(), periode: d.periode.kode, station: d.station.no,
      nim: f.peserta.nim, nama: f.peserta.nama, skor: f.skor.slice(), gr: f.gr, catatan: f.catatan,
      penguji: d.penguji.nama, waktuNilai: waktuSetempat(), waktuIso: new Date().toISOString(), status: 'antri', pesan: ''
    };
    DB.simpanNilai(rec).then(function () {
      S.lokal[rec.kunci] = rec;
      delete S.draf[f.kunci];
      return Promise.all([DB.del('draf-' + f.kunci), DB.set('draf-index', S.draf)]);
    }).then(function () {
      tutupDialog();
      toast('Nilai ' + f.peserta.nama + ' tersimpan di perangkat.', 'sukses');
      history.back();
      sinkron();
    }).catch(function (e) {
      toast('Gagal menyimpan di perangkat: ' + e.message, 'galat', 5000);
    });
  }

  /* ---------------- Sinkronisasi ---------------- */
  function sinkron(manual) {
    if (!S.sesi || S.sesi.peran === 'ADMIN' || S.sinkronJalan) return Promise.resolve();
    var antri = Object.keys(S.lokal).map(function (k) { return S.lokal[k]; }).filter(function (r) { return r.status === 'antri'; });
    if (!antri.length) { if (manual) toast('Tidak ada nilai yang perlu dikirim.'); renderBilahSinkron(); return Promise.resolve(); }
    if (!navigator.onLine) { if (manual) toast('Perangkat sedang offline. Nilai akan dikirim otomatis saat online.', 'galat'); renderBilahSinkron(); return Promise.resolve(); }
    S.sinkronJalan = true; renderBilahSinkron();
    var batch = antri.slice(0, 25).map(function (r) {
      return { idKlien: r.idKlien, periode: r.periode, station: r.station, nim: r.nim, skor: r.skor, gr: r.gr, catatan: r.catatan, waktuNilai: r.waktuNilai, penguji: r.penguji };
    });
    return api('simpan', { pin: S.sesi.pin, records: batch }).then(function (res) {
      if (!res.ok) throw new Error(res.pesan || 'Server menolak pengiriman.');
      var byId = {}; (res.hasil || []).forEach(function (h) { byId[h.idKlien] = h; });
      var tulis = [];
      antri.slice(0, 25).forEach(function (r) {
        var h = byId[r.idKlien]; if (!h) return;
        if (h.status === 'ok' || h.status === 'duplikat') { r.status = 'terkirim'; r.pesan = ''; r.waktuKirim = new Date().toISOString(); }
        else { r.status = h.status; r.pesan = h.pesan || ''; }
        tulis.push(DB.simpanNilai(r));
      });
      return Promise.all(tulis).then(function () {
        var gagal = (res.hasil || []).filter(function (h) { return h.status === 'konflik' || h.status === 'ditolak'; });
        if (gagal.length) toast(gagal.length + ' nilai ditolak server. Buka peserta bertanda merah.', 'galat', 5000);
        else if (manual || batch.length) toast(batch.length + ' nilai terkirim ke server ✓', 'sukses');
        S.sinkronJalan = false;
        if (antri.length > 25) return sinkron(manual);
      });
    }).catch(function (e) {
      if (manual) toast(e.message, 'galat', 4500);
    }).then(function () { S.sinkronJalan = false; renderPenguji(); });
  }

  /* ---------------- Cadangan ---------------- */
  function unduhBerkas(nama, isi, tipe) {
    var blob = new Blob([isi], { type: tipe });
    var file;
    try { file = new File([blob], nama, { type: tipe }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /iphone|ipad|ipod|android/i.test(navigator.userAgent)) {
      return navigator.share({ files: [file], title: nama }).catch(function () { unduhLangsung(blob, nama); });
    }
    unduhLangsung(blob, nama);
    return Promise.resolve();
  }
  function unduhLangsung(blob, nama) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nama;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function unduhCadangan() {
    var d = D();
    var recs = Object.keys(S.lokal).map(function (k) { return S.lokal[k]; });
    if (!recs.length) { toast('Belum ada nilai di perangkat ini.'); return; }
    var isi = {
      jenis: 'cadangan-penguji-osce', versiApp: VERSI_APP, dibuat: new Date().toISOString(),
      penguji: d.penguji.nama, periode: d.periode.kode, station: d.station.no,
      records: recs.map(function (r) { return { idKlien: r.idKlien, periode: r.periode, station: r.station, nim: r.nim, nama: r.nama, skor: r.skor, gr: r.gr, catatan: r.catatan, penguji: r.penguji, waktuNilai: r.waktuNilai, status: r.status }; })
    };
    unduhBerkas('cadangan-osce-' + d.periode.kode + '-st' + d.station.no + '-' + stempel() + '.json', JSON.stringify(isi, null, 1), 'application/json')
      .then(function () { DB.set('cadangan-terakhir', new Date().toISOString()); toast('File cadangan dibuat (' + recs.length + ' nilai).', 'sukses'); });
  }

  /* ---------------- Admin ---------------- */
  function bukaAdmin() {
    var d = S.sesi.data;
    $('ad-nama').textContent = d.nama;
    var sel = $('ad-periode');
    sel.innerHTML = (d.periode || []).map(function (p) {
      return '<option value="' + esc(p.kode) + '">' + esc(p.nama) + ' — ' + (p.program === 'D3' ? 'D3' : 'S.Tr') + ' (' + esc(p.kode) + ')' + (p.status !== 'AKTIF' ? ' · ' + esc(p.status) : '') + '</option>';
    }).join('');
    if (!(d.periode || []).length) sel.innerHTML = '<option value="">Belum ada periode di sheet PERIODE</option>';
    tampil('layar-admin');
    DB.get('admin-terakhir').then(function (kode) {
      if (kode && (d.periode || []).some(function (p) { return p.kode === kode; })) sel.value = kode;
      var k = sel.value;
      if (k) DB.get('admin-cache-' + k).then(function (c) { if (c) { S.admin.data = c; renderAdmin(true); } });
    });
  }

  function muatAdmin() {
    var kode = $('ad-periode').value; if (!kode) return;
    var btn = $('btn-muat-admin'); btn.disabled = true; btn.innerHTML = '<span class="memuat"></span> Memuat…';
    api('dataAdmin', { pin: S.sesi.pin, periode: kode }).then(function (res) {
      if (!res.ok) throw new Error(res.pesan);
      S.admin.data = res;
      DB.set('admin-cache-' + kode, res); DB.set('admin-terakhir', kode);
      renderAdmin(false);
    }).catch(function (e) {
      toast(e.message, 'galat', 4500);
      DB.get('admin-cache-' + kode).then(function (c) { if (c) { S.admin.data = c; renderAdmin(true); } });
    }).then(function () { btn.disabled = false; btn.textContent = 'Muat data'; });
  }

  function renderAdmin(dariCache) {
    var data = S.admin.data; if (!data) return;
    var hasil = Rekap.hitung(data, { minPeserta: CFG.MIN_PESERTA_BRM || 10 });
    S.admin.hasil = hasil;
    $('ad-isi').classList.remove('tersembunyi');
    var p = data.periode;
    $('ad-judul-periode').textContent = p.nama + ' · ' + (p.program === 'D3' ? 'Diploma III Gizi' : 'Sarjana Terapan Gizi') + ' · Paket ' + p.paket;
    var pr = hasil.progres, pct = pr.total ? Math.round(pr.terisi / pr.total * 100) : 0;
    $('ad-progres-teks').textContent = pr.terisi + ' dari ' + pr.total + ' nilai masuk (' + pct + '%) · ' + data.peserta.length + ' peserta × ' + hasil.stations.length + ' station';
    $('ad-bar').style.width = pct + '%';
    $('ad-status').textContent = (dariCache ? 'Menampilkan data tersimpan, ' : 'Data diambil ') + waktuLokal(data.diambil) + (dariCache ? ' — tekan "Muat data" untuk memperbarui.' : '.');
    renderTabAdmin();
  }

  function renderTabAdmin() {
    var data = S.admin.data, h = S.admin.hasil, tab = S.admin.tab, out = '';
    Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (b) { b.classList.toggle('aktif', b.getAttribute('data-tab') === tab); });
    if (tab === 'progres') {
      out = '<h3>Nilai masuk per station</h3><div class="grid-st">' + h.stations.map(function (s) {
        var n = Object.keys(s.baris).length, N = data.peserta.length;
        var pg = (data.penguji || []).filter(function (x) { return x.station === s.station.no; }).map(function (x) { return esc(x.nama) + (x.jenis ? ' <span class="catatan-kecil">(' + esc(x.jenis) + ')</span>' : ''); }).join('<br>');
        return '<div class="kotak-st"><div class="no">STATION ' + s.station.no + '</div><div class="kasus">' + esc(s.station.kasus) + '</div><div class="angka-st">' + n + ' / ' + N + '</div>' +
          '<div class="bilah-progres"><div style="width:' + (N ? n / N * 100 : 0) + '%"></div></div><div class="catatan-kecil" style="margin-top:6px">' + (pg || 'Penguji belum diatur') + '</div></div>';
      }).join('') + '</div>';
    } else if (tab === 'matriks') {
      out = '<h3>Matriks nilai (Actual Mark)</h3><p class="catatan-kecil">Hijau = lulus station, merah = tidak lulus station, – = belum dinilai. NBL bersifat sementara sampai semua nilai masuk.</p><div class="gulir"><table class="matriks"><thead><tr><th class="kiri">Peserta</th>' +
        h.stations.map(function (s) { return '<th>St ' + s.station.no + '<br><span style="font-weight:400">NBL ' + s.nbl + '</span></th>'; }).join('') + '</tr></thead><tbody>' +
        h.peserta.map(function (r) {
          return '<tr><td class="kiri">' + esc(r.peserta.urut ? r.peserta.urut + '. ' : '') + esc(r.peserta.nama) + '<br><span class="catatan-kecil">' + esc(r.peserta.nim) + '</span></td>' +
            r.st.map(function (x) { return x ? '<td class="' + (x.lulus ? 'sel-ok' : 'sel-tl') + '">' + x.am + '<br><span style="font-weight:400;font-size:11px">GR ' + x.gr + '</span></td>' : '<td class="sel-belum">–</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
    } else if (tab === 'nbl') {
      out = '<h3>Nilai Batas Lulus per station</h3><p class="catatan-kecil">Borderline Regression: AM = a + b·GR, NBL = a + 2b. Batas cadangan ' + (data.periode.batasCadangan || 60) + '% skor maksimal dipakai bila n &lt; ' + (CFG.MIN_PESERTA_BRM || 10) + ', GR seragam, atau slope ≤ 0.</p><div class="gulir"><table class="tabel"><thead><tr><th>St</th><th>Kasus</th><th class="angka-sel">Maks</th><th class="angka-sel">n</th><th class="angka-sel">a</th><th class="angka-sel">b</th><th class="angka-sel">R²</th><th class="angka-sel">NBL</th><th>Metode</th></tr></thead><tbody>' +
        h.stations.map(function (s) {
          var f = function (v) { return v === null ? '–' : (Math.round(v * 100) / 100); };
          return '<tr><td>' + s.station.no + '</td><td>' + esc(s.station.kasus) + '</td><td class="angka-sel">' + s.maks + '</td><td class="angka-sel">' + s.info.n + '</td><td class="angka-sel">' + f(s.info.a) + '</td><td class="angka-sel">' + f(s.info.b) + '</td><td class="angka-sel">' + f(s.info.r2) + '</td><td class="angka-sel"><b>' + s.nbl + '</b></td><td>' + esc(s.info.metode) + (s.info.ket ? '<br><span class="catatan-kecil">' + esc(s.info.ket) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } else if (tab === 'hasil') {
      var c = { LULUS: 0, 'TIDAK LULUS': 0, 'BELUM LENGKAP': 0 };
      h.peserta.forEach(function (r) { c[r.status]++; });
      out = '<h3>Hasil kelulusan</h3><div class="ringkas-angka" style="margin-bottom:12px"><div class="angka"><b class="status-lulus">' + c.LULUS + '</b><span>Lulus</span></div><div class="angka"><b class="status-tl">' + c['TIDAK LULUS'] + '</b><span>Tidak lulus</span></div><div class="angka"><b class="status-bl">' + c['BELUM LENGKAP'] + '</b><span>Belum lengkap</span></div></div>' +
        '<div class="gulir"><table class="tabel"><thead><tr><th>No</th><th>NIM</th><th>Nama</th><th class="angka-sel">Station lulus</th><th>Status</th><th>Station tidak lulus</th></tr></thead><tbody>' +
        h.peserta.map(function (r, i) {
          var cls = r.status === 'LULUS' ? 'status-lulus' : r.status === 'TIDAK LULUS' ? 'status-tl' : 'status-bl';
          return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.peserta.nim) + '</td><td>' + esc(r.peserta.nama) + '</td><td class="angka-sel">' + r.jmlLulus + '/' + h.stations.length + '</td><td class="' + cls + '">' + r.status + '</td><td>' + (r.gagal.length ? 'St ' + r.gagal.join(', ') : '–') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    $('ad-tab').innerHTML = out;
  }

  function unduhExcel() {
    if (!S.admin.data) return;
    if (!window.XLSX) { toast('Modul Excel belum termuat, coba lagi sebentar.', 'galat'); return; }
    var wb = Rekap.buatWorkbook(window.XLSX, S.admin.data, S.admin.hasil, { minPeserta: CFG.MIN_PESERTA_BRM || 10 });
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    unduhBerkas('Rekap_OSCE_' + S.admin.data.periode.kode + '_' + stempel() + '.xlsx', out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  function imporCadangan(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var isi;
      try { isi = JSON.parse(fr.result); } catch (e) { toast('File bukan cadangan yang valid.', 'galat'); return; }
      if (!isi || isi.jenis !== 'cadangan-penguji-osce' || !Array.isArray(isi.records)) { toast('File bukan cadangan Penguji OSCE.', 'galat'); return; }
      var recs = isi.records;
      konfirmasi('Impor cadangan?', 'File dari <b>' + esc(isi.penguji) + '</b> (periode ' + esc(isi.periode) + ', station ' + esc(isi.station) + ') berisi <b>' + recs.length + ' nilai</b>. Nilai yang sudah ada di server tidak akan ditimpa.', 'Impor').then(function (ya) {
        if (!ya) return;
        toast('Mengimpor…');
        var ringkas = { ok: 0, duplikat: 0, konflik: 0, ditolak: 0 }, pesan = [];
        var potong = []; for (var i = 0; i < recs.length; i += 25) potong.push(recs.slice(i, i + 25));
        potong.reduce(function (pr, b) {
          return pr.then(function () {
            return api('simpan', { pin: S.sesi.pin, records: b, timpa: false }).then(function (res) {
              if (!res.ok) throw new Error(res.pesan);
              res.hasil.forEach(function (h) { ringkas[h.status] = (ringkas[h.status] || 0) + 1; if (h.pesan && h.status !== 'ok') pesan.push(h.kunci + ': ' + h.pesan); });
            });
          });
        }, Promise.resolve()).then(function () {
          var d = dialog('<h3>Hasil impor</h3><table class="tabel"><tr><td>Masuk baru</td><td class="angka-sel"><b>' + ringkas.ok + '</b></td></tr><tr><td>Sudah ada (sama)</td><td class="angka-sel">' + ringkas.duplikat + '</td></tr><tr><td>Konflik (sudah dinilai lain)</td><td class="angka-sel">' + ringkas.konflik + '</td></tr><tr><td>Ditolak</td><td class="angka-sel">' + ringkas.ditolak + '</td></tr></table>' +
            (pesan.length ? '<p class="catatan-kecil" style="margin-top:10px">' + pesan.slice(0, 15).map(esc).join('<br>') + '</p>' : '') + '<button class="btn btn-utama btn-penuh" style="margin-top:12px" data-x="1">Tutup</button>');
          d.querySelector('[data-x]').addEventListener('click', function () { tutupDialog(); muatAdmin(); });
        }).catch(function (e) { toast(e.message, 'galat', 4500); });
      });
    };
    fr.readAsText(file);
  }

  function initAdmin() {
    $('btn-muat-admin').addEventListener('click', muatAdmin);
    $('ad-periode').addEventListener('change', function () {
      var k = this.value; S.admin.data = null; $('ad-isi').classList.add('tersembunyi'); $('ad-status').textContent = '';
      DB.get('admin-cache-' + k).then(function (c) { if (c) { S.admin.data = c; renderAdmin(true); } });
    });
    document.querySelector('.tab-bar').addEventListener('click', function (e) {
      var b = e.target.closest('.tab-btn'); if (!b) return; S.admin.tab = b.getAttribute('data-tab'); renderTabAdmin();
    });
    $('btn-unduh-excel').addEventListener('click', unduhExcel);
    $('btn-impor').addEventListener('click', function () { $('file-impor').click(); });
    $('file-impor').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) imporCadangan(f); e.target.value = ''; });
    $('btn-keluar-admin').addEventListener('click', function () {
      konfirmasi('Keluar dari mode admin?', 'Anda perlu memasukkan PIN lagi untuk masuk.', 'Keluar').then(function (ya) {
        if (!ya) return;
        DB.del('sesi').then(function () { S.sesi = null; S.admin.data = null; perbaruiCover(); tampil('layar-cover'); });
      });
    });
  }


  /* ---------------- Impor rubrik dari template soal (.docx) ---------------- */
  var STANDAR = {
    D3: { waktu: 10, paket: 'D3-STANDAR', st: [
      [1, 'Endokrin atau Sistem Perkemihan', 'DM Tipe 2'], [2, 'Sistem Pencernaan', 'Gastritis'], [3, 'Sistem Kardiovaskuler atau Neuromuskuler', 'Dislipidemia'],
      [4, 'ISTIRAHAT', ''], [5, 'Masalah Gizi pada Anak dan Remaja', 'Balita Stunting'], [6, 'Masalah Gizi pada Ibu', 'Ibu Hamil KEK'],
      [7, 'Penyelenggaraan Makanan', 'Penyelenggaraan Makanan di Rumah Sakit'], [8, 'ISTIRAHAT', '']] },
    STR: { waktu: 12, paket: 'STR-STANDAR', st: [
      [1, 'Endokrin', 'DM Tipe 2'], [2, 'Sistem Perkemihan', 'Gagal Ginjal Kronik (GGK)'], [3, 'Sistem Pencernaan atau Pernapasan', 'Tipoid'],
      [4, 'ISTIRAHAT', ''], [5, 'Sistem Kardiovaskuler atau Neuromuskuler', 'Pasca Stroke'], [6, 'Masalah Gizi pada Anak dan Remaja', 'Anemia Remaja'],
      [7, 'Masalah Gizi pada Ibu', 'Ibu Hamil Hipertensi'], [8, 'Penyelenggaraan Makanan', 'Penyelenggaraan Makanan di Katering'], [9, 'ISTIRAHAT', '']] }
  };
  S.imp = { program: 'D3', file: [], kasus: {} };

  function impStation() { return STANDAR[S.imp.program].st.map(function (x) { return { no: x[0], judul: x[1], kasus: x[2], istirahat: x[1] === 'ISTIRAHAT' }; }); }
  function impAktif() { return impStation().filter(function (x) { return !x.istirahat; }); }

  function bukaImpor() {
    S.imp = { program: 'D3', file: [], kasus: {} };
    $('imp-program').value = 'D3'; $('imp-kode').value = ''; $('imp-ket').value = ''; $('imp-salin').checked = true;
    renderImpor(); tampil('layar-impor');
  }

  function impValidasi() {
    var galat = [], aktif = impAktif(), salin = $('imp-salin').checked;
    var kode = $('imp-kode').value.trim();
    if (!kode) galat.push('Kode paket belum diisi.');
    else if (!/^[A-Za-z0-9_\-]+$/.test(kode)) galat.push('Kode paket hanya boleh huruf, angka, tanda - atau _.');
    if (!S.imp.file.length) galat.push('Belum ada file soal.');
    S.imp.file.forEach(function (f) {
      f.galat = [];
      if (f.gagal) { f.galat.push(f.gagal); return; }
      if (!f.station) f.galat.push('Nomor station belum ditentukan.');
      else if (!aktif.some(function (a) { return a.no === f.station; })) f.galat.push('Station ' + f.station + ' bukan station aktif ' + (S.imp.program === 'D3' ? 'D3' : 'Sarjana Terapan') + '.');
      else if (S.imp.file.filter(function (g) { return g.station === f.station; }).length > 1) f.galat.push('Lebih dari satu file untuk station ' + f.station + '.');
      var dipakai = f.butir.filter(function (b) { return b.pakai; });
      if (!dipakai.length) f.galat.push('Tidak ada butir rubrik yang dipakai.');
      if (dipakai.length > 8) f.galat.push('Maksimal 8 butir per station (sekarang ' + dipakai.length + ').');
      dipakai.forEach(function (b, i) {
        if (!b.bobot) f.galat.push('Bobot butir ' + (i + 1) + ' belum diisi.');
        if (b.skor.some(function (x) { return !x; })) f.galat.push('Kriteria skor butir ' + (i + 1) + ' ada yang kosong.');
        if (!b.kompetensi) f.galat.push('Nama kompetensi butir ' + (i + 1) + ' kosong.');
      });
      f.peringatan.forEach(function (w) { f.galat.push(w); });
    });
    var tanpaFile = aktif.filter(function (a) { return !S.imp.file.some(function (f) { return f.station === a.no; }); });
    if (tanpaFile.length && !salin) galat.push('Station ' + tanpaFile.map(function (a) { return a.no; }).join(', ') + ' belum memiliki file.');
    S.imp.file.forEach(function (f) { if (f.galat.length) galat.push(f.nama + ': ' + f.galat[0]); });
    return galat;
  }

  function renderImpor() {
    var aktif = impAktif(), salin = $('imp-salin').checked;
    var galat = impValidasi();
    var opsiSt = function (pilih) {
      return '<option value="">– pilih station –</option>' + aktif.map(function (a) { return '<option value="' + a.no + '"' + (a.no === pilih ? ' selected' : '') + '>Station ' + a.no + ' · ' + esc(a.kasus) + '</option>'; }).join('');
    };
    var kartuFile = function (f, i) {
      var html = '<div class="imp-file">📄 ' + esc(f.nama) + (f.sumberStation ? ' · nomor station dari ' + esc(f.sumberStation) : '') + '</div>';
      html += '<div class="imp-kepala"><select data-imp="station" data-f="' + i + '">' + opsiSt(f.station) + '</select><button class="btn btn-garis btn-kecil" data-imp="hapus" data-f="' + i + '">Hapus file</button></div>';
      f.galat.forEach(function (g) { html += '<div class="imp-galat">' + esc(g) + '</div>'; });
      if (f.butir.length) {
        var nomor = 0;
        html += '<table class="imp-butir"><tbody>' + f.butir.map(function (b, j) {
          if (b.pakai) nomor++;
          return '<tr class="' + (b.pakai ? '' : 'mati') + '"><td style="width:30px"><input type="checkbox" data-imp="pakai" data-f="' + i + '" data-b="' + j + '"' + (b.pakai ? ' checked' : '') + ' title="Pakai butir ini"></td>' +
            '<td style="width:30px"><b>' + (b.pakai ? nomor : '–') + '</b></td>' +
            '<td>' + esc(b.kompetensi) + (b.alternatif ? '<span class="tag-alt">alternatif</span>' : '') +
            '<details><summary>Kriteria skor 0–3</summary>' + b.skor.map(function (t, k) { return '<div><b>Skor ' + k + ':</b> ' + esc(t || '(kosong)') + '</div>'; }).join('') + '</details></td>' +
            '<td style="width:96px">Bobot<br><select data-imp="bobot" data-f="' + i + '" data-b="' + j + '" class="' + (b.bobot ? '' : 'kosong') + '"><option value="">–</option><option' + (b.bobot === 1 ? ' selected' : '') + '>1</option><option' + (b.bobot === 2 ? ' selected' : '') + '>2</option><option' + (b.bobot === 3 ? ' selected' : '') + '>3</option></select></td></tr>';
        }).join('') + '</tbody></table>';
        var maks = f.butir.filter(function (b) { return b.pakai; }).reduce(function (t, b) { return t + 3 * (b.bobot || 0); }, 0);
        html += '<div class="catatan-kecil" style="margin-top:6px">Skor maksimal station: <b>' + maks + '</b></div>';
      }
      return html;
    };

    var out = '';
    var tanpaSt = S.imp.file.map(function (f, i) { return { f: f, i: i }; }).filter(function (x) { return !x.f.station || !aktif.some(function (a) { return a.no === x.f.station; }) || S.imp.file.filter(function (g) { return g.station === x.f.station; }).length > 1; });
    if (tanpaSt.length) {
      out += '<div class="panel"><h3>Perlu ditindaklanjuti</h3><p class="catatan-kecil" style="margin:0">Tentukan nomor station untuk file berikut.</p></div>';
      tanpaSt.forEach(function (x) { out += '<div class="kartu-imp galat">' + kartuFile(x.f, x.i) + '</div>'; });
    }
    if (S.imp.file.length) out += '<div class="panel" style="margin-bottom:10px"><h3 style="margin:0">3. Pratinjau per station</h3></div>';
    impStation().forEach(function (st) {
      if (!S.imp.file.length) return;
      if (st.istirahat) { out += '<div class="kartu-imp istirahat"><div class="imp-kepala"><span class="no">' + st.no + '</span><span class="judul">Station istirahat</span></div></div>'; return; }
      var idx = -1;
      S.imp.file.forEach(function (f, i) { if (f.station === st.no && S.imp.file.filter(function (g) { return g.station === st.no; }).length === 1) idx = i; });
      var kasus = S.imp.kasus[st.no] !== undefined ? S.imp.kasus[st.no] : st.kasus;
      var kelas = idx >= 0 ? (S.imp.file[idx].galat.length ? 'galat' : '') : (salin ? 'standar' : 'galat');
      out += '<div class="kartu-imp ' + kelas + '"><div class="imp-kepala"><span class="no">' + st.no + '</span><span class="judul">' + esc(st.judul) + '</span></div>' +
        '<div class="imp-kasus">Kasus <input data-imp="kasus" data-st="' + st.no + '" value="' + esc(kasus) + '"></div>';
      if (idx >= 0) out += kartuFile(S.imp.file[idx], idx);
      else out += '<div class="catatan-kecil">' + (salin ? 'Tidak ada file — memakai rubrik paket standar (' + STANDAR[S.imp.program].paket + ').' : '<span style="color:var(--merah)">Belum ada file untuk station ini.</span>') + '</div>';
      out += '</div>';
    });
    $('imp-hasil').innerHTML = out;
    var siap = !galat.length;
    $('btn-simpan-paket').disabled = !siap;
    var nFile = S.imp.file.length, nButir = S.imp.file.reduce(function (t, f) { return t + f.butir.filter(function (b) { return b.pakai; }).length; }, 0);
    $('imp-status').innerHTML = !nFile ? 'Belum ada file' : (siap ? '<span style="color:var(--hijau)">Siap disimpan</span> · ' + nFile + ' file, ' + nButir + ' butir'
      : '<span style="color:var(--merah)">' + galat.length + ' hal perlu diperbaiki</span>');
    $('imp-status').title = galat.join('\n');
  }

  function bacaFileDocx(files) {
    if (!window.JSZip) { toast('Modul pembaca docx belum termuat, coba lagi.', 'galat'); return; }
    var arr = Array.prototype.slice.call(files);
    toast('Membaca ' + arr.length + ' file…');
    Promise.all(arr.map(function (f) {
      return ImporDocx.bacaDocx(f).catch(function (e) { return { nama: f.name, station: null, sumberStation: '', butir: [], peringatan: [], gagal: 'Gagal dibaca: ' + e.message }; });
    })).then(function (hasil) {
      hasil.forEach(function (h) {
        h.galat = [];
        S.imp.file = S.imp.file.filter(function (f) { return f.nama !== h.nama; });
        S.imp.file.push(h);
      });
      S.imp.file.sort(function (a, b) { return (a.station || 99) - (b.station || 99); });
      renderImpor();
      toast(hasil.length + ' file dibaca.', 'sukses');
    });
  }

  function simpanPaket() {
    var galat = impValidasi(); if (galat.length) { toast(galat[0], 'galat', 4000); return; }
    var prog = S.imp.program, kode = $('imp-kode').value.trim().toUpperCase();
    var station = impStation().map(function (st) {
      return { no: st.no, judul: st.judul, kasus: st.istirahat ? '' : (S.imp.kasus[st.no] !== undefined ? S.imp.kasus[st.no] : st.kasus), istirahat: st.istirahat, waktu: STANDAR[prog].waktu };
    });
    var rubrik = [], salin = [];
    impAktif().forEach(function (st) {
      var f = S.imp.file.filter(function (x) { return x.station === st.no; })[0];
      if (!f) { salin.push(st.no); return; }
      f.butir.filter(function (b) { return b.pakai; }).forEach(function (b, i) {
        rubrik.push({ station: st.no, butir: i + 1, kompetensi: b.kompetensi, s0: b.skor[0], s1: b.skor[1], s2: b.skor[2], s3: b.skor[3], bobot: b.bobot });
      });
    });
    var ringkas = impAktif().map(function (st) {
      var f = S.imp.file.filter(function (x) { return x.station === st.no; })[0];
      return 'St ' + st.no + ': ' + (f ? f.butir.filter(function (b) { return b.pakai; }).length + ' butir dari file' : 'rubrik standar');
    }).join('<br>');
    konfirmasi('Simpan paket ' + kode + '?', 'Program ' + (prog === 'D3' ? 'Diploma III Gizi' : 'Sarjana Terapan Gizi') + '.<br>' + ringkas, 'Simpan').then(function (ya) {
      if (!ya) return;
      var btn = $('btn-simpan-paket'); btn.disabled = true; btn.innerHTML = '<span class="memuat"></span> Menyimpan…';
      api('imporPaket', { pin: S.sesi.pin, kode: kode, program: prog, keterangan: $('imp-ket').value.trim(), basis: STANDAR[prog].paket, salinStation: salin, station: station, rubrik: rubrik })
        .then(function (res) {
          if (!res.ok) throw new Error(res.pesan);
          var d = dialog('<h3>Paket ' + esc(kode) + ' tersimpan</h3><p class="sub">' + res.jumlahButir + ' butir rubrik untuk ' + res.jumlahStation + ' station aktif telah ditulis ke tab PAKET, STATION, dan RUBRIK.</p>' +
            '<div class="kotak-info" style="background:var(--latar);border-radius:10px;padding:10px 12px;font-size:14px;margin-bottom:12px">Langkah berikutnya: di tab <b>PERIODE</b> Google Sheet, isi kolom <b>Kode Paket</b> periode ujian dengan <b>' + esc(kode) + '</b>.</div>' +
            '<button class="btn btn-utama btn-penuh" data-x="1">Selesai</button>', { wajib: true });
          d.querySelector('[data-x]').addEventListener('click', function () { tutupDialog(); tampil('layar-admin'); });
        })
        .catch(function (e) { toast(e.message, 'galat', 5000); })
        .then(function () { btn.textContent = 'Simpan sebagai paket'; renderImpor(); });
    });
  }

  function initImpor() {
    $('btn-buka-impor').addEventListener('click', bukaImpor);
    $('btn-tutup-impor').addEventListener('click', function () { tampil('layar-admin'); });
    $('btn-pilih-docx').addEventListener('click', function () { $('file-docx').click(); });
    $('file-docx').addEventListener('change', function (e) { if (e.target.files.length) bacaFileDocx(e.target.files); e.target.value = ''; });
    $('imp-program').addEventListener('change', function () { S.imp.program = this.value; S.imp.kasus = {}; renderImpor(); });
    $('imp-kode').addEventListener('input', renderImpor);
    $('imp-salin').addEventListener('change', renderImpor);
    $('btn-simpan-paket').addEventListener('click', simpanPaket);
    var w = $('imp-hasil');
    w.addEventListener('change', function (e) {
      var t = e.target, jenis = t.getAttribute('data-imp'); if (!jenis) return;
      var f = S.imp.file[+t.getAttribute('data-f')];
      if (jenis === 'station') f.station = t.value ? +t.value : null;
      if (jenis === 'pakai') f.butir[+t.getAttribute('data-b')].pakai = t.checked;
      if (jenis === 'bobot') f.butir[+t.getAttribute('data-b')].bobot = t.value ? +t.value : null;
      if (jenis === 'kasus') { S.imp.kasus[+t.getAttribute('data-st')] = t.value; return; }
      renderImpor();
    });
    w.addEventListener('click', function (e) {
      var t = e.target.closest('[data-imp="hapus"]'); if (!t) return;
      S.imp.file.splice(+t.getAttribute('data-f'), 1); renderImpor();
    });
  }

  /* ---------------- Service worker ---------------- */
  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function tunggu(w) {
        w.addEventListener('statechange', function () {
          if (w.state === 'installed' && navigator.serviceWorker.controller) tawarkan(w);
        });
      }
      function tawarkan(w) {
        $('banner-update').classList.remove('tersembunyi');
        $('btn-update').onclick = function () { w.postMessage('skipWaiting'); };
      }
      if (reg.waiting && navigator.serviceWorker.controller) tawarkan(reg.waiting);
      reg.addEventListener('updatefound', function () { tunggu(reg.installing); });
      setInterval(function () { reg.update().catch(function () { }); }, 30 * 60 * 1000);
    }).catch(function () { });
    var muatUlang = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (muatUlang) return; muatUlang = true; location.reload(); });
  }

  /* ---------------- Mulai ---------------- */
  function mulai() {
    initCover(); initPenguji(); initForm(); initAdmin(); initImpor(); initSW();
    window.addEventListener('online', function () { renderBilahSinkron(); sinkron(); });
    window.addEventListener('offline', renderBilahSinkron);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sinkron(); });
    setInterval(function () { sinkron(); }, CFG.INTERVAL_SINKRON || 30000);

    Promise.all([DB.get('sesi'), muatLokal()]).then(function (x) {
      S.sesi = x[0] || null;
      perbaruiCover();
      tampil('layar-cover');
      if (S.sesi && S.sesi.peran !== 'ADMIN') sinkron();
    }).catch(function (e) {
      toast('Penyimpanan perangkat tidak tersedia: ' + e.message, 'galat', 6000);
    });
    if (!apiSiap()) setTimeout(function () { toast('Admin: URL server belum diatur di js/config.js', 'galat', 6000); }, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai); else mulai();
})();
