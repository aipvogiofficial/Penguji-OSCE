# Penguji OSCE Vokasi Gizi

Aplikasi web (PWA) untuk **input nilai penguji Uji Kompetensi metode OSCE** program Diploma III Gizi dan Sarjana Terapan Gizi, dengan **Google Sheets sebagai database** dan **rekap Excel** otomatis. Mengacu pada *Pedoman Penyelenggaraan Uji Kompetensi dengan Metode OSCE Vokasi Gizi* (DPP PERSAGI · KIGI · AIPVOGI, 2023).

| | D3 Gizi | Sarjana Terapan Gizi |
|---|---|---|
| Station | 8 (6 aktif) | 9 (7 aktif) |
| Istirahat | Station 4 & 8 | Station 4 & 9 |
| Waktu/station | 10 menit | 12 menit |

**Fitur utama**
- Halaman cover, login dengan PIN (dibuat admin di Google Sheet).
- Penguji hanya melihat station & rubrik miliknya; skor 0–3 per butir × bobot dihitung otomatis, plus Global Rating (Tidak Lulus/Borderline/Lulus/Superior).
- Layar "Periksa kembali" sebelum disimpan; setelah disimpan nilai **dikunci** (koreksi hanya oleh admin).
- **Bisa offline**: nilai disimpan di perangkat (IndexedDB) lalu terkirim otomatis saat online; tidak ada nilai ganda.
- Pengaman data: penyimpanan permanen, logout dikunci selama ada nilai belum terkirim, file cadangan yang bisa diimpor admin.
- Admin: progres per station, matriks peserta, **Nilai Batas Lulus (Borderline Regression Method)**, hasil kelulusan (lulus bila lulus **semua** station), **unduh Excel rekap**.

---

## Struktur berkas

```
index.html, manifest.webmanifest, sw.js   → aplikasi PWA (di-host GitHub Pages)
css/  js/  icons/  vendor/                 → tampilan, logika, ikon, SheetJS
apps-script/Code.gs                        → backend Google Apps Script (tempel ke Sheet)
data/rubrik-standar.json                   → rubrik standar sesuai pedoman
tools/                                     → skrip pembuat rubrik, Code.gs, ikon
tests/                                     → uji otomatis (Node.js)
```

---

## Langkah 1 — Siapkan Google Sheet (database)

1. Login Google dengan akun **aipvogi.official@gmail.com**.
2. Buat Google Sheet baru, beri nama mis. **Database Penguji OSCE**.
3. Menu **Ekstensi → Apps Script**. Hapus isi `Code.gs`, lalu **tempel seluruh isi** `apps-script/Code.gs` dari repo ini. Simpan (ikon disket).
4. Di bagian atas editor, pilih fungsi **`setup`** → klik **Jalankan**. Izinkan akses (Tinjau izin → pilih akun → Lanjutan → Buka proyek → Izinkan).
5. Kembali ke Sheet. Sekarang ada tab: `PERIODE, PAKET, STATION, RUBRIK, PESERTA, PENGUJI, NILAI, LOG`, lengkap dengan rubrik standar `D3-STANDAR` dan `STR-STANDAR`.
6. PIN admin awal: **909090** → segera ganti di tab `PENGUJI`.
7. (Opsional, untuk uji coba) muat ulang Sheet, lalu menu **OSCE → Isi data contoh**.

## Langkah 2 — Pasang sebagai Web App (API)

1. Di editor Apps Script: **Terapkan → Deployment baru**.
2. Jenis: **Aplikasi web**.
   - Jalankan sebagai: **Saya (aipvogi.official@gmail.com)**
   - Yang memiliki akses: **Siapa saja**
3. Klik **Terapkan**, lalu salin **URL Web App** (berakhiran `/exec`).
4. Buka `js/config.js` di repo, ganti `TEMPEL_URL_WEB_APP_DI_SINI` dengan URL tadi.

> Bila nanti `Code.gs` diubah, gunakan **Terapkan → Kelola deployment → Edit (ikon pensil) → Versi: Versi baru → Terapkan** agar URL tetap sama.

## Langkah 3 — Unggah ke GitHub & aktifkan GitHub Pages

1. Buka https://github.com/aipvogiofficial/Penguji-OSCE → **Add file → Upload files** → unggah seluruh isi folder ini (termasuk subfolder) → **Commit changes**.
2. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → **Save**.
3. Setelah 1–2 menit aplikasi aktif di: **https://aipvogiofficial.github.io/Penguji-OSCE/**

> Repo GitHub Pages gratis bersifat publik. Itu aman: data peserta & nilai tidak ada di GitHub, hanya di Google Sheet (jangan bagikan Sheet ke publik). Setiap penyimpanan dicek PIN oleh Apps Script.

## Langkah 4 — Isi data ujian di Google Sheet

**PERIODE** — satu baris per periode ujian

| Kode Periode | Nama Periode | Program | Kode Paket | Tanggal | Status | Batas Cadangan (%) |
|---|---|---|---|---|---|---|
| D3-2026-01 | OSCE D3 Gizi Periode I 2026 | D3 | D3-STANDAR | 2026-11-20 | AKTIF | 60 |

- `Program`: `D3` atau `STR`. `Status`: `AKTIF` (penguji bisa login) atau `SELESAI`.
- `Batas Cadangan (%)`: dipakai hanya bila regresi tidak memadai (lihat bagian Penilaian).

**PESERTA** — `Kode Periode, No Urut, NIM, Nama, Sesi, Grup`. *No Urut* = urutan rotasi yang tampil di layar penguji.

**PENGUJI** — satu baris per penguji per station

| PIN | Nama | Asal Institusi | Jenis | Peran | Kode Periode | No Station | Aktif |
|---|---|---|---|---|---|---|---|
| 583921 | Dr. A, M.Gz | Poltekkes X | Internal | PENGUJI | D3-2026-01 | 1 | YA |
| 909090 | Administrator | | | ADMIN | | | YA |

- PIN harus unik, sebaiknya 6 digit acak dan **tidak diawali angka 0**.
- Penguji siaga dibuat dengan baris sendiri (PIN berbeda, `Jenis` = Siaga); aktifkan saat dibutuhkan.
- Station istirahat (D3: 4 & 8; S.Tr: 4 & 9) tidak diberi penguji.

## Langkah 5 — Pakai di hari ujian

**Penguji**
1. Buka alamat aplikasi di HP/tablet/laptop → pasang ke layar utama (tombol *Pasang aplikasi*, atau di iPhone: *Bagikan → Tambahkan ke Layar Utama*).
2. Login dengan PIN **saat masih ada internet** (mis. saat briefing H-1). Daftar peserta & rubrik tersimpan di perangkat.
3. Saat ujian: pilih peserta → isi skor tiap butir → pilih Global Performance → **Periksa & Simpan** → centang konfirmasi → **Simpan & Kunci**.
4. Status: *Belum terkirim* (oranye) = tersimpan di perangkat, *Terkirim ✓* (hijau) = sudah di Sheet.
5. Akhir sesi: pastikan "Semua nilai sudah terkirim", lalu menu ⋮ → **Unduh file cadangan nilai** (simpan/serahkan ke admin).

**Admin**
1. Login PIN admin → pilih periode → **Muat data**.
2. Pantau tab *Progres per station* dan *Matriks peserta*.
3. Setelah semua nilai masuk: tab *Batas lulus (NBL)* & *Hasil kelulusan* → **Unduh Excel Rekap**.
4. Bila ada perangkat penguji bermasalah: **Impor Cadangan** (file .json dari penguji). Nilai yang sudah ada tidak ditimpa.

**Koreksi nilai** — langsung edit kolom `B1..B8` atau `Global Rating` di tab `NILAI` Google Sheet (isi kolom *Keterangan* alasan koreksi). Rekap selalu dihitung ulang dari skor butir, jadi tidak ada total yang perlu diperbaiki manual.

---

## Penilaian & kelulusan

- **Actual Mark (AM)** station = Σ (skor butir 0–3 × bobot butir 1–3).
- **Nilai Batas Lulus (NBL)** per station dengan *Borderline Regression Method*: regresi linear `AM = a + b·GR` (GR 1–4), **NBL = a + 2b** (AM pada GR = 2 / borderline).
- Bila data tidak memadai — peserta dinilai < 10 (`MIN_PESERTA_BRM` di `js/config.js`), GR seragam, atau slope ≤ 0 — dipakai **Batas Cadangan** = persentase × skor maksimal station (kolom *Batas Cadangan (%)* di PERIODE).
- Lulus station bila AM ≥ NBL. **Peserta LULUS bila lulus di seluruh station aktif.** Selama nilai belum lengkap, NBL dan status masih sementara.

Isi Excel rekap: **Rekap** (peserta × station: AM, GR, L/TL, status akhir), **NBL** (a, b, R², NBL, metode), satu sheet **detail per station** (skor per butir, penguji, waktu, catatan), dan **Info**.

---

## Zona waktu (WIB / WITA / WIT)

Aplikasi bisa dipakai di seluruh Indonesia tanpa pengaturan tambahan:
- **Waktu Penilaian** dicatat dari jam perangkat penguji beserta zonanya, mis. `2026-11-20 09:15:02 WIT` (Papua), `… WITA` (Sulawesi), `… WIB` (Sumatera/Jawa). Zona terbaca otomatis dari pengaturan jam perangkat.
- **Waktu Diterima** adalah jam server saat nilai masuk ke Sheet, mengikuti zona waktu proyek Apps Script (Setelan Project → Zona waktu).
- Tampilan waktu di aplikasi (mis. "Data diambil") selalu dalam jam perangkat yang sedang dipakai.

Pastikan jam & zona waktu perangkat penguji diatur **otomatis** (Pengaturan → Tanggal & waktu → otomatis).

## Impor rubrik dari template soal (.docx)

Admin → panel **Paket rubrik** → **Impor Rubrik dari Template Soal (.docx)**. Pilih program, isi kode paket baru, lalu pilih semua file soal (satu file per station). Aplikasi hanya membaca **nomor station** dan **tabel Rubrik Penilaian** (kompetensi, skor 0–3, bobot); file dibaca di browser admin dan tidak diunggah ke mana pun. Periksa pratinjau, lengkapi yang bertanda merah, lalu **Simpan sebagai paket** — tab PAKET, STATION, RUBRIK terisi otomatis. Station tanpa file dapat memakai rubrik paket standar.

## Mengganti rubrik / kasus (paket ujian)

Rubrik tidak ada di kode, melainkan di Sheet, dikelompokkan dalam **paket**.

1. Di tab `PAKET` tambahkan baris baru, mis. `D3-2027-A | D3 | Kasus periode 2027 | TIDAK`.
2. Di tab `STATION`, salin 8 baris `D3-STANDAR` (atau 9 baris `STR-STANDAR`), ganti *Kode Paket* menjadi `D3-2027-A`, lalu ubah *Judul/Kasus* bila perlu. Station istirahat tetap `Istirahat = YA`.
3. Di tab `RUBRIK`, salin baris paket lama, ganti *Kode Paket*, lalu edit *Kompetensi*, *Skor 0–3*, *Bobot*. Satu station maksimal 8 butir; *No Butir* berurutan mulai 1.
4. Di tab `PERIODE`, isi *Kode Paket* periode baru dengan `D3-2027-A`.

Paket otomatis ditandai `Terkunci = YA` setelah ada nilai masuk — **jangan mengubah rubrik paket yang terkunci**; buat paket baru. Nilai periode lama tetap terbaca dengan rubriknya sendiri.

Rubrik standar dibuat dari Lampiran III pedoman, dengan penyesuaian:
- Station Penyelenggaraan Makanan S.Tr mengikuti contoh soal (Katering: perencanaan kebutuhan bahan makanan, penyelia, uji mutu, kesimpulan, perilaku profesional).
- Butir antropometri memakai versi utama (BB + TB + data objektif).
- Bobot butir Comstock station PM D3 tidak tercantum di pedoman; diisi **3** — silakan sesuaikan di tab `RUBRIK` bila perlu.

---

## Memperbarui aplikasi

Setelah mengubah berkas aplikasi di GitHub, naikkan versi pada baris `var VERSI = 'penguji-osce-v1.2.0'` di `sw.js` (mis. `v1.0.1`). Perangkat penguji akan menampilkan banner *Versi baru tersedia → Muat ulang*.

## Pengembangan & uji

```bash
python3 tools/rubrik_standar.py   # buat data/rubrik-standar.json
python3 tools/build_gs.py         # gabungkan tools/core.gs + rubrik → apps-script/Code.gs
node tests/uji-backend.js         # uji Code.gs (simulasi Google Sheets) + rekap + Excel
node tests/mock-server.js . 8787  # server uji lokal (API tiruan di /api)
```
Untuk uji lokal, set `API_URL: 'http://localhost:8787/api'` di `js/config.js` (jangan di-commit).
