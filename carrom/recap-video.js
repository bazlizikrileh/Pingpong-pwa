// Video ringkasan pertandingan (MP4 menegak 9:16) — gaya siaran sukan:
// pembukaan (papan carrom + striker meluncur) → angka → matriks kumpulan/liga → detik menarik → bracket kalah mati
// → bracket pool → podium (lampu sorot) → penutup. Dilukis pada kanvas, dikod oleh draw-video.js.
import { VID } from './draw-video.js';
import { coin, striker, boardPersp, boardTop } from './carrom-art.js';
const { W, H, rr, fitText, ease } = VID;

const cl = x => Math.max(0, Math.min(1, x));
const back = x => { x = cl(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };   // ease-out-back
const GOLD = '#ffc53d', HOT = '#ff5a36', WIN = '#35d07f', LOSS = '#ff6b6b', INK = '#0a0f1d', WHITE = '#fff';
const F = (w, s, it = false) => `${it ? 'italic ' : ''}${w} ${s}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

function wrap(c, s, maxW, size, weight = 900, maxLines = 2, it = false) {
  c.font = F(weight, size, it);
  const words = String(s || '').split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const tr = cur ? cur + ' ' + w : w; if (c.measureText(tr).width <= maxW || !cur) cur = tr; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const k = lines.slice(0, maxLines); c.font = F(weight, size, it); let last = lines.slice(maxLines - 1).join(' '); while (last.length > 1 && c.measureText(last + '…').width > maxW) last = last.slice(0, -1); k[maxLines - 1] = last + '…'; return k; }
  return lines;
}
// teks dipendekkan supaya muat (dengan fon tertentu)
function fit(c, s, maxW, size, weight = 800, it = false, min = 10) {
  s = String(s ?? '');
  for (let f = size; f >= min; f--) { c.font = F(weight, f, it); if (c.measureText(s).width <= maxW) return s; }
  let t = s; while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t + '…';
}
const hexA = (hex, a) => { const h = String(hex || '#1d3f8c').replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h.slice(0, 6), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

export function buildRecap(d) {
  const S = [];
  const ACC = d.c2 && /^#/.test(d.c2) ? d.c2 : '#1f6feb';
  S.push({ k: 'intro', dur: 5 });
  S.push({ k: 'stats', dur: 4.6, chap: 'DALAM ANGKA' });
  // matriks: 2 kumpulan sebaris jika kecil
  const G = d.groups || [];
  const big = G.some(g => g.rows.length > 6);
  const st = d.noAwards ? 0.3 : 0.22, hold = d.noAwards ? 3.4 : 2.2;   // tanpa detik menarik → matriks dipapar lebih lama
  for (let i = 0; i < G.length; i += big ? 1 : 2) S.push({ k: 'matrix', st, gs: G.slice(i, i + (big ? 1 : 2)), dur: 1.1 + Math.max(...G.slice(i, i + (big ? 1 : 2)).map(g => g.rows.length)) * st + hold, chap: i === 0 ? (d.isLiga ? 'KEPUTUSAN LIGA' : 'PERINGKAT KUMPULAN') : '' });
  if (d.table && d.table.rows.length) S.push({ k: 'table', dur: 1.4 + Math.min(d.table.rows.length, 10) * 0.28 + 2, chap: d.table.title });
  const aw = d.noAwards ? [] : (d.awards || []).slice(0, 3);
  const brk = (b, chap) => { if (!b || !b.rounds.length) return; const vis = b.rounds.slice(-4); S.push({ k: 'bracket', b, vis, dur: 1.1 + vis.length * 1.45 + 2, chap }); };
  brk(d.ko, 'KALAH MATI'); brk(d.pool, 'POOL KALAH');
  // detik menarik selepas liga / bracket, sebelum podium
  if (aw.length) S.push({ k: 'awards', dur: 0.9 + aw.length * 2.3, chap: 'DETIK MENARIK' });
  if (d.podium && d.podium.length) S.push({ k: 'podium', dur: 7, chap: 'PODIUM' });
  S.push({ k: 'end', dur: 4.6 });
  let acc = 0; S.forEach(x => { x.t0 = acc; acc += x.dur; });
  const dur = acc;

  // ---- bunyi ----
  const ev = [];
  S.forEach(x => {
    ev.push({ t: x.t0, kind: 'scene' });
    if (x.k === 'intro') [0.55, 1.1, 1.65, 2.2].forEach((t, i) => ev.push({ t: x.t0 + t, kind: 'tick', i }));
    if (x.k === 'stats') for (let i = 0; i < 4; i++) ev.push({ t: x.t0 + 0.9 + i * 0.4, kind: 'card', i: i * 2 });
    if (x.k === 'matrix') { const n = Math.max(...x.gs.map(g => g.rows.length)); for (let i = 0; i < n; i++) ev.push({ t: x.t0 + 0.9 + i * x.st, kind: 'tick', i }); }
    if (x.k === 'table') x.k && d.table.rows.slice(0, 10).forEach((_, i) => ev.push({ t: x.t0 + 1.1 + i * 0.28, kind: 'tick', i }));
    if (x.k === 'awards') aw.forEach((_, i) => ev.push({ t: x.t0 + 0.8 + i * 2.3, kind: 'card', i: 3 + i * 3 }));
    if (x.k === 'bracket') x.vis.forEach((_, i) => ev.push({ t: x.t0 + 1.1 + i * 1.45 + 0.7, kind: i === x.vis.length - 1 ? 'done' : 'card', i: 5 + i }));
    if (x.k === 'podium') [[1.0, 'card'], [2.4, 'card'], [3.9, 'boom']].forEach(([t, k], i) => ev.push({ t: x.t0 + t, kind: k, i: 8 + i }));
    if (x.k === 'end') ev.push({ t: x.t0 + 0.3, kind: 'end' });
  });

  const make = (logos, sc) => {
    const cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
    const c = cv.getContext('2d'), L = logos.filter(Boolean);
    const logosAt = (cx, y, h, a = 1) => {
      const tw = L.reduce((s, im) => s + h * im.width / im.height + 16, -16); let x = cx - tw / 2;
      c.save(); c.globalAlpha *= a; L.forEach(im => { const w = h * im.width / im.height; c.drawImage(im, x, y, w, h); x += w + 16; }); c.restore();
    };
    // ---- latar: gelap + cahaya warna kelab, garis laju, bijirin ringan ----
    const bg = (t, x) => {
      c.fillStyle = INK; c.fillRect(0, 0, W, H);
      const gx = W * (0.2 + 0.1 * Math.sin(t * 0.3)), gy = H * (0.18 + 0.05 * Math.cos(t * 0.4));
      let g = c.createRadialGradient(gx, gy, 10, gx, gy, H * 0.75); g.addColorStop(0, hexA(ACC, 0.55)); g.addColorStop(1, hexA(ACC, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H);
      g = c.createRadialGradient(W * 0.95, H * 0.92, 10, W * 0.95, H * 0.92, H * 0.55); g.addColorStop(0, 'rgba(255,90,54,.28)'); g.addColorStop(1, 'rgba(255,90,54,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // garis laju condong
      c.save(); c.globalAlpha = 0.06; c.strokeStyle = WHITE; c.lineWidth = 2;
      for (let i = 0; i < 14; i++) { const y = ((i * 97 + t * 260) % (H + 400)) - 200; c.beginPath(); c.moveTo(-50, y); c.lineTo(W + 50, y - 260); c.stroke(); }
      c.restore();
    };
    // ---- kepala gaya siaran (lower-third) & bar kemajuan ----
    const hud = (t, x) => {
      const p = ease(t / 0.5);
      if (x.hud && x.k !== 'intro' && x.k !== 'end') {
        const title = x.title || x.chapTitle;
        c.save(); c.globalAlpha = p;
        c.fillStyle = HOT; c.beginPath(); c.moveTo(34, 64); c.lineTo(46, 64); c.lineTo(40, 112); c.lineTo(28, 112); c.fill();
        c.fillStyle = WHITE; c.fillText(fit(c, x.hud, W - 230, 34, 900, true), 58, 100);
        c.fillStyle = 'rgba(255,255,255,.6)'; c.fillText(fit(c, d.title, W - 230, 18, 600), 58, 128);
        c.restore();
        if (L.length) logosAt(W - 80, 60, 64, 0.95 * p);
      }
      // bar kemajuan + tanda bab
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(40, H - 34, W - 80, 4);
      c.fillStyle = GOLD; c.fillRect(40, H - 34, (W - 80) * cl((x.t0 + t) / dur), 4);
      S.forEach(s => { if (s.chap) { c.fillStyle = s.t0 <= x.t0 + t ? GOLD : 'rgba(255,255,255,.35)'; c.fillRect(40 + (W - 80) * s.t0 / dur - 1, H - 40, 3, 16); } });
    };
    // ---- peralihan bab: jalur condong menyapu skrin dengan tajuk besar ----
    const chapter = (t, txt) => {
      if (!txt || t > 1.0) return;
      const p = t / 1.0, xo = (1 - ease(p * 1.6)) * W * 1.4 - ease(cl((p - 0.55) / 0.45)) * W * 1.6;
      c.save(); c.translate(xo, 0);
      c.fillStyle = HOT; c.beginPath(); c.moveTo(-40, H * 0.36); c.lineTo(W + 140, H * 0.30); c.lineTo(W + 140, H * 0.52); c.lineTo(-40, H * 0.58); c.fill();
      c.fillStyle = GOLD; c.beginPath(); c.moveTo(-40, H * 0.58); c.lineTo(W + 140, H * 0.52); c.lineTo(W + 140, H * 0.535); c.lineTo(-40, H * 0.595); c.fill();
      c.fillStyle = WHITE; c.textAlign = 'center';
      const ls = wrap(c, txt, W - 80, 62, 900, 2, true); ls.forEach((ln, i) => { c.font = F(900, 62, true); c.fillText(ln, W / 2, H * 0.455 + (i - (ls.length - 1) / 2) * 66); });
      c.restore(); c.textAlign = 'left';
    };
    // buah carrom (ganti bola pingpong)
    const ball = (x, y, r = 14, kind = 'queen') => coin(c, x, y, r, kind, { shadow: false });
    const confetti = (t, n = 80) => {
      const cols = [GOLD, HOT, WIN, '#60a5fa', '#f472b6', WHITE];
      for (let i = 0; i < n; i++) { const x = (i * 97.3) % W, y = ((i * 61) % 520) - 280 + t * (230 + (i % 5) * 55); if (y > H || y < -20) continue;
        c.save(); c.translate(x + Math.sin(t * 3 + i) * 14, y); c.rotate(t * 5 + i); c.fillStyle = cols[i % cols.length]; c.fillRect(-7, -3.5, 14, 7); c.restore(); }
    };
    const pill = (x, y, txt, size, fg, bgc) => { const al = c.textAlign; txt = fit(c, txt, W - 100, size, 800); const w = c.measureText(txt).width + size * 1.4; c.fillStyle = bgc; rr(c, x - w / 2, y - size * 1.05, w, size * 1.6, size * 0.8); c.fill(); c.fillStyle = fg; c.textAlign = 'center'; c.fillText(txt, x, y + size * 0.02); c.textAlign = al; };
    const medal = (x, y, r, n) => { const al = c.textAlign;
      const col = [GOLD, '#dfe6ee', '#e09a5b'][n - 1] || '#999';
      c.fillStyle = HOT; c.beginPath(); c.moveTo(x - r * 0.7, y - r * 2.2); c.lineTo(x - r * 0.15, y - r * 0.6); c.lineTo(x + r * 0.15, y - r * 0.6); c.lineTo(x - r * 0.25, y - r * 2.2); c.fill();
      c.fillStyle = ACC; c.beginPath(); c.moveTo(x + r * 0.7, y - r * 2.2); c.lineTo(x + r * 0.15, y - r * 0.6); c.lineTo(x - r * 0.15, y - r * 0.6); c.lineTo(x + r * 0.25, y - r * 2.2); c.fill();
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r); g.addColorStop(0, WHITE); g.addColorStop(0.35, col); g.addColorStop(1, col);
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r * 0.78, 0, 7); c.stroke();
      c.fillStyle = INK; c.textAlign = 'center'; c.font = F(900, r * 1.05); c.fillText(String(n), x, y + r * 0.36); c.textAlign = al;
    };

    const SC = {
      intro0(t) {
        // papan carrom perspektif; striker meluncur dari garisan asas ke ratu di tengah
        const ty = 640, tH = 470, topW = 430, botW = 700, p = ease(t / 0.9);
        const sp = cl((t - 0.5) / 1.6), hit = sp >= 1;
        c.save(); c.globalAlpha = p; c.translate(0, (1 - p) * 120);
        boardPersp(c, W / 2, ty, topW, botW, tH, { k: 1, striker: false });
        // kedudukan striker dalam koordinat perspektif (v = 0 atas, 1 bawah)
        const v = 0.85 - 0.33 * ease(sp), wv = topW + (botW - topW) * v, sx = W / 2 + Math.sin(sp * 3) * 18 * (1 - sp), sy = ty + v * tH, sr = wv * 0.045;
        if (t > 0.5) {
          for (let k = 6; k >= 1; k--) { c.fillStyle = `rgba(255,255,255,${0.05 * (7 - k)})`; c.beginPath(); c.ellipse(sx, sy + k * 14, sr * (1 - k * 0.08), sr * 0.7, 0, 0, 7); c.fill(); }
          c.save(); c.translate(sx, sy); c.scale(1, 0.72); striker(c, 0, 0, sr, '#2f5bb7'); c.restore();
        }
        if (hit) { const u = cl((t - 2.1) / 0.5); c.strokeStyle = `rgba(255,197,61,${1 - u})`; c.lineWidth = 6; c.beginPath(); c.ellipse(W / 2, ty + 0.5 * tH, 40 + u * 160, (40 + u * 160) * 0.7, 0, 0, 7); c.stroke(); }
        c.restore();
        // tajuk
        if (L.length) logosAt(W / 2, 92, 110, ease((t - 0.2) / 0.6));
        c.textAlign = 'center';
        c.globalAlpha = cl((t - 0.6) / 0.4); pill(W / 2, 262, 'RINGKASAN PERTANDINGAN', 22, INK, GOLD); c.globalAlpha = 1;
        const lines = wrap(c, d.title.toUpperCase(), W - 90, 64, 900, 3, true);
        lines.forEach((ln, i) => {
          const q = cl((t - 0.9 - i * 0.14) / 0.35); if (q <= 0) return;
          const s = 1.5 - 0.5 * back(q);
          c.save(); c.globalAlpha = q; c.translate(W / 2, 350 + i * 70); c.scale(s, s); c.font = F(900, 64, true);
          c.fillStyle = HOT; c.fillText(ln, 4, 4); c.fillStyle = WHITE; c.fillText(ln, 0, 0); c.restore();
        });
        const y = 350 + lines.length * 70 + 4;
        c.globalAlpha = cl((t - 1.6) / 0.4);
        if (d.when) pill(W / 2, y + 14, '📅 ' + d.when, 24, WHITE, 'rgba(255,255,255,.14)');
        c.fillStyle = 'rgba(255,255,255,.8)'; if (d.where) c.fillText(fit(c, '📍 ' + d.where, W - 120, 22, 600), W / 2, y + 66);
        c.globalAlpha = 1; c.textAlign = 'left';
      },
      stats0(t, x) {
        const items = d.stats;
        items.forEach((it, i) => {
          const q = ease((t - 0.85 - i * 0.4) / 0.5); if (q <= 0) return;
          const y = 250 + i * 225, xo = (1 - q) * -W;
          c.save(); c.translate(xo, 0);
          c.fillStyle = i % 2 ? hexA(ACC, 0.35) : 'rgba(255,255,255,.07)';
          c.beginPath(); c.moveTo(40, y); c.lineTo(W - 30, y - 18); c.lineTo(W - 30, y + 170); c.lineTo(40, y + 188); c.fill();
          c.fillStyle = HOT; c.fillRect(40, y, 10, 188);
          const n = Math.round(it.n * ease((t - 1.0 - i * 0.4) / 1.3));
          c.fillStyle = GOLD; c.fillText(fit(c, n.toLocaleString('ms-MY'), 420, 118, 900, true), 78, y + 128);
          c.fillStyle = WHITE; c.fillText(fit(c, it.label.toUpperCase(), 230, 26, 900, true), W - 270, y + 80);
          c.font = '54px system-ui'; c.fillText(it.ic, W - 270, y + 150);
          c.restore();
        });
      },
      matrix(t, x) {
        const gs = x.gs, two = gs.length > 1, areaH = two ? 450 : 930;
        gs.forEach((g, gi) => {
          const n = g.rows.length, y0 = 200 + gi * (areaH + 30), nameW = n > 8 ? 150 : 190, ptsW = 74;
          const cw = Math.min(78, (W - 70 - nameW - ptsW - 10) / n), rh = Math.min(two ? 62 : 74, (areaH - 70) / (n + 0.6));
          const tw = nameW + cw * n + ptsW, x0 = (W - tw) / 2, fs = Math.max(11, Math.min(20, cw * 0.3, rh * 0.32));
          const hq = ease((t - 0.8) / 0.4);
          c.globalAlpha = hq;
          c.fillStyle = GOLD; c.fillText(fit(c, g.name.toUpperCase(), W - 100, 30, 900, true), x0, y0 + 30);
          c.fillStyle = 'rgba(255,255,255,.55)';
          c.textAlign = 'center'; for (let j = 0; j < n; j++) c.fillText(fit(c, String(j + 1), cw, fs, 800), x0 + nameW + cw * j + cw / 2, y0 + 64);
          c.fillStyle = GOLD; c.fillText(fit(c, 'MATA', ptsW, fs, 900), x0 + nameW + cw * n + ptsW / 2, y0 + 64); c.textAlign = 'left';
          c.globalAlpha = 1;
          g.rows.forEach((r, i) => {
            const q = ease((t - 0.95 - i * x.st) / 0.35); if (q <= 0) return;
            const y = y0 + 76 + i * rh;
            c.save(); c.globalAlpha = q; c.translate((1 - q) * 60, 0);
            c.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.1)'; rr(c, x0, y, tw, rh - 5, 10); c.fill();
            if (r.q) { c.fillStyle = WIN; rr(c, x0, y, 6, rh - 5, 3); c.fill(); }
            c.fillStyle = r.q ? WHITE : 'rgba(255,255,255,.75)';
            c.fillText(fit(c, `${i + 1}. ${r.name}`, nameW - 16, Math.min(22, rh * 0.36), r.q ? 900 : 700), x0 + 14, y + rh / 2 + 5);
            for (let j = 0; j < n; j++) {
              const cell = g.cells[i][j], cx = x0 + nameW + cw * j, cq = cl((t - 1.05 - i * x.st - j * 0.04) / 0.2);
              if (cell === 'x') { c.fillStyle = 'rgba(255,255,255,.07)'; rr(c, cx + 3, y + 4, cw - 6, rh - 13, 6); c.fill(); continue; }
              if (!cell || cq <= 0) { c.fillStyle = 'rgba(255,255,255,.35)'; c.textAlign = 'center'; c.fillText('·', cx + cw / 2, y + rh / 2 + 5); c.textAlign = 'left'; continue; }
              c.save(); c.translate(cx + cw / 2, y + rh / 2 - 2); c.scale(back(cq), back(cq));
              c.fillStyle = cell.r === 'w' ? 'rgba(53,208,127,.9)' : cell.r === 'd' ? 'rgba(255,197,61,.85)' : 'rgba(255,107,107,.32)';
              rr(c, -(cw - 8) / 2, -(rh - 15) / 2, cw - 8, rh - 15, 7); c.fill();
              c.fillStyle = cell.r === 'w' ? INK : WHITE; c.textAlign = 'center'; c.fillText(fit(c, cell.s, cw - 10, fs, 900), 0, fs * 0.36); c.restore();
            }
            c.textAlign = 'center'; c.fillStyle = GOLD; c.fillText(fit(c, String(r.pts), ptsW - 8, Math.min(30, rh * 0.48), 900, true), x0 + nameW + cw * n + ptsW / 2, y + rh / 2 + 9); c.textAlign = 'left';
            c.restore();
          });
        });
        c.globalAlpha = cl((t - x.dur + 1.8) / 0.4); c.fillStyle = 'rgba(255,255,255,.7)'; c.textAlign = 'center';
        c.fillText(fit(c, 'Baca ikut baris · hijau = menang · ▌ layak', W - 100, 18, 600), W / 2, H - 60); c.textAlign = 'left'; c.globalAlpha = 1;
      },
      table(t) {
        const rows = d.table.rows.slice(0, 10), rh = Math.min(92, 900 / rows.length);
        rows.forEach((r, i) => {
          const q = back((t - 1.0 - i * 0.28) / 0.45); if (q <= 0) return;
          const y = 200 + i * rh;
          c.save(); c.globalAlpha = cl(q); c.translate((1 - cl(q)) * W, 0);
          c.fillStyle = i === 0 ? 'rgba(255,197,61,.25)' : 'rgba(255,255,255,.08)';
          c.beginPath(); c.moveTo(48, y); c.lineTo(W - 36, y - 8); c.lineTo(W - 36, y + rh - 18); c.lineTo(48, y + rh - 10); c.fill();
          if (i < 3) medal(92, y + rh / 2 - 6, Math.min(26, rh * 0.32), i + 1); else { c.fillStyle = 'rgba(255,255,255,.6)'; c.textAlign = 'center'; c.fillText(fit(c, String(i + 1), 50, 26, 900, true), 92, y + rh / 2 + 4); c.textAlign = 'left'; }
          c.fillStyle = WHITE; c.fillText(fit(c, r.name, W - 330, Math.min(30, rh * 0.36), 900, true), 140, y + rh / 2 - 4);
          c.fillStyle = 'rgba(255,255,255,.65)'; c.fillText(fit(c, r.sub || '', W - 330, Math.min(18, rh * 0.22), 600), 140, y + rh / 2 + 20);
          c.textAlign = 'right'; c.fillStyle = GOLD; c.fillText(fit(c, String(r.pts), 120, Math.min(44, rh * 0.5), 900, true), W - 62, y + rh / 2 + 8); c.textAlign = 'left';
          c.restore();
        });
      },
      awards(t) {
        const i = Math.min(aw.length - 1, Math.floor(Math.max(0, t - 0.7) / 2.3)), lt = t - 0.7 - i * 2.3, a = aw[i];
        if (!a || lt < 0) return;
        const q = ease(lt / 0.45), o = cl((lt - 1.95) / 0.35);
        c.save(); c.globalAlpha = 1 - o; c.translate((1 - q) * W * 0.8 - o * W * 0.8, 0);
        c.fillStyle = hexA(ACC, 0.4); c.beginPath(); c.moveTo(40, 330); c.lineTo(W - 40, 290); c.lineTo(W - 40, 920); c.lineTo(40, 960); c.fill();
        c.strokeStyle = GOLD; c.lineWidth = 4; c.stroke();
        c.textAlign = 'center'; c.font = '130px system-ui'; c.fillText(a.ic, W / 2, 500);
        pill(W / 2, 590, a.t.toUpperCase(), 24, INK, GOLD);
        const wl = wrap(c, a.w, W - 140, 50, 900, 2, true); wl.forEach((ln, k) => { c.font = F(900, 50, true); c.fillStyle = WHITE; c.fillText(ln, W / 2, 690 + k * 58); });
        const nl = wrap(c, a.n, W - 150, 24, 600, 3); nl.forEach((ln, k) => { c.font = F(600, 24); c.fillStyle = 'rgba(255,255,255,.8)'; c.fillText(ln, W / 2, 712 + wl.length * 58 + k * 32); });
        c.restore(); c.textAlign = 'left';
        aw.forEach((_, k) => { c.fillStyle = k === i ? GOLD : 'rgba(255,255,255,.3)'; rr(c, W / 2 + (k - (aw.length - 1) / 2) * 44 - 15, 1010, 30, 8, 4); c.fill(); });
      },
      bracket(t, x) {
        const V = x.vis, nR = V.length, top = 200, bot = H - 215, colW = (W - 50) / nR, m0 = V[0].ms.length, sp = (bot - top) / m0;
        const bh = Math.min(76, sp * 0.86), fs = Math.max(11, Math.min(19, bh * 0.27, colW * 0.11));
        const cy = (r, j) => top + sp * (2 ** r) * (j + 0.5);
        if (x.b.rounds.length > nR) { c.fillStyle = 'rgba(255,255,255,.5)'; c.fillText(fit(c, `+ ${x.b.rounds.length - nR} pusingan awal`, 300, 16, 600), 30, top - 14); }
        V.forEach((R, r) => {
          const rt = t - 1.1 - r * 1.45, q = ease(rt / 0.5); if (q <= 0) return;
          const bx = 25 + r * colW, bw = colW - 18, last = r === nR - 1;
          c.globalAlpha = q; c.fillStyle = last ? GOLD : 'rgba(255,255,255,.75)';
          c.fillText(fit(c, R.name.toUpperCase(), bw, Math.min(17, fs), 900, true), bx, top - 32 + (r % 2 ? 0 : 0));
          c.globalAlpha = 1;
          R.ms.forEach((m, j) => {
            const y = cy(r, j) - bh / 2, wq = cl((rt - 0.6) / 0.35), mq = ease((rt - j * 0.04) / 0.4);
            if (mq <= 0) return;
            c.save(); c.globalAlpha = mq; c.translate((1 - mq) * -30, 0);
            c.fillStyle = last ? 'rgba(255,197,61,.22)' : 'rgba(255,255,255,.09)'; rr(c, bx, y, bw, bh, 9); c.fill();
            if (last && wq > 0) { c.strokeStyle = GOLD; c.lineWidth = 3; c.stroke(); }
            const line = (nm, sc, isW, yy) => {
              const dim = wq > 0 && m.w && !isW;
              c.fillStyle = isW && wq > 0 ? (last ? GOLD : WIN) : dim ? 'rgba(255,255,255,.4)' : WHITE;
              c.fillText(fit(c, nm || '—', bw - (sc !== '' ? 40 : 14), fs, isW && wq > 0 ? 900 : 700), bx + 9, yy);
              if (sc !== '' && wq > 0) { c.textAlign = 'right'; c.fillText(fit(c, String(sc), 34, fs, 900), bx + bw - 8, yy); c.textAlign = 'left'; }
            };
            line(m.a, m.sa ?? '', m.w === 'a', y + bh * 0.42); line(m.b, m.sb ?? '', m.w === 'b', y + bh * 0.84);
            c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(bx + 6, y + bh / 2 - 0.5, bw - 12, 1);
            c.restore();
            // penyambung ke pusingan seterusnya
            if (r < nR - 1 && wq > 0) {
              const x1 = bx + bw, x2 = bx + colW, ym = cy(r, j), yn = cy(r + 1, j >> 1), k = wq;
              c.strokeStyle = m.w ? hexA(GOLD, 0.8) : 'rgba(255,255,255,.3)'; c.lineWidth = 2.5; c.beginPath();
              c.moveTo(x1, ym); c.lineTo(x1 + (x2 - x1) / 2 * Math.min(1, k * 2), ym);
              if (k > 0.5) { const kk = (k - 0.5) * 2; c.lineTo((x1 + x2) / 2, ym + (yn - ym) * kk); if (kk >= 1) c.lineTo(x2, yn); }
              c.stroke();
            }
          });
        });
        // juara bracket
        const F0 = V[nR - 1].ms[0], ft = t - 1.1 - (nR - 1) * 1.45 - 0.9;
        if (F0 && F0.w && ft > 0) {
          const nm = F0.w === 'a' ? F0.a : F0.b, q = back(ft / 0.5);
          c.save(); c.translate(W / 2, H - 150); c.scale(cl(q) * q, cl(q) * q);
          c.fillStyle = 'rgba(10,15,29,.88)'; rr(c, -W / 2 + 40, -52, W - 80, 92, 46); c.fill(); c.strokeStyle = GOLD; c.lineWidth = 3; c.stroke();
          c.textAlign = 'center'; c.fillStyle = GOLD; c.fillText(fit(c, `🏆 ${x.k === 'bracket' && x.chap === 'POOL KALAH' ? 'JUARA POOL' : 'JOHAN'}: ${nm}`, W - 140, 32, 900, true), 0, 6);
          c.restore(); c.textAlign = 'left';
          if (x.chap !== 'POOL KALAH') confetti(ft, 50);
        }
      },
      podium(t) {
        const P = d.podium, at = p => P.find(z => z.place === p), base = H - 120;
        // lampu sorot
        [[120, -0.25], [W - 120, 0.25], [W / 2, 0]].forEach(([sx, a0], i) => {
          const sw = Math.sin(t * 1.3 + i) * 0.18 * (1 - cl((t - 3.9) / 0.6)) + a0 * (1 - cl((t - 3.9) / 0.6)), tx = W / 2 + Math.tan(sw) * 900;
          const g = c.createLinearGradient(sx, 0, tx, base - 300); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g; c.beginPath(); c.moveTo(sx - 12, 0); c.lineTo(sx + 12, 0); c.lineTo(tx + 170, base - 260); c.lineTo(tx - 170, base - 260); c.fill();
        });
        const cols = [{ p: 2, x: 60, w: 200, h: 270, rv: 2.4 }, { p: 1, x: 260, w: 200, h: 380, rv: 3.9 }, { p: 3, x: 460, w: 200, h: 190, rv: 1.0 }];
        cols.forEach(k => {
          const e = at(k.p); if (!e) return;
          const q = back((t - k.rv) / 0.6); if (q <= 0) return;
          const h = k.h * Math.min(1, q);
          const g = c.createLinearGradient(k.x, base - h, k.x + k.w, base);
          g.addColorStop(0, k.p === 1 ? GOLD : k.p === 2 ? '#e8edf3' : '#e8a066'); g.addColorStop(1, k.p === 1 ? '#b8860b' : k.p === 2 ? '#8b97a6' : '#8a4b1f');
          c.fillStyle = g; c.beginPath(); c.moveTo(k.x, base - h + 16); c.lineTo(k.x + k.w, base - h); c.lineTo(k.x + k.w, base); c.lineTo(k.x, base); c.fill();
          c.fillStyle = 'rgba(0,0,0,.35)'; c.textAlign = 'center'; c.font = F(900, 110, true); c.fillText(String(k.p), k.x + k.w / 2, base - h + 130);
          const nq = cl((t - k.rv - 0.35) / 0.4);
          if (nq > 0) {
            c.save(); c.globalAlpha = nq; c.translate(0, (1 - nq) * 30);
            medal(k.x + k.w / 2, base - h - 70, k.p === 1 ? 40 : 32, k.p);
            const names = e.names.slice(0, 2), sz = k.p === 1 ? 26 : 21; let yy = base - h - 130 - (k.p === 1 ? 16 : 0);
            [...names].reverse().forEach(nm => { const ls = wrap(c, nm, k.w + 20, sz, 900, 2, true); for (let m = ls.length - 1; m >= 0; m--) { c.font = F(900, sz, true); c.fillStyle = WHITE; c.fillText(ls[m], k.x + k.w / 2, yy); yy -= sz + 6; } yy -= 6; });
            c.restore();
          }
          c.textAlign = 'left';
        });
        const one = at(1);
        if (one && t > 4.3) {
          confetti(t - 4.3, 100);
          const q = back((t - 4.3) / 0.5);
          c.save(); c.translate(W / 2, 250); c.scale(Math.min(1.2, q), Math.min(1.2, q)); c.textAlign = 'center';
          c.fillStyle = HOT; c.font = F(900, 74, true); c.fillText('JOHAN', 5, 5); c.fillStyle = GOLD; c.fillText('JOHAN', 0, 0);
          c.fillStyle = WHITE; c.fillText(fit(c, one.names.join(' & '), W - 100, 40, 900, true), 0, 60);
          c.restore(); c.textAlign = 'left';
        }
      },
      end(t) {
        const words = ['TAHNIAH', 'SEMUA!'];
        c.textAlign = 'center';
        words.forEach((w, i) => {
          const q = cl((t - 0.2 - i * 0.25) / 0.35); if (q <= 0) return;
          const s = 1.6 - 0.6 * back(q);
          c.save(); c.globalAlpha = q; c.translate(W / 2, 480 + i * 110); c.scale(s, s); c.font = F(900, 104, true);
          c.fillStyle = HOT; c.fillText(w, 6, 6); c.fillStyle = i ? WHITE : GOLD; c.fillText(w, 0, 0); c.restore();
        });
        c.globalAlpha = cl((t - 0.9) / 0.4);
        wrap(c, 'Terima kasih kepada semua peserta, pengadil & AJK', W - 140, 30, 700, 3).forEach((ln, i) => { c.font = F(700, 30); c.fillStyle = WHITE; c.fillText(ln, W / 2, 720 + i * 42); });
        c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText(fit(c, d.title, W - 120, 22, 600), W / 2, 850);
        pill(W / 2, 930, '📄 Keputusan penuh di Carrom Portal', 22, INK, GOLD);
        c.globalAlpha = 1;
        if (L.length) logosAt(W / 2, 200, 120, cl(t / 0.6));
        // buah carrom meluncur di bawah
        ['white', 'black', 'queen'].forEach((k, i) => { const bxp = (t * 260 + i * 70) % (W + 120) - 60; ball(bxp, 1130, 18, k); });
        confetti(t, 60);
        c.textAlign = 'left';
      },
    };
    Object.assign(SC, OPEN(c, d, { L, logosAt, ball, pill, wrap, fit, confetti, medal, ACC, rr }));
    const TPL = Math.max(0, Math.min(9, d.style | 0));
    SC.intro = TPL ? (t, x) => SC['i' + TPL](t, x) : SC.intro0;
    SC.stats = TPL ? (t, x) => SC['s' + TPL](t, x) : SC.stats0;
    S.forEach(s => { s.hud = s.chap || (s.k === 'matrix' ? (d.isLiga ? 'KEPUTUSAN LIGA' : 'PERINGKAT KUMPULAN') : ''); });
    const draw = tt => {
      c.setTransform(sc, 0, 0, sc, 0, 0);
      const x = S.find(s => tt < s.t0 + s.dur) || S[S.length - 1], lt = tt - x.t0;
      bg(tt, x);
      // kandungan bermula selepas jalur bab lalu
      SC[x.k](x.chap ? Math.max(0, lt - 0.0) : lt, x);
      hud(lt, x);
      chapter(lt, x.chap);
      if (lt < 0.18 && x.t0 > 0) { c.fillStyle = `rgba(255,255,255,${0.5 * (1 - lt / 0.18)})`; c.fillRect(0, 0, W, H); }   // kilatan peralihan
    };
    return { cv, draw };
  };
  return { dur, events: ev, make, scenes: S };
}

// ---------- 10 templat pembukaan & angka (0 = Papan, lalai di atas; 1–9 di bawah) ----------
export const OPEN_NAMES = ['Papan Carrom', 'Papan Skor', 'Striker', 'Neon', 'Tiket', 'Poster', 'Papan Atas', 'Kiraan Detik', 'Hujan Buah', 'Emas'];
function OPEN(c, d, h) {
  const { logosAt, ball, pill, wrap, fit, confetti, ACC, rr, L } = h;
  const T = d.title, U = s => String(s || '').toUpperCase(), ST = d.stats || [];
  const num = (it, t, k, dly = 0) => Math.round(it.n * ease((t - dly) / k));
  const center = () => { c.textAlign = 'center'; };
  const left = () => { c.textAlign = 'left'; };
  const titleLines = (size, maxW = W - 100, it = true) => wrap(c, U(T), maxW, size, 900, 3, it);
  const info = (y, a = 1, col = 'rgba(255,255,255,.85)') => { c.save(); c.globalAlpha *= a; center(); if (d.when) pill(W / 2, y, '📅 ' + d.when, 24, WHITE, 'rgba(255,255,255,.14)'); c.fillStyle = col; if (d.where) c.fillText(fit(c, '📍 ' + d.where, W - 120, 22, 600), W / 2, y + 52); c.restore(); left(); };
  const glow = (col, b) => { c.shadowColor = col; c.shadowBlur = b; };
  const noGlow = () => { c.shadowBlur = 0; };
  const digits = (n, t, settle, seed) => String(n).split('').map((ch, i) => (t < settle + i * 0.08 && /\d/.test(ch) ? String(Math.floor(Math.abs(Math.sin((t * 37 + i * 11 + seed) * 3.1)) * 10)) : ch)).join('');
  return {
    // 1 · Papan skor LED: huruf disusun macam papan skor, angka "flap"
    i1(t) {
      const x0 = 50, y0 = 250, w = W - 100, hh = 640, p = ease(t / 0.6);
      c.save(); c.globalAlpha = p;
      c.fillStyle = '#0d0d0f'; rr(c, x0, y0, w, hh, 26); c.fill(); c.strokeStyle = '#3a3a40'; c.lineWidth = 10; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.04)'; for (let yy = y0 + 20; yy < y0 + hh - 10; yy += 12) for (let xx = x0 + 20; xx < x0 + w - 10; xx += 12) c.fillRect(xx, yy, 3, 3);
      center(); glow('#ffb300', 18); c.fillStyle = '#ffb300'; c.font = '900 28px ui-monospace, Menlo, monospace'; c.fillText('★ RINGKASAN PERTANDINGAN ★', W / 2, y0 + 70);
      const ls = wrap(c, U(T), w - 60, 52, 900, 4); const shown = Math.floor(cl((t - 0.6) / 1.6) * U(T).length); let k = 0;
      ls.forEach((ln, i) => { let s = ''; for (const ch of ln) { s += k < shown ? ch : k < shown + 3 && ch !== ' ' ? String.fromCharCode(65 + Math.floor(Math.random() * 26)) : ' '; k++; } k++;
        c.font = '900 52px ui-monospace, Menlo, monospace'; glow('#ff3d00', 22); c.fillStyle = '#ff6a2a'; c.fillText(s, W / 2, y0 + 170 + i * 66); });
      glow('#00e676', 16); c.fillStyle = '#5cff9d'; c.font = '800 30px ui-monospace, Menlo, monospace'; c.globalAlpha = p * cl((t - 2.4) / 0.4);
      if (d.when) c.fillText(fit(c, U(d.when), w - 60, 30, 800), W / 2, y0 + hh - 100);
      c.fillStyle = '#9fd8ff'; glow('#40c4ff', 12); if (d.where) c.fillText(fit(c, U(d.where), w - 60, 20, 700), W / 2, y0 + hh - 50);
      noGlow(); c.restore(); left();
      if (L.length) logosAt(W / 2, 110, 110, ease(t / 0.6));
    },
    s1(t) {
      ST.forEach((it, i) => {
        const y = 260 + i * 220, q = ease((t - 0.85 - i * 0.35) / 0.4); if (q <= 0) return;
        c.save(); c.globalAlpha = q;
        c.fillStyle = '#0d0d0f'; rr(c, 40, y, W - 80, 180, 18); c.fill(); c.strokeStyle = '#3a3a40'; c.lineWidth = 6; c.stroke();
        c.fillStyle = '#ffb300'; c.font = '900 24px ui-monospace, Menlo, monospace'; c.fillText(fit(c, U(it.label), 260, 24, 900), 70, y + 52);
        c.font = '48px system-ui'; c.fillText(it.ic, 70, y + 140);
        const s = digits(num(it, t, 1.4, 1.0 + i * 0.35), t, 1.2 + i * 0.35 + 1.0, i), dw = 62, x1 = W - 70 - s.length * (dw + 6);
        s.split('').forEach((ch, j) => { const xx = x1 + j * (dw + 6);
          c.fillStyle = '#26262b'; rr(c, xx, y + 30, dw, 120, 8); c.fill(); c.fillStyle = '#000'; c.fillRect(xx, y + 89, dw, 3);
          glow('#ffffff', 6); c.fillStyle = '#f5f5f5'; c.textAlign = 'center'; c.font = '900 80px ui-monospace, Menlo, monospace'; c.fillText(ch, xx + dw / 2, y + 120); noGlow(); });
        left(); c.restore();
      });
    },
    // 2 · Striker: dua striker meluncur masuk dan berlaga, ratu melonjak
    i2(t) {
      const p = back(t / 0.9);
      striker(c, W / 2 - 160 + (1 - cl(p)) * -560, 720, 150, '#d32f2f');
      striker(c, W / 2 + 160 + (1 - cl(p)) * 560, 720, 150, '#212121');
      const bq = cl((t - 0.9) / 1.2); if (bq > 0) ball(W / 2, 560 - Math.sin(bq * Math.PI) * 180, 34, 'queen');
      if (L.length) logosAt(W / 2, 100, 110, ease(t / 0.6));
      center(); c.globalAlpha = cl((t - 0.5) / 0.4); pill(W / 2, 262, 'RINGKASAN PERTANDINGAN', 22, INK, GOLD); c.globalAlpha = 1;
      titleLines(58).forEach((ln, i) => { const q = cl((t - 1.0 - i * 0.15) / 0.3); c.globalAlpha = q; c.font = F(900, 58, true); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillText(ln, W / 2 + 4, 352 + i * 66); c.fillStyle = WHITE; c.fillText(ln, W / 2, 348 + i * 66); });
      c.globalAlpha = 1; left(); info(1010, cl((t - 1.8) / 0.4));
    },
    s2(t) {
      ST.forEach((it, i) => {
        const cx = i % 2 ? W * 0.73 : W * 0.27, cy = 400 + Math.floor(i / 2) * 420, q = back((t - 0.85 - i * 0.3) / 0.6); if (q <= 0) return;
        c.save(); c.translate(cx, cy); c.rotate((i % 2 ? 0.12 : -0.12) * (1 - cl(q))); c.scale(q, q);
        coin(c, 0, 0, 140, i % 2 ? 'black' : 'queen');
        c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(0, 0, 112, 0, 7); c.fill();
        center(); c.fillStyle = WHITE; c.fillText(fit(c, num(it, t, 1.2, 1 + i * 0.3).toLocaleString('ms-MY'), 220, 72, 900, true), 0, 22);
        c.font = '40px system-ui'; c.fillText(it.ic, 0, -60);
        c.fillStyle = GOLD; c.fillText(fit(c, U(it.label), 240, 22, 900), 0, 268); c.restore(); left();
      });
    },
    // 3 · Neon: tiub neon berkelip menyala
    i3(t) {
      const fl = k => (t < 0.4 + k * 0.3 ? (Math.sin(t * 90 + k) > 0.3 ? 0.25 : 0.05) : 1);
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, W, H);
      center();
      c.globalAlpha = fl(0); glow('#00e5ff', 24); c.strokeStyle = '#00e5ff'; c.lineWidth = 6; rr(c, 50, 230, W - 100, 640, 40); c.stroke();
      c.globalAlpha = fl(1); glow('#ff2fd1', 20); c.fillStyle = '#ff7be6'; c.fillText(fit(c, 'RINGKASAN PERTANDINGAN', W - 160, 28, 900), W / 2, 310);
      c.globalAlpha = fl(2); glow('#ffea00', 28); c.fillStyle = '#fff7a6';
      titleLines(56, W - 160, false).forEach((ln, i) => { c.font = F(900, 56); c.fillText(ln, W / 2, 420 + i * 70); });
      c.globalAlpha = fl(3); glow('#00e5ff', 18); c.fillStyle = '#b8f7ff';
      if (d.when) c.fillText(fit(c, d.when, W - 160, 30, 800), W / 2, 760); if (d.where) c.fillText(fit(c, d.where, W - 160, 20, 600), W / 2, 810);
      noGlow(); c.globalAlpha = 1; left();
      if (L.length) logosAt(W / 2, 90, 110, fl(1));
    },
    s3(t) {
      const cols = ['#00e5ff', '#ff2fd1', '#ffea00', '#76ff03'];
      ST.forEach((it, i) => {
        const y = 250 + i * 225, on = t > 0.9 + i * 0.35, fl = t < 1.15 + i * 0.35 ? (Math.sin(t * 80 + i) > 0 ? 0.3 : 0.1) : 1; if (!on) return;
        c.save(); c.globalAlpha = fl; glow(cols[i], 22); c.strokeStyle = cols[i]; c.lineWidth = 5; rr(c, 50, y, W - 100, 185, 30); c.stroke();
        c.fillStyle = cols[i]; c.fillText(fit(c, num(it, t, 1.2, 1 + i * 0.35).toLocaleString('ms-MY'), 380, 100, 900), 90, y + 128);
        c.textAlign = 'right'; c.fillStyle = WHITE; c.fillText(fit(c, U(it.label), 220, 24, 800), W - 90, y + 85); c.font = '46px system-ui'; c.fillText(it.ic, W - 90, y + 148);
        noGlow(); c.restore(); left();
      });
    },
    // 4 · Tiket: tiket acara dengan cop "TAMAT"
    i4(t) {
      const q = back((t - 0.2) / 0.8), y0 = 230 + (1 - cl(q)) * 900, x0 = 60, w = W - 120, hh = 760;
      c.save(); c.fillStyle = '#fff6e5'; rr(c, x0, y0, w, hh, 26); c.fill();
      c.fillStyle = INK; c.beginPath(); c.arc(x0, y0 + 560, 26, 0, 7); c.arc(x0 + w, y0 + 560, 26, 0, 7); c.fill();
      c.strokeStyle = '#c9b48a'; c.setLineDash([12, 10]); c.lineWidth = 3; c.beginPath(); c.moveTo(x0 + 34, y0 + 560); c.lineTo(x0 + w - 34, y0 + 560); c.stroke(); c.setLineDash([]);
      c.fillStyle = HOT; rr(c, x0, y0, w, 90, 26); c.fill(); c.fillRect(x0, y0 + 50, w, 40);
      center(); c.fillStyle = WHITE; c.fillText(fit(c, '🎟️ TIKET · RINGKASAN PERTANDINGAN', w - 40, 26, 900), W / 2, y0 + 58);
      c.fillStyle = INK; wrap(c, U(T), w - 70, 50, 900, 3, true).forEach((ln, i) => { c.font = F(900, 50, true); c.fillText(ln, W / 2, y0 + 180 + i * 60); });
      c.fillStyle = '#6b5a3a'; if (d.when) c.fillText(fit(c, '📅 ' + d.when, w - 60, 26, 800), W / 2, y0 + 410); if (d.where) c.fillText(fit(c, '📍 ' + d.where, w - 60, 20, 600), W / 2, y0 + 460);
      for (let i = 0; i < 46; i++) { const bw = (i * 7) % 3 + 2; c.fillStyle = INK; c.fillRect(x0 + 90 + i * 10.5, y0 + 610, bw, 100); }
      c.restore(); left();
      const sq = back((t - 2.4) / 0.4);
      if (sq > 0) { c.save(); c.translate(W - 190, y0 + 330); c.rotate(-0.3); c.scale(2.2 - 1.2 * Math.min(1, sq), 2.2 - 1.2 * Math.min(1, sq)); c.globalAlpha = cl(sq) * 0.85;
        c.strokeStyle = '#d32f2f'; c.lineWidth = 7; rr(c, -110, -48, 220, 96, 14); c.stroke(); center(); c.fillStyle = '#d32f2f'; c.font = F(900, 52); c.fillText('TAMAT', 0, 18); c.restore(); left(); }
      if (L.length) logosAt(W / 2, 80, 110, ease(t / 0.5));
    },
    s4(t) {
      const x0 = 80, w = W - 160, q = ease((t - 0.8) / 1.0), hh = 120 + ST.length * 150, y0 = 230;
      c.save(); c.beginPath(); c.rect(0, y0, W, hh * q + 30); c.clip();
      c.fillStyle = '#fbfbf7'; c.fillRect(x0, y0, w, hh);
      c.fillStyle = '#fbfbf7'; c.beginPath(); for (let i = 0; i <= 20; i++) c.lineTo(x0 + i * w / 20, y0 + hh + (i % 2 ? 18 : 0)); c.lineTo(x0 + w, y0 + hh); c.fill();
      c.fillStyle = INK; center(); c.font = '900 30px ui-monospace, Menlo, monospace'; c.fillText('*** RESIT KEPUTUSAN ***', W / 2, y0 + 64); left();
      ST.forEach((it, i) => { const y = y0 + 150 + i * 150;
        c.fillStyle = '#555'; c.font = '700 24px ui-monospace, Menlo, monospace'; c.fillText(`${it.ic} ${U(it.label)}`, x0 + 30, y);
        c.fillStyle = '#bbb'; c.fillText('.'.repeat(40), x0 + 30, y + 44);
        c.textAlign = 'right'; c.fillStyle = INK; c.font = '900 64px ui-monospace, Menlo, monospace'; c.fillText(num(it, t, 1.2, 1.1 + i * 0.3).toLocaleString('ms-MY'), x0 + w - 30, y + 60); left();
        c.strokeStyle = '#ddd'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(x0 + 20, y + 92); c.lineTo(x0 + w - 20, y + 92); c.stroke(); c.setLineDash([]); });
      c.restore();
    },
    // 5 · Poster: belah pepenjuru, perkataan tajuk besar bersilih ganti
    i5(t) {
      const p = ease(t / 0.7);
      c.fillStyle = ACC; c.beginPath(); c.moveTo(0, 0); c.lineTo(W * p, 0); c.lineTo(W * p - 300, H); c.lineTo(0, H); c.fill();
      c.fillStyle = HOT; c.beginPath(); c.moveTo(W, H * 0.62); c.lineTo(W, H); c.lineTo(W - W * 0.9 * p, H); c.fill();
      const words = U(T).split(/\s+/).slice(0, 6), cols = [WHITE, GOLD, WHITE, INK, GOLD, WHITE];
      words.forEach((w, i) => { const q = back((t - 0.5 - i * 0.18) / 0.4); if (q <= 0) return; const fromL = i % 2 === 0;
        c.save(); c.translate(fromL ? 50 - (1 - Math.min(1, q)) * 600 : W - 50 + (1 - Math.min(1, q)) * 600, 300 + i * 100); c.textAlign = fromL ? 'left' : 'right';
        c.fillStyle = cols[i % cols.length]; c.fillText(fit(c, w, W - 100, 96, 900, true), 0, 0); c.restore(); });
      const y = Math.min(1000, 300 + words.length * 100 + 10);
      c.globalAlpha = cl((t - 1.9) / 0.4); c.fillStyle = INK; c.fillRect(0, y, W, 110);
      c.fillStyle = GOLD; center(); if (d.when) c.fillText(fit(c, U(d.when), W - 80, 32, 900, true), W / 2, y + 50); c.fillStyle = WHITE; if (d.where) c.fillText(fit(c, d.where, W - 80, 20, 600), W / 2, y + 88);
      c.globalAlpha = 1; left();
      if (L.length) logosAt(W / 2, 110, 100, p);
    },
    s5(t) {
      ST.forEach((it, i) => {
        const y = 230 + i * 235, q = ease((t - 0.85 - i * 0.35) / 0.45); if (q <= 0) return; const r = i % 2;
        c.save(); c.translate((r ? 1 : -1) * (1 - q) * W, 0);
        c.fillStyle = [ACC, HOT, GOLD, WHITE][i]; c.fillRect(r ? W * 0.35 : 0, y, W * 0.65, 200);
        c.textAlign = r ? 'right' : 'left'; const fg = i >= 2 ? INK : WHITE;
        c.fillStyle = fg; c.fillText(fit(c, num(it, t, 1.2, 1 + i * 0.35).toLocaleString('ms-MY'), W * 0.6, 130, 900, true), r ? W - 40 : 40, y + 140);
        c.fillStyle = fg; c.fillText(fit(c, `${it.ic} ${U(it.label)}`, W * 0.6, 24, 900), r ? W - 40 : 40, y + 184);
        c.restore(); left();
      });
    },
    // 6 · Papan carrom dari atas, zum keluar ke tajuk
    i6(t) {
      const z = 3 - 2 * ease(t / 1.4), cx = W / 2, cy = 640;
      c.save(); c.translate(cx, cy); c.scale(z, z); c.rotate((1 - ease(t / 1.4)) * 0.5);
      boardTop(c, 0, 0, 640, { k: 1 });
      c.restore();
      const r = 210 + Math.sin(t * 3) * 6; c.fillStyle = 'rgba(10,15,29,.9)'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
      c.strokeStyle = GOLD; c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ease((t - 0.6) / 1.2)); c.stroke();
      center(); c.globalAlpha = cl((t - 1.2) / 0.4);
      const ls = wrap(c, U(T), 360, 40, 900, 4, true); ls.forEach((ln, i) => { c.font = F(900, 40, true); c.fillStyle = WHITE; c.fillText(ln, cx, cy - (ls.length - 1) * 24 + i * 48 + 12); });
      c.globalAlpha = 1; left(); info(960, cl((t - 1.8) / 0.4));
      if (L.length) logosAt(W / 2, 110, 110, cl((t - 1) / 0.5));
    },
    s6(t) {
      ST.forEach((it, i) => {
        const cx = i % 2 ? W * 0.72 : W * 0.28, cy = 420 + Math.floor(i / 2) * 430, q = ease((t - 0.85 - i * 0.3) / 1.0); if (q <= 0) return;
        c.lineWidth = 16; c.strokeStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(cx, cy, 130, 0, 7); c.stroke();
        c.strokeStyle = [GOLD, HOT, '#35d07f', '#60a5fa'][i]; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, 130, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q); c.stroke(); c.lineCap = 'butt';
        center(); c.fillStyle = WHITE; c.fillText(fit(c, num(it, t, 1.0, 0.85 + i * 0.3).toLocaleString('ms-MY'), 210, 64, 900, true), cx, cy + 20);
        c.font = '34px system-ui'; c.fillText(it.ic, cx, cy - 50); c.fillStyle = GOLD; c.fillText(fit(c, U(it.label), 250, 22, 900), cx, cy + 190); left();
      });
    },
    // 7 · Kiraan detik 3-2-1 kemudian tajuk meletup masuk
    i7(t) {
      center();
      if (t < 1.5) { const k = Math.floor(t / 0.5), u = (t % 0.5) / 0.5, n = 3 - k;
        c.strokeStyle = GOLD; c.lineWidth = 10; c.beginPath(); c.arc(W / 2, 620, 220 * (1 - u * 0.3), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u)); c.stroke();
        c.save(); c.translate(W / 2, 680); c.scale(1.4 - 0.4 * u, 1.4 - 0.4 * u); c.globalAlpha = 1 - u * 0.6; c.fillStyle = WHITE; c.font = F(900, 220, true); c.fillText(String(n), 0, 0); c.restore();
      } else {
        const u = t - 1.5;
        if (u < 0.2) { c.fillStyle = `rgba(255,255,255,${1 - u / 0.2})`; c.fillRect(0, 0, W, H); }
        for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, rr2 = 120 + ease(u / 0.8) * 520; c.fillStyle = [GOLD, HOT, WHITE][i % 3]; c.globalAlpha = 1 - cl(u / 1.2); c.beginPath(); c.arc(W / 2 + Math.cos(a) * rr2, 600 + Math.sin(a) * rr2, 8, 0, 7); c.fill(); }
        c.globalAlpha = 1;
        titleLines(60).forEach((ln, i) => { const q = back((u - 0.05 - i * 0.12) / 0.4); if (q <= 0) return; c.save(); c.translate(W / 2, 480 + i * 70); c.scale(q, q); c.font = F(900, 60, true); c.fillStyle = HOT; c.fillText(ln, 4, 4); c.fillStyle = WHITE; c.fillText(ln, 0, 0); c.restore(); });
        info(820, cl((u - 0.6) / 0.4));
        if (L.length) logosAt(W / 2, 140, 120, cl(u / 0.5));
      }
      left();
    },
    s7(t) {
      ST.forEach((it, i) => {
        const y = 250 + i * 225, q = ease((t - 0.85 - i * 0.3) / 0.4); if (q <= 0) return;
        c.save(); c.globalAlpha = q;
        c.fillStyle = 'rgba(255,255,255,.07)'; rr(c, 40, y, W - 80, 190, 20); c.fill();
        c.fillStyle = WHITE; c.fillText(fit(c, `${it.ic}  ${U(it.label)}`, W - 140, 24, 900), 70, y + 46);
        const s = it.n.toLocaleString('ms-MY'), dw = 58, rp = ease((t - 0.95 - i * 0.3) / 1.4);
        c.save(); c.beginPath(); c.rect(60, y + 64, W - 120, 110); c.clip();
        let xx = 70;
        s.split('').forEach((ch, j) => {
          if (!/\d/.test(ch)) { c.fillStyle = GOLD; c.font = F(900, 90); c.fillText(ch, xx, y + 156); xx += 26; return; }
          xx += dw;
          const tgt = +ch + 10 * (2 + j), pos = tgt * rp;
          for (let k = Math.floor(pos) - 1; k <= Math.floor(pos) + 1; k++) { const off = (k - pos) * 100; c.fillStyle = GOLD; c.font = F(900, 90); c.fillText(String(((k % 10) + 10) % 10), xx - dw, y + 156 + off); }
        });
        c.restore(); c.restore();
      });
    },
    // 8 · Hujan buah carrom: buah hitam, putih & ratu jatuh dan melantun
    i8(t) {
      for (let i = 0; i < 46; i++) {
        const x = 30 + (i * 151.7) % (W - 60), st = (i % 12) * 0.08, g = 2400, floor = H - 70 - (i % 5) * 26, tt = Math.max(0, t - st);
        const fall = Math.sqrt(2 * (floor + 40) / g); let y;
        if (tt < fall) y = -40 + 0.5 * g * tt * tt; else { const u = tt - fall, v = g * fall * 0.45, b = Math.max(0, v * u - 0.5 * g * u * u); y = floor - b; }
        ball(x, y, 14 + (i % 3) * 3, i % 9 === 0 ? 'queen' : i % 2 ? 'black' : 'white');
      }
      c.fillStyle = 'rgba(10,15,29,.82)'; c.fillRect(0, 230, W, 560);
      center(); c.globalAlpha = cl((t - 0.8) / 0.4); pill(W / 2, 300, 'RINGKASAN PERTANDINGAN', 22, INK, GOLD);
      titleLines(58).forEach((ln, i) => { c.font = F(900, 58, true); c.fillStyle = WHITE; c.fillText(ln, W / 2, 400 + i * 66); });
      c.globalAlpha = 1; left(); info(640, cl((t - 1.4) / 0.4));
      if (L.length) logosAt(W / 2, 90, 110, cl(t / 0.5));
    },
    s8(t) {
      ST.forEach((it, i) => {
        const cx = i % 2 ? W * 0.7 : W * 0.3, fy = 430 + Math.floor(i / 2) * 420, st = 0.85 + i * 0.3, u = t - st; if (u <= 0) return;
        const g = 3000, fall = 0.42, y = u < fall ? fy - 700 + 0.5 * g * u * u * (700 / (0.5 * g * fall * fall)) : fy - Math.abs(Math.sin((u - fall) * 9)) * 60 * Math.exp(-(u - fall) * 4);
        const r = 150;
        c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(cx, fy + r + 14, r * 0.8, 14, 0, 0, 7); c.fill();
        coin(c, cx, y, r, i % 2 ? 'queen' : 'white', { shadow: false });
        center(); c.fillStyle = i % 2 ? WHITE : INK; c.fillText(fit(c, num(it, t, 1.0, st + 0.3).toLocaleString('ms-MY'), 240, 70, 900, true), cx, y + 24);
        c.font = '36px system-ui'; c.fillText(it.ic, cx, y - 54); c.fillStyle = WHITE; c.fillText(fit(c, U(it.label), 260, 22, 900), cx, fy + r + 60); left();
      });
    },
    // 9 · Emas: bingkai emas dilukis, tajuk serif anggun
    i9(t) {
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, W, H);
      const per = 2 * (W - 120 + H - 320), q = ease(t / 1.6);
      c.strokeStyle = GOLD; c.lineWidth = 3; c.setLineDash([per * q, per]); c.strokeRect(60, 160, W - 120, H - 320); c.setLineDash([]);
      c.strokeStyle = 'rgba(255,197,61,.5)'; c.lineWidth = 1; c.strokeRect(74, 174, W - 148, H - 348);
      center(); c.globalAlpha = cl((t - 0.8) / 0.6);
      c.fillStyle = GOLD; c.font = '600 22px Georgia, "Times New Roman", serif'; c.fillText('—  R I N G K A S A N   P E R T A N D I N G A N  —', W / 2, 420);
      const ls = (() => { c.font = '700 54px Georgia, serif'; return wrap(c, T, W - 200, 54, 700, 3); })();
      ls.forEach((ln, i) => { c.font = '700 54px Georgia, "Times New Roman", serif'; c.fillStyle = WHITE; c.fillText(ln, W / 2, 520 + i * 66 + (1 - cl((t - 1 - i * 0.15) / 0.6)) * 30); });
      const y = 540 + ls.length * 66;
      c.fillStyle = GOLD; c.fillRect(W / 2 - 80 * cl((t - 1.6) / 0.5), y, 160 * cl((t - 1.6) / 0.5), 2);
      c.globalAlpha = cl((t - 1.9) / 0.5); c.fillStyle = 'rgba(255,255,255,.9)'; c.font = 'italic 400 28px Georgia, serif';
      if (d.when) c.fillText(d.when, W / 2, y + 60); c.font = '400 20px Georgia, serif'; if (d.where) c.fillText(fit(c, d.where, W - 200, 20, 400), W / 2, y + 100);
      c.globalAlpha = 1; left();
      if (L.length) logosAt(W / 2, 230, 110, cl((t - 0.4) / 0.6));
    },
    s9(t) {
      c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, 0, W, H);
      ST.forEach((it, i) => {
        const y = 290 + i * 215, q = ease((t - 0.85 - i * 0.35) / 0.6); if (q <= 0) return;
        c.globalAlpha = q; center();
        c.fillStyle = GOLD; c.font = '700 96px Georgia, "Times New Roman", serif'; c.fillText(num(it, t, 1.3, 1 + i * 0.35).toLocaleString('ms-MY'), W / 2, y + 80);
        c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '400 22px Georgia, serif'; c.fillText(U(it.label).split('').join(' '), W / 2, y + 122);
        c.fillStyle = 'rgba(255,197,61,.6)'; c.fillRect(W / 2 - 140 * q, y + 160, 280 * q, 1);
        c.globalAlpha = 1; left();
      });
    },
  };
}
