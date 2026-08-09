# Bintang Frozen V26 Cloud

Dibangun ulang karena source V26 lama tidak tersedia.

Arsitektur: PWA/Web → REST API Node/Express → Supabase PostgreSQL/Auth.

## Jalankan lokal
1. Install Node.js 20+.
2. `npm install`
3. Copy `.env.example` menjadi `.env`.
4. Isi `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
5. `npm start`
6. Buka http://localhost:3000

Frontend perlu Supabase URL + anon key. Untuk uji cepat, setelah halaman terbuka jalankan di browser console:
localStorage.setItem('BF_SUPABASE_URL','https://PROJECT.supabase.co')
localStorage.setItem('BF_SUPABASE_ANON_KEY','ANON_KEY')
Lalu refresh.

## Deploy Render
Build: `npm install`
Start: `npm start`
Set environment variables dari `.env`.

JANGAN pernah menaruh SUPABASE_SERVICE_ROLE_KEY di frontend atau membagikannya.

## Sudah tersedia
- Supabase Auth login
- Role Owner/Admin/Staff/Marketing
- Dashboard
- Customer, Supplier, Produk
- Stok dari view current_stock
- Barang Masuk + Timbangan
- Barang Keluar + Timbangan
- Keuangan
- Komisi
- Audit Log
- Export laporan gabungan PDF

Tahap hardening berikutnya: RLS granular per role, form transaksi lengkap, export Excel/CSV, backup/restore, scanner barcode, dan integrasi timbangan USB/RS232/Bluetooth.
