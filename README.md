# Bintang Frozen V27 — Rebuild

Aplikasi web operasional yang dibangun dari nol. Tidak memakai source code atau aset dari aplikasi/ZIP lama.

## Fitur
- Dashboard
- Master Data: Barang, Customer, Supplier, Supir, Satuan
- Barang Masuk: supplier, supir, ongkir, multi-item, tally/timbangan, foto nota, keterangan
- Barang Keluar: multi-customer, multi-item, qty pesanan, satuan, tally/timbangan, keterangan
- Stok otomatis dari transaksi + penyesuaian stok
- Catatan operasional
- Laporan periode + ekspor CSV
- Backup/restore JSON
- PWA/offline shell
- Hash routing agar refresh tidak membutuhkan rewrite route server
- Error fallback agar kesalahan halaman tidak berakhir sebagai layar putih tanpa informasi

## Menjalankan lokal
Gunakan web server statis. Contoh dengan Python:

```bash
python3 -m http.server 8080
```

Lalu buka `http://localhost:8080/#/dashboard`.

> Jangan membuka hanya lewat `file://` bila ingin service worker/PWA aktif.

## Deploy GitHub Pages
Upload isi folder ini ke repository, aktifkan GitHub Pages dari branch yang berisi `index.html`. Karena navigasi menggunakan hash (`#/dashboard`, `#/incoming`, dst.), refresh halaman tidak memerlukan konfigurasi rewrite khusus.

## Data
Data transaksi utama disimpan di IndexedDB browser dengan nama database `bintang_frozen_v27`. `localStorage` tidak dipakai untuk transaksi/stok.

Backup rutin melalui Pengaturan → Download Backup JSON sangat disarankan, khususnya sebelum membersihkan data browser atau pindah perangkat.

## Catatan keamanan data
- Master Data yang dipakai histori sebaiknya dinonaktifkan, bukan dihapus.
- Reset data memakai dua kali konfirmasi.
- Restore mengganti seluruh data aplikasi setelah konfirmasi.
- Foto nota dibatasi maksimal 2,5 MB per transaksi pada aplikasi ini.
