// Video ringkasan pertandingan (MP4 menegak 9:16) — babak: pembukaan, angka, kedudukan, detik menarik,
// kalah mati, podium, penutup. Dilukis pada kanvas dan dikod oleh draw-video.js (WebCodecs / MediaRecorder).
import { VID } from './draw-video.js';
const { W, H, rr, fitText, ease } = VID;

const clamp = x => Math.max(0, Math.min(1, x));
const pop = x => { x = clamp(x); return x < 0.7 ? ease(x / 0.7) * 1.08 : 1.08 - 0.08 * ease((x - 0.7) / 0.3); };
const GOLD = '#ffc53d', ORANGE = '#ff8a1f', GREEN = '#7ee2a0', WHITE = '#ffffff';

function wrap(c, s, maxW, size, weight = 800, maxLines = 2) {
  c.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const words = String(s || '').split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    const tryL = cur ? cur + ' ' + w : w;
    if (c.measureText(tryL).width <= maxW || !cur) cur = tryL; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); keep[maxLines - 1] = fitText(c, lines.slice(maxLines - 1).join(' '), maxW, size, weight); return keep; }
  return lines;
}

// d: data ringkasan (lihat recapData dalam app.js)
export function buildRecap(d) {
  const S = [];
  S.push({ k: 'intro', dur: 4 });
  S.push({ k: 'stats', dur: 5 });
  if (d.table && d.table.rows.length) S.push({ k: 'table', dur: 2.2 + Math.min(d.table.rows.length, 8) * 0.35 + 2 });
  if (d.groups && d.groups.length) S.push({ k: 'groups', dur: 2 + Math.min(d.groups.length, 8) * 0.3 + 2.5 });
  const aw = (d.awards || []).slice(0, 4);
  if (aw.length) S.push({ k: 'awards', dur: 1 + aw.length * 2.4 });
  if (d.ko && d.ko.rounds.length) S.push({ k: 'ko', dur: 1.2 + d.ko.rounds.length * 2.3 + 1.5 });
  if (d.podium && d.podium.length) S.push({ k: 'podium', dur: 7 });
  S.push({ k: 'end', dur: 4.5 });
  let acc = 0; S.forEach(x => { x.t0 = acc; acc += x.dur; });
  const dur = acc;

  // peristiwa bunyi
  const ev = [];
  S.forEach(x => {
    ev.push({ t: x.t0, kind: 'scene' });
    if (x.k === 'stats') for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) ev.push({ t: x.t0 + 0.6 + i * 0.3 + j * 0.18, kind: 'tick', i: j });
    if (x.k === 'table') d.table.rows.slice(0, 8).forEach((_, i) => ev.push({ t: x.t0 + 1 + i * 0.35, kind: 'card', i }));
    if (x.k === 'groups') d.groups.slice(0, 8).forEach((_, i) => ev.push({ t: x.t0 + 1 + i * 0.3, kind: 'card', i }));
    if (x.k === 'awards') aw.forEach((_, i) => ev.push({ t: x.t0 + 0.8 + i * 2.4, kind: 'card', i: i * 3 }));
    if (x.k === 'ko') d.ko.rounds.forEach((_, i) => ev.push({ t: x.t0 + 1.2 + i * 2.3 + 1.2, kind: i === d.ko.rounds.length - 1 ? 'done' : 'card', i: i + 5 }));
    if (x.k === 'podium') [0.6, 2.1, 3.6].forEach((t, i) => ev.push({ t: x.t0 + t, kind: i === 2 ? 'boom' : 'card', i: 8 + i }));
    if (x.k === 'end') ev.push({ t: x.t0 + 0.2, kind: 'end' });
  });

  const make = (logos, sc) => {
    const cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
    const c = cv.getContext('2d'), L = logos.filter(Boolean);
    const bg = t => {
      const g = c.createLinearGradient(0, 0, W * 0.5, H); g.addColorStop(0, d.c2 || '#1d3f8c'); g.addColorStop(1, d.c1 || '#0b1a3f');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // jalur diagonal & bola bergerak (latar)
      c.save(); c.globalAlpha = 0.07; c.fillStyle = WHITE;
      for (let i = -4; i < 10; i++) { c.beginPath(); const x = i * 160 + ((t * 40) % 160); c.moveTo(x, 0); c.lineTo(x + 70, 0); c.lineTo(x - 330, H); c.lineTo(x - 400, H); c.fill(); }
      c.globalAlpha = 0.12;
      for (let i = 0; i < 7; i++) { const x = (i * 131 + t * (30 + i * 9)) % (W + 80) - 40, y = 140 + ((i * 263) % (H - 280)) + Math.sin(t * 2 + i) * 30; c.beginPath(); c.arc(x, y, 10 + (i % 3) * 6, 0, 7); c.fill(); }
      c.restore();
      c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 3; rr(c, 16, 16, W - 32, H - 32, 28); c.stroke();
    };
    const head = (txt, p) => {
      c.save(); c.globalAlpha = clamp(p * 2); c.textAlign = 'center';
      c.fillStyle = ORANGE; c.fillText(fitText(c, txt, W - 120, 30, 900), W / 2, 150);
      c.fillStyle = 'rgba(255,255,255,.75)'; c.fillText(fitText(c, d.title, W - 140, 22, 600), W / 2, 188);
      c.fillStyle = ORANGE; c.fillRect(W / 2 - 60 * ease(p * 2), 206, 120 * ease(p * 2), 5);
      c.restore();
    };
    const logosAt = (y, h, a = 1) => {
      const tw = L.reduce((s, im) => s + h * im.width / im.height + 18, -18); let x = (W - tw) / 2;
      c.save(); c.globalAlpha = a; L.forEach(im => { const w = h * im.width / im.height; c.drawImage(im, x, y, w, h); x += w + 18; }); c.restore();
    };
    const confetti = (t, n = 80) => {
      const cols = [GOLD, ORANGE, GREEN, '#60a5fa', '#f472b6', WHITE];
      for (let i = 0; i < n; i++) { const x = (i * 97.3) % W, y = ((i * 61) % 500) - 260 + t * (220 + (i % 5) * 50); if (y > H || y < -20) continue;
        c.save(); c.translate(x, y); c.rotate(t * 5 + i); c.fillStyle = cols[i % cols.length]; c.fillRect(-7, -3.5, 14, 7); c.restore(); }
    };
    const card = (x, y, w, h, r = 22, fill = 'rgba(255,255,255,.12)', stroke = 'rgba(255,255,255,.22)') => { c.fillStyle = fill; rr(c, x, y, w, h, r); c.fill(); c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); };

    const SC = {
      intro(t) {
        const p = ease(t / 0.8);
        if (L.length) { c.save(); c.translate(W / 2, 360); c.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p); c.translate(-W / 2, -360); logosAt(285, 150, p); c.restore(); }
        c.textAlign = 'center';
        c.globalAlpha = clamp((t - 0.4) / 0.5); c.fillStyle = ORANGE; c.fillText(fitText(c, '🏓 RINGKASAN PERTANDINGAN', W - 120, 28, 900), W / 2, 540);
        const lines = wrap(c, d.title, W - 110, 60, 900, 3);
        lines.forEach((ln, i) => { const q = ease((t - 0.7 - i * 0.15) / 0.5); c.globalAlpha = q; c.fillStyle = WHITE; c.font = '900 60px system-ui, sans-serif'; c.fillText(ln, W / 2 + (1 - q) * 60, 625 + i * 70); });
        const y = 625 + lines.length * 70 + 20, q2 = clamp((t - 1.4) / 0.5);
        c.globalAlpha = q2; c.fillStyle = 'rgba(255,255,255,.85)';
        if (d.club) c.fillText(fitText(c, d.club, W - 120, 26, 600), W / 2, y);
        if (d.when) c.fillText(fitText(c, '📅 ' + d.when, W - 120, 30, 800), W / 2, y + 60);
        if (d.where) c.fillText(fitText(c, '📍 ' + d.where, W - 120, 24, 600), W / 2, y + 105);
        c.globalAlpha = 1; c.textAlign = 'left';
      },
      stats(t) {
        head('DALAM ANGKA', t);
        const items = d.stats, bw = 300, bh = 270, gx = (W - bw * 2 - 30) / 2;
        items.forEach((it, i) => {
          const x = gx + (i % 2) * (bw + 30), y = 300 + Math.floor(i / 2) * (bh + 34), q = pop((t - 0.3 - i * 0.3) / 0.6);
          if (q <= 0) return;
          c.save(); c.translate(x + bw / 2, y + bh / 2); c.scale(q, q); c.translate(-bw / 2, -bh / 2);
          card(0, 0, bw, bh, 28);
          c.textAlign = 'center'; c.font = '64px system-ui'; c.fillText(it.ic, bw / 2, 90);
          const n = Math.round(it.n * ease((t - 0.6 - i * 0.3) / 1.2));
          c.fillStyle = GOLD; c.fillText(fitText(c, n.toLocaleString('ms-MY'), bw - 30, 76, 900), bw / 2, 180);
          c.fillStyle = WHITE; c.fillText(fitText(c, it.label, bw - 30, 26, 700), bw / 2, 228);
          c.restore();
        });
        c.textAlign = 'left';
      },
      table(t) {
        const T = d.table; head(T.title, t);
        const rows = T.rows.slice(0, 8), rh = 104, y0 = 270;
        rows.forEach((r, i) => {
          const q = ease((t - 0.9 - i * 0.35) / 0.45); if (q <= 0) return;
          const y = y0 + i * (rh + 12), x = 50 + (1 - q) * 500;
          c.globalAlpha = q;
          card(x, y, W - 100, rh, 20, i === 0 ? 'rgba(255,197,61,.28)' : r.q ? 'rgba(126,226,160,.16)' : 'rgba(255,255,255,.1)', i === 0 ? GOLD : 'rgba(255,255,255,.2)');
          c.fillStyle = i < 3 ? [GOLD, '#dfe6ee', '#e9a46b'][i] : 'rgba(255,255,255,.25)';
          c.beginPath(); c.arc(x + 52, y + rh / 2, 30, 0, 7); c.fill();
          c.fillStyle = i < 3 ? '#1b1300' : WHITE; c.textAlign = 'center'; c.fillText(fitText(c, String(i + 1), 50, 30, 900), x + 52, y + rh / 2 + 11);
          c.textAlign = 'left'; c.fillStyle = WHITE; c.fillText(fitText(c, r.name, W - 380, 30, 800), x + 100, y + 46);
          c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText(fitText(c, r.sub || '', W - 380, 20, 500), x + 100, y + 78);
          c.textAlign = 'right'; c.fillStyle = GOLD; c.fillText(fitText(c, String(r.pts), 120, 44, 900), x + W - 130, y + 58);
          c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText(fitText(c, 'mata', 120, 18, 600), x + W - 130, y + 84);
          c.textAlign = 'left'; c.globalAlpha = 1;
        });
        if (T.rows.length > 8) { c.globalAlpha = clamp((t - 4) / 0.5); c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText(fitText(c, `+ ${T.rows.length - 8} lagi`, 300, 22, 600), W / 2, y0 + 8 * (rh + 12) + 30); c.textAlign = 'left'; c.globalAlpha = 1; }
      },
      groups(t) {
        head('PERINGKAT KUMPULAN', t);
        const G = d.groups.slice(0, 8), cols = G.length > 4 ? 2 : 1, bw = cols === 2 ? 300 : W - 140, rows = Math.ceil(G.length / cols);
        const bh = Math.min(230, (H - 330 - (rows - 1) * 18) / rows), gx = (W - bw * cols - (cols - 1) * 24) / 2;
        G.forEach((g, i) => {
          const x = gx + (i % cols) * (bw + 24), y = 270 + Math.floor(i / cols) * (bh + 18), q = pop((t - 0.9 - i * 0.3) / 0.5);
          if (q <= 0) return;
          c.save(); c.translate(x + bw / 2, y + bh / 2); c.scale(q, q); c.translate(-bw / 2, -bh / 2);
          card(0, 0, bw, bh, 20);
          c.fillStyle = ORANGE; c.fillText(fitText(c, g.name, bw - 30, 24, 900), 18, 36);
          const lh = Math.min(38, (bh - 56) / Math.max(1, g.rows.length));
          g.rows.forEach((r, j) => {
            c.fillStyle = r.q ? WHITE : 'rgba(255,255,255,.55)';
            c.fillText(fitText(c, `${j + 1}. ${r.name}`, bw - 80, Math.min(22, lh - 6), r.q ? 800 : 500), 18, 56 + (j + 0.7) * lh);
            c.textAlign = 'right'; c.fillStyle = r.q ? GREEN : 'rgba(255,255,255,.5)'; c.fillText(fitText(c, String(r.pts), 60, Math.min(22, lh - 6), 900), bw - 16, 56 + (j + 0.7) * lh); c.textAlign = 'left';
          });
          c.restore();
        });
        c.globalAlpha = clamp((t - 2.5) / 0.5); c.textAlign = 'center'; c.fillStyle = GREEN;
        c.fillText(fitText(c, '● layak ke kalah mati', W - 120, 22, 700), W / 2, H - 70); c.textAlign = 'left'; c.globalAlpha = 1;
      },
      awards(t) {
        head('DETIK MENARIK', t);
        const i = Math.min(aw.length - 1, Math.floor(Math.max(0, t - 0.6) / 2.4)), lt = t - 0.6 - i * 2.4, a = aw[i];
        if (!a || lt < 0) return;
        const q = pop(lt / 0.55), out = clamp((lt - 2.0) / 0.4);
        c.save(); c.globalAlpha = 1 - out; c.translate(W / 2, 640); c.scale(q, q); c.translate(-W / 2, -640);
        card(60, 330, W - 120, 620, 34, 'rgba(255,255,255,.13)', GOLD);
        c.textAlign = 'center'; c.font = '120px system-ui'; c.fillText(a.ic, W / 2, 500);
        c.fillStyle = GOLD; c.fillText(fitText(c, a.t.toUpperCase(), W - 180, 32, 900), W / 2, 590);
        const wl = wrap(c, a.w, W - 180, 44, 900, 2); c.fillStyle = WHITE; wl.forEach((ln, k) => { c.font = '900 44px system-ui, sans-serif'; c.fillText(ln, W / 2, 670 + k * 54); });
        const nl = wrap(c, a.n, W - 190, 24, 500, 3); c.fillStyle = 'rgba(255,255,255,.78)'; nl.forEach((ln, k) => { c.font = '500 24px system-ui, sans-serif'; c.fillText(ln, W / 2, 690 + wl.length * 54 + k * 34); });
        c.restore(); c.textAlign = 'left';
        // titik kemajuan
        aw.forEach((_, k) => { c.fillStyle = k === i ? GOLD : 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(W / 2 + (k - (aw.length - 1) / 2) * 30, 1010, 8, 0, 7); c.fill(); });
      },
      ko(t) {
        head('KALAH MATI', t);
        const R = d.ko.rounds, i = Math.min(R.length - 1, Math.floor(Math.max(0, t - 1.2) / 2.3)), lt = t - 1.2 - i * 2.3, r = R[i];
        if (!r || lt < 0) return;
        const last = i === R.length - 1, fin = r.final;
        c.textAlign = 'center'; c.globalAlpha = clamp(lt / 0.3); c.fillStyle = WHITE;
        c.fillText(fitText(c, r.name.toUpperCase(), W - 120, last ? 52 : 40, 900), W / 2, 300); c.globalAlpha = 1;
        const ms = r.ms.slice(0, 4), mh = last ? 360 : Math.min(190, (H - 420) / ms.length - 20);
        ms.forEach((m, j) => {
          const q = ease((lt - 0.2 - j * 0.18) / 0.4); if (q <= 0) return;
          const y = 350 + j * (mh + 20), x = 60;
          c.globalAlpha = q; card(x, y + (1 - q) * 40, W - 120, mh, 24, last ? 'rgba(255,197,61,.18)' : 'rgba(255,255,255,.1)', last ? GOLD : 'rgba(255,255,255,.22)');
          const win = clamp((lt - 1.1) / 0.3), yy = y + (1 - q) * 40;
          const side = (nm, isW, yy2, sz) => {
            c.textAlign = 'left'; c.fillStyle = isW && win ? (last ? GOLD : GREEN) : win ? 'rgba(255,255,255,.55)' : WHITE;
            c.fillText(fitText(c, (isW && win ? '🏆 ' : '') + nm, W - 300, sz, isW && win ? 900 : 700), x + 30, yy2);
          };
          const sz = last ? 40 : Math.min(30, mh / 4);
          side(m.a, m.w === 'a', yy + (last ? 110 : mh * 0.4), sz);
          side(m.b, m.w === 'b', yy + (last ? 210 : mh * 0.78), sz);
          c.textAlign = 'right'; c.globalAlpha = q * win;
          c.fillStyle = GOLD; c.fillText(fitText(c, m.sc, 150, last ? 64 : sz + 8, 900), x + W - 150, yy + (last ? 175 : mh * 0.62));
          if (last && fin && fin.sets) { c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.8)'; c.fillText(fitText(c, fin.sets, W - 180, 26, 600), W / 2, yy + 300); }
          c.globalAlpha = 1; c.textAlign = 'left';
        });
        if (last && lt > 1.3) confetti(lt - 1.3, 50);
      },
      podium(t) {
        head('PODIUM', t);
        const P = d.podium, at = p => P.find(x => x.place === p);
        const cols = [{ p: 2, x: 70, h: 300, rv: 2.1, col: '#dfe6ee' }, { p: 1, x: 260, h: 420, rv: 3.6, col: GOLD }, { p: 3, x: 450, h: 220, rv: 0.6, col: '#e9a46b' }];
        const base = H - 230;
        cols.forEach(k => {
          const e = at(k.p); if (!e) return;
          const q = ease((t - k.rv) / 0.6); if (q <= 0) return;
          const h = k.h * q, w = 200;
          const g = c.createLinearGradient(0, base - h, 0, base); g.addColorStop(0, k.col); g.addColorStop(1, 'rgba(255,255,255,.15)');
          c.fillStyle = g; rr(c, k.x, base - h, w, h, 16); c.fill();
          c.textAlign = 'center'; c.fillStyle = '#1b1300'; c.fillText(fitText(c, String(k.p), 120, 90, 900), k.x + w / 2, base - h + 100);
          const nq = pop((t - k.rv - 0.4) / 0.5);
          if (nq > 0) {
            c.save(); c.translate(k.x + w / 2, base - h - 70); c.scale(nq, nq);
            c.font = '64px system-ui'; c.fillText(['🥇', '🥈', '🥉'][k.p - 1], 0, -60);
            const names = e.names.slice(0, 2), sz = k.p === 1 ? 30 : 24;
            names.forEach((nm, j) => { const ls = wrap(c, nm, 230, sz, 900, 2); ls.forEach((ln, m) => { c.font = `900 ${sz}px system-ui, sans-serif`; c.fillStyle = WHITE; c.fillText(ln, 0, (j * ls.length + m) * (sz + 6) - (names.length - 1) * 8); }); });
            c.restore();
          }
          c.textAlign = 'left';
        });
        const t1 = cols.find(k => k.p === 1);
        if (t > t1.rv + 0.5) {
          const e = at(1); confetti(t - t1.rv - 0.5, 90);
          c.textAlign = 'center'; c.globalAlpha = clamp((t - t1.rv - 0.6) / 0.4); c.fillStyle = GOLD;
          c.fillText(fitText(c, `JOHAN: ${e ? e.names.join(' & ') : ''}`, W - 100, 40, 900), W / 2, 280); c.globalAlpha = 1; c.textAlign = 'left';
        }
      },
      end(t) {
        const p = ease(t / 0.7);
        c.textAlign = 'center';
        if (L.length) logosAt(260, 130, p);
        c.save(); c.translate(W / 2, 560); c.scale(0.7 + 0.3 * p, 0.7 + 0.3 * p); c.fillStyle = GOLD; c.fillText(fitText(c, 'TAHNIAH! 🎉', W - 100, 84, 900), 0, 0); c.restore();
        c.globalAlpha = clamp((t - 0.5) / 0.5); c.fillStyle = WHITE;
        wrap(c, 'Terima kasih kepada semua peserta, pengadil & AJK', W - 140, 32, 700, 3).forEach((ln, i) => { c.font = '700 32px system-ui, sans-serif'; c.fillText(ln, W / 2, 660 + i * 44); });
        c.fillStyle = 'rgba(255,255,255,.8)'; c.fillText(fitText(c, d.title, W - 120, 26, 600), W / 2, 820);
        if (d.url) { c.fillStyle = GREEN; c.fillText(fitText(c, '📄 Keputusan penuh di Pingpong Portal', W - 120, 24, 700), W / 2, 900); }
        c.globalAlpha = 1; confetti(t, 70);
        c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText(fitText(c, 'Pingpong Portal', W - 80, 20, 600), W / 2, H - 40);
        c.textAlign = 'left';
      },
    };
    const draw = t => {
      c.setTransform(sc, 0, 0, sc, 0, 0);
      let x = S.find(s => t < s.t0 + s.dur) || S[S.length - 1];
      const lt = t - x.t0;
      bg(t); SC[x.k](lt);
      // peralihan: pudar masuk setiap babak
      if (lt < 0.25) { c.fillStyle = `rgba(0,0,0,${0.6 * (1 - lt / 0.25)})`; c.fillRect(0, 0, W, H); }
    };
    return { cv, draw };
  };
  return { dur, events: ev, make, scenes: S };
}
