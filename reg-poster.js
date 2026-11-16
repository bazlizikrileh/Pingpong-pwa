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
export async function makeRegPoster(d) {
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
