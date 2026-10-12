/*
 * KONFIGURASI APLIKASI
 * Ganti API_URL dengan URL Web App Google Apps Script hasil deployment
 * (berakhiran /exec). Lihat README bagian "Langkah 2".
 */
window.OSCE_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxDImlbU2wci02XXwOAyBV3NslMuKnhBdi0tXncQdfKxXiTqXISUzSFaMbG3jkWFvk1/exec',
  NAMA_APLIKASI: 'Penguji OSCE Vokasi Gizi',
  PENYELENGGARA: 'AIPVOGI',
  // Interval sinkron otomatis (milidetik)
  INTERVAL_SINKRON: 30000,
  // Minimal jumlah peserta di satu station agar Borderline Regression dipakai
  MIN_PESERTA_BRM: 10
};
