# -*- coding: utf-8 -*-
"""Membangun Buku Manual Aplikasi Penguji OSCE Vokasi Gizi (PDF).
Jalankan: python3 docs/manual/build.py  -> docs/Manual-Aplikasi-Penguji-OSCE.pdf"""
import asyncio, json, os, re, io, html, subprocess
from playwright.async_api import async_playwright
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(D))
OUT = os.path.join(ROOT, 'docs', 'Manual-Aplikasi-Penguji-OSCE.pdf')
TMP = os.path.join(D, '_build'); os.makedirs(TMP, exist_ok=True)
VERSI = '1.2.0'

# ---------- tabel rubrik ----------
seed = json.load(open(os.path.join(ROOT, 'data', 'rubrik-standar.json'), encoding='utf-8'))
def tabel(paket):
    rows = []
    for st in [s for s in seed['station'] if s['paket'] == paket]:
        if st['istirahat'] == 'YA':
            rows.append(f"<tr><td>{st['no']}</td><td colspan='3'><i>Station istirahat</i></td></tr>"); continue
        bt = [r for r in seed['rubrik'] if r['paket'] == paket and r['station'] == st['no']]
        isi = '<br>'.join(f"{r['butir']}. {html.escape(r['kompetensi'])} <b>(bobot {r['bobot']})</b>" for r in bt)
        mx = sum(3 * r['bobot'] for r in bt)
        rows.append(f"<tr><td>{st['no']}</td><td>{html.escape(st['judul'])}<br><i>{html.escape(st['kasus'])}</i></td><td>{isi}</td><td style='text-align:center'>{mx}</td></tr>")
    return ("<table><thead><tr><th style='width:6%'>St</th><th style='width:26%'>Station / Kasus</th><th>Butir kompetensi</th><th style='width:9%'>Skor maks</th></tr></thead><tbody>"
            + ''.join(rows) + "</tbody></table>")

isi = open(os.path.join(D, 'isi.html'), encoding='utf-8').read()
isi = isi.replace('{{TABEL_RUBRIK_D3}}', tabel('D3-STANDAR')).replace('{{TABEL_RUBRIK_STR}}', tabel('STR-STANDAR'))
open(os.path.join(D, '_isi.html'), 'w', encoding='utf-8').write(isi)

# daftar judul untuk daftar isi
judul = []
for m in re.finditer(r'<h1 class="bab"><small>(.*?)</small>(.*?)</h1>|<h2>(.*?)</h2>', isi):
    if m.group(1): judul.append(('bab', m.group(1) + ' ' + m.group(2), m.group(2)))
    else: judul.append(('sub', m.group(3), m.group(3)))

COVER = f"""<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="gaya.css">
<style>@page {{ size: A4; margin: 0; }}</style></head><body>
<div class="cover"><div class="cincin"></div>
<div class="atas"><span class="g"></span>ASOSIASI INSTITUSI PENDIDIKAN TINGGI VOKASI GIZI INDONESIA</div>
<img class="logo" src="../../icons/logo-aipvogi.png">
<div class="judul"><span class="jenis">BUKU MANUAL</span>
<h1>Aplikasi Penguji <em>OSCE</em><br>Vokasi Gizi</h1>
<p>Panduan instalasi, pengelolaan data, dan penggunaan aplikasi input nilai Uji Kompetensi metode Objective Structured Clinical Examination untuk Diploma III Gizi dan Sarjana Terapan Gizi.</p>
<div class="pil"><span>Diploma III Gizi · 8 station</span><span>Sarjana Terapan Gizi · 9 station</span><span>Versi aplikasi {VERSI}</span></div></div>
<div class="bawah"><div><b>Bidang IT AIPVOGI</b>Asosiasi Institusi Pendidikan Tinggi Vokasi Gizi Indonesia</div>
<div class="kanan">Edisi Oktober 2026</div></div></div></body></html>"""

def front_html(nomor):
    rows = []
    for jenis, teks, kunci in judul:
        hal = nomor.get(kunci, '')
        rows.append(f"<tr class='{jenis}'><td class='isi'><span class='t'>{html.escape(teks)}</span></td><td class='hal'>{hal}</td></tr>")
    return f"""<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="gaya.css"></head><body>
<h2 class="halaman-judul">KATA PENGANTAR</h2>
<p>Puji syukur kami panjatkan ke hadirat Tuhan Yang Maha Esa atas rahmat dan karunia-Nya sehingga <b>Buku Manual Aplikasi Penguji OSCE Vokasi Gizi</b> ini dapat diselesaikan.</p>
<p>Uji Kompetensi dengan metode <i>Objective Structured Clinical Examination</i> (OSCE) merupakan bagian penting dalam menjamin mutu lulusan Program Pendidikan Vokasi Gizi sebagai calon nutrisionis. Surat Edaran Bersama DPP PERSAGI, KIGI, dan AIPVOGI tahun 2023 menghimbau perguruan tinggi pengelola Program Diploma III Gizi dan Sarjana Terapan Gizi untuk menyelenggarakan Uji Kompetensi metode OSCE secara mandiri institusional dengan mengacu pada <i>Pedoman Penyelenggaraan Uji Kompetensi dengan Metode OSCE Vokasi Gizi</i>.</p>
<p>Untuk mendukung penyelenggaraan tersebut, Bidang IT AIPVOGI mengembangkan Aplikasi Penguji OSCE Vokasi Gizi. Aplikasi ini memungkinkan penguji menginput nilai secara langsung di setiap station, tetap dapat digunakan ketika koneksi internet terbatas, serta menghasilkan rekapitulasi nilai, Nilai Batas Lulus dengan <i>Borderline Regression Method</i>, dan status kelulusan peserta dalam format Excel. Dengan demikian proses penilaian diharapkan menjadi lebih cepat, akurat, terdokumentasi dengan baik, dan seragam di seluruh institusi anggota.</p>
<p>Buku manual ini disusun sebagai panduan bagi admin dan penguji, mulai dari instalasi dan konfigurasi, pengelolaan data ujian di Google Sheets, penggunaan aplikasi pada hari pelaksanaan, hingga penjelasan cara penetapan kelulusan. Rubrik standar dalam aplikasi mengikuti Lampiran III pedoman dan dapat disesuaikan oleh setiap institusi sesuai kebijakan masing-masing.</p>
<p>Kami menyadari bahwa aplikasi dan buku manual ini masih dapat terus disempurnakan. Oleh karena itu, kritik dan saran dari institusi anggota AIPVOGI, para penguji, dan pengguna lainnya sangat kami harapkan untuk pengembangan versi berikutnya. Semoga buku manual ini bermanfaat dalam mendukung penyelenggaraan Uji Kompetensi Vokasi Gizi yang bermutu.</p>
<div class="ttd">Jakarta, Oktober 2026<br><br><b>Bidang IT</b><br>Asosiasi Institusi Pendidikan Tinggi<br>Vokasi Gizi Indonesia (AIPVOGI)</div>
<h2 class="halaman-judul" style="page-break-before:always">DAFTAR ISI</h2>
<table class="toc"><tbody>
<tr class="bab"><td class="isi"><span class="t">Kata Pengantar</span></td><td class="hal">i</td></tr>
<tr class="bab"><td class="isi"><span class="t">Daftar Isi</span></td><td class="hal">ii</td></tr>
{''.join(rows)}
</tbody></table></body></html>"""

async def render(page, nama, src, opsi=None):
    path = os.path.join(D, src)
    await page.goto('file://' + path); await page.wait_for_timeout(400)
    out = os.path.join(TMP, nama + '.pdf')
    await page.pdf(path=out, prefer_css_page_size=True, print_background=True, **(opsi or {}))
    return out

def cari_halaman(pdf):
    n = len(PdfReader(pdf).pages); teks = []
    for i in range(1, n + 1):
        t = subprocess.run(['pdftotext', '-f', str(i), '-l', str(i), '-layout', pdf, '-'], capture_output=True, text=True).stdout
        teks.append(re.sub(r'\s+', ' ', t))
    nomor, mulai = {}, 0
    for jenis, _, kunci in judul:
        k = re.sub(r'\s+', ' ', html.unescape(re.sub('<.*?>', '', kunci)))
        for i in range(mulai, n):
            if k in teks[i]:
                nomor[kunci] = i + 1; mulai = i; break
    return nomor, n

def romawi(n): return ['i','ii','iii','iv','v','vi','vii','viii'][n-1]

pdfmetrics.registerFont(TTFont('DV', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
def stempel(src, label_fn, kepala):
    r = PdfReader(src); w = PdfWriter()
    for i, pg in enumerate(r.pages):
        buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4); W, H = A4
        c.setFont('DV', 8); c.setFillColorRGB(.45, .5, .6)
        c.drawCentredString(W / 2, 11 * 2.835, label_fn(i + 1))
        if kepala:
            c.drawString(22 * 2.835, H - 12 * 2.835, 'Buku Manual Aplikasi Penguji OSCE Vokasi Gizi')
            c.drawRightString(W - 20 * 2.835, H - 12 * 2.835, 'AIPVOGI')
            c.setStrokeColorRGB(.85, .87, .92); c.setLineWidth(.5); c.line(22 * 2.835, H - 14 * 2.835, W - 20 * 2.835, H - 14 * 2.835)
        c.save(); buf.seek(0)
        pg.merge_page(PdfReader(buf).pages[0]); w.add_page(pg)
    out = src.replace('.pdf', '-n.pdf'); w.write(out); return out

async def main():
    open(os.path.join(D, '_cover.html'), 'w', encoding='utf-8').write(COVER)
    async with async_playwright() as p:
        br = await p.chromium.launch(); pg = await br.new_page()
        cover = await render(pg, 'cover', '_cover.html')
        isi_pdf = await render(pg, 'isi', '_isi.html')
        nomor, n = cari_halaman(isi_pdf)
        hilang = [k for _, _, k in judul if k not in nomor]
        if hilang: print('TIDAK DITEMUKAN:', hilang)
        open(os.path.join(D, '_front.html'), 'w', encoding='utf-8').write(front_html(nomor))
        front = await render(pg, 'front', '_front.html')
        await br.close()
    front_n = stempel(front, romawi, False)
    isi_n = stempel(isi_pdf, str, True)
    w = PdfWriter()
    for f in (cover, front_n, isi_n):
        for pgx in PdfReader(f).pages: w.add_page(pgx)
    w.add_metadata({'/Title': 'Buku Manual Aplikasi Penguji OSCE Vokasi Gizi', '/Author': 'Bidang IT AIPVOGI', '/Subject': 'Panduan aplikasi input nilai Uji Kompetensi metode OSCE Vokasi Gizi'})
    # bookmark
    off = 1 + len(PdfReader(front).pages)
    induk = None
    for jenis, teks, kunci in judul:
        if kunci not in nomor: continue
        if jenis == 'bab': induk = w.add_outline_item(re.sub('<.*?>', '', teks), off + nomor[kunci] - 1)
        else: w.add_outline_item(re.sub('<.*?>', '', teks), off + nomor[kunci] - 1, parent=induk)
    with open(OUT, 'wb') as f: w.write(f)
    print('OK', OUT, 'halaman isi', n, 'total', len(w.pages))

asyncio.run(main())
