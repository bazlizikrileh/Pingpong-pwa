# Carrom Portal (PWA)

Portal pertandingan carrom, dibina daripada Portal Pingpong (kod yang sama, disesuaikan untuk carrom).
Alamat: `https://bazlizikrileh.github.io/Pingpong-pwa/carrom/`

## Beza dengan Portal Pingpong
- Acara: perseorangan (single), regu pasangan pilihan, regu pasangan diundi. Trio/kuartet dan regu bertukar belum dibuka (kod masih ada untuk fasa akan datang).
- Set (game) hingga **sasaran mata** (lalai 25) atau **had board** (lalai 8). Tiada syarat beza 2 mata. Jika mata sama selepas had board, satu board tambahan dimainkan.
- Jaga skor: tekan pemenang board, kemudian pilih mata board (1–13).
- Handicap manual 0–10 (mata mula setiap set).
- Papan carrom: auto 1 papan bagi setiap 4 peserta (maks. 40); saiz kumpulan 3–6; sehingga 24 kumpulan.
- Ilustrasi poster, laporan dan video dilukis semula dengan papan, buah, ratu dan striker carrom (`carrom-art.js`).
- Muzik dan vendor dikongsi dengan Portal Pingpong (`../music/`, `../vendor/`).

## Data
- Firebase yang sama (projek `pingpong-portal`). Pertandingan carrom ditanda `sport: 'carrom'` dalam data; Portal Pingpong mengabaikannya dan Portal Carrom hanya memaparkannya. Peranan admin/pengesah dikongsi.
- Simpanan peranti berasingan (`carrom-pwa:v1`, `carrom:*`). Topik notifikasi kelab: `club:carrom-<kelab>`.

## Kemas kini
Setiap kali fail app berubah, naikkan `VERSION` dalam `carrom/sw.js`.
