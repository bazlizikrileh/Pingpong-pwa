# Pingpong Portal (PWA)

Portal pertandingan pingpong umum: single, double atau regu; format kumpulan + kalah mati, kalah mati sahaja, atau round robin.

## Ciri (versi 2.0 — Fasa A)
Mengikut dokumen *Spesifikasi Portal Pingpong (KSAS & KSKPKPJB) untuk PWA*.
- Acara: perseorangan, regu pilihan, regu diundi, trio/kuartet diundi (1 perseorangan + 1 regu)
- Cabutan kumpulan agih seperti kad (A, B, C … kembali ke A); import kumpulan yang telah diundi
- Jadual round robin bernombor (G1, G2 …), meja asal kumpulan, simulasi sesi dua laluan dengan anggaran masa tamat
- Pemecah seri: mata → beza perlawanan → beza set → bersemuka (diulang bagi blok lebih kecil) → beza mata
- Kalah mati: cermin atau undian (BYE ke johan terbaik, rakan sekumpulan dijauhkan), tempat ketiga terbaik, pool kalah
- Ranking akhir: Tempat ikut pusingan, (a) Set ±/main, (b) Set menang/main, purata beza mata, naik bersemuka †
- Matriks keputusan, profil pemain, gambar kedudukan (Web Share), mesej LAPOR KEPUTUSAN WhatsApp, tampal laporan (admin), draf skor
- Video undian (pasangan/trio, kumpulan, kalah mati, pool), profil kelab (KSAS, KSKPKPJB, lain-lain)
- Gaya ala LekaPong (bahagian 10a spesifikasi)

## Firebase (Fasa B1)
- Data pertandingan dikongsi melalui Firestore (`tournaments/{id}`, medan `data` = JSON).
- Peranan: pemilik (akaun Google Ahmad), admin pertandingan, pengesah skor (`roles/{email}`), diurus di halaman **Pentadbir**.
- PIN acara (`pins/{id}`) untuk pengadil/peserta menghantar skor (`tournaments/{id}/submissions`) → disahkan penganjur.
- Peraturan keselamatan: `firestore.rules` (tampal dalam Firebase console → Firestore → Rules).
- SDK Firebase dibungkus dalam `vendor/firebase.js` (tiada CDN luar).

## Ujian
`node tests/nov6.mjs` — memainkan semula pertandingan sebenar 6 Nov 2026 (29 pemain, 66 perlawanan) dan membandingkan kedudukan kumpulan, jadual sesi/meja, BYE pool dan ranking akhir dengan laporan PDF portal Claude.

## Fail
| Fail | Fungsi |
|---|---|
| `index.html` | Rangka halaman |
| `app.js` | Paparan dan navigasi |
| `engine.js` | Logik pertandingan (cabutan, kedudukan, kalah mati) |
| `store.js` | Simpanan data (kini dalam peranti; akan ditukar ke Firebase) |
| `draw-anim.js` | Video undian |
| `tests/` | Ujian dengan data 6 Nov |
| `sw.js`, `manifest.webmanifest`, `icons/` | Fail PWA |
| `netlify.toml` | Tetapan hosting Netlify |

## Seterusnya
1. Fasa B — Firebase: data dikongsi, log masuk admin, PIN pengadil, tab Langsung, agihan meja dinamik, pengadil automatik, skor menunggu pengesahan
2. Fasa C — laporan PDF, kedudukan pasti (clinched)

## Kemas kini
Setiap kali fail app berubah, naikkan `VERSION` dalam `sw.js`.
