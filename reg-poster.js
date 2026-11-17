// Poster pendaftaran (PNG 1080×1350) — dijana terus dari maklumat pertandingan, dengan kod QR ke pautan daftar
import qrcode from './vendor/qrcode.js';
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function setF(c, size, weight = 700) { c.font = `${weight} ${size}px ${FONT}`; }
// pecah teks kepada baris yang muat lebar
function wrap(c, text, maxW, maxLines) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const tryL = line ? line + ' ' + w : w;
      if (c.measureText(tryL).width <= maxW || !line) line = tryL; else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}
function drawQR(c, text, x, y, size) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), cell = size / (n + 2);
  c.fillStyle = '#fff'; c.fillRect(x, y, size, size); c.fillStyle = '#0b1220';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(Math.floor(x + (k + 1) * cell), Math.floor(y + (r + 1) * cell), Math.ceil(cell), Math.ceil(cell));
}
// d: { title, club, logos, when, time, venue, format, hc, fee, prizes[], note, slots, countdown, url, status }
export async function makeRegPoster(d, style = 'editorial') {
  if (style === 'editorial' || style === 'gelap') return makeBold(d, style);
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const hd1 = css('--hd1') || '#0b1a3f', hd2 = css('--hd2') || '#1d3f8c', or = css('--or') || '#ff7a1a';
  const g = c.createLinearGradient(0, 0, W * .6, H); g.addColorStop(0, hd2); g.addColorStop(1, hd1);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // corak meja pingpong
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 5; rr(c, 30, 30, W - 60, H - 60, 36); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(W / 2 - 2, 30, 4, H - 60);
  // bola hiasan
  const ball = (x, y, r, a) => { const bg = c.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r); bg.addColorStop(0, `rgba(255,220,170,${a})`); bg.addColorStop(1, `rgba(255,140,40,${a})`); c.fillStyle = bg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  ball(W - 120, 150, 46, .9); ball(W - 190, 235, 20, .45); ball(W - 225, 290, 10, .25);
  // kandungan atas: diskala turun sehingga muat di atas kad QR
  const imgs = (await Promise.all((d.logos || []).map(loadImg))).filter(Boolean);
  const cardH = 300, cy = H - 84 - cardH, limit = cy - 30;
  const darkOr = (() => { const h = or.replace('#', ''); if (h.length < 6) return false; const [r, gg, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); return r * .299 + gg * .587 + b * .114 < 150; })();
  const body = (k, draw) => {
    const F = (size, w) => setF(c, Math.round(size * k), w);
    let y = 80;
    if (imgs.length) { let x = 80; const lh = 120 * k; if (draw) imgs.forEach(im => { const w = lh * im.width / im.height; c.drawImage(im, x, y, w, lh); x += w + 18; }); y += lh + 30 * k + 8; }
    c.textAlign = 'left'; c.fillStyle = 'rgba(255,255,255,.78)'; F(28, 600);
    wrap(c, d.club || '', W - 330, 2).forEach(l => { if (draw) c.fillText(l, 80, y); y += 36 * k; });
    c.fillStyle = '#fff'; let ts = 84 * k; setF(c, ts, 900);
    let tl = wrap(c, d.title, W - 280, 3);
    while (tl.length > 2 && ts > 56 * k) { ts -= 6; setF(c, ts, 900); tl = wrap(c, d.title, W - 280, 3); }
    y += 14 * k; tl.forEach(l => { y += ts * 1.02; if (draw) c.fillText(l, 80, y); });
    y += 30 * k; F(30, 800);
    const lab = d.status || 'PENDAFTARAN DIBUKA', lw = c.measureText(lab).width + 56 * k, ph = 56 * k;
    if (draw) { c.fillStyle = d.status ? '#9ca3af' : or; rr(c, 80, y, lw, ph, ph / 2); c.fill(); c.fillStyle = !d.status && darkOr ? '#fff' : '#111'; c.fillText(lab, 80 + 28 * k, y + ph * .7); }
    y += ph + 62 * k;
    const rows = [['📅', d.when], ['⏰', d.time], ['📍', d.venue], ['🎯', d.format], ['⚖️', d.hc], ['💰', d.fee ? 'Yuran: ' + d.fee : '']].filter(r => r[1]);
    for (const [ic, tx] of rows) {
      F(36, 600); const ls = wrap(c, tx, W - 250, 2);
      if (draw) { c.fillStyle = '#fff'; c.font = `400 ${Math.round(38 * k)}px ${FONT}`; c.fillText(ic, 80, y + 2); F(36, 600); ls.forEach((l, i) => c.fillText(l, 80 + 60 * k, y + i * 44 * k)); }
      y += 44 * k * ls.length + 14 * k;
    }
    const prizes = (d.prizes || []).slice(0, 4);
    if (prizes.length) {
      y += 4 * k; const bh = 64 * k + prizes.length * 48 * k;
      if (draw) {
        c.fillStyle = 'rgba(255,255,255,.1)'; rr(c, 80, y - 30 * k, W - 160, bh + 10 * k, 24); c.fill();
        c.fillStyle = '#ffd166'; F(30, 800); c.fillText('🏆  HADIAH', 112, y + 14 * k);
        c.fillStyle = '#fff'; F(32, 600); const md = ['🥇', '🥈', '🥉', '🏅'];
        prizes.forEach((p, i) => c.fillText(`${md[i] || '🏅'}  ${wrap(c, p, W - 300, 1)[0]}`, 112, y + 64 * k + i * 48 * k));
      }
      y += bh + 6 * k;
    }
    if (d.note) { c.fillStyle = 'rgba(255,255,255,.82)'; F(28, 500); wrap(c, d.note, W - 180, 3).forEach(l => { y += 36 * k; if (draw) c.fillText(l, 84, y); }); }
    return y;
  };
  let k = 1; while (k > .62 && body(k, false) > limit) k -= .04;
  body(k, true);
  // kad QR di bawah
  c.fillStyle = '#fff'; rr(c, 60, cy, W - 120, cardH, 30); c.fill();
  drawQR(c, d.url, 90, cy + 30, cardH - 60);
  const tx = 90 + cardH - 60 + 40, tw = W - 60 - 40 - tx;
  c.fillStyle = '#0b1220'; setF(c, 46, 900); c.fillText(d.status ? 'Imbas untuk lihat' : 'Imbas untuk daftar', tx, cy + 82);
  setF(c, 30, 600); c.fillStyle = '#334155';
  let ty = cy + 132;
  [d.slots, d.countdown].filter(Boolean).forEach(s => { wrap(c, s, tw, 1).forEach(l => { c.fillText(l, tx, ty); ty += 42; }); });
  c.fillStyle = '#64748b'; setF(c, 22, 500);
  wrap(c, d.url.replace(/^https?:\/\//, ''), tw, 2).forEach(l => { c.fillText(l, tx, Math.max(ty + 8, cy + cardH - 70)); ty += 30; });
  // jalur bawah
  c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.55)'; setF(c, 22, 500);
  c.fillText('🏓 Pingpong Portal', W / 2, H - 46);
  return new Promise(res => cv.toBlob(b => res(b), 'image/png'));
}
export async function shareBlob(blob, name, title) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  return 'download';
}

// ---------- Gaya Editorial (risograph) & Gelap (neon) ----------
const lum = hex => { const h = String(hex).replace('#', ''); if (h.length < 6) return 128; const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); return r * .299 + g * .587 + b * .114; };
const MONO = 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace';
// teks "condensed": dimampat secara mendatar supaya rupa poster sukan tanpa fon khas
function ctext(c, str, x, y, size, { w = 900, sx = .76, align = 'left', fill = true, stroke = false } = {}) {
  c.save(); c.font = `${w} ${size}px ${FONT}`; c.textAlign = 'left';
  const tw = c.measureText(str).width * sx, ox = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
  c.translate(ox, y); c.scale(sx, 1);
  if (fill) c.fillText(str, 0, 0); if (stroke) c.strokeText(str, 0, 0);
  c.restore(); return tw;
}
const cw = (c, str, size, w = 900, sx = .76) => { c.font = `${w} ${size}px ${FONT}`; return c.measureText(str).width * sx; };
// pecah tajuk kepada baris besar yang memenuhi lebar
function headline(c, text, maxW, maxH, maxLines = 4, sx = .76) {
  const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
  for (let size = 210; size >= 60; size -= 6) {
    const lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (cw(c, t, size, 900, sx) <= maxW || !line) line = t; else { lines.push(line); line = w; } }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every(l => cw(c, l, size, 900, sx) <= maxW) && lines.length * size * .9 <= maxH) return { size, lines };
  }
  return { size: 60, lines: words.length ? [words.join(' ')] : [''] };
}
function halftoneBall(c, cx, cy, R, color, step = 13, light = [-.45, -.5]) {
  c.fillStyle = color;
  const lx = cx + light[0] * R, ly = cy + light[1] * R;
  for (let y = cy - R; y <= cy + R; y += step) for (let x = cx - R; x <= cx + R; x += step) {
    const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > R * R) continue;
    const t = Math.min(1, Math.hypot(x - lx, y - ly) / (R * 1.7));
    const r = step * .5 * (.12 + .88 * t); if (r < .6) continue;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
}
function grain(c, W, H, n, col) { c.fillStyle = col; for (let i = 0; i < n; i++) c.fillRect(Math.random() * W, Math.random() * H, 1.6, 1.6); }
function stamp(c, x, y, r, col, top, bottom, rot = -.22) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 5;
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r - 12, 0, Math.PI * 2); c.stroke();
  c.textAlign = 'center';
  ctext(c, top, 0, -4, r * .42, { align: 'center', sx: .8 });
  c.font = `700 ${Math.round(r * .2)}px ${MONO}`; c.fillText(bottom, 0, r * .38);
  c.restore();
}
async function makeBold(d, style) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), dark = style === 'gelap';
  const tb = css('--tb') || '#1f4aa8', or = css('--or') || '#ff7a1a', hd1 = css('--hd1') || '#0b1a3f';
  // dua "dakwat": warna utama kelab + aksen (jika aksen terlalu cerah di atas krim, guna warna gelap kelab)
  const ink1 = tb, ink2 = !dark && lum(or) > 175 ? hd1 : or;
  const paper = dark ? '#0a0d14' : '#efe6d4', text = dark ? '#f5f1e8' : '#16130f', soft = dark ? 'rgba(245,241,232,.62)' : 'rgba(22,19,15,.62)';
  const M = 70;
  // latar
  c.fillStyle = paper; c.fillRect(0, 0, W, H);
  if (dark) {
    const g1 = c.createRadialGradient(W * .85, H * .42, 20, W * .85, H * .42, 700); g1.addColorStop(0, ink1 + 'aa'); g1.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g1; c.fillRect(0, 0, W, H);
    const g2 = c.createRadialGradient(W * .05, H * .95, 10, W * .05, H * .95, 600); g2.addColorStop(0, ink2 + '66'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g2; c.fillRect(0, 0, W, H);
    // garis laju
    c.save(); c.globalAlpha = .08; c.strokeStyle = '#fff'; c.lineWidth = 2;
    for (let i = 0; i < 26; i++) { const y0 = 120 + i * 48; c.beginPath(); c.moveTo(-50, y0 + 300); c.lineTo(W + 50, y0 - 300); c.stroke(); }
    c.restore();
    // perkataan gergasi bergaris luar sebagai tekstur
    c.save(); c.globalAlpha = .1; c.strokeStyle = '#fff'; c.lineWidth = 3; c.translate(W - 30, H * .5); c.rotate(-Math.PI / 2);
    ctext(c, 'PINGPONG', 0, 0, 300, { align: 'center', fill: false, stroke: true, sx: .8 }); c.restore();
  } else grain(c, W, H, 9000, 'rgba(60,45,20,.07)');
  // bola: halftone (editorial) atau neon (gelap)
  const bx = W - 110, by = 880, bR = 250;
  if (dark) {
    c.save(); c.shadowColor = ink2; c.shadowBlur = 90;
    const bg = c.createRadialGradient(bx - 70, by - 80, 20, bx, by, bR); bg.addColorStop(0, '#fff'); bg.addColorStop(.55, '#ffe9c7'); bg.addColorStop(1, ink2);
    c.fillStyle = bg; c.beginPath(); c.arc(bx, by, bR, 0, Math.PI * 2); c.fill(); c.restore();
    c.save(); c.globalAlpha = .35; halftoneBall(c, bx, by, bR, '#000', 14, [.5, .55]); c.restore();
  } else {
    c.save(); c.globalCompositeOperation = 'multiply';
    c.globalAlpha = .9; halftoneBall(c, bx + 9, by + 7, bR, ink2, 13);
    c.globalAlpha = .85; halftoneBall(c, bx, by, bR, ink1, 13, [-.3, -.6]);
    c.restore();
  }
  // atas: logo + kelab + cop
  const imgs = (await Promise.all((d.logos || []).map(loadImg))).filter(Boolean);
  let x = M; imgs.forEach(im => { const w = 92 * im.width / im.height; c.drawImage(im, x, 58, w, 92); x += w + 12; });
  c.fillStyle = soft; c.textAlign = 'left'; c.font = `700 22px ${MONO}`;
  const clubL = wrap(c, (d.club || '').toUpperCase(), W - x - 280, 2); clubL.forEach((l, i) => c.fillText(l, x + 8, 92 + i * 28));
  stamp(c, W - 150, 128, 88, dark ? ink2 : ink2, d.status ? 'TUTUP' : 'DAFTAR', d.status ? d.status.toUpperCase().slice(0, 14) : 'DIBUKA');
  // tajuk besar
  const top = 200, hl = headline(c, d.title, W - 2 * M, 400, 4);
  let y = top;
  hl.lines.forEach((l, i) => {
    y += hl.size * .9;
    c.save();
    if (dark) { c.shadowColor = i % 2 ? ink2 : ink1; c.shadowBlur = 28; }
    c.fillStyle = dark ? (i % 2 ? ink2 : '#fff') : (i % 2 ? ink2 : ink1);
    if (!dark) c.globalCompositeOperation = 'multiply';
    ctext(c, l, M - 4, y, hl.size); c.restore();
  });
  const colW = 580, qrS = 250, qrY = H - M - qrS - 10;
  // garis + subtajuk
  y += 30; c.fillStyle = text; c.fillRect(M, y, W - 2 * M, 4); y += 48;
  c.font = `700 24px ${MONO}`; c.fillStyle = text; wrap(c, (d.format || '').toUpperCase(), colW + 40, 2).forEach(l => { c.fillText(l, M, y); y += 34; });
  if (d.hc) { c.fillStyle = ink2; c.fillText(d.hc.toUpperCase(), M, y); y += 34; }
  y += 22;
  // butiran (lajur kiri, bola di kanan)

  // butiran dalam grid 2 lajur: [TARIKH | MASA], [TEMPAT | YURAN]
  const cell = (k, v, x0, w0) => {
    c.font = `700 19px ${MONO}`; c.fillStyle = ink2; c.fillText(k, x0, y);
    c.fillStyle = text; c.font = `800 32px ${FONT}`; const vl = wrap(c, v, w0, 2);
    vl.forEach((l, i) => c.fillText(l, x0, y + 34 + i * 34)); return vl.length;
  };
  const pairs = [[['TARIKH', d.when], ['MASA', d.time]], [['TEMPAT', d.venue], ['YURAN', d.fee]]];
  for (const pr of pairs) {
    const items = pr.filter(r => r[1]); if (!items.length || y > qrY - 70) continue;
    const half = colW * .62;
    const n = items.length === 2 ? Math.max(cell(items[0][0], items[0][1], M, half - 20), cell(items[1][0], items[1][1], M + half, colW - half)) : cell(items[0][0], items[0][1], M, colW);
    y += 34 * n + 24;
  }
  const prizes = (d.prizes || []).slice(0, 3);
  if (prizes.length && y < qrY - 70) {
    c.font = `700 19px ${MONO}`; c.fillStyle = ink2; c.fillText('HADIAH', M, y); y += 32;
    c.font = `700 25px ${FONT}`; c.fillStyle = text;
    for (const [i, p] of prizes.entries()) { if (y > qrY - 34) break; c.fillText(`${['①', '②', '③'][i]}  ${wrap(c, p, colW - 50, 1)[0]}`, M, y); y += 33; }
    y += 8;
  }
  if (d.note && y < qrY - 40) { c.font = `500 22px ${MONO}`; c.fillStyle = soft; wrap(c, d.note, colW, 2).forEach(l => { if (y < qrY - 10) { c.fillText(l, M, y); y += 30; } }); }
  // bawah: seruan + QR
  const qx = W - M - qrS, by2 = H - M;
  c.fillStyle = text; c.fillRect(M, qrY - 24, W - 2 * M - qrS - 30, 3);
  c.fillStyle = dark ? '#fff' : ink1;
  const cta = d.status ? 'IMBAS & SAKSIKAN' : 'DAFTAR SEKARANG';
  const ctaS = Math.min(96, 96 * (W - 2 * M - qrS - 50) / cw(c, cta + ' →', 96));
  if (dark) { c.save(); c.shadowColor = ink1; c.shadowBlur = 24; ctext(c, cta + ' →', M - 2, qrY + ctaS * .82, ctaS); c.restore(); } else ctext(c, cta + ' →', M - 2, qrY + ctaS * .82, ctaS);
  c.font = `700 24px ${MONO}`; c.fillStyle = dark ? ink2 : ink2;
  let ly = qrY + ctaS + 34; [d.slots, d.countdown].filter(Boolean).forEach(t2 => { c.fillText(t2.toUpperCase(), M, ly); ly += 34; });
  c.font = `500 18px ${MONO}`; c.fillStyle = soft; c.fillText(d.url.replace(/^https?:\/\//, ''), M, by2 - 2);
  // kad QR
  c.save(); if (dark) { c.shadowColor = ink2; c.shadowBlur = 40; }
  c.fillStyle = '#fff'; rr(c, qx - 14, qrY - 14, qrS + 28, qrS + 28, 18); c.fill(); c.restore();
  drawQR(c, d.url, qx, qrY, qrS);
  if (!dark) { c.strokeStyle = ink1; c.lineWidth = 4; rr(c, qx - 14, qrY - 14, qrS + 28, qrS + 28, 18); c.stroke(); }
  return new Promise(res => cv.toBlob(b => res(b), 'image/png'));
}
