/*
 * Pembaca template soal OSCE (.docx) — dijalankan sepenuhnya di browser admin.
 * Yang diambil HANYA: nomor station + tabel RUBRIK PENILAIAN (kompetensi, skor 0–3, bobot).
 * Skenario, instruksi penguji/pemeran standar, dsb. tidak dibaca dan tidak dikirim ke mana pun.
 * Membutuhkan JSZip (vendor/jszip.min.js).
 */
(function (root) {
  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  function anak(el, nama) {
    var out = [];
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.localName === nama && n.namespaceURI === W) out.push(n);
    return out;
  }
  function satu(el, nama) { var a = anak(el, nama); return a[0] || null; }
  function attr(el, nama) { return el ? (el.getAttributeNS(W, nama) || el.getAttribute('w:' + nama)) : null; }
  function rapikan(s) { return String(s || '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim(); }

  function dicoret(run) {
    var rPr = satu(run, 'rPr'); if (!rPr) return false;
    var s = satu(rPr, 'strike') || satu(rPr, 'dstrike');
    if (!s) return false;
    var v = attr(s, 'val');
    return !(v === 'false' || v === '0' || v === 'off');
  }

  /** Teks satu paragraf. opsi.tanpaCoret = abaikan teks yang dicoret. */
  function teksParagraf(p, opsi) {
    var out = '';
    (function jalan(el) {
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1) continue;
        if (n.localName === 'r') {
          if (opsi && opsi.tanpaCoret && dicoret(n)) continue;
          for (var c = n.firstChild; c; c = c.nextSibling) {
            if (c.nodeType !== 1) continue;
            if (c.localName === 't') out += c.textContent;
            else if (c.localName === 'tab') out += ' ';
            else if (c.localName === 'br' || c.localName === 'cr') out += '\n';
          }
        } else if (n.localName === 'hyperlink' || n.localName === 'ins' || n.localName === 'smartTag' || n.localName === 'sdt' || n.localName === 'sdtContent' || n.localName === 'fldSimple') {
          jalan(n);
        }
      }
    })(p);
    var pPr = satu(p, 'pPr');
    if (pPr && satu(pPr, 'numPr') && out.trim()) out = '• ' + out;
    return out;
  }

  function teksSel(tc, opsi) {
    var bagian = [];
    (function kumpul(el) {
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1) continue;
        if (n.localName === 'p') bagian.push(teksParagraf(n, opsi));
        else if (n.localName === 'tbl' || n.localName === 'sdt' || n.localName === 'sdtContent' || n.localName === 'tr' || n.localName === 'tc') kumpul(n);
      }
    })(tc);
    return rapikan(bagian.join('\n'));
  }

  function warnaSel(tc) {
    var tcPr = satu(tc, 'tcPr'); var shd = tcPr && satu(tcPr, 'shd');
    var f = shd ? (attr(shd, 'fill') || '') : '';
    return f.toUpperCase();
  }
  function kuning(hex) {
    if (!/^[0-9A-F]{6}$/.test(hex)) return false;
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return r > 200 && g > 180 && b < 150;
  }

  /** Baris tabel → array sel (gridSpan diperluas, vMerge lanjutan = kosong). */
  function barisTabel(tbl) {
    return anak(tbl, 'tr').map(function (tr) {
      var sel = [], kuningAda = false;
      anak(tr, 'tc').forEach(function (tc) {
        var tcPr = satu(tc, 'tcPr');
        var span = tcPr && satu(tcPr, 'gridSpan') ? parseInt(attr(satu(tcPr, 'gridSpan'), 'val'), 10) || 1 : 1;
        var vm = tcPr && satu(tcPr, 'vMerge');
        var lanjutan = vm && attr(vm, 'val') !== 'restart';
        var t = lanjutan ? '' : teksSel(tc);
        if (kuning(warnaSel(tc))) kuningAda = true;
        sel.push({ teks: t, tc: tc });
        for (var i = 1; i < span; i++) sel.push({ teks: '', tc: tc });
      });
      return { sel: sel, kuning: kuningAda };
    });
  }

  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  function cariHeader(rows) {
    for (var i = 0; i < rows.length; i++) {
      var idx = { skor: [-1, -1, -1, -1], komp: -1, bobot: -1, no: -1 };
      rows[i].sel.forEach(function (c, j) {
        var t = norm(c.teks);
        var m = t.match(/^skor\s*=?\s*([0-3])\b/);
        if (m && idx.skor[+m[1]] < 0) idx.skor[+m[1]] = j;
        else if (/^bobot/.test(t) && idx.bobot < 0) idx.bobot = j;
        else if (/^kompetensi/.test(t) && idx.komp < 0) idx.komp = j;
        else if (/^no\b|^no\.?$/.test(t) && idx.no < 0) idx.no = j;
      });
      if (idx.skor.every(function (x) { return x >= 0; })) {
        if (idx.komp < 0) idx.komp = Math.max(0, idx.skor[0] - 1);
        return { baris: i, idx: idx };
      }
    }
    return null;
  }

  function nomorDariTeks(t, jmlMaks) {
    // "Stasion 1  (stasion 4 dan 8 = ...)" -> 1 ; tolak bila masih berderet "1 / 2 / 3"
    var bersih = t.replace(/\([^)]*\)/g, ' ');
    if (/\d\s*\/\s*\d/.test(bersih)) return null;
    var m = bersih.match(/sta[st]?[sx]?i?on\s*[–\-:.]?\s*(\d{1,2})/i) || bersih.match(/^\s*(\d{1,2})\b/);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return n >= 1 && n <= (jmlMaks || 9) ? n : null;
  }

  function deteksiStation(doc, body, namaFile) {
    // 1) Paragraf judul "Stasion – 1."
    var paras = anak(body, 'p');
    for (var i = 0; i < paras.length; i++) {
      var t = rapikan(teksParagraf(paras[i], { tanpaCoret: true }));
      var m = t.match(/^sta[st]?[sx]?i?on\s*[–\-]\s*(\d{1,2})\s*\.?$/i);
      if (m) return { no: +m[1], sumber: 'judul "' + t + '"' };
    }
    // 2) Baris "Nomor station" pada tabel soal (angka lain dicoret)
    var tbls = doc.getElementsByTagNameNS(W, 'tbl');
    for (var a = 0; a < tbls.length; a++) {
      var trs = anak(tbls[a], 'tr');
      for (var b = 0; b < trs.length; b++) {
        var tcs = anak(trs[b], 'tc');
        for (var c = 0; c < tcs.length - 1; c++) {
          if (/nomor\s*sta/i.test(teksSel(tcs[c]))) {
            var n = nomorDariTeks(teksSel(tcs[c + 1], { tanpaCoret: true }));
            if (n) return { no: n, sumber: 'baris "Nomor station" (angka lain dicoret)' };
          }
        }
      }
    }
    // 3) Judul rubrik "STATION 1 / 2 / 3 ..." dengan coretan
    for (var j = 0; j < paras.length; j++) {
      var tt = rapikan(teksParagraf(paras[j], { tanpaCoret: true }));
      if (/^station\s*\d/i.test(tt)) { var n2 = nomorDariTeks(tt); if (n2) return { no: n2, sumber: 'judul rubrik' }; }
    }
    // 4) Nama file: "St5", "Station_5", "Stasion-5"
    var mf = String(namaFile || '').match(/(?:^|[^a-z])(?:st|sta[st]?[sx]?i?on)[\s_\-.]*0?(\d)(?!\d)/i);
    if (mf) return { no: +mf[1], sumber: 'nama file' };
    return { no: null, sumber: '' };
  }

  /** Baca satu file docx → { nama, station, sumberStation, butir[], peringatan[] } */
  function bacaDocx(file) {
    return file.arrayBuffer().then(function (buf) { return JSZip.loadAsync(buf); }).then(function (zip) {
      var f = zip.file('word/document.xml');
      if (!f) throw new Error('Bukan file Word (.docx) yang valid.');
      return f.async('string');
    }).then(function (xml) {
      var doc = new DOMParser().parseFromString(xml, 'application/xml');
      var body = doc.getElementsByTagNameNS(W, 'body')[0];
      var hasil = { nama: file.name, station: null, sumberStation: '', butir: [], peringatan: [] };
      var st = deteksiStation(doc, body, file.name);
      hasil.station = st.no; hasil.sumberStation = st.sumber;

      // Cari tabel rubrik (berisi kolom "Skor = 0" s.d. "Skor = 3")
      var tbls = doc.getElementsByTagNameNS(W, 'tbl'), rows = null, hdr = null;
      for (var i = 0; i < tbls.length && !hdr; i++) {
        var r = barisTabel(tbls[i]); var h = cariHeader(r);
        if (h) { rows = r; hdr = h; }
      }
      if (!hdr) { hasil.peringatan.push('Tabel RUBRIK PENILAIAN (kolom "Skor = 0" s.d. "Skor = 3") tidak ditemukan.'); return hasil; }

      var idx = hdr.idx, induk = '';
      for (var k = hdr.baris + 1; k < rows.length; k++) {
        var s = rows[k].sel;
        var ambil = function (j) { return j >= 0 && s[j] ? s[j].teks : ''; };
        var skor = idx.skor.map(ambil);
        var komp = ambil(idx.komp), no = ambil(idx.no), bobotT = ambil(idx.bobot);
        if (cariHeader([rows[k]])) continue; // header berulang di halaman berikut
        if (skor.every(function (x) { return !x; })) {
          if (komp) induk = komp.replace(/[\s:]+$/, '');
          continue;
        }
        if (/^\d+\.\d+/.test(no.trim()) && induk) komp = induk + ': ' + komp;
        var mb = String(bobotT).match(/[1-3]/);
        hasil.butir.push({
          no: no.trim(), kompetensi: komp.replace(/\s*\n\s*/g, ' '),
          skor: skor, bobot: mb ? +mb[0] : null,
          alternatif: rows[k].kuning || /^\(?\s*atau\b/i.test(komp),
          pakai: !(rows[k].kuning || /^\(?\s*atau\b/i.test(komp))
        });
      }
      if (!hasil.butir.length) hasil.peringatan.push('Tabel rubrik ditemukan tetapi tidak ada butir yang berisi skor.');
      return hasil;
    });
  }

  var api = { bacaDocx: bacaDocx };
  root.ImporDocx = api;
})(this);
