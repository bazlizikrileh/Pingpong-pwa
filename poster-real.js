// Poster pendaftaran "realistik": meja pingpong, raket & bola dilukis seperti foto (kanvas 1080×1350),
// 8 susun atur. Data sama seperti poster-kit (regPosterData dalam app.js).
const W = 1080, H = 1350;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const setF = (c, s, w = 800) => { c.font = `${w} ${s}px ${FONT}`; };
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
const loadImg = src => new Promise(ok => { if (!src) return ok(null); const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
// rawak boleh diulang (sama untuk poster yang sama)
const rnd = seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
export const REAL_NAMES = ['Meja & Kad', 'Warna Kelab', 'Kertas Krim', 'Arena Gelap', 'Kabur Sinematik', 'Tarikh Gergasi', 'Pukulan', 'Jaring'];

function wrap(c, text, maxW, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean), out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur);
  if (out.length > maxLines) { const k = out.slice(0, maxLines); let l = out.slice(maxLines - 1).join(' '); while (l.length > 1 && c.measureText(l + '…').width > maxW) l = l.slice(0, -1); k[maxLines - 1] = l + '…'; return k; }
  return out;
}
const fitOne = (c, s, maxW) => { s = String(s || ''); if (c.measureText(s).width <= maxW) return s; while (s.length > 1 && c.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; };
const lum = hex => { const h = String(hex || '').replace('#', ''); if (h.length < 6) return 0.5; const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); return (r * 0.299 + g * 0.587 + b * 0.114) / 255; };

// ---------- objek realistik ----------
function noise(c, x, y, w, h, n, col, R) { c.fillStyle = col; for (let i = 0; i < n; i++) c.fillRect(x + R() * w, y + R() * h, 1.6, 1.6); }
function softShadow(c, x, y, rx, ry, a = 0.45) {
  for (let i = 6; i >= 1; i--) { c.fillStyle = `rgba(0,0,0,${a / 7})`; c.beginPath(); c.ellipse(x, y, rx * (1 + i * 0.09), ry * (1 + i * 0.12), 0, 0, 7); c.fill(); }
}
function ball(c, x, y, r, orange = false, shadow = true, lift = 0.5) {
  if (shadow) softShadow(c, x + r * 0.45, y + r * (0.9 + lift), r * 0.95, r * 0.38, 0.5);
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r * 1.05);
  if (orange) { g.addColorStop(0, '#fff3dc'); g.addColorStop(0.35, '#ffb347'); g.addColorStop(1, '#d9661a'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f1f1ee'); g.addColorStop(1, '#bcbcb4'); }
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.14, -0.6, 0, 7); c.fill();
}
// raket: s = jejari bilah; rubber: warna getah
function paddle(c, x, y, s, rot, rubber = '#c8102e', shadow = true, R = Math.random) {
  c.save(); c.translate(x, y); c.rotate(rot);
  if (shadow) { c.save(); c.translate(s * 0.12, s * 0.16); softShadow(c, 0, s * 0.35, s * 0.95, s * 1.25, 0.55); c.restore(); }
  // pemegang (kayu, mengembang di hujung)
  const hy = s * 0.82, hl = s * 1.02;
  const hg = c.createLinearGradient(-s * 0.24, 0, s * 0.24, 0); hg.addColorStop(0, '#b77a43'); hg.addColorStop(0.45, '#e6b67f'); hg.addColorStop(1, '#8c5527');
  c.fillStyle = hg; c.beginPath(); c.moveTo(-s * 0.17, hy - s * 0.15); c.lineTo(s * 0.17, hy - s * 0.15); c.quadraticCurveTo(s * 0.2, hy + hl * 0.6, s * 0.26, hy + hl); c.lineTo(-s * 0.26, hy + hl); c.quadraticCurveTo(-s * 0.2, hy + hl * 0.6, -s * 0.17, hy - s * 0.15); c.fill();
  c.strokeStyle = 'rgba(90,50,20,.35)'; c.lineWidth = 1.5; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * s * 0.05, hy); c.quadraticCurveTo(i * s * 0.07, hy + hl * 0.5, i * s * 0.09, hy + hl); c.stroke(); }
  c.fillStyle = '#1b1b1b'; rr(c, -s * 0.1, hy + hl * 0.25, s * 0.2, s * 0.28, 6); c.fill();
  c.fillStyle = '#d4af37'; rr(c, -s * 0.07, hy + hl * 0.29, s * 0.14, s * 0.2, 4); c.fill();
  // bilah: tepi kayu + getah
  c.fillStyle = '#2b2118'; c.beginPath(); c.ellipse(0, 0, s * 1.02, s * 1.08, 0, 0, 7); c.fill();
  c.fillStyle = '#c99b63'; c.beginPath(); c.ellipse(0, 0, s * 0.995, s * 1.055, 0, 0, 7); c.fill();
  const rg = c.createRadialGradient(-s * 0.35, -s * 0.45, s * 0.1, 0, 0, s * 1.1);
  const light = rubber === '#1a1a1a' ? '#4a4a4a' : '#ff5a4e';
  rg.addColorStop(0, light); rg.addColorStop(1, rubber);
  c.fillStyle = rg; c.beginPath(); c.ellipse(0, 0, s * 0.96, s * 1.02, 0, 0, 7); c.fill();
  // tekstur getah
  c.save(); c.beginPath(); c.ellipse(0, 0, s * 0.96, s * 1.02, 0, 0, 7); c.clip();
  c.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 900; i++) c.fillRect((R() - 0.5) * 2 * s, (R() - 0.5) * 2.1 * s, 2, 2);
  const sh = c.createLinearGradient(-s, -s, s, s); sh.addColorStop(0, 'rgba(255,255,255,.22)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.28)');
  c.fillStyle = sh; c.fillRect(-s, -s * 1.1, s * 2, s * 2.2);
  c.restore();
  // logo getah kecil
  c.fillStyle = 'rgba(255,255,255,.55)'; rr(c, -s * 0.22, s * 0.62, s * 0.44, s * 0.13, 4); c.fill();
  c.restore();
}
// meja perspektif: cx, y atas, lebar atas/bawah, tinggi permukaan
function tablePersp(c, cx, ty, tw, bw, th, R, { net = true, thick = 0.05, legs = true, color = ['#1d5fb3', '#0e3c80'] } = {}) {
  const x1 = cx - tw / 2, x2 = cx + tw / 2, x3 = cx + bw / 2, x4 = cx - bw / 2, by = ty + th, d = bw * thick;
  softShadow(c, cx, by + d * 2.2, bw * 0.52, d * 1.6, 0.6);
  if (legs) { c.fillStyle = '#1e2125'; [[-0.42, 0], [0.42, 0]].forEach(([k]) => { c.fillRect(cx + k * bw - 10, by + d, 20, d * 3.2); }); }
  // tebal hadapan
  c.fillStyle = '#0a2a5c'; c.beginPath(); c.moveTo(x4, by); c.lineTo(x3, by); c.lineTo(x3, by + d); c.lineTo(x4, by + d); c.fill();
  // permukaan
  const g = c.createLinearGradient(0, ty, 0, by); g.addColorStop(0, color[1]); g.addColorStop(1, color[0]);
  c.fillStyle = g; c.beginPath(); c.moveTo(x1, ty); c.lineTo(x2, ty); c.lineTo(x3, by); c.lineTo(x4, by); c.closePath(); c.fill();
  c.save(); c.clip(); noise(c, x4, ty, bw, th, 2600, 'rgba(255,255,255,.035)', R);
  const sp = c.createRadialGradient(cx - bw * 0.15, ty + th * 0.35, 10, cx, ty + th * 0.4, bw * 0.7); sp.addColorStop(0, 'rgba(255,255,255,.18)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sp; c.fillRect(x4, ty, bw, th); c.restore();
  // garisan putih
  const L = (u, v) => [x1 + (x4 - x1) * v + ((x2 + (x3 - x2) * v) - (x1 + (x4 - x1) * v)) * u, ty + th * v];
  c.strokeStyle = '#f7f7f2'; c.lineCap = 'round';
  const seg = (a, b, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); };
  const e = 0.012; seg(L(e, e), L(1 - e, e), 3); seg(L(e, 1 - e), L(1 - e, 1 - e), 7); seg(L(e, e), L(e, 1 - e), 5); seg(L(1 - e, e), L(1 - e, 1 - e), 5); seg(L(0.5, e), L(0.5, 1 - e), 3);
  // jaring
  if (net) {
    const v = 0.46, [nx1, ny] = L(-0.04, v), [nx2] = L(1.04, v), nh = (bw * 0.08) * (0.55 + 0.45 * v);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(nx1, ny + 2, nx2 - nx1, 8);
    c.fillStyle = 'rgba(20,20,24,.55)'; c.fillRect(nx1, ny - nh, nx2 - nx1, nh);
    c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1;
    for (let x = nx1; x < nx2; x += 9) { c.beginPath(); c.moveTo(x, ny - nh); c.lineTo(x, ny); c.stroke(); }
    for (let y = ny - nh; y < ny; y += 9) { c.beginPath(); c.moveTo(nx1, y); c.lineTo(nx2, y); c.stroke(); }
    c.fillStyle = '#fbfbf7'; c.fillRect(nx1, ny - nh - 6, nx2 - nx1, 8);
    c.fillStyle = '#2f3237'; [nx1 - 8, nx2].forEach(px => { c.fillRect(px, ny - nh - 10, 8, nh + 14); });
  }
  return L;
}
// meja dari atas (pandangan burung)
function tableTop(c, x, y, w, h, R, { color = ['#1d5fb3', '#123f86'], netH = true } = {}) {
  softShadow(c, x + w / 2 + 12, y + h / 2 + 18, w * 0.5, h * 0.5, 0.32);
  const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, color[0]); g.addColorStop(1, color[1]);
  c.fillStyle = g; c.fillRect(x, y, w, h);
  noise(c, x, y, w, h, 3000, 'rgba(255,255,255,.035)', R);
  const sp = c.createRadialGradient(x + w * 0.35, y + h * 0.3, 10, x + w * 0.4, y + h * 0.35, Math.max(w, h) * 0.8); sp.addColorStop(0, 'rgba(255,255,255,.16)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sp; c.fillRect(x, y, w, h);
  c.strokeStyle = '#f7f7f2'; c.lineWidth = Math.max(5, w * 0.012); c.strokeRect(x + c.lineWidth / 2, y + c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth);
  c.lineWidth = Math.max(3, w * 0.006);
  if (netH) { c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); c.stroke(); const ny = y + h / 2; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 20, ny + 4, w + 40, 16); c.fillStyle = '#27292e'; c.fillRect(x - 20, ny - 8, w + 40, 14); c.fillStyle = '#fbfbf7'; c.fillRect(x - 20, ny - 10, w + 40, 5); c.fillStyle = '#3a3d43'; c.fillRect(x - 34, ny - 16, 18, 30); c.fillRect(x + w + 16, ny - 16, 18, 30); }
  else { c.beginPath(); c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2); c.stroke(); const nx = x + w / 2; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(nx + 4, y - 20, 16, h + 40); c.fillStyle = '#27292e'; c.fillRect(nx - 8, y - 20, 14, h + 40); c.fillStyle = '#fbfbf7'; c.fillRect(nx - 10, y - 20, 5, h + 40); }
}
function floor(c, x, y, w, h, kind = 'dark', R) {
  if (kind === 'wood') {
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#6b3f1f'); g.addColorStop(1, '#3c2210'); c.fillStyle = g; c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 2; for (let i = 0; i < w; i += 90) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i - 120, y + h); c.stroke(); }
    noise(c, x, y, w, h, 3000, 'rgba(255,220,180,.04)', R);
  } else {
    const g = c.createRadialGradient(x + w / 2, y + h * 0.35, 20, x + w / 2, y + h * 0.5, Math.max(w, h) * 0.8); g.addColorStop(0, '#2b3446'); g.addColorStop(1, '#07090f');
    c.fillStyle = g; c.fillRect(x, y, w, h); noise(c, x, y, w, h, 4000, 'rgba(255,255,255,.025)', R);
  }
}
function vignette(c, a = 0.55) { const g = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.8); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }

// ---------- teks & kad maklumat ----------
function titleBlock(c, title, x, y, maxW, { size = 110, color = '#fff', accent = '#ff7a1a', lines = 4, align = 'left', lh = 0.98, minSize = 58 } = {}) {
  let s = size, ls;
  for (; s >= minSize; s -= 3) { setF(c, s, 900); const all = wrap(c, String(title).toUpperCase(), maxW, 99); ls = all; if (all.length <= lines && all.every(l => c.measureText(l).width <= maxW)) break; }
  if (ls.length > lines) { setF(c, s, 900); ls = wrap(c, String(title).toUpperCase(), maxW, lines); }
  c.textAlign = align; const ax = align === 'center' ? x + maxW / 2 : x;
  // perkataan terakhir (cth. tahun) diwarnakan aksen
  ls.forEach((l, i) => {
    const yy = y + s * 0.82 + i * s * lh, last = i === ls.length - 1, words = l.split(' ');
    if (last && words.length > 1 && /\d{4}|[A-Z]{3,}/.test(words[words.length - 1]) && align === 'left') {
      const head = words.slice(0, -1).join(' ') + ' '; c.fillStyle = color; c.fillText(head, ax, yy); c.fillStyle = accent; c.fillText(words[words.length - 1], ax + c.measureText(head).width, yy);
    } else if (last && align !== 'left' && ls.length > 1) { c.fillStyle = accent; c.fillText(l, ax, yy); }
    else { c.fillStyle = color; c.fillText(l, ax, yy); }
  });
  c.textAlign = 'left';
  return y + ls.length * s * lh + s * 0.1;
}
function subLine(d) { return [d.format, d.hc].filter(Boolean).join(' · ').toUpperCase(); }
function drawQR(c, text, x, y, size) {
  const q = window.__qrLib(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 2, cell = size / (n + m * 2);
  c.fillStyle = '#fff'; c.fillRect(x, y, size, size); c.fillStyle = '#0b1220';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(Math.floor(x + (k + m) * cell), Math.floor(y + (r + m) * cell), Math.ceil(cell), Math.ceil(cell));
}
function qrCard(c, d, x, y, s = 230, dark = false) {
  const pad = 16, h = s + 66;
  c.save(); c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = 24; c.shadowOffsetY = 8;
  c.fillStyle = dark ? '#111318' : '#fff'; rr(c, x, y, s + pad * 2, h, 22); c.fill(); c.restore();
  drawQR(c, d.url, x + pad, y + pad, s);
  c.fillStyle = dark ? '#fff' : '#111318'; setF(c, 22, 900); c.textAlign = 'center';
  c.fillText(d.status ? (d.status === 'TEMPAT PENUH' ? 'TEMPAT PENUH' : 'IMBAS UNTUK LIHAT') : 'DAFTAR SEKARANG', x + pad + s / 2, y + s + pad + 36); c.textAlign = 'left';
  return [s + pad * 2, h];
}
// grid TARIKH / MASA / TEMPAT / YURAN + hadiah bernombor
function infoGrid(c, d, x, y, w, { label = '#ff7a1a', text = '#111318', prizeCol = '#ff7a1a', compact = false, maxY = H - 50 } = {}) {
  const cells = [['TARIKH', d.when], ['MASA', d.time], ['TEMPAT', d.venue], ['YURAN', d.fee]].filter(z => z[1]);
  const colW = w / 2, lh = compact ? 34 : 38; let yy = y;
  for (let i = 0; i < cells.length; i += 2) {
    let hMax = 0;
    cells.slice(i, i + 2).forEach(([k, v], j) => {
      const xx = x + j * colW; c.fillStyle = label; setF(c, 20, 900); c.fillText(k, xx, yy);
      c.fillStyle = text; setF(c, compact ? 30 : 34, 800); const ls = wrap(c, v, colW - 20, 2); ls.forEach((l, n) => c.fillText(l, xx, yy + 38 + n * lh)); hMax = Math.max(hMax, 38 + ls.length * lh);
    });
    yy += hMax + 16;
  }
  const P = (d.prizes || []).slice(0, 3);
  P.forEach((p, i) => { if (yy + 14 > maxY) return; c.fillStyle = prizeCol; c.beginPath(); c.arc(x + 13, yy + 2, 13, 0, 7); c.fill(); c.fillStyle = '#fff'; setF(c, 16, 900); c.textAlign = 'center'; c.fillText(String(i + 1), x + 13, yy + 8); c.textAlign = 'left';
    c.fillStyle = text; setF(c, 24, 700); c.fillText(fitOne(c, p, w - 40), x + 36, yy + 10); yy += 38; });
  return yy;
}
async function logosAt(c, d, x, y, h) { const ims = (await Promise.all((d.logos || []).map(loadImg))).filter(Boolean); let xx = x; ims.forEach(im => { const w = h * im.width / im.height; c.drawImage(im, xx, y, w, h); xx += w + 14; }); return xx; }
function chip(c, text, x, y, bg, fg, size = 22, maxW = 900) { setF(c, size, 900); text = fitOne(c, text, maxW); const w = c.measureText(text).width + size * 1.4; c.fillStyle = bg; rr(c, x, y, w, size * 1.7, size * 0.85); c.fill(); c.fillStyle = fg; c.fillText(text, x + size * 0.7, y + size * 1.2); return w; }
function footer(c, col = 'rgba(255,255,255,.5)') { c.fillStyle = col; setF(c, 18, 600); c.textAlign = 'center'; c.fillText('🏓 Pingpong Portal', W / 2, H - 18); c.textAlign = 'left'; }

// ---------- 8 susun atur ----------
const LAY = [
  // 1 · Meja dari atas memenuhi atas + kad krim bertindih
  async (c, d, A, R) => {
    floor(c, 0, 0, W, H, 'wood', R);
    tableTop(c, 150, -80, 780, 900, R, { netH: false });
    ball(c, 360, 300, 26); ball(c, 720, 520, 26, true); paddle(c, 760, 210, 120, 0.7, '#c8102e', true, R); paddle(c, 300, 560, 115, -2.4, '#1a1a1a', true, R);
    vignette(c, 0.45);
    if ((d.logos || []).length) { const lg = (await Promise.all(d.logos.map(loadImg))).filter(Boolean)[0]; if (lg) { c.fillStyle = 'rgba(255,255,255,.92)'; c.beginPath(); c.arc(W / 2, 74, 54, 0, 7); c.fill(); const w = 80 * lg.width / lg.height; c.drawImage(lg, W / 2 - w / 2, 34, w, 80); } }
    const cy = 610; c.save(); c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 40; c.fillStyle = '#fbf6ec'; rr(c, 40, cy, W - 80, H - cy - 40, 30); c.fill(); c.restore();
    c.fillStyle = A; rr(c, 40, cy, W - 80, 10, 5); c.fill();
    c.fillStyle = A; setF(c, 24, 900); c.fillText(fitOne(c, (d.clubShort || d.club || '').toUpperCase(), 600), 90, cy + 66);
    let y = titleBlock(c, d.title, 90, cy + 80, W - 180, { size: 76, color: '#14161b', accent: A, lines: 3, minSize: 50 });
    c.fillStyle = '#5b5e66'; setF(c, 24, 800); c.fillText(fitOne(c, subLine(d), W - 180), 90, y + 10);
    infoGrid(c, d, 90, y + 66, 560, { label: A, prizeCol: A, compact: true, maxY: H - 56 });
    qrCard(c, d, W - 330, H - 40 - 330, 220);
  },
  // 2 · Warna kelab, tajuk besar kiri, meja terpotong di kanan, kad putih bawah
  async (c, d, A, R, T) => {
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, T.hd2); g.addColorStop(1, T.hd1); c.fillStyle = g; c.fillRect(0, 0, W, H);
    noise(c, 0, 0, W, H, 5000, 'rgba(255,255,255,.03)', R);
    c.save(); c.translate(W + 60, 360); c.rotate(0.32); tableTop(c, -330, -380, 560, 900, R, { netH: true }); c.restore();
    ball(c, 690, 560, 24, true); paddle(c, 820, 900, 120, -0.4, '#c8102e', true, R);
    const g2 = c.createLinearGradient(0, 0, W * 0.75, 0); g2.addColorStop(0, T.hd1); g2.addColorStop(0.55, 'rgba(0,0,0,0)'); c.fillStyle = g2; c.globalAlpha = 0.85; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    await logosAt(c, d, 70, 70, 96);
    c.fillStyle = 'rgba(255,255,255,.85)'; setF(c, 24, 800); wrap(c, (d.club || '').toUpperCase(), 560, 2).forEach((l, i) => c.fillText(l, 70, 210 + i * 32));
    let y = titleBlock(c, d.title, 70, 280, 620, { size: 100, color: '#fff', accent: A, lines: 4, minSize: 56 });
    chip(c, subLine(d), 70, y + 10, 'rgba(255,255,255,.14)', '#fff', 20, 560);
    const cy = 860; c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 40; c.fillStyle = '#fff'; rr(c, 50, cy, W - 100, H - cy - 50, 30); c.fill(); c.restore();
    infoGrid(c, d, 100, cy + 70, 560, { label: T.hd2, prizeCol: A, compact: true, maxY: H - 70 });
    qrCard(c, d, W - 340, cy + 40, 210);
  },
  // 3 · Kertas krim, meja dari atas di tengah, bucu bola
  async (c, d, A, R) => {
    c.fillStyle = '#f5ecd9'; c.fillRect(0, 0, W, H); noise(c, 0, 0, W, H, 9000, 'rgba(120,90,40,.05)', R);
    c.strokeStyle = '#3b2a17'; c.lineWidth = 3; c.strokeRect(36, 36, W - 72, H - 72);
    [[70, 70], [W - 70, 70], [70, H - 70], [W - 70, H - 70]].forEach(([x, y], i) => ball(c, x, y, 22, i % 2 === 0, false));
    const lx = await logosAt(c, d, W / 2 - 40, 80, 80); if (lx === W / 2 - 40) {/* tiada logo */}
    c.fillStyle = '#7a4b1c'; setF(c, 22, 900); c.textAlign = 'center'; c.fillText(fitOne(c, (d.club || '').toUpperCase(), W - 200), W / 2, 196); c.textAlign = 'left';
    let y = titleBlock(c, d.title, 100, 210, W - 200, { size: 84, color: '#1c140b', accent: A, lines: 3, align: 'center', minSize: 50 });
    c.save(); c.translate(W / 2, y + 190); c.rotate(-0.12); tableTop(c, -220, -140, 440, 280, R, { netH: false }); c.restore();
    ball(c, W / 2 + 100, y + 160, 18, true); paddle(c, W / 2 - 270, y + 130, 70, -0.5, '#c8102e', true, R);
    y += 390;
    c.textAlign = 'center'; c.fillStyle = A; setF(c, 24, 900); c.fillText(fitOne(c, subLine(d), W - 200), W / 2, y);
    c.fillStyle = '#1c140b'; setF(c, 46, 900); c.fillText(fitOne(c, [d.when, d.time].filter(Boolean).join(' · '), W - 160), W / 2, y + 62);
    c.fillStyle = '#4a3a28'; setF(c, 28, 600); c.fillText(fitOne(c, [d.venue, d.fee ? 'Yuran ' + d.fee : ''].filter(Boolean).join(' · '), W - 160), W / 2, y + 106);
    if ((d.prizes || []).length) { setF(c, 24, 700); c.fillText(fitOne(c, '🏆 ' + d.prizes.slice(0, 2).join(' · '), W - 160), W / 2, y + 146); }
    c.textAlign = 'left'; qrCard(c, d, W / 2 - 106, Math.max(y + 170, H - 320), 180);
  },
  // 4 · Arena gelap, meja perspektif di bawah, tajuk atas
  async (c, d, A, R) => {
    floor(c, 0, 0, W, H, 'dark', R);
    const sp = c.createRadialGradient(W / 2, 0, 20, W / 2, 300, 900); sp.addColorStop(0, 'rgba(255,255,255,.18)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = sp; c.fillRect(0, 0, W, H);
    tablePersp(c, W / 2, 640, 640, 1150, 470, R);
    ball(c, 420, 760, 18, false, true, 1.6); ball(c, 640, 930, 24, true, true, 0.4); paddle(c, 820, 1020, 105, 2.5, '#c8102e', true, R); paddle(c, 220, 860, 90, -2.2, '#1a1a1a', true, R);
    const fg = c.createLinearGradient(0, 960, 0, H); fg.addColorStop(0, 'rgba(7,9,15,0)'); fg.addColorStop(0.45, 'rgba(7,9,15,.88)'); fg.addColorStop(1, 'rgba(7,9,15,.97)'); c.fillStyle = fg; c.fillRect(0, 960, W, H - 960);
    const lx = await logosAt(c, d, 70, 60, 80);
    c.fillStyle = 'rgba(255,255,255,.85)'; setF(c, 22, 800); wrap(c, (d.club || '').toUpperCase(), W - lx - 90, 2).forEach((l, i) => c.fillText(l, lx + 10, 92 + i * 30));
    chip(c, '● PERTANDINGAN PINGPONG', 70, 168, A, lum(A) > 0.6 ? '#111' : '#fff', 20);
    let y = titleBlock(c, d.title, 70, 230, W - 140, { size: 96, color: '#fff', accent: A, lines: 3, minSize: 56 });
    c.fillStyle = 'rgba(255,255,255,.75)'; setF(c, 24, 800); c.fillText(fitOne(c, subLine(d), W - 140), 70, y + 12);
    infoGrid(c, d, 70, 1060, 600, { label: A, text: '#fff', prizeCol: A, compact: true, maxY: H - 50 });
    qrCard(c, d, W - 320, H - 330, 210);
  },
  // 5 · Kabur sinematik: raket & bola dekat (kabur), tajuk dengan baris aksen
  async (c, d, A, R) => {
    const off = document.createElement('canvas'); off.width = W / 6; off.height = H / 6; const o = off.getContext('2d'); o.scale(1 / 6, 1 / 6);
    floor(o, 0, 0, W, H, 'dark', R); paddle(o, 860, 420, 300, 0.5, '#c8102e', true, R); paddle(o, 180, 980, 260, -2.6, '#1a1a1a', true, R); ball(o, 520, 1140, 110); ball(o, 940, 1150, 70, true);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(off, 0, 0, W, H);
    ball(c, 900, 1020, 64, true); paddle(c, 950, 1160, 150, -0.6, '#1a1a1a', true, R);
    const dk = c.createLinearGradient(0, 0, W, 0); dk.addColorStop(0, 'rgba(5,6,10,.9)'); dk.addColorStop(0.7, 'rgba(5,6,10,.25)'); c.fillStyle = dk; c.fillRect(0, 0, W, H);
    const lx = await logosAt(c, d, 70, 60, 86);
    c.fillStyle = A; c.fillRect(70, 190, 90, 8);
    // baris tengah tajuk diwarna aksen
    let s = 96, L2; for (; s >= 56; s -= 3) { setF(c, s, 900); L2 = wrap(c, String(d.title).toUpperCase(), W - 160, 99); if (L2.length <= 4) break; }
    if (L2.length > 4) L2 = wrap(c, String(d.title).toUpperCase(), W - 160, 4); L2.forEach((l, i) => { c.fillStyle = i > 0 && i < L2.length ? (i === L2.length - 1 ? A : (i === 1 ? A : '#fff')) : '#fff'; if (L2.length <= 2 && i === 1) c.fillStyle = A; c.fillText(l, 70, 230 + s * 0.82 + i * s * 0.98); });
    let y = 230 + L2.length * s * 0.98 + 20;
    c.fillStyle = 'rgba(255,255,255,.75)'; setF(c, 24, 800); wrap(c, subLine(d), 620, 2).forEach((l, i) => c.fillText(l, 70, y + i * 32));
    infoGrid(c, d, 70, Math.max(y + 100, 760), 600, { label: A, text: '#fff', prizeCol: A, compact: true, maxY: H - 50 });
    qrCard(c, d, W - 320, H - 330, 210);
    void lx;
  },
  // 6 · Tarikh gergasi + bulatan dekat raket/bola
  async (c, d, A, R) => {
    c.fillStyle = '#f6f1e7'; c.fillRect(0, 0, W, H); noise(c, 0, 0, W, H, 6000, 'rgba(0,0,0,.025)', R);
    // bulatan foto dekat
    const cx = 850, cy = 400, cr = 270;
    c.save(); c.beginPath(); c.arc(cx, cy, cr, 0, 7); c.clip();
    tableTop(c, cx - 520, cy - 420, 1000, 800, R, { netH: false }); paddle(c, cx - 40, cy + 40, 210, 0.9, '#c8102e', true, R); ball(c, cx - 210, cy - 120, 46, true); ball(c, cx + 170, cy + 210, 38);
    c.restore();
    c.strokeStyle = A; c.lineWidth = 14; c.beginPath(); c.arc(cx, cy, cr + 22, Math.PI * 0.55, Math.PI * 1.45); c.stroke();
    await logosAt(c, d, 70, 60, 74);
    const dp = d.dateParts || {};
    c.fillStyle = '#121317'; setF(c, 230, 900); c.fillText(dp.day || '', 56, 440);
    const dw = c.measureText(dp.day || '').width, dx = 70 + dw;
    c.fillStyle = A; setF(c, 64, 900); c.fillText(dp.mon || '', dx, 330);
    c.fillStyle = '#121317'; setF(c, 40, 900); c.fillText(dp.year || '', dx, 380);
    c.fillStyle = '#5b5e66'; setF(c, 24, 600); c.fillText(fitOne(c, [String(d.when || '').split(',')[0], d.time].filter(Boolean).join(' · '), cx - cr - 30 - dx), dx, 420);
    let y = titleBlock(c, d.title, 60, 720, W - 120, { size: 86, color: '#121317', accent: A, lines: 3, minSize: 50 });
    c.fillStyle = A; setF(c, 24, 900); c.fillText(fitOne(c, subLine(d), W - 120), 60, y + 10);
    c.fillStyle = '#121317'; c.fillRect(60, y + 30, W - 120, 3);
    infoGrid(c, d, 60, y + 82, 580, { label: A, prizeCol: A, compact: true, maxY: H - 50 });
    qrCard(c, d, W - 320, H - 330, 210, true);
  },
  // 7 · Pukulan: raket menghentam bola dengan jejak laju, susunan pepenjuru
  async (c, d, A, R, T) => {
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0b0f1a'); g.addColorStop(1, T.hd1); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = A; c.beginPath(); c.moveTo(0, 820); c.lineTo(W, 560); c.lineTo(W, 700); c.lineTo(0, 960); c.fill();
    c.globalAlpha = 0.18; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, 990); c.lineTo(W, 730); c.lineTo(W, 744); c.lineTo(0, 1004); c.fill(); c.globalAlpha = 1;
    // jejak bola
    for (let i = 14; i >= 1; i--) { c.fillStyle = `rgba(255,190,110,${0.05 + 0.03 * (14 - i) / 14})`; c.beginPath(); c.arc(670 - i * 34, 230 + i * 18, 30 - i * 1.2, 0, 7); c.fill(); }
    for (let i = 0; i < 7; i++) { c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 4; c.beginPath(); c.moveTo(770 + i * 14, 150 - i * 18); c.lineTo(900 + i * 20, 110 - i * 24); c.stroke(); }
    paddle(c, 860, 300, 165, 0.85, '#c8102e', true, R); ball(c, 680, 230, 34, true, false);
    // kilatan hentaman
    const fl = c.createRadialGradient(715, 245, 4, 715, 245, 130); fl.addColorStop(0, 'rgba(255,255,255,.6)'); fl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = fl; c.fillRect(570, 100, 300, 300);
    await logosAt(c, d, 70, 60, 84);
    c.fillStyle = 'rgba(255,255,255,.8)'; setF(c, 22, 800); wrap(c, (d.club || '').toUpperCase(), 520, 2).forEach((l, i) => c.fillText(l, 70, 190 + i * 30));
    let y = titleBlock(c, d.title, 70, 470, W - 140, { size: 100, color: '#fff', accent: lum(A) > 0.55 ? '#fff' : '#ffd166', lines: 3, minSize: 56 });
    c.fillStyle = '#fff'; setF(c, 24, 800); c.fillText(fitOne(c, subLine(d), W - 140), 70, Math.max(y + 10, 0));
    const cy = 1020; c.fillStyle = '#fff'; rr(c, 50, cy, W - 100, H - cy - 46, 28); c.fill();
    infoGrid(c, d, 100, cy + 60, 560, { label: T.hd2, prizeCol: A, compact: true });
    qrCard(c, d, W - 320, cy + 20, 190);
  },
  // 8 · Jaring: sudut rendah ke jaring dengan bola, tajuk di atas
  async (c, d, A, R) => {
    floor(c, 0, 0, W, H, 'dark', R);
    const L = tablePersp(c, W / 2, 470, 1500, 2300, 760, R, { net: true, legs: false });
    ball(c, 470, 640, 32, true, true, 1.2); ball(c, 760, 820, 22, false, true, 0.6); paddle(c, 260, 1040, 120, -0.5, '#1a1a1a', true, R);
    void L;
    const top = c.createLinearGradient(0, 0, 0, 640); top.addColorStop(0, 'rgba(7,9,15,.97)'); top.addColorStop(1, 'rgba(7,9,15,0)'); c.fillStyle = top; c.fillRect(0, 0, W, 640);
    const bot = c.createLinearGradient(0, 900, 0, H); bot.addColorStop(0, 'rgba(7,9,15,0)'); bot.addColorStop(0.5, 'rgba(7,9,15,.9)'); bot.addColorStop(1, 'rgba(7,9,15,.97)'); c.fillStyle = bot; c.fillRect(0, 900, W, H - 900);
    await logosAt(c, d, W / 2 - 42, 50, 84);
    c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.8)'; setF(c, 22, 800); c.fillText(fitOne(c, (d.club || '').toUpperCase(), W - 140), W / 2, 170); c.textAlign = 'left';
    let y = titleBlock(c, d.title, 70, 190, W - 140, { size: 92, color: '#fff', accent: A, lines: 3, align: 'center', minSize: 54 });
    c.textAlign = 'center'; c.fillStyle = A; setF(c, 24, 900); c.fillText(fitOne(c, subLine(d), W - 140), W / 2, y + 12); c.textAlign = 'left';
    infoGrid(c, d, 70, 1050, 600, { label: A, text: '#fff', prizeCol: A, compact: true, maxY: H - 50 });
    qrCard(c, d, W - 320, H - 330, 210);
  },
];

export async function makeRealPoster(d, n = 1) {
  if (!window.__qrLib) window.__qrLib = (await import('./vendor/qrcode.js')).default;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const T = { hd1: css('--hd1') || '#0b1a3f', hd2: css('--hd2') || '#1d3f8c', or: css('--or') || '#ff7a1a' };
  // aksen: warna kelab jika cukup terang, jika tidak jingga
  const A = lum(T.or) > 0.25 ? T.or : '#ff7a1a';
  let seed = 7; for (const ch of String(d.url || '') + n) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const R = rnd(seed || 11);
  c.textBaseline = 'alphabetic';
  await LAY[(n - 1) % LAY.length](c, d, A, R, T);
  footer(c, n === 3 || n === 6 ? 'rgba(0,0,0,.4)' : 'rgba(255,255,255,.5)');
  return new Promise(res => cv.toBlob(b => res(b), 'image/png'));
}

// ---------- Latar banner: gambar sahaja (tiada teks/logo/QR), saiz lebar 1200×480 ----------
// Objek diletak ke kanan supaya teks banner di kiri kekal jelas.
const SW = 1200, SH = 480;
const SCENE = [
  (c, R) => { floor(c, 0, 0, SW, SH, 'wood', R); c.save(); c.translate(860, 240); c.rotate(-1.25); tableTop(c, -260, -330, 520, 660, R, { netH: false }); c.restore();
    ball(c, 700, 150, 22); ball(c, 1010, 330, 22, true); paddle(c, 1080, 120, 95, 0.7, '#c8102e', true, R); paddle(c, 640, 380, 90, -2.4, '#1a1a1a', true, R); },
  (c, R, T) => { const g = c.createLinearGradient(0, 0, SW, SH); g.addColorStop(0, T.hd2); g.addColorStop(1, T.hd1); c.fillStyle = g; c.fillRect(0, 0, SW, SH);
    noise(c, 0, 0, SW, SH, 3000, 'rgba(255,255,255,.03)', R); c.save(); c.translate(1010, 200); c.rotate(0.32); tableTop(c, -230, -300, 420, 680, R, { netH: true }); c.restore();
    ball(c, 760, 300, 22, true); paddle(c, 860, 140, 100, -0.4, '#c8102e', true, R); },
  (c, R) => { c.fillStyle = '#f5ecd9'; c.fillRect(0, 0, SW, SH); noise(c, 0, 0, SW, SH, 6000, 'rgba(120,90,40,.05)', R);
    c.save(); c.translate(900, 250); c.rotate(-0.12); tableTop(c, -230, -140, 460, 280, R, { netH: false }); c.restore();
    ball(c, 1010, 200, 18, true); paddle(c, 640, 250, 75, -0.5, '#c8102e', true, R); [[1150, 50], [1150, 430], [560, 50], [560, 430]].forEach(([x, y], i) => ball(c, x, y, 18, i % 2 === 0, false)); },
  (c, R) => { floor(c, 0, 0, SW, SH, 'dark', R);
    const sp = c.createRadialGradient(850, 0, 20, 850, 160, 520); sp.addColorStop(0, 'rgba(255,255,255,.2)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = sp; c.fillRect(0, 0, SW, SH);
    tablePersp(c, 850, 170, 420, 760, 230, R); ball(c, 760, 230, 14, false, true, 1.6); ball(c, 930, 330, 18, true, true, 0.4); paddle(c, 1110, 360, 80, 2.5, '#c8102e', true, R); paddle(c, 560, 330, 70, -2.2, '#1a1a1a', true, R); },
  (c, R) => { const off = document.createElement('canvas'); off.width = SW / 6; off.height = SH / 6; const o = off.getContext('2d'); o.scale(1 / 6, 1 / 6);
    floor(o, 0, 0, SW, SH, 'dark', R); paddle(o, 980, 160, 220, 0.5, '#c8102e', true, R); paddle(o, 620, 380, 180, -2.6, '#1a1a1a', true, R); ball(o, 800, 420, 80); ball(o, 1140, 380, 55, true);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(off, 0, 0, SW, SH); ball(c, 1000, 300, 48, true); paddle(c, 1100, 400, 110, -0.6, '#1a1a1a', true, R); },
  (c, R, T, A) => { c.fillStyle = '#f6f1e7'; c.fillRect(0, 0, SW, SH); noise(c, 0, 0, SW, SH, 4000, 'rgba(0,0,0,.025)', R);
    const cx = 930, cy = 240, cr = 190; c.save(); c.beginPath(); c.arc(cx, cy, cr, 0, 7); c.clip();
    tableTop(c, cx - 380, cy - 300, 720, 580, R, { netH: false }); paddle(c, cx - 30, cy + 30, 150, 0.9, '#c8102e', true, R); ball(c, cx - 150, cy - 90, 34, true); ball(c, cx + 120, cy + 150, 28); c.restore();
    c.strokeStyle = A; c.lineWidth = 12; c.beginPath(); c.arc(cx, cy, cr + 18, Math.PI * 0.55, Math.PI * 1.45); c.stroke(); },
  (c, R, T, A) => { const g = c.createLinearGradient(0, 0, SW, SH); g.addColorStop(0, '#0b0f1a'); g.addColorStop(1, T.hd1); c.fillStyle = g; c.fillRect(0, 0, SW, SH);
    c.fillStyle = A; c.beginPath(); c.moveTo(0, 400); c.lineTo(SW, 200); c.lineTo(SW, 290); c.lineTo(0, 490); c.fill();
    for (let i = 14; i >= 1; i--) { c.fillStyle = `rgba(255,190,110,${0.05 + 0.03 * (14 - i) / 14})`; c.beginPath(); c.arc(900 - i * 30, 170 + i * 14, 26 - i * 1.1, 0, 7); c.fill(); }
    paddle(c, 1070, 210, 130, 0.85, '#c8102e', true, R); ball(c, 910, 165, 28, true, false);
    const fl = c.createRadialGradient(945, 175, 4, 945, 175, 110); fl.addColorStop(0, 'rgba(255,255,255,.55)'); fl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = fl; c.fillRect(830, 60, 240, 240); },
  (c, R) => { floor(c, 0, 0, SW, SH, 'dark', R); tablePersp(c, 820, 230, 900, 1500, 360, R, { net: true, legs: false });
    ball(c, 720, 300, 24, true, true, 1.2); ball(c, 960, 380, 18, false, true, 0.6); paddle(c, 1110, 300, 90, -0.5, '#1a1a1a', true, R); },
];
export async function makeScene(n = 1) {
  const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH; const c = cv.getContext('2d');
  const T = { hd1: css('--hd1') || '#0b1a3f', hd2: css('--hd2') || '#1d3f8c', or: css('--or') || '#ff7a1a' };
  const A = lum(T.or) > 0.25 ? T.or : '#ff7a1a', R = rnd(97 + n * 131);
  SCENE[(n - 1) % SCENE.length](c, R, T, A);
  return cv;
}
