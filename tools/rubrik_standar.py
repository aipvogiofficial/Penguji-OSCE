# -*- coding: utf-8 -*-
"""
Sumber data RUBRIK STANDAR sesuai Pedoman Penyelenggaraan Uji Kompetensi
Metode OSCE Vokasi Gizi (DPP PERSAGI - KIGI - AIPVOGI, Agustus 2023), Lampiran III.

Jalankan:  python3 tools/rubrik_standar.py
Menghasilkan data/rubrik-standar.json (dipakai tools/build_gs.py untuk Code.gs).

Catatan penyesuaian dari pedoman (keputusan pengguna):
- D3  : 8 station, istirahat di 4 & 8, 10 menit/station.
- S.Tr: 9 station, istirahat di 4 & 9, 12 menit/station.
  Urutan S.Tr: 1 Endokrin, 2 Perkemihan, 3 Pencernaan/Pernapasan, 4 ISTIRAHAT,
  5 Kardiovaskuler/Neuromuskuler, 6 Anak/Remaja, 7 Ibu, 8 Penyelenggaraan Makanan, 9 ISTIRAHAT.
- Station Penyelenggaraan Makanan S.Tr mengikuti contoh soal (Katering).
- Butir antropometri memakai versi utama (BB + TB + data objektif), bukan versi alternatif "hanya TB".
"""
import json, os

# ---------- Deskriptor yang dipakai berulang ----------
PERILAKU_LIST = ("1) Mengucapkan salam pembuka kepada pasien; 2) Bersikap ramah; "
                 "3) Mempertahankan kontak mata; 4) Menggunakan bahasa sederhana dan santun; "
                 "5) Melakukan tindakan konseling dengan tanggung jawab; 6) Mengucapkan salam penutup")

def perilaku(bobot=2):
    return dict(
        kompetensi="Mampu menunjukkan perilaku profesional",
        s0="Tidak memiliki perilaku profesional sama sekali",
        s1="Menunjukkan 1-2 perilaku profesional, meliputi: " + PERILAKU_LIST,
        s2="Menunjukkan 3-4 perilaku profesional, meliputi: " + PERILAKU_LIST,
        s3="Menunjukkan 5-6 perilaku profesional, meliputi: " + PERILAKU_LIST,
        bobot=bobot)

ASES3_LIST = "1) data subjektif riwayat diet; 2) data subjektif riwayat penyakit; 3) data obyektif biokimia"

def asesmen3(bobot=1):
    return dict(
        kompetensi="Mampu melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia",
        s0="Tidak melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia",
        s1="Melakukan asesmen gizi menggunakan 1 dari 3 data/informasi, yaitu: " + ASES3_LIST,
        s2="Melakukan asesmen gizi menggunakan 2 dari 3 data/informasi, yaitu: " + ASES3_LIST,
        s3="Melakukan asesmen gizi menggunakan 3 data/informasi, yaitu: " + ASES3_LIST,
        bobot=bobot)

ASES7_LIST = ("1) Menyatakan masalah gizi berdasarkan pemeriksaan biokimia terkait gizi; "
              "2) Menyatakan masalah gizi berdasarkan data pemeriksaan fisik terkait gizi; "
              "3) Menyatakan masalah gizi berdasarkan analisis konsumsi makanan; "
              "4) Menyatakan masalah gizi berdasarkan data riwayat pasien; "
              "5) Mengidentifikasi etiologi masalah gizi; "
              "6) Mengidentifikasi sign dan symptoms penunjuk spesifik masalah gizi; "
              "7) Menyatakan rumusan diagnosis gizi dengan format PES (problem-etiologi-sign/symptom)")

def asesmen6(bobot=1):
    return dict(
        kompetensi="Mampu melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia, serta menetapkan rumusan diagnosis gizi",
        s0="Tidak melakukan asesmen gizi data subjektif (riwayat diet, riwayat penyakit) dan data obyektif biokimia",
        s1="Melakukan asesmen gizi melalui 1-3 dari 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: " + ASES7_LIST,
        s2="Melakukan asesmen gizi melalui 4-5 dari 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: " + ASES7_LIST,
        s3="Melakukan asesmen gizi melalui 6 data/informasi dan menetapkan rumusan diagnosis gizi, yaitu: " + ASES7_LIST,
        bobot=bobot)

def antropometri(bobot=3):
    return dict(
        kompetensi="Mampu melakukan pengukuran antropometri (BB dan TB) dan pengumpulan data objektif (pemeriksaan fisik keadaan umum, pemeriksaan klinis: tekanan darah dan suhu tubuh)",
        s0="Tidak melakukan pengukuran antropometri (BB dan TB) dan tidak mengumpulkan data objektif (pemeriksaan fisik keadaan umum dan pemeriksaan klinis seperti tekanan darah dan suhu tubuh)",
        s1="Melakukan 1 pengukuran antropometri (BB atau TB) dengan benar sesuai SOP; DAN melakukan pengumpulan 1 dari 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
        s2="Melakukan 2 pengukuran antropometri (BB dan TB), salah satunya benar sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
        s3="Melakukan 2 pengukuran antropometri (BB dan TB) dengan benar keduanya sesuai SOP; DAN melakukan pengumpulan 2 data objektif: 1) pemeriksaan fisik keadaan umum pasien; 2) pemeriksaan klinis (tekanan darah, suhu tubuh)",
        bobot=bobot)

PES_LIST = "1) Menetapkan Problem gizi (P); 2) Menetapkan Etiologi dari problem gizi (E); 3) Menetapkan Simptom atau tanda gizi (S)"

def diagnosis(bobot=1, dasar=""):
    d = (" berdasarkan " + dasar) if dasar else ""
    return dict(
        kompetensi="Mampu menetapkan diagnosis gizi" + (" (berdasarkan " + dasar + ")" if dasar else ""),
        s0="Tidak menetapkan diagnosis gizi" + d,
        s1="Menetapkan diagnosis gizi" + d + " untuk 1 dari 3 aspek dengan benar: " + PES_LIST,
        s2="Menetapkan diagnosis gizi" + d + " untuk 2 dari 3 aspek dengan benar: " + PES_LIST,
        s3="Menetapkan diagnosis gizi" + d + " untuk 3 aspek dengan benar: " + PES_LIST,
        bobot=bobot)

INTV4_LIST = "1) Jenis diet; 2) Bentuk makanan; 3) Cara pemberian/rute makanan; 4) Prinsip diet"

def intervensi4(bobot=3):
    return dict(
        kompetensi="Mampu melakukan/menentukan intervensi pemberian makanan",
        s0="Tidak menentukan intervensi pemberian makanan yang tepat",
        s1="Menentukan intervensi pemberian makanan hanya 1 dari 4 aspek: " + INTV4_LIST,
        s2="Menentukan intervensi pemberian makanan hanya 2-3 dari 4 aspek: " + INTV4_LIST,
        s3="Menentukan intervensi pemberian makanan semua aspek (4 aspek): " + INTV4_LIST,
        bobot=bobot)

INTV6_LIST = ("1) Menyiapkan form dalam penyusunan menu sehari; "
              "2) Menggunakan TKPI atau sejenisnya untuk menentukan bahan makanan yang disarankan untuk dikonsumsi setiap hari; "
              "3) Memanfaatkan buku bahan penukar atau konversi ke URT untuk menerjemahkan jumlah bahan yang dikonsumsi; "
              "4) Menanyakan pantangan makanan yang harus dihindari maupun makanan yang disukai; "
              "5) Melakukan pembagian waktu makan dan makanan selingan dalam menu makan sehari; "
              "6) Mempertimbangkan bahan makanan yang disarankan dan yang harus dihindari sesuai prinsip diet yang diberikan")

def intervensi6(bobot=3):
    return dict(
        kompetensi="Mampu melakukan intervensi pemberian makanan (penyusunan menu sehari)",
        s0="Tidak dapat menentukan intervensi pemberian makanan yang tepat",
        s1="Melakukan intervensi pemberian makanan hanya 1-3 dari 6 aspek: " + INTV6_LIST,
        s2="Melakukan intervensi pemberian makanan hanya 4-5 dari 6 aspek: " + INTV6_LIST,
        s3="Melakukan intervensi pemberian makanan yang terdiri dari 6 aspek: " + INTV6_LIST,
        bobot=bobot)

def edukasi5(kasus, bobot=3):
    lst = ("1) Mempelajari masalah gizi pasien sesuai diagnosis gizi; "
           "2) Menjelaskan tujuan diet pasien menggunakan media leaflet " + kasus + "; "
           "3) Menjelaskan makanan yang boleh dikonsumsi menggunakan media food model; "
           "4) Menjelaskan makanan yang tidak boleh dikonsumsi menggunakan media food model; "
           "5) Melakukan evaluasi edukasi gizi dengan memberikan pertanyaan kepada pasien")
    return dict(
        kompetensi="Mampu melakukan edukasi gizi terkait kasus " + kasus,
        s0="Tidak melakukan edukasi gizi terkait kasus " + kasus,
        s1="Melakukan 1-2 dari 5 langkah edukasi gizi dengan tepat: " + lst,
        s2="Melakukan 3-4 dari 5 langkah edukasi gizi dengan tepat: " + lst,
        s3="Melakukan 5 langkah edukasi gizi dengan tepat: " + lst,
        bobot=bobot)

def edukasi6(kasus, bobot=3, sisa=False):
    if sisa:
        tambah = ", berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan"
        lst = ("1) Menyampaikan masalah gizi berdasarkan hasil penilaian intervensi pemberian makanan melalui penilaian sisa makanan; "
               "2) Menyampaikan masalah gizi berdasarkan asupan gizi dari makanan yang dikonsumsi; "
               "3) Mendiskusikan perubahan pola makan mengikuti hasil penilaian sisa makanan dan perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; "
               "4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien" + tambah + "; "
               "5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien" + tambah + "; "
               "6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan" + tambah)
    else:
        lst = ("1) Menyampaikan masalah gizi berdasarkan pemeriksaan fisik, klinik, dan biokimia; "
               "2) Menyampaikan masalah gizi berdasarkan asupan gizi; "
               "3) Mendiskusikan perubahan pola makan mengikuti perencanaan menu yang sudah disiapkan (makanan yang boleh dan tidak boleh) dengan alat bantu food model dan leaflet; "
               "4) Mendiskusikan hambatan dan alternatif perubahan pola makan yang dapat dilakukan pasien; "
               "5) Mendiskusikan pola perubahan perilaku berkaitan dengan pola aktivitas dan gaya hidup yang dapat dilakukan klien; "
               "6) Mengukur pengetahuan gizi pasien berkaitan dengan penyakit dan diet yang diberikan")
    return dict(
        kompetensi="Mampu melakukan edukasi gizi terkait kasus " + kasus + (" (berdasarkan hasil penilaian sisa makanan)" if sisa else ""),
        s0="Tidak melakukan edukasi gizi terkait kasus " + kasus,
        s1="Melakukan 1-2 dari 6 langkah edukasi gizi dengan tepat: " + lst,
        s2="Melakukan 3-4 dari 6 langkah edukasi gizi dengan tepat: " + lst,
        s3="Melakukan 6 langkah edukasi gizi dengan tepat: " + lst,
        bobot=bobot)

ADIME_LIST = ("1) Dokumentasi asesmen/pengkajian gizi; 2) Dokumentasi diagnosis gizi; "
              "3) Dokumentasi intervensi gizi dan intervensi edukasi gizi; "
              "4) Dokumentasi monitoring data ABCD (Antropometri, Biokimia, Clinik, Diet) sesuai data dominan kasus; "
              "5) Dokumentasi evaluasi asuhan gizi")

def dokumentasi(kasus, bobot=1):
    return dict(
        kompetensi="Mampu melakukan pendokumentasian asuhan gizi (ADIME) kasus " + kasus,
        s0="Tidak melakukan pendokumentasian asuhan gizi untuk kasus " + kasus,
        s1="Melakukan pendokumentasian asuhan gizi untuk 1-2 dari 5 aspek (ADIME): " + ADIME_LIST,
        s2="Melakukan pendokumentasian asuhan gizi untuk 3-4 dari 5 aspek (ADIME): " + ADIME_LIST,
        s3="Melakukan pendokumentasian asuhan gizi untuk 5 aspek (ADIME): " + ADIME_LIST,
        bobot=bobot)

def kolaborasi(bobot=1):
    return dict(
        kompetensi="Mampu melakukan kolaborasi interprofesional",
        s0="Tidak melakukan kolaborasi dengan profesi atau pihak lain dalam penanganan kasus, hanya bekerja sendiri",
        s1="1) Melakukan kolaborasi dengan profesi atau pihak lain dalam penanganan kasus; 2) Mendapat penolakan dari profesi/pihak lain, atau terdapat penilaian negatif dari profesi/pihak lain",
        s2="1) Melakukan kolaborasi dengan profesi atau pihak lain dalam penanganan kasus; 2) Diterima oleh pihak lain, tetapi ada komplain atau belum mendapatkan kesepakatan menjadi tim bersama penanganan kasus berikutnya (bersifat insidental)",
        s3="1) Melakukan kolaborasi dengan profesi atau pihak lain dalam penanganan kasus; 2) Tidak ada komplain dan dapat diterima dalam kesepakatan sebagai tim bersama penanganan kasus dengan profesi/pihak lain selanjutnya",
        bobot=bobot)

COMSTOCK_LIST = ("1) Menyiapkan formulir penilaian sisa makanan metode Comstock 6 poin; "
                 "2) Menyiapkan peralatan yang diperlukan (sendok, garpu, alat tulis); "
                 "3) Menilai standar porsi makanan sebagai gold standard dari contoh yang disajikan di plato-1; "
                 "4) Melakukan penilaian sisa makanan pasien untuk 1 kali makan yang disajikan di plato-2; "
                 "5) Menganalisis sisa makanan berdasarkan jenis makanan dan keseluruhan makanan untuk 1 kali makan")

def comstock(bobot=3):
    return dict(
        kompetensi="Mampu menentukan intervensi pemberian makanan melalui penilaian sisa makanan metode Comstock",
        s0="Tidak menentukan intervensi pemberian makanan melalui penilaian sisa makanan dengan metode Comstock 6 poin",
        s1="Melakukan penilaian sisa makanan metode Comstock dengan 1-2 dari 5 langkah yang tepat: " + COMSTOCK_LIST,
        s2="Melakukan penilaian sisa makanan metode Comstock dengan 3-4 dari 5 langkah yang tepat: " + COMSTOCK_LIST,
        s3="Melakukan penilaian sisa makanan metode Comstock dengan semua (5) langkah yang tepat: " + COMSTOCK_LIST,
        bobot=bobot)

# ---------- PM Katering (S.Tr) ----------
PM_KATERING = [
    dict(kompetensi="Pendokumentasian: Perencanaan kebutuhan bahan makanan",
         s0="Tidak melakukan perhitungan perencanaan kebutuhan bahan makanan",
         s1="Melakukan perhitungan perencanaan kebutuhan bahan makanan menggunakan: 1) jumlah konsumen; 2) standar porsi",
         s2="Melakukan perhitungan perencanaan kebutuhan bahan makanan menggunakan: 1) jumlah konsumen; 2) standar porsi; 3) frekuensi penggunaan bahan makanan dalam satu siklus menu",
         s3="Melakukan perhitungan perencanaan kebutuhan bahan makanan menggunakan: 1) jumlah konsumen; 2) standar porsi; 3) frekuensi penggunaan bahan makanan dalam satu siklus menu; 4) jumlah putaran siklus menu dalam satu bulan",
         bobot=2),
    dict(kompetensi="Pendokumentasian: Kegiatan sebagai penyelia terhadap kinerja petugas (penerimaan/persiapan/pengolahan/pemorsian/distribusi)",
         s0="Tidak melakukan kegiatan sebagai penyelia terhadap kinerja petugas bagian penerimaan/persiapan/pengolahan/pemorsian/distribusi",
         s1="Melakukan kegiatan sebagai penyelia tanpa menyiapkan/menggunakan instrumen penyelia atau SOP",
         s2="Melakukan kegiatan sebagai penyelia dengan menyiapkan/menggunakan instrumen penyelia atau SOP, tetapi instrumen/SOP belum terisi lengkap (hanya sebagian)",
         s3="Melakukan kegiatan sebagai penyelia dengan menyiapkan/menggunakan instrumen penyelia atau SOP, dan instrumen/SOP terisi lengkap",
         bobot=2),
    dict(kompetensi="Pendokumentasian: Uji mutu bahan makanan atau makanan secara fisik dan organoleptik",
         s0="Tidak melakukan uji mutu bahan makanan atau makanan secara fisik dan organoleptik",
         s1="Melakukan uji mutu: 1) tanpa menyiapkan/menggunakan instrumen atau SOP; 2) hanya salah satu uji mutu (fisik atau organoleptik) dengan benar",
         s2="Melakukan uji mutu: 1) tanpa menyiapkan/menggunakan instrumen atau SOP; 2) uji mutu secara fisik dan organoleptik dengan benar",
         s3="Melakukan uji mutu: 1) dengan menyiapkan/menggunakan instrumen atau SOP; 2) uji mutu secara fisik dan organoleptik dengan benar",
         bobot=3),
    dict(kompetensi="Pendokumentasian: Kesimpulan hasil praktik pengamatan dan praktik tindakan",
         s0="Tidak membuat kesimpulan hasil praktik pengamatan dan praktik tindakan",
         s1="Membuat kesimpulan hanya 1 dari 3 tindakan: 1) Perencanaan kebutuhan bahan makanan; 2) Penyelia kegiatan; 3) Uji mutu secara fisik dan organoleptik",
         s2="Membuat kesimpulan hanya 2 dari 3 tindakan: 1) Perencanaan kebutuhan bahan makanan; 2) Penyelia kegiatan; 3) Uji mutu secara fisik dan organoleptik",
         s3="Membuat kesimpulan untuk 3 tindakan: 1) Perencanaan kebutuhan bahan makanan; 2) Penyelia kegiatan; 3) Uji mutu secara fisik dan organoleptik",
         bobot=1),
    perilaku(2),
]

# ---------- Station ----------
D3 = dict(kode="D3-STANDAR", program="D3", waktu=10, stations=[
    dict(no=1, judul="Endokrin atau Sistem Perkemihan", kasus="DM Tipe 2",
         butir=[asesmen3(1), edukasi5("DM Tipe 2", 3), dokumentasi("DM Tipe 2", 1), perilaku(2)]),
    dict(no=2, judul="Sistem Pencernaan", kasus="Gastritis",
         butir=[intervensi4(3), edukasi5("Gastritis", 3), perilaku(2)]),
    dict(no=3, judul="Sistem Kardiovaskuler atau Neuromuskuler", kasus="Dislipidemia",
         butir=[antropometri(3), diagnosis(1), perilaku(2)]),
    dict(no=4, istirahat=True),
    dict(no=5, judul="Masalah Gizi pada Anak dan Remaja", kasus="Balita Stunting",
         butir=[antropometri(3), edukasi6("Balita Stunting", 3), perilaku(2)]),
    dict(no=6, judul="Masalah Gizi pada Ibu", kasus="Ibu Hamil KEK",
         butir=[asesmen6(1), antropometri(3), perilaku(2)]),
    dict(no=7, judul="Penyelenggaraan Makanan", kasus="Penyelenggaraan Makanan di Rumah Sakit",
         butir=[diagnosis(1, "perilaku makan dan asupan gizi"), comstock(3),
                edukasi6("Penyelenggaraan Makanan di RS", 3, sisa=True), perilaku(2)]),
    dict(no=8, istirahat=True),
])

STR = dict(kode="STR-STANDAR", program="STR", waktu=12, stations=[
    dict(no=1, judul="Endokrin", kasus="DM Tipe 2",
         butir=[antropometri(3), intervensi4(3), kolaborasi(1), perilaku(2)]),
    dict(no=2, judul="Sistem Perkemihan", kasus="Gagal Ginjal Kronik (GGK)",
         butir=[asesmen3(1), antropometri(3), diagnosis(1), perilaku(2)]),
    dict(no=3, judul="Sistem Pencernaan atau Pernapasan", kasus="Tipoid",
         butir=[antropometri(3), edukasi5("Tipoid", 3), dokumentasi("Tipoid", 1), perilaku(2)]),
    dict(no=4, istirahat=True),
    dict(no=5, judul="Sistem Kardiovaskuler atau Neuromuskuler", kasus="Pasca Stroke",
         butir=[diagnosis(1), intervensi4(3), dokumentasi("Pasca Stroke", 1), perilaku(2)]),
    dict(no=6, judul="Masalah Gizi pada Anak dan Remaja", kasus="Anemia Remaja",
         butir=[asesmen6(1), intervensi6(3), edukasi6("Anemia Remaja", 3), perilaku(2)]),
    dict(no=7, judul="Masalah Gizi pada Ibu", kasus="Ibu Hamil Hipertensi",
         butir=[asesmen6(1), antropometri(3), edukasi6("Ibu Hamil Hipertensi", 3), perilaku(2)]),
    dict(no=8, judul="Penyelenggaraan Makanan", kasus="Penyelenggaraan Makanan di Katering",
         butir=PM_KATERING),
    dict(no=9, istirahat=True),
])

def to_rows(paket):
    st_rows, rb_rows = [], []
    for s in paket["stations"]:
        ist = s.get("istirahat", False)
        st_rows.append(dict(paket=paket["kode"], program=paket["program"], no=s["no"],
                            judul="ISTIRAHAT" if ist else s["judul"],
                            kasus="" if ist else s["kasus"],
                            istirahat="YA" if ist else "TIDAK",
                            waktu=paket["waktu"]))
        if ist:
            continue
        for i, b in enumerate(s["butir"], 1):
            rb_rows.append(dict(paket=paket["kode"], station=s["no"], butir=i, **b))
    return st_rows, rb_rows

if __name__ == "__main__":
    out = dict(paket=[], station=[], rubrik=[])
    for p in (D3, STR):
        out["paket"].append(dict(kode=p["kode"], program=p["program"],
                                 keterangan="Rubrik standar Pedoman OSCE Vokasi Gizi 2023"))
        s, r = to_rows(p)
        out["station"] += s
        out["rubrik"] += r
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(os.path.join(root, "data"), exist_ok=True)
    with open(os.path.join(root, "data", "rubrik-standar.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    for p in (D3, STR):
        for s in p["stations"]:
            if s.get("istirahat"):
                print(p["kode"], s["no"], "ISTIRAHAT"); continue
            mx = sum(3 * b["bobot"] for b in s["butir"])
            print(p["kode"], s["no"], s["kasus"], "butir", len(s["butir"]), "maks", mx)
