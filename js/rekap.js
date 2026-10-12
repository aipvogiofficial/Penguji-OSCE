/*
 * Perhitungan rekap OSCE & ekspor Excel.
 * - Actual Mark (AM) station = Σ (skor butir × bobot butir)
 * - Nilai Batas Lulus (NBL) per station: Borderline Regression Method
 *     AM = a + b·GR  (GR: 1 Tidak Lulus, 2 Borderline, 3 Lulus, 4 Superior)
 *     NBL = a + 2b   (titik potong pada GR = 2 / borderline)
 * - Bila data tidak memadai (n < minimal, GR seragam, atau slope ≤ 0)
 *   dipakai Batas Cadangan = persentase × skor maksimal station.
 * - Lulus station bila AM ≥ NBL; LULUS akhir bila lulus SEMUA station aktif.
 */
(function (root) {
  var GR_LABEL = { 1: 'Tidak Lulus', 2: 'Borderline', 3: 'Lulus', 4: 'Superior' };

  function bulat(x, d) { var p = Math.pow(10, d || 2); return Math.round(x * p) / p; }

  function regresi(xs, ys) {
    var n = xs.length;
    if (n < 2) return null;
    var mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var sxx = 0, sxy = 0, syy = 0;
    for (i = 0; i < n; i++) {
      sxx += (xs[i] - mx) * (xs[i] - mx);
      sxy += (xs[i] - mx) * (ys[i] - my);
      syy += (ys[i] - my) * (ys[i] - my);
    }
    if (sxx === 0) return null;
    var b = sxy / sxx, a = my - b * mx;
    var r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
    return { a: a, b: b, r2: r2 };
  }

  /**
   * data: { periode, station[], rubrik[], peserta[], nilai[] }  (format dari aksi dataAdmin)
   * opsi: { minPeserta }
   */
  function hitung(data, opsi) {
    opsi = opsi || {};
    var minN = opsi.minPeserta || 10;
    var pct = (data.periode && data.periode.batasCadangan) || 60;
    var aktif = data.station.filter(function (s) { return !s.istirahat; });

    var hasilStation = aktif.map(function (st) {
      var butir = data.rubrik.filter(function (r) { return r.station === st.no; })
        .sort(function (a, b) { return a.butir - b.butir; });
      var maks = butir.reduce(function (t, r) { return t + 3 * r.bobot; }, 0);
      var nilai = data.nilai.filter(function (n) { return n.station === st.no; });
      var baris = {};
      var xs = [], ys = [];
      nilai.forEach(function (n) {
        var am = 0;
        butir.forEach(function (r, i) { am += (Number(n.skor[i]) || 0) * r.bobot; });
        baris[n.nim] = { am: am, gr: n.gr, skor: n.skor, penguji: n.penguji, waktu: n.waktuNilai || n.waktuTerima, catatan: n.catatan };
        xs.push(n.gr); ys.push(am);
      });

      var info = { n: xs.length, a: null, b: null, r2: null, metode: '', ket: '' };
      var nbl;
      var reg = regresi(xs, ys);
      var grUnik = xs.filter(function (v, i, arr) { return arr.indexOf(v) === i; }).length;
      if (xs.length >= minN && reg && reg.b > 0 && grUnik >= 2) {
        nbl = reg.a + 2 * reg.b;
        info.a = reg.a; info.b = reg.b; info.r2 = reg.r2; info.metode = 'Borderline Regression';
        if (nbl > maks) { nbl = maks; info.ket = 'NBL dibatasi pada skor maksimal.'; }
        if (nbl < 0) { nbl = 0; info.ket = 'NBL dibatasi pada 0.'; }
      } else {
        nbl = pct / 100 * maks;
        info.metode = 'Batas Cadangan ' + pct + '%';
        if (reg) { info.a = reg.a; info.b = reg.b; info.r2 = reg.r2; }
        if (xs.length < minN) info.ket = 'Jumlah peserta dinilai (' + xs.length + ') < ' + minN + '.';
        else if (grUnik < 2) info.ket = 'Global rating seragam, regresi tidak dapat dihitung.';
        else info.ket = 'Kemiringan regresi ≤ 0 (GR tidak sejalan dengan skor).';
      }
      nbl = bulat(nbl, 2);
      Object.keys(baris).forEach(function (nim) { baris[nim].lulus = baris[nim].am + 1e-9 >= nbl; });
      return { station: st, butir: butir, maks: maks, nbl: nbl, info: info, baris: baris };
    });

    var peserta = data.peserta.map(function (p) {
      var st = hasilStation.map(function (h) { return h.baris[p.nim] || null; });
      var lengkap = st.every(function (x) { return x; });
      var jmlLulus = st.filter(function (x) { return x && x.lulus; }).length;
      var status = !lengkap ? 'BELUM LENGKAP' : (jmlLulus === hasilStation.length ? 'LULUS' : 'TIDAK LULUS');
      var gagal = hasilStation.filter(function (h, i) { return st[i] && !st[i].lulus; }).map(function (h) { return h.station.no; });
      return { peserta: p, st: st, jmlLulus: jmlLulus, status: status, gagal: gagal };
    });

    var totalSel = data.peserta.length * hasilStation.length;
    var terisi = hasilStation.reduce(function (t, h) { return t + Object.keys(h.baris).length; }, 0);
    return { stations: hasilStation, peserta: peserta, progres: { terisi: terisi, total: totalSel } };
  }

  function namaSheet(s) { return s.replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31).trim(); }

  /** Buat workbook SheetJS. XLSX = library SheetJS. */
  function buatWorkbook(XLSX, data, hasil, opsi) {
    opsi = opsi || {};
    var wb = XLSX.utils.book_new();
    var per = data.periode;
    var prog = per.program === 'D3' ? 'Diploma III Gizi' : 'Sarjana Terapan Gizi';
    var lengkap = hasil.progres.terisi === hasil.progres.total;

    // --- Sheet REKAP
    var head1 = ['No', 'NIM', 'Nama'], head2 = ['', '', ''];
    hasil.stations.forEach(function (h) {
      head1.push('St ' + h.station.no + ' ' + h.station.kasus, '', '');
      head2.push('AM', 'GR', 'Ket');
    });
    head1.push('Station Lulus', 'Status Akhir', 'Station Tidak Lulus');
    head2.push('', '', '');
    var aoa = [
      ['REKAP HASIL UJI KOMPETENSI METODE OSCE — ' + prog.toUpperCase()],
      ['Periode: ' + per.nama + ' (' + per.kode + ')   Paket: ' + per.paket + '   Tanggal: ' + (per.tanggal || '-')],
      [lengkap ? 'Status data: LENGKAP' : 'Status data: BELUM LENGKAP (' + hasil.progres.terisi + '/' + hasil.progres.total + ' nilai) — NBL & kelulusan masih sementara'],
      [], head1, head2
    ];
    hasil.peserta.forEach(function (r, i) {
      var row = [i + 1, r.peserta.nim, r.peserta.nama];
      r.st.forEach(function (x) {
        if (x) row.push(x.am, x.gr, x.lulus ? 'L' : 'TL');
        else row.push('', '', '-');
      });
      row.push(r.jmlLulus + '/' + hasil.stations.length, r.status, r.gagal.join(', '));
      aoa.push(row);
    });
    aoa.push([]);
    aoa.push(['Keterangan: AM = Actual Mark (Σ skor × bobot); GR = Global Rating (1 Tidak Lulus, 2 Borderline, 3 Lulus, 4 Superior); L = Lulus station (AM ≥ NBL); TL = Tidak Lulus station.']);
    aoa.push(['Peserta dinyatakan LULUS bila lulus pada seluruh ' + hasil.stations.length + ' station aktif.']);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: head1.length - 1 } }];
    hasil.stations.forEach(function (h, i) { merges.push({ s: { r: 4, c: 3 + i * 3 }, e: { r: 4, c: 5 + i * 3 } }); });
    ws['!merges'] = merges;
    var cols = [{ wch: 4 }, { wch: 14 }, { wch: 28 }];
    hasil.stations.forEach(function () { cols.push({ wch: 6 }, { wch: 4 }, { wch: 5 }); });
    cols.push({ wch: 12 }, { wch: 15 }, { wch: 18 });
    ws['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap');

    // --- Sheet NBL
    var nb = [['NILAI BATAS LULUS (NBL) PER STATION'], [],
      ['Station', 'Judul', 'Kasus', 'Skor Maks', 'n Dinilai', 'a (intersep)', 'b (slope)', 'R²', 'NBL', 'NBL (%)', 'Metode', 'Jml Lulus', 'Jml Tidak Lulus', 'Keterangan']];
    hasil.stations.forEach(function (h) {
      var lulus = Object.keys(h.baris).filter(function (k) { return h.baris[k].lulus; }).length;
      nb.push([h.station.no, h.station.judul, h.station.kasus, h.maks, h.info.n,
        h.info.a === null ? '' : bulat(h.info.a, 4), h.info.b === null ? '' : bulat(h.info.b, 4),
        h.info.r2 === null ? '' : bulat(h.info.r2, 4), h.nbl, h.maks ? bulat(h.nbl / h.maks * 100, 2) : '',
        h.info.metode, lulus, h.info.n - lulus, h.info.ket]);
    });
    nb.push([]);
    nb.push(['Metode Borderline Regression: AM = a + b·GR; NBL = a + 2b (nilai AM pada GR = 2/borderline).']);
    nb.push(['Batas cadangan dipakai bila n < ' + (opsi.minPeserta || 10) + ', GR seragam, atau slope ≤ 0.']);
    var ws2 = XLSX.utils.aoa_to_sheet(nb);
    ws2['!cols'] = [{ wch: 8 }, { wch: 34 }, { wch: 30 }, { wch: 9 }, { wch: 9 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 26 }, { wch: 9 }, { wch: 13 }, { wch: 44 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'NBL');

    // --- Sheet detail per station
    hasil.stations.forEach(function (h) {
      var a = [['STATION ' + h.station.no + ' — ' + h.station.judul + ' (Kasus: ' + h.station.kasus + ')'],
        ['Skor maks: ' + h.maks + '   NBL: ' + h.nbl + '   Metode: ' + h.info.metode], []];
      var hd = ['No', 'NIM', 'Nama'];
      h.butir.forEach(function (b) { hd.push('B' + b.butir + ' (bobot ' + b.bobot + ')'); });
      hd.push('AM', 'AM (%)', 'GR', 'Kategori GR', 'Lulus Station', 'Penguji', 'Waktu Penilaian (jam setempat)', 'Catatan');
      a.push(hd);
      data.peserta.forEach(function (p, i) {
        var x = h.baris[p.nim];
        var row = [i + 1, p.nim, p.nama];
        if (x) {
          h.butir.forEach(function (b, j) { row.push(x.skor[j]); });
          row.push(x.am, h.maks ? bulat(x.am / h.maks * 100, 2) : '', x.gr, GR_LABEL[x.gr] || '', x.lulus ? 'Lulus' : 'Tidak Lulus', x.penguji || '', x.waktu || '', x.catatan || '');
        } else {
          h.butir.forEach(function () { row.push(''); });
          row.push('', '', '', '', 'Belum dinilai', '', '', '');
        }
        a.push(row);
      });
      a.push([]);
      a.push(['Butir penilaian:']);
      h.butir.forEach(function (b) { a.push(['B' + b.butir, b.kompetensi + ' (bobot ' + b.bobot + ')']); });
      var w = XLSX.utils.aoa_to_sheet(a);
      var c = [{ wch: 4 }, { wch: 14 }, { wch: 28 }];
      h.butir.forEach(function () { c.push({ wch: 11 }); });
      c.push({ wch: 6 }, { wch: 8 }, { wch: 4 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 26 }, { wch: 30 });
      w['!cols'] = c;
      XLSX.utils.book_append_sheet(wb, w, namaSheet('St' + h.station.no + ' ' + h.station.kasus));
    });

    // --- Info
    var info = [['INFORMASI'], ['Aplikasi', 'Penguji OSCE Vokasi Gizi'], ['Program', prog],
      ['Kode Periode', per.kode], ['Nama Periode', per.nama], ['Paket Rubrik', per.paket], ['Tanggal Ujian', per.tanggal || ''],
      ['Jumlah Peserta', data.peserta.length], ['Station Aktif', hasil.stations.length],
      ['Nilai Masuk', hasil.progres.terisi + ' / ' + hasil.progres.total],
      ['Diunduh', new Date().toLocaleString('id-ID') + ' (jam perangkat admin, UTC' + (function (m) { return (m >= 0 ? '+' : '-') + Math.abs(m / 60); })(-new Date().getTimezoneOffset()) + ')'],
      ['Zona waktu', 'Waktu penilaian dicatat sesuai jam perangkat penguji (WIB/WITA/WIT otomatis).'],
      ['Pengembang', 'Bidang IT AIPVOGI (Asosiasi Institusi Pendidikan Tinggi Vokasi Gizi Indonesia)'],
      ['Acuan', 'Pedoman Penyelenggaraan Uji Kompetensi Metode OSCE Vokasi Gizi (DPP PERSAGI, KIGI, AIPVOGI, 2023)']];
    var w3 = XLSX.utils.aoa_to_sheet(info);
    w3['!cols'] = [{ wch: 18 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, w3, 'Info');
    return wb;
  }

  var api = { hitung: hitung, buatWorkbook: buatWorkbook, regresi: regresi, GR_LABEL: GR_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rekap = api;
})(this);
