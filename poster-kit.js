// Kit poster: 5 susun atur × 5 rawatan visual = 25 gaya. Semua ilustrasi (bet, bola, meja, pemain) dilukis dengan kod.
import qrcode from './vendor/qrcode.js';
const W = 1080, H = 1350, M = 70;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace';
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const lum = hex => { const h = String(hex).replace('#', ''); if (h.length < 6) return 128; const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); return r * .299 + g * .587 + b * .114; };
const alpha = (hex, a) => { const h = String(hex).replace('#', ''); if (h.length < 6) return hex; const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); return `rgba(${r},${g},${b},${a})`; };
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
const font = (c, size, w = 700, fam = FONT) => (c.font = `${w} ${Math.round(size)}px ${fam}`);
function wrap(c, text, maxW, maxLines = 9) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; } }
    if (line) out.push(line);
  }
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}
// teks condensed (dimampat mendatar)
function ctext(c, s, x, y, size, { w = 900, sx = .76, align = 'left', fill = true, stroke = false } = {}) {
  c.save(); font(c, size, w); c.textAlign = 'left';
  const tw = c.measureText(s).width * sx, ox = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
  c.translate(ox, y); c.scale(sx, 1); if (fill) c.fillText(s, 0, 0); if (stroke) c.strokeText(s, 0, 0); c.restore(); return tw;
}
const cw = (c, s, size, w = 900, sx = .76) => { font(c, size, w); return c.measureText(s).width * sx; };
let SX = .76;
function fitTitle(c, text, maxW, maxH, maxLines = 4, sx = SX, start = 210) {
  sx = Math.max(sx, SX);
  const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
  for (let size = start; size >= 48; size -= 6) {
    const lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (cw(c, t, size, 900, sx) <= maxW || !line) line = t; else { lines.push(line); line = w; } }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every(l => cw(c, l, size, 900, sx) <= maxW) && lines.length * size * .9 <= maxH) return { size, lines };
  }
  return { size: 48, lines: [words.join(' ')] };
}
function drawQR(c, text, x, y, size) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), cell = size / (n + 2);
  c.fillStyle = '#fff'; c.fillRect(x, y, size, size); c.fillStyle = '#0b1220';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(Math.floor(x + (k + 1) * cell), Math.floor(y + (r + 1) * cell), Math.ceil(cell), Math.ceil(cell));
}
function rand(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------- Bentuk ilustrasi (Path2D) ----------
function capsule(p, x1, y1, x2, y2, r) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  p.moveTo(x1 + r * Math.cos(a + Math.PI / 2), y1 + r * Math.sin(a + Math.PI / 2));
  p.arc(x1, y1, r, a + Math.PI / 2, a - Math.PI / 2);
  p.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2); p.closePath();
}
const shapes = {
  ball(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); return [p]; },
  paddle(x, y, s, rot = -.5) {
    const tr = (px, py) => [x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot)];
    const blade = new Path2D(), handle = new Path2D();
    const N = 40; for (let i = 0; i <= N; i++) { const t = i / N * Math.PI * 2, [px, py] = tr(Math.cos(t) * s * .46, Math.sin(t) * s * .5 - s * .12); i ? blade.lineTo(px, py) : blade.moveTo(px, py); }
    blade.closePath();
    const [h1x, h1y] = tr(0, s * .3), [h2x, h2y] = tr(0, s * .78); capsule(handle, h1x, h1y, h2x, h2y, s * .085);
    return [blade, handle];
  },
  table(x, y, w) { // meja perspektif: permukaan + kaki + jaring
    const h = w * .34, top = new Path2D(), legs = new Path2D(), net = new Path2D(), lines = new Path2D();
    const inset = w * .16;
    top.moveTo(x + inset, y); top.lineTo(x + w - inset, y); top.lineTo(x + w, y + h); top.lineTo(x, y + h); top.closePath();
    const lw = w * .025; [[x + w * .06, y + h], [x + w * .94 - lw, y + h], [x + inset + w * .03, y + h * .4], [x + w - inset - w * .055, y + h * .4]].forEach(([lx, ly], i) => legs.rect(lx, ly, lw, i < 2 ? h * .75 : h * 1.1));
    lines.moveTo(x + w / 2, y); lines.lineTo(x + w / 2, y + h);
    net.rect(x + w * .04, y + h * .5 - h * .32, w * .92, h * .32);
    return { top, legs, net, lines, h };
  },
  player(x, y, hgt, mirror = false, pose = 0) {
    const P = pose ? { head: [.5, .09], neck: [.5, .2], hip: [.5, .52], fa: [[.55, .22], [.74, .2], [.84, .07]], ba: [[.46, .22], [.32, .33], [.36, .46]], fl: [[.53, .52], [.66, .72], [.62, .96]], bl: [[.46, .52], [.36, .74], [.24, .95]], pad: [.88, .02] }
      : { head: [.55, .09], neck: [.52, .2], hip: [.44, .52], fa: [[.55, .23], [.72, .34], [.88, .27]], ba: [[.48, .22], [.3, .3], [.2, .22]], fl: [[.47, .52], [.63, .71], [.68, .96]], bl: [[.41, .52], [.29, .72], [.14, .93]], pad: [.95, .2] };
    const T = ([px, py]) => [x + (mirror ? 1 - px : px) * hgt * .8, y + py * hgt];
    const body = new Path2D(), r = hgt * .045;
    const [hx, hy] = T(P.head); body.moveTo(hx + hgt * .075, hy); body.arc(hx, hy, hgt * .075, 0, Math.PI * 2);
    const seg = pts => { for (let i = 0; i < pts.length - 1; i++) { const [a1, b1] = T(pts[i]), [a2, b2] = T(pts[i + 1]); capsule(body, a1, b1, a2, b2, r); } };
    seg([P.neck, P.hip]); { const [a1, b1] = T(P.neck), [a2, b2] = T(P.hip); capsule(body, a1, b1, a2, b2, r * 1.6); }
    seg(P.fa); seg(P.ba); seg(P.fl); seg(P.bl);
    const [px, py] = T(P.pad); const pad = shapes.paddle(px, py, hgt * .17, mirror ? .7 : -.7);
    return [body, ...pad];
  },
};
// lukis senarai Path2D mengikut gaya rawatan
function paint(c, paths, T, col, opt = {}) {
  const [main, second] = Array.isArray(col) ? col : [col, col];
  c.save();
  if (T.illus === 'halftone') {
    paths.forEach((p, i) => { c.save(); c.clip(p); c.globalCompositeOperation = 'multiply'; const b = opt.box || [0, 0, W, H];
      halftoneRect(c, b, i ? second : main, 12, opt.light); c.restore(); });
  } else if (T.illus === 'glow') {
    c.shadowColor = main; c.shadowBlur = 50; paths.forEach((p, i) => { c.fillStyle = i ? second : main; c.fill(p); }); c.shadowBlur = 0;
    c.globalAlpha = .35; c.fillStyle = '#fff'; paths.forEach(p => c.fill(p));
  } else if (T.illus === 'white') {
    c.shadowColor = 'rgba(255,255,255,.55)'; c.shadowBlur = 40; c.fillStyle = 'rgba(255,255,255,.88)'; paths.forEach(p => c.fill(p));
    c.shadowBlur = 0; c.globalAlpha = .35; paths.forEach((p, i) => { c.fillStyle = i ? second : main; c.fill(p); });
  } else if (T.illus === 'line') {
    c.lineWidth = (opt.lw || 6) * 2; c.lineJoin = 'round'; paths.forEach((p, i) => { c.strokeStyle = i ? second : main; c.stroke(p); });
    c.fillStyle = T.paper; paths.forEach(p => c.fill(p));
  } else if (T.illus === 'flat') {
    c.lineWidth = (opt.lw || 8) * 2; c.lineJoin = 'round'; c.strokeStyle = T.outline; paths.forEach(p => c.stroke(p));
    paths.forEach((p, i) => { c.fillStyle = i ? second : main; c.fill(p); });
  } else { c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 30; c.shadowOffsetY = 12; paths.forEach((p, i) => { c.fillStyle = i ? second : main; c.fill(p); }); }
  c.restore();
}
function halftoneRect(c, [bx, by, bw, bh], col, step = 12, light = [.25, .2]) {
  c.fillStyle = col; const lx = bx + bw * light[0], ly = by + bh * light[1], far = Math.hypot(bw, bh) * .8;
  for (let y = by; y <= by + bh; y += step) for (let x = bx; x <= bx + bw; x += step) {
    const t = Math.min(1, Math.hypot(x - lx, y - ly) / far), r = step * .5 * (.25 + .75 * t);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
}
// ilustrasi siap: bola, bet, meja, pemain, combo
function illBall(c, T, x, y, r) {
  if (T.illus === 'halftone') { c.save(); c.clip(shapes.ball(x, y, r)[0]); c.globalCompositeOperation = 'multiply'; c.globalAlpha = .9; halftoneRect(c, [x - r + 8, y - r + 6, r * 2, r * 2], T.ink2, 13, [.2, .15]); c.globalAlpha = .85; halftoneRect(c, [x - r, y - r, r * 2, r * 2], T.ink1, 13, [.3, .1]); c.restore(); return; }
  if (T.illus === 'glow') { c.save(); c.shadowColor = T.ink2; c.shadowBlur = 90; const g = c.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r); g.addColorStop(0, '#fff'); g.addColorStop(.55, '#ffe9c7'); g.addColorStop(1, T.ink2); c.fillStyle = g; c.fill(shapes.ball(x, y, r)[0]); c.restore(); return; }
  if (T.illus === 'white') { c.save(); c.shadowColor = 'rgba(255,255,255,.7)'; c.shadowBlur = 60; const g = c.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(1, alpha(T.titleB.startsWith('#') ? T.titleB : '#ffd6a5', .9)); c.fillStyle = g; c.fill(shapes.ball(x, y, r)[0]); c.restore(); return; }
  if (T.illus === 'line') { const lc = T.illusCol || T.ink2; paint(c, shapes.ball(x, y, r), T, lc, { lw: 7 }); c.save(); c.strokeStyle = lc; c.lineWidth = 4; c.beginPath(); c.arc(x, y, r * .7, -2.4, -1.2); c.stroke(); c.restore(); return; }
  const g = c.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r); g.addColorStop(0, '#fff'); g.addColorStop(1, T.illus === 'flat' ? '#ffd7a0' : '#ffb067');
  c.save(); if (T.illus === 'flat') { c.lineWidth = 8; c.strokeStyle = T.outline; } else { c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 40; c.shadowOffsetY = 16; }
  c.fillStyle = g; const p = shapes.ball(x, y, r)[0]; c.fill(p); if (T.illus === 'flat') c.stroke(p); c.restore();
}
const illPaddle = (c, T, x, y, s, rot) => { const [blade, handle] = shapes.paddle(x, y, s, rot); paint(c, [blade, handle], T, T.illusCol ? T.illusCol : [T.rubber, T.wood], { box: [x - s, y - s, s * 2, s * 2] }); };
function illTable(c, T, x, y, w) {
  const t = shapes.table(x, y, w);
  paint(c, [t.legs], T, T.illus === 'line' ? T.tableLine : T.light ? T.deep : T.text, { lw: 5 });
  paint(c, [t.top], T, T.tableCol, { lw: 6, box: [x, y, w, t.h] });
  c.save(); c.strokeStyle = T.tableLine; c.lineWidth = 5; c.stroke(t.top); c.lineWidth = 3; c.stroke(t.lines);
  c.fillStyle = T.illus === 'line' ? 'transparent' : 'rgba(255,255,255,.18)'; c.fill(t.net); c.strokeStyle = T.tableLine; c.lineWidth = 3; c.stroke(t.net); c.restore();
  return t.h;
}
const illPlayer = (c, T, x, y, h, mirror, pose, col) => paint(c, shapes.player(x, y, h, mirror, pose), T, [col || T.fig, T.rubber], { box: [x - h * .2, y, h * 1.2, h], lw: 5 });

// ---------- Rawatan visual (A–J) ----------
// Setiap rawatan memberi sifat generik (latar, teks, panel, label, gaya ilustrasi, kesan tajuk) supaya serasi dengan semua susun atur.
function treatment(k, club) {
  const tb = club.tb, or = club.or, hd1 = club.hd1, hd2 = club.hd2;
  const D = {
    A: { name: 'Risograph', paper: '#efe6d4', text: '#16130f', illus: 'halftone', titleFx: 'multiply' },
    B: { name: 'Neon', paper: '#0a0d14', text: '#f5f1e8', illus: 'glow', titleFx: 'glow' },
    C: { name: 'Gradien', paper: hd1, text: '#ffffff', illus: 'solid', titleFx: 'shadow' },
    D: { name: 'Minimalis', paper: '#fafaf7', text: '#111111', illus: 'line', titleFx: 'plain' },
    E: { name: 'Retro', paper: '#f4e3c3', text: hd1, illus: 'flat', titleFx: 'offset' },
    F: { name: 'Komik', paper: '#fff6d8', text: '#111111', illus: 'flat', titleFx: 'comic' },
    G: { name: 'Aurora', paper: '#110b24', text: '#ffffff', illus: 'white', titleFx: 'soft' },
    H: { name: 'Pelan teknikal', paper: '#0f3470', text: '#e8f0ff', illus: 'line', titleFx: 'outline' },
    I: { name: 'Kertas kraf', paper: '#c8a46e', text: '#1d1a16', illus: 'flat', titleFx: 'stencil' },
    J: { name: 'Swiss', paper: '#ffffff', text: '#111111', illus: 'solid', titleFx: 'plain' },
  }[k];
  const T = Object.assign({ key: k, ink1: tb, ink2: or, deep: hd1, hd2, wood: '#c8894c', sx: .76 }, D);
  T.light = lum(T.paper) > 150;
  if (T.light && lum(or) > 175) T.ink2 = hd1;                 // aksen terlalu cerah di atas latar cerah
  if (!T.light && lum(T.ink1) < 60) T.ink1 = hd2;
  T.soft = alpha(T.text.startsWith('#') ? T.text : '#111111', .62);
  T.titleA = T.light ? T.ink1 : '#ffffff'; T.titleB = T.light ? T.ink2 : (lum(or) < 90 ? '#ffd166' : or);
  T.label = T.light ? T.ink2 : '#ffd166';
  T.panel = T.light ? alpha(T.ink1, .08) : 'rgba(255,255,255,.08)'; T.panelStroke = T.light ? alpha(T.ink1, .45) : 'rgba(255,255,255,.28)'; T.panelLW = 2;
  T.chip = T.light ? alpha(T.ink1, .12) : 'rgba(255,255,255,.14)'; T.chipStroke = null;
  T.qrFrame = T.light ? T.ink1 : null; T.qrGlow = null; T.stampCol = T.light ? T.ink2 : '#ffffff';
  T.rubber = '#d62d2d'; T.tableCol = tb; T.tableLine = 'rgba(255,255,255,.85)'; T.fig = T.ink1; T.fig2 = T.ink2; T.outline = hd1;
  T.rule = T.text; T.cta = T.light ? T.ink1 : '#ffffff';
  // penyesuaian setiap rawatan
  if (k === 'B') { T.rubber = or; T.tableCol = hd2; T.qrGlow = T.ink2; T.panelStroke = alpha(T.ink2, .6); T.label = T.ink2; T.stampCol = T.ink2; T.titleB = or; T.fig = T.ink1; T.fig2 = or; }
  if (k === 'C') { T.rubber = or; T.tableCol = 'rgba(255,255,255,.18)'; T.panel = 'rgba(255,255,255,.12)'; T.panelStroke = null; T.qrGlow = 'rgba(0,0,0,.3)'; T.fig = '#ffffff'; T.fig2 = or; T.titleB = or; }
  if (k === 'D') { T.rubber = T.ink2; T.wood = T.ink1; T.panel = '#ffffff'; T.chip = '#ffffff'; T.chipStroke = T.ink1; T.tableLine = T.ink1; }
  if (k === 'E') { T.panel = alpha(T.ink1, .1); T.panelStroke = hd1; T.panelLW = 4; T.qrFrame = hd1; T.chipStroke = hd1; T.outline = hd1; }
  if (k === 'F') { T.outline = '#111111'; T.panel = '#ffffff'; T.panelStroke = '#111111'; T.panelLW = 4; T.chip = '#ffffff'; T.chipStroke = '#111111'; T.qrFrame = '#111111'; T.titleA = '#ffffff'; T.titleB = '#ffd400'; T.label = T.ink1; T.rubber = '#e11d2e'; T.fig = T.ink1; T.fig2 = '#ffd400'; T.cta = '#111111'; T.stampCol = '#111111'; }
  if (k === 'G') { T.panel = 'rgba(255,255,255,.13)'; T.panelStroke = 'rgba(255,255,255,.35)'; T.panelLW = 1.5; T.chip = 'rgba(255,255,255,.16)'; T.chipStroke = 'rgba(255,255,255,.3)'; T.qrGlow = 'rgba(255,255,255,.35)'; T.titleB = lum(or) < 150 ? '#ffd6a5' : or; T.label = '#c4b5fd'; T.fig = '#ffffff'; T.tableCol = 'rgba(255,255,255,.2)'; }
  if (k === 'H') { T.illusCol = '#ffffff'; T.fig = '#ffffff'; T.fig2 = '#9ec5ff'; T.rubber = '#9ec5ff'; T.wood = '#ffffff'; T.tableCol = '#ffffff'; T.tableLine = '#ffffff'; T.panel = 'rgba(255,255,255,.04)'; T.panelStroke = 'rgba(255,255,255,.55)'; T.chip = 'rgba(255,255,255,.06)'; T.chipStroke = 'rgba(255,255,255,.5)'; T.label = '#9ec5ff'; T.qrFrame = '#ffffff'; T.titleB = '#ffffff'; T.stampCol = '#9ec5ff'; T.rule = 'rgba(255,255,255,.6)'; }
  if (k === 'I') { T.outline = '#1d1a16'; T.ink2 = lum(T.ink2) > 150 ? hd1 : T.ink2; T.titleA = '#1d1a16'; T.titleB = lum(T.ink1) < 40 ? '#7a1f12' : T.ink1; T.label = '#1d1a16'; T.panel = 'rgba(255,255,255,.28)'; T.panelStroke = '#1d1a16'; T.chip = 'rgba(255,255,255,.35)'; T.chipStroke = '#1d1a16'; T.qrFrame = '#1d1a16'; T.cta = '#1d1a16'; T.stampCol = '#7a1f12'; T.fig = '#1d1a16'; T.fig2 = T.titleB; }
  if (k === 'J') { T.sx = .86; T.titleA = '#111111'; T.panel = '#f1f1f1'; T.panelStroke = null; T.chip = '#f1f1f1'; T.qrFrame = '#111111'; T.fig = '#111111'; T.fig2 = T.ink2; T.rubber = T.ink2; T.cta = '#111111'; T.label = T.ink2; T.tableCol = '#111111'; }
  return T;
}
function background(c, T, R) {
  c.fillStyle = T.paper; c.fillRect(0, 0, W, H);
  const k = T.key;
  if (k === 'A') { c.fillStyle = 'rgba(60,45,20,.07)'; for (let i = 0; i < 9000; i++) c.fillRect(R() * W, R() * H, 1.6, 1.6); }
  if (k === 'B') {
    [[.85, .4, T.ink1, 700, .66], [.05, .95, T.ink2, 600, .4]].forEach(([fx, fy, col, rad, a]) => { const g = c.createRadialGradient(W * fx, H * fy, 10, W * fx, H * fy, rad); g.addColorStop(0, alpha(col, a)); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); });
    c.save(); c.globalAlpha = .08; c.strokeStyle = '#fff'; c.lineWidth = 2; for (let i = 0; i < 26; i++) { const y0 = 120 + i * 48; c.beginPath(); c.moveTo(-50, y0 + 300); c.lineTo(W + 50, y0 - 300); c.stroke(); } c.restore();
  }
  if (k === 'C') {
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, T.ink1); g.addColorStop(1, T.deep); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save(); c.globalAlpha = .12; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(W * .55, 0); c.lineTo(W, 0); c.lineTo(W, H * .55); c.closePath(); c.fill();
    c.globalAlpha = .08; c.beginPath(); c.moveTo(0, H * .75); c.lineTo(W * .5, H); c.lineTo(0, H); c.closePath(); c.fill(); c.restore();
    c.save(); c.globalAlpha = .1; c.fillStyle = '#fff'; for (let i = 0; i < 1600; i++) { c.beginPath(); c.arc(R() * W, R() * H, 1.4, 0, 7); c.fill(); } c.restore();
  }
  if (k === 'D') { c.strokeStyle = 'rgba(0,0,0,.06)'; c.lineWidth = 1; for (let x = 60; x < W; x += 60) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } }
  if (k === 'E') {
    c.save(); c.translate(W * .78, H * .4); for (let i = 0; i < 24; i++) { c.rotate(Math.PI / 12); c.fillStyle = i % 2 ? alpha(T.ink2, .16) : 'rgba(0,0,0,0)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(1400, -180); c.lineTo(1400, 180); c.closePath(); c.fill(); } c.restore();
    [T.ink1, T.ink2, T.deep].forEach((col, i) => { c.fillStyle = col; c.fillRect(0, H - 40 - i * 22, W, 14); });
  }
  if (k === 'F') { // titik Ben-Day + letupan komik
    c.fillStyle = alpha(T.ink2, .22); for (let y = 0; y < H; y += 22) for (let x = (y / 22) % 2 ? 11 : 0; x < W; x += 22) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
    c.save(); c.translate(W * .72, H * .3); c.fillStyle = '#ffd400'; c.strokeStyle = '#111'; c.lineWidth = 6; c.beginPath();
    for (let i = 0; i < 28; i++) { const r = i % 2 ? 260 : 420, a = i / 28 * Math.PI * 2; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r * .8) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r * .8); }
    c.closePath(); c.globalAlpha = .55; c.fill(); c.globalAlpha = 1; c.stroke(); c.restore();
    c.strokeStyle = '#111'; c.lineWidth = 10; c.strokeRect(14, 14, W - 28, H - 28);
  }
  if (k === 'G') { // aurora: tompok warna kabur
    [[.15, .2, T.ink1, 620], [.9, .35, '#7c3aed', 560], [.55, .85, T.ink2, 640], [.05, .9, '#06b6d4', 420]].forEach(([fx, fy, col, rad]) => { const g = c.createRadialGradient(W * fx, H * fy, 0, W * fx, H * fy, rad); g.addColorStop(0, alpha(col, .75)); g.addColorStop(1, alpha(col, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H); });
    c.save(); c.globalAlpha = .06; c.fillStyle = '#fff'; for (let i = 0; i < 3000; i++) c.fillRect(R() * W, R() * H, 1.2, 1.2); c.restore();
  }
  if (k === 'H') { // grid pelan
    c.lineWidth = 1; for (let x = 0; x < W; x += 30) { c.strokeStyle = x % 150 ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.16)'; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += 30) { c.strokeStyle = y % 150 ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.16)'; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2; c.strokeRect(24, 24, W - 48, H - 48);
    c.font = `500 15px ${MONO}`; c.fillStyle = 'rgba(255,255,255,.5)'; c.fillText('LUKISAN NO. PP-01 · SKALA 1:1 · JANGAN DIUKUR', 40, H - 36);
  }
  if (k === 'I') { // gentian kertas kraf + pita pelekat
    c.save(); for (let i = 0; i < 2200; i++) { c.strokeStyle = R() > .5 ? 'rgba(90,60,25,.12)' : 'rgba(255,240,210,.12)'; c.lineWidth = 1; const x = R() * W, y = R() * H, a = R() * Math.PI; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); c.stroke(); } c.restore();
    const tape = (x, y, w, rot) => { c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = 'rgba(245,240,225,.7)'; c.fillRect(-w / 2, -22, w, 44); c.restore(); };
    tape(90, 40, 220, -.6); tape(W - 90, 40, 220, .6); tape(90, H - 40, 220, .6); tape(W - 90, H - 40, 220, -.6);
  }
  if (k === 'J') { // blok geometri Swiss
    c.fillStyle = alpha(T.ink1, .92); c.fillRect(W * .7, 0, W * .3, H * .1);
    c.fillStyle = '#ececec'; c.beginPath(); c.arc(W, H * .55, 190, Math.PI / 2, Math.PI * 1.5); c.fill();
    c.fillStyle = '#111'; c.fillRect(M, H - 46, W - 2 * M, 6);
  }
}
function title(c, T, lines, x, y, size, opt = {}) {
  const sx = opt.sx || T.sx, align = opt.align || 'left';
  lines.forEach((l, i) => {
    const yy = y + (i + 1) * size * .9, col = i % 2 ? T.titleB : T.titleA;
    c.save();
    if (T.titleFx === 'glow') { c.shadowColor = i % 2 ? T.ink2 : T.ink1; c.shadowBlur = 30; }
    if (T.titleFx === 'soft') { c.shadowColor = 'rgba(255,255,255,.45)'; c.shadowBlur = 24; }
    if (T.titleFx === 'shadow') { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowOffsetX = 6; c.shadowOffsetY = 6; }
    if (T.titleFx === 'multiply') c.globalCompositeOperation = 'multiply';
    if (T.titleFx === 'offset') { c.fillStyle = T.deep; ctext(c, l, x + 7, yy + 7, size, { sx, align }); }
    if (T.titleFx === 'comic') { c.fillStyle = '#111'; ctext(c, l, x + 9, yy + 9, size, { sx, align }); c.strokeStyle = '#111'; c.lineWidth = 14; c.lineJoin = 'round'; ctext(c, l, x, yy, size, { sx, align, fill: false, stroke: true }); }
    if (T.titleFx === 'outline' && i % 2 === 0) { c.strokeStyle = '#ffffff'; c.lineWidth = 3; ctext(c, l, x, yy, size, { sx, align, fill: false, stroke: true }); c.restore(); return; }
    if (T.titleFx === 'stencil') { // potong jalur mendatar pada huruf (kesan stensil) melalui kanvas sementara
      const oc = document.createElement('canvas'); oc.width = W * 3; oc.height = Math.ceil(size * 1.3); const o = oc.getContext('2d');
      o.fillStyle = col; ctext(o, l, x + W, size, size, { sx, align }); o.globalCompositeOperation = 'destination-out';
      for (let sy = size * .22; sy < size * 1.1; sy += size * .3) o.fillRect(0, sy, W * 3, Math.max(3, size * .045));
      c.drawImage(oc, -W, yy - size); c.restore(); return;
    }
    c.fillStyle = col; ctext(c, l, x, yy, size, { sx, align });
    if (T.titleFx === 'offset') { c.strokeStyle = T.deep; c.lineWidth = 3; ctext(c, l, x, yy, size, { sx, align, fill: false, stroke: true }); }
    c.restore();
  });
  return y + lines.length * size * .9;
}
function stamp(c, T, x, y, r, top, bottom, rot = -.2) {
  c.save(); c.translate(x, y); c.rotate(rot); const col = T.stampCol;
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
  c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r - 12, 0, 7); c.stroke();
  ctext(c, top, 0, -2, r * .42, { align: 'center', sx: .8 }); font(c, r * .2, 700, MONO); c.textAlign = 'center'; c.fillText(bottom, 0, r * .38); c.restore();
}
function panel(c, T, x, y, w, h, r = 22) {
  c.save(); if (T.key === 'G') { c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 30; }
  c.fillStyle = T.panel; rr(c, x, y, w, h, r); c.fill(); c.restore();
  if (T.panelStroke) { c.save(); c.strokeStyle = T.panelStroke; c.lineWidth = T.panelLW; if (T.key === 'H') c.setLineDash([10, 8]); rr(c, x, y, w, h, r); c.stroke(); c.restore(); }
}
const ticketFill = T => ({ A: '#f7f0e2', B: '#121827', C: alpha(T.deep, .88), D: '#ffffff', E: '#fff6e3', F: '#ffffff', G: 'rgba(255,255,255,.14)', H: '#123f86', I: '#e9d3a8', J: '#f4f4f4' })[T.key];
function qrBlock(c, T, x, y, s, url) {
  c.save(); if (T.qrGlow) { c.shadowColor = T.qrGlow; c.shadowBlur = 40; }
  c.fillStyle = '#fff'; rr(c, x - 14, y - 14, s + 28, s + 28, 18); c.fill(); c.restore();
  drawQR(c, url, x, y, s);
  if (T.qrFrame) { c.strokeStyle = T.qrFrame; c.lineWidth = T.key === 'D' || T.key === 'J' ? 2 : 5; rr(c, x - 14, y - 14, s + 28, s + 28, 18); c.stroke(); }
}
async function header(c, T, d, x, y, maxW, logoH = 88) {
  const imgs = (await Promise.all((d.logos || []).map(loadImg))).filter(Boolean);
  let xx = x; imgs.forEach(im => { const w = logoH * im.width / im.height; c.drawImage(im, xx, y, w, logoH); xx += w + 12; });
  font(c, 21, 700, MONO); c.fillStyle = T.soft; c.textAlign = 'left';
  wrap(c, (d.club || '').toUpperCase(), maxW - (xx - x) - 10, 2).forEach((l, i) => c.fillText(l, xx + 8, y + logoH / 2 - 4 + i * 27));
}
const facts = d => [['TARIKH', d.when], ['MASA', d.time], ['TEMPAT', d.venue], ['YURAN', d.fee]].filter(r => r[1]);
function factGrid(c, T, d, x, y, w, maxY, cols = 2, valSize = 32) {
  const items = facts(d); const colW = w / cols;
  for (let i = 0; i < items.length; i += cols) {
    if (y > maxY - 60) break;
    let n = 1;
    items.slice(i, i + cols).forEach(([k, v], j) => {
      const xx = x + j * colW; font(c, 18, 700, MONO); c.fillStyle = T.label; c.fillText(k, xx, y);
      font(c, valSize, 800); c.fillStyle = T.text; const vl = wrap(c, v, colW - 20, 2); vl.forEach((l, q) => c.fillText(l, xx, y + valSize + 2 + q * (valSize + 2))); n = Math.max(n, vl.length);
    });
    y += (valSize + 2) * n + 26;
  }
  return y;
}
function prizeList(c, T, d, x, y, w, maxY, size = 25) {
  const pz = (d.prizes || []).slice(0, 3); if (!pz.length || y > maxY - 60) return y;
  font(c, 18, 700, MONO); c.fillStyle = T.label; c.fillText('HADIAH', x, y); y += size + 8;
  font(c, size, 700); c.fillStyle = T.text;
  for (const [i, p] of pz.entries()) { if (y > maxY) break; c.fillText(`${['①', '②', '③'][i]}  ${wrap(c, p, w - 40, 1)[0]}`, x, y); y += size + 8; }
  return y + 6;
}
function noteText(c, T, d, x, y, w, maxY, size = 22) { if (!d.note || y > maxY - 20) return y; font(c, size, 500, MONO); c.fillStyle = T.soft; wrap(c, d.note, w, 2).forEach(l => { if (y < maxY) { c.fillText(l, x, y); y += size + 8; } }); return y; }
function cta(c, T, d, x, y, maxW, size = 92) {
  const s = d.status ? 'IMBAS & SAKSIKAN →' : 'DAFTAR SEKARANG →', sz = Math.min(size, size * maxW / cw(c, s, size));
  c.save(); c.fillStyle = T.cta; if (T.key === 'B') { c.shadowColor = T.ink1; c.shadowBlur = 24; }
  ctext(c, s, x, y + sz * .82, sz); c.restore();
  font(c, 23, 700, MONO); c.fillStyle = T.label; let yy = y + sz + 30;
  [d.slots, d.countdown].filter(Boolean).forEach(t => { wrap(c, t.toUpperCase(), maxW, 2).forEach(l => { c.fillText(l, x, yy); yy += 30; }); });
  return yy;
}
const urlText = (c, T, d, x, y, align = 'left') => { font(c, 17, 500, MONO); c.fillStyle = T.soft; c.textAlign = align; c.fillText(d.url.replace(/^https?:\/\//, ''), x, y); c.textAlign = 'left'; };

// ---------- Susun atur (1–5) ----------
const L = {
  // 1. Tajuk gergasi di atas, bola + bet di kanan
  async 1(c, T, d) {
    illPaddle(c, T, W - 330, 700, 260, -.6); illBall(c, T, W - 110, 880, 240);
    await header(c, T, d, M, 56, W - 300); stamp(c, T, W - 150, 128, 88, d.status ? 'TUTUP' : 'DAFTAR', d.status ? 'PENUH' : 'DIBUKA');
    const hl = fitTitle(c, d.title, W - 2 * M, 400); let y = title(c, T, hl.lines, M - 4, 200, hl.size);
    y += 28; c.fillStyle = T.text; c.fillRect(M, y, W - 2 * M, 4); y += 46;
    font(c, 24, 700, MONO); c.fillStyle = T.text; wrap(c, d.format.toUpperCase(), 620, 2).forEach(l => { c.fillText(l, M, y); y += 32; });
    if (d.hc) { c.fillStyle = T.label; c.fillText(d.hc.toUpperCase(), M, y); y += 32; }
    const qS = 250, qY = H - M - qS - 10; y = factGrid(c, T, d, M, y + 20, 580, qY - 30); y = prizeList(c, T, d, M, y, 580, qY - 40); noteText(c, T, d, M, y, 580, qY - 40);
    c.fillStyle = T.text; c.fillRect(M, qY - 24, W - 2 * M - qS - 30, 3);
    cta(c, T, d, M, qY, W - 2 * M - qS - 50); urlText(c, T, d, M, H - M - 2); qrBlock(c, T, W - M - qS, qY, qS, d.url);
  },
  // 2. Tajuk menegak di tepi kiri, pemain di kanan atas
  async 2(c, T, d) {
    const band = 300;
    c.save(); c.fillStyle = T.panel; c.fillRect(0, 0, band, H); if (T.panelStroke) { c.fillStyle = T.panelStroke; c.fillRect(band, 0, 2, H); } c.restore();
    c.save(); c.translate(band - 34, H - 60); c.rotate(-Math.PI / 2);
    const hl = fitTitle(c, d.title, H - 140, band - 50, 2, .76, 230); title(c, T, hl.lines, 0, -hl.lines.length * hl.size * .9, hl.size); c.restore();
    const x = band + 50, w = W - x - M;
    await header(c, T, d, x, 56, w, 76);
    illPlayer(c, T, x + w - 330, 160, 360, true, 0); illBall(c, T, x + 40, 260, 46);
    let y = 560; font(c, 24, 700, MONO); c.fillStyle = T.text; wrap(c, d.format.toUpperCase(), w, 2).forEach(l => { c.fillText(l, x, y); y += 32; });
    if (d.hc) { c.fillStyle = T.label; c.fillText(d.hc.toUpperCase(), x, y); y += 32; }
    c.fillStyle = T.text; c.fillRect(x, y, w, 3); y += 50;
    const qS = 230, qY = H - M - qS - 10;
    y = factGrid(c, T, d, x, y, w, qY - 120, 2, 30); y = prizeList(c, T, d, x, y, w, qY - 130, 24); noteText(c, T, d, x, y, w, qY - 130, 20);
    qrBlock(c, T, W - M - qS, qY, qS, d.url); cta(c, T, d, x, qY - 10, W - M - qS - x - 30, 60); urlText(c, T, d, x, H - M - 2);
  },
  // 3. Bola gergasi di tengah, tajuk di bawah, simetri
  async 3(c, T, d) {
    illPaddle(c, T, W / 2 + 200, 420, 270, .7); illPaddle(c, T, W / 2 - 215, 440, 240, -.75); illBall(c, T, W / 2, 330, 200);
    await header(c, T, d, M, 56, W - 2 * M, 72);
    const hl = fitTitle(c, d.title, W - 2 * M, 210, 3, .76, 140); let y = title(c, T, hl.lines, W / 2, 590, hl.size, { align: 'center' });
    y += 28; font(c, 24, 700, MONO); c.fillStyle = T.text; c.textAlign = 'center';
    wrap(c, d.format.toUpperCase() + (d.hc ? ' · ' + d.hc.toUpperCase() : ''), W - 2 * M, 2).forEach(l => { c.fillText(l, W / 2, y); y += 32; }); c.textAlign = 'left';
    // jalur fakta (chip)
    y += 16; const fs = facts(d); let xx = M; font(c, 26, 800);
    const chips = fs.map(([k, v]) => `${v}`), gap = 14;
    let row = []; const rows = [];
    chips.forEach(ch => { const w0 = c.measureText(ch).width + 44; if (xx + w0 > W - M && row.length) { rows.push(row); row = []; xx = M; } row.push([ch, w0]); xx += w0 + gap; }); if (row.length) rows.push(row);
    rows.slice(0, 2).forEach(r => { const tot = r.reduce((s, [, w0]) => s + w0, 0) + gap * (r.length - 1); let cx = (W - tot) / 2;
      r.forEach(([ch, w0]) => { c.fillStyle = T.chip; rr(c, cx, y, w0, 54, 27); c.fill(); if (T.chipStroke) { c.strokeStyle = T.chipStroke; c.lineWidth = 2; c.stroke(); }
        c.fillStyle = T.text; font(c, 26, 800); c.fillText(ch, cx + 22, y + 37); cx += w0 + gap; }); y += 68; });
    const qS = 200, qY = H - M - qS - 10;
    const pz = (d.prizes || []).slice(0, 3); if (pz.length && y + 30 < qY - 20) { font(c, 22, 700); c.fillStyle = T.soft; c.textAlign = 'center'; wrap(c, '🏆 ' + pz.join('  ·  '), W - 2 * M, 2).forEach(l => { if (y + 30 < qY - 20) { c.fillText(l, W / 2, y + 22); y += 30; } }); c.textAlign = 'left'; } qrBlock(c, T, W - M - qS, qY, qS, d.url); cta(c, T, d, M, qY + 10, W - 2 * M - qS - 50, 80); urlText(c, T, d, M, H - M - 2);
  },
  // 4. Tiket / pas masuk dengan keratan
  async 4(c, T, d) {
    const tx = 56, ty = 380, tw = W - 112, th = H - ty - 70, stub = 310;
    illTable(c, T, 170, 120, 560); illPlayer(c, T, 70, 30, 260, false, 1, T.fig2); illPlayer(c, T, 640, 40, 250, true, 0); illBall(c, T, 560, 80, 22);
    // badan tiket
    const sx = tx + tw - stub, p = new Path2D(); p.roundRect ? p.roundRect(tx, ty, tw, th, 28) : p.rect(tx, ty, tw, th);
    [ty, ty + th].forEach(yy => { p.moveTo(sx + 26, yy); p.arc(sx, yy, 26, 0, Math.PI * 2); });
    c.save(); c.fillStyle = ticketFill(T);
    c.shadowColor = 'rgba(0,0,0,.2)'; c.shadowBlur = 30; c.shadowOffsetY = 10; c.fill(p, 'evenodd'); c.restore();
    if (T.panelStroke) { c.strokeStyle = T.panelStroke; c.lineWidth = Math.max(2, T.panelLW); c.stroke(p); }
    c.save(); c.setLineDash([10, 12]); c.strokeStyle = T.soft; c.lineWidth = 3; c.beginPath(); c.moveTo(sx, ty + 40); c.lineTo(sx, ty + th - 40); c.stroke(); c.restore();
    // kandungan tiket
    const x = tx + 46, w = sx - x - 40; await header(c, T, d, x, ty + 30, w, 56);
    font(c, 20, 700, MONO); c.fillStyle = T.label; c.fillText(d.status ? 'PAS PENONTON' : 'PAS MASUK · PESERTA', x, ty + 130);
    const hl = fitTitle(c, d.title, w, 280, 3, .76, 120); let y = title(c, T, hl.lines, x - 3, ty + 140, hl.size);
    y += 40; font(c, 21, 700, MONO); c.fillStyle = T.text; wrap(c, d.format.toUpperCase() + (d.hc ? ' · ' + d.hc.toUpperCase() : ''), w, 2).forEach(l => { c.fillText(l, x, y); y += 28; });
    y += 24; y = factGrid(c, T, d, x, y, w, ty + th - 120, 2, 28); y = prizeList(c, T, d, x, y, w, ty + th - 60, 23); noteText(c, T, d, x, y, w, ty + th - 40, 19);
    // keratan
    const qS = stub - 90, qx = sx + 45; qrBlock(c, T, qx, ty + 150, qS, d.url);
    c.save(); c.translate(sx + stub / 2, ty + 120); c.fillStyle = T.text; ctext(c, d.status ? 'IMBAS' : 'DAFTAR', 0, 0, 64, { align: 'center' }); c.restore();
    font(c, 20, 700, MONO); c.fillStyle = T.text; c.textAlign = 'center'; let yy = ty + 150 + qS + 60;
    [d.slots, d.countdown].filter(Boolean).forEach(t => { wrap(c, t.toUpperCase(), stub - 50, 2).forEach(l => { c.fillText(l, sx + stub / 2, yy); yy += 28; }); });
    font(c, 18, 700, MONO); c.fillStyle = T.soft; c.fillText('No. ' + String(Math.abs(hash(d.url)) % 9000 + 1000), sx + stub / 2, ty + th - 40); c.textAlign = 'left';
  },
  // 5. Grid papan skor
  async 5(c, T, d) {
    const g = 18, x0 = M - 20, w0 = W - 2 * (M - 20);
    const box = (x, y, w, h) => panel(c, T, x, y, w, h, 22);
    await header(c, T, d, x0 + 6, 50, w0 - 200, 70); stamp(c, T, W - 130, 100, 66, d.status ? 'TUTUP' : 'DAFTAR', d.status ? 'PENUH' : 'DIBUKA');
    // kotak tajuk
    let y = 150; const hl = fitTitle(c, d.title, w0 - 60, 260, 3, .76, 150), th = hl.lines.length * hl.size * .9 + 60;
    box(x0, y, w0, th, .08); title(c, T, hl.lines, x0 + 30, y + 14, hl.size); y += th + g;
    // kotak fakta (3 atau 4 sel)
    const fs = facts(d), n = Math.min(fs.length, 4), cwid = (w0 - g * (n - 1)) / n, fh = 150;
    fs.slice(0, n).forEach(([k, v], i) => { const x = x0 + i * (cwid + g); box(x, y, cwid, fh); font(c, 17, 700, MONO); c.fillStyle = T.label; c.fillText(k, x + 20, y + 36);
      let sz = 30; font(c, sz, 800); let vl = wrap(c, v, cwid - 40, 3); while (vl.length > 2 && sz > 20) { sz -= 2; font(c, sz, 800); vl = wrap(c, v, cwid - 40, 3); }
      c.fillStyle = T.text; vl.slice(0, 3).forEach((l, q) => c.fillText(l, x + 20, y + 76 + q * (sz + 4))); });
    y += fh + g;
    // kotak ilustrasi + format
    const ih = 360, iw = w0 * .58; box(x0, y, iw, ih, .06);
    c.save(); rr(c, x0, y, iw, ih, 22); c.clip(); illTable(c, T, x0 + 60, y + 170, iw - 120); illPlayer(c, T, x0 + 10, y + 40, 230, false, 0); illPlayer(c, T, x0 + iw - 190, y + 50, 220, true, 1); illBall(c, T, x0 + iw / 2, y + 90, 20); c.restore();
    const rx = x0 + iw + g, rw = w0 - iw - g; box(rx, y, rw, ih);
    font(c, 17, 700, MONO); c.fillStyle = T.label; c.fillText('FORMAT', rx + 22, y + 38);
    font(c, 27, 800); c.fillStyle = T.text; let yy = y + 74; wrap(c, d.format, rw - 44, 3).forEach(l => { c.fillText(l, rx + 22, yy); yy += 33; });
    if (d.hc) { font(c, 22, 700); c.fillStyle = T.soft; wrap(c, d.hc, rw - 44, 2).forEach(l => { c.fillText(l, rx + 22, yy); yy += 28; }); }
    yy += 14; yy = prizeList(c, T, d, rx + 22, yy + 10, rw - 30, y + ih - 20, 21);
    y += ih + g;
    // kotak CTA + QR
    const bh = H - y - 50, qS = Math.min(bh - 40, 230); box(x0, y, w0, bh, .14);
    qrBlock(c, T, x0 + w0 - qS - 30, y + (bh - qS) / 2, qS, d.url);
    cta(c, T, d, x0 + 30, y + 24, w0 - qS - 110, 76); noteText(c, T, d, x0 + 30, y + bh - 40, w0 - qS - 110, y + bh, 18);
  },

  // 6. Tarikh gergasi: hari bulan sebagai wira poster
  async 6(c, T, d) {
    const dp = d.dateParts; if (!dp) return L[1](c, T, d);
    await header(c, T, d, M, 56, W - 300); stamp(c, T, W - 150, 128, 88, d.status ? 'TUTUP' : 'DAFTAR', d.status ? 'PENUH' : 'DIBUKA');
    const big = 560; c.save(); if (T.titleFx === 'glow') { c.shadowColor = T.ink1; c.shadowBlur = 40; } if (T.titleFx === 'multiply') c.globalCompositeOperation = 'multiply';
    if (T.titleFx === 'comic' || T.titleFx === 'offset') { c.fillStyle = T.titleFx === 'comic' ? '#111' : T.deep; ctext(c, dp.day, M + 8, 210 + big * .78 + 8, big, { sx: .8 }); }
    c.fillStyle = T.titleA;
    if (T.titleFx === 'outline') { c.strokeStyle = '#fff'; c.lineWidth = 4; ctext(c, dp.day, M - 10, 210 + big * .78, big, { sx: .8, fill: false, stroke: true }); }
    else ctext(c, dp.day, M - 10, 210 + big * .78, big, { sx: .8 }); c.restore();
    const dw = cw(c, dp.day, big, 900, .8), rx = M + dw + 20;
    c.save(); c.fillStyle = T.titleB; if (T.titleFx === 'glow') { c.shadowColor = T.ink2; c.shadowBlur = 30; } ctext(c, dp.mon, rx, 330, 170, { sx: .8 }); c.restore();
    font(c, 40, 800, MONO); c.fillStyle = T.text; c.fillText(dp.year, rx + 6, 390); font(c, 30, 700, MONO); c.fillStyle = T.label; c.fillText(dp.wd.toUpperCase(), rx + 6, 440);
    if (d.time) { font(c, 46, 900); c.fillStyle = T.text; c.fillText(d.time, rx + 6, 510); }
    illBall(c, T, W - 150, 610, 90); illPaddle(c, T, W - 270, 680, 190, -.5);
    let y = 760; c.fillStyle = T.rule; c.fillRect(M, y, W - 2 * M, 4);
    const hl = fitTitle(c, d.title, W - 2 * M, 200, 2, T.sx, 110); y = title(c, T, hl.lines, M - 3, y + 6, hl.size) + 34;
    font(c, 23, 700, MONO); c.fillStyle = T.text; wrap(c, d.format.toUpperCase() + (d.hc ? ' · ' + d.hc.toUpperCase() : ''), W - 2 * M, 2).forEach(l => { c.fillText(l, M, y); y += 30; });
    const qS = 220, qY = H - M - qS - 10;
    font(c, 30, 800); c.fillStyle = T.text; [d.venue, d.fee ? 'Yuran ' + d.fee : ''].filter(Boolean).forEach(v => { if (y < qY - 70) { y += 12; wrap(c, '◆ ' + v, W - 2 * M - qS - 40, 1).forEach(l => { c.fillText(l, M, y + 26); y += 38; }); } });
    const pz = (d.prizes || []).slice(0, 3); if (pz.length && y < qY - 60) { font(c, 21, 700); c.fillStyle = T.soft; wrap(c, '🏆 ' + pz.join(' · '), W - 2 * M - qS - 40, 2).forEach(l => { if (y < qY - 40) { c.fillText(l, M, y + 30); y += 28; } }); }
    qrBlock(c, T, W - M - qS, qY, qS, d.url); cta(c, T, d, M, qY + 26, W - 2 * M - qS - 60, 76); urlText(c, T, d, M, H - M - 2);
  },
  // 7. Carta undian: rajah kalah mati dengan pasangan misteri
  async 7(c, T, d) {
    await header(c, T, d, M, 50, W - 2 * M, 70);
    const hl = fitTitle(c, d.title, W - 2 * M, 250, 3, T.sx, 150); let y = title(c, T, hl.lines, M - 3, 140, hl.size) + 26;
    font(c, 23, 700, MONO); c.fillStyle = T.label; wrap(c, d.format.toUpperCase() + (d.hc ? ' · ' + d.hc.toUpperCase() : ''), W - 2 * M, 2).forEach(l => { c.fillText(l, M, y); y += 30; });
    // rajah: 8 slot → 4 → 2 → johan
    const top = y + 20, bh = 470, x0 = M, col = [x0, x0 + 260, x0 + 500, x0 + 720], slotW = 210, slotH = 44;
    const ys = n => Array.from({ length: n }, (_, i) => top + (i + .5) * bh / n);
    const lineC = T.light ? alpha(T.text.startsWith('#') ? T.text : '#111111', .55) : 'rgba(255,255,255,.55)';
    const slot = (x, yy, w, txt, hi) => { c.save(); c.fillStyle = hi ? T.titleB : T.chip; rr(c, x, yy - slotH / 2, w, slotH, 22); c.fill(); if (T.chipStroke || hi) { c.strokeStyle = hi ? T.outline : T.chipStroke; c.lineWidth = 2; if (T.chipStroke || T.key === 'F') c.stroke(); } c.restore();
      font(c, 20, 800, MONO); c.fillStyle = hi ? (lum(T.titleB) > 150 ? '#111' : '#fff') : T.text; c.textAlign = 'center'; c.fillText(txt, x + w / 2, yy + 7); c.textAlign = 'left'; };
    [8, 4, 2].forEach((n, r) => { const a = ys(n), b = ys(n / 2), w = r ? slotW - 30 : slotW;
      a.forEach((yy, i) => { slot(col[r], yy, w, r ? '?' : `PASANGAN ${'ABCDEFGH'[i]}?`, false);
        c.strokeStyle = lineC; c.lineWidth = 3; c.beginPath(); c.moveTo(col[r] + w, yy); c.lineTo(col[r + 1] - 18, yy); c.lineTo(col[r + 1] - 18, b[Math.floor(i / 2)]); c.lineTo(col[r + 1], b[Math.floor(i / 2)]); c.stroke(); }); });
    const fy = ys(1)[0]; slot(col[3], fy, 220, 'JOHAN?', true);
    illBall(c, T, col[3] + 110, fy - 120, 56); illPaddle(c, T, col[3] + 120, fy + 150, 170, .5);
    y = top + bh + 30;
    const qS = 220, qY = H - M - qS - 10;
    y = factGrid(c, T, d, M, y, W - 2 * M - qS - 40, qY - 10, 2, 28);
    qrBlock(c, T, W - M - qS, qY, qS, d.url); cta(c, T, d, M, Math.max(y, qY + 40), W - 2 * M - qS - 60, 68); urlText(c, T, d, M, H - M - 2);
  },
  // 8. Belah diagonal: dua pemain berhadapan merentas jaring
  async 8(c, T, d) {
    c.save(); c.fillStyle = T.light ? alpha(T.ink1, .14) : alpha(T.ink1, .35); c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(0, 560); c.closePath(); c.fill();
    c.fillStyle = T.light ? alpha(T.ink2, .14) : alpha(T.ink2, .3); c.beginPath(); c.moveTo(W, 0); c.lineTo(W, 560); c.lineTo(0, 560); c.closePath(); c.fill(); c.restore();
    c.save(); c.setLineDash([14, 12]); c.strokeStyle = T.rule; c.lineWidth = 3; c.beginPath(); c.moveTo(W, 0); c.lineTo(0, 560); c.stroke(); c.restore();
    await header(c, T, d, M, 46, W - 2 * M, 66);
    illPlayer(c, T, 50, 130, 340, false, 0, T.fig); illPlayer(c, T, W - 330, 170, 330, true, 1, T.fig2); illBall(c, T, W / 2 + 10, 250, 30);
    font(c, 24, 900, MONO); c.fillStyle = T.text; c.textAlign = 'center'; c.fillText('VS', W / 2, 390); c.textAlign = 'left';
    c.save(); c.translate(W / 2, 590); c.rotate(-.05);
    const hl = fitTitle(c, d.title, W - 2 * M, 230, 3, T.sx, 140); const th = hl.lines.length * hl.size * .9;
    if (T.light) { c.fillStyle = T.key === 'J' ? '#ffffff' : T.paper; c.globalAlpha = .9; c.fillRect(-W, -30, W * 2, th + 60); c.globalAlpha = 1; }
    title(c, T, hl.lines, 0, -10, hl.size, { align: 'center' }); c.restore();
    let y = 590 + th + 60;
    font(c, 22, 700, MONO); c.fillStyle = T.label; c.textAlign = 'center'; wrap(c, d.format.toUpperCase() + (d.hc ? ' · ' + d.hc.toUpperCase() : ''), W - 2 * M, 2).forEach(l => { c.fillText(l, W / 2, y); y += 28; }); c.textAlign = 'left';
    const qS = 210, qY = H - M - qS - 10;
    y = factGrid(c, T, d, M, y + 30, W - 2 * M - qS - 40, qY + 40, 2, 28); prizeList(c, T, d, M, y, W - 2 * M - qS - 40, H - M - 90, 22);
    qrBlock(c, T, W - M - qS, qY, qS, d.url);
    font(c, 22, 800, MONO); c.fillStyle = T.cta; c.fillText(d.status ? 'IMBAS & SAKSIKAN →' : 'IMBAS & DAFTAR →', W - M - qS, qY - 28);
    font(c, 20, 700, MONO); c.fillStyle = T.label; [d.slots, d.countdown].filter(Boolean).forEach((t, i) => c.fillText(t.toUpperCase(), M, H - M - 30 + i * 28));
  },
  // 9. Kulit majalah: masthead PINGPONG, pemain wira, tajuk sebagai coverline
  async 9(c, T, d) {
    font(c, 19, 700, MONO); c.fillStyle = T.soft; c.fillText(`EDISI KHAS · ${(d.clubShort || '').toUpperCase()}`, M, 64); c.textAlign = 'right'; c.fillText(d.dateParts ? `${d.dateParts.day}.${d.dateParts.monN}.${d.dateParts.year.slice(2)}` : '', W - M, 64); c.textAlign = 'left';
    const mh = Math.min(300, 300 * (W - 2 * M) / cw(c, 'PINGPONG', 300, 900, .8));
    c.save(); c.fillStyle = T.titleA; if (T.titleFx === 'glow' || T.titleFx === 'soft') { c.shadowColor = T.ink1; c.shadowBlur = 30; } if (T.titleFx === 'multiply') c.globalCompositeOperation = 'multiply';
    if (T.titleFx === 'comic' || T.titleFx === 'offset') { const f = c.fillStyle; c.fillStyle = T.titleFx === 'comic' ? '#111' : T.deep; ctext(c, 'PINGPONG', M + 8, 80 + mh * .8 + 8, mh, { sx: .8 }); c.fillStyle = f; }
    if (T.titleFx === 'outline') { c.strokeStyle = '#fff'; c.lineWidth = 4; ctext(c, 'PINGPONG', M - 6, 80 + mh * .8, mh, { sx: .8, fill: false, stroke: true }); } else ctext(c, 'PINGPONG', M - 6, 80 + mh * .8, mh, { sx: .8 });
    c.restore();
    const imgs = (await Promise.all((d.logos || []).map(loadImg))).filter(Boolean); let lx = W - M; imgs.reverse().forEach(im => { const w = 70 * im.width / im.height; lx -= w; c.drawImage(im, lx, 84 + mh * .8 + 14, w, 70); lx -= 10; });
    illPlayer(c, T, 540, 420, 600, true, 1, T.fig); illBall(c, T, 650, 400, 38);
    let y = 120 + mh * .8 + 40; const cwid = 470;
    const hl = fitTitle(c, d.title, cwid, 320, 4, T.sx, 120); y = title(c, T, hl.lines, M - 3, y, hl.size) + 30;
    const lines = [['TARIKH', d.when], ['MASA', d.time], ['DI', d.venue], ['YURAN', d.fee], ['HADIAH', (d.prizes || [])[0]]].filter(r => r[1]);
    for (const [k, v] of lines) { if (y > H - 340) break; font(c, 17, 700, MONO); c.fillStyle = T.label; c.fillText(k, M, y); font(c, 29, 800); c.fillStyle = T.text; const vl = wrap(c, v, cwid, 2); vl.forEach((l, i) => c.fillText(l, M, y + 33 + i * 32)); y += 32 * vl.length + 34; }
    const qS = 210, qY = H - M - qS - 10; panel(c, T, W - M - qS - 34, qY - 66, qS + 34 * 2 - 20, qS + 66 + 24, 20);
    font(c, 20, 800, MONO); c.fillStyle = T.text; c.fillText(d.status ? 'IMBAS UNTUK LIHAT' : 'IMBAS UNTUK DAFTAR', W - M - qS - 14, qY - 26); qrBlock(c, T, W - M - qS - 4, qY, qS - 10, d.url);
    font(c, 21, 700, MONO); c.fillStyle = T.label; [d.slots, d.countdown].filter(Boolean).forEach((t, i) => c.fillText(t.toUpperCase(), M, H - M - 60 + i * 30));
    urlText(c, T, d, M, H - M + 6);
  },
  // 10. Kolaj polaroid: gambar bersepah, tajuk pada pita, nota & kertas pelekat
  async 10(c, T, d) {
    await header(c, T, d, M, 36, W - 2 * M, 60);
    const polaroid = (x, y, w, h, rot, draw, cap) => {
      c.save(); c.translate(x, y); c.rotate(rot); c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = 24; c.shadowOffsetY = 10;
      c.fillStyle = '#fbfbf7'; c.fillRect(-w / 2, -h / 2, w, h + 70); c.shadowColor = 'transparent';
      c.fillStyle = T.light ? alpha(T.ink1, .1) : T.paper; c.fillRect(-w / 2 + 18, -h / 2 + 18, w - 36, h - 36);
      c.save(); c.beginPath(); c.rect(-w / 2 + 18, -h / 2 + 18, w - 36, h - 36); c.clip(); draw(-w / 2 + 18, -h / 2 + 18, w - 36, h - 36); c.restore();
      c.fillStyle = '#333'; c.font = `italic 600 28px ${FONT}`; c.textAlign = 'center'; c.fillText(cap, 0, h / 2 + 32); c.textAlign = 'left'; c.restore();
    };
    polaroid(250, 290, 330, 300, -.09, (x, y, w, h) => { illPaddle(c, T, x + w * .42, y + h * .52, 220, -.4); illBall(c, T, x + w * .75, y + h * .3, 40); }, 'bet sedia!');
    polaroid(780, 270, 360, 300, .07, (x, y, w, h) => { illTable(c, T, x + 30, y + h * .5, w - 60); illPlayer(c, T, x + 4, y + 10, 190, false, 0); illPlayer(c, T, x + w - 150, y + 14, 180, true, 1, T.fig2); }, 'siapa partner?');
    // pita tajuk
    const hl = fitTitle(c, d.title, W - 2 * M - 40, 240, 3, T.sx, 140), th = hl.lines.length * hl.size * .9;
    c.save(); c.translate(W / 2, 560); c.rotate(-.035); c.fillStyle = T.light ? alpha(T.ink2, .2) : 'rgba(255,255,255,.12)'; c.fillRect(-W / 2 + 30, -20, W - 60, th + 44);
    title(c, T, hl.lines, 0, -6, hl.size, { align: 'center' }); c.restore();
    const ny = 560 + th + 70;
    // kad nota (butiran)
    const nw = 560, nh = H - ny - 60;
    c.save(); c.translate(M + nw / 2, ny + nh / 2); c.rotate(.012); c.fillStyle = T.key === 'G' ? 'rgba(255,255,255,.14)' : '#fffdf6'; c.shadowColor = 'rgba(0,0,0,.2)'; c.shadowBlur = 18; c.fillRect(-nw / 2, -nh / 2, nw, nh); c.restore();
    c.save(); c.strokeStyle = T.key === 'G' ? 'rgba(255,255,255,.2)' : 'rgba(80,120,200,.25)'; c.lineWidth = 2; for (let yy = ny + 66; yy < ny + nh - 10; yy += 38) { c.beginPath(); c.moveTo(M + 16, yy); c.lineTo(M + nw - 16, yy); c.stroke(); } c.restore();
    const ink = T.key === 'G' ? '#ffffff' : '#1d1a16', lab = T.key === 'G' ? '#c4b5fd' : (T.light ? T.ink2 : T.ink1);
    let y = ny + 54; font(c, 18, 700, MONO); c.fillStyle = lab; c.fillText(d.format.toUpperCase().slice(0, 44), M + 24, y - 14);
    for (const [k, v] of facts(d)) { if (y > ny + nh - 40) break; font(c, 28, 800); c.fillStyle = ink; c.fillText(wrap(c, `${k === 'TARIKH' ? '📅' : k === 'MASA' ? '⏰' : k === 'TEMPAT' ? '📍' : '💰'} ${v}`, nw - 50, 1)[0], M + 24, y + 38); y += 38; }
    const pz = (d.prizes || [])[0]; if (pz && y < ny + nh - 40) { font(c, 26, 700); c.fillStyle = ink; c.fillText(wrap(c, '🏆 ' + pz, nw - 50, 1)[0], M + 24, y + 38); }
    // kertas pelekat (QR)
    const sw = 360, sx0 = W - M - sw + 10, sy0 = ny + 6, sh = H - sy0 - 60;
    c.save(); c.translate(sx0 + sw / 2, sy0 + sh / 2); c.rotate(-.04); c.fillStyle = '#ffe066'; c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 20; c.shadowOffsetY = 8; c.fillRect(-sw / 2, -sh / 2, sw, sh); c.restore();
    font(c, 26, 900); c.fillStyle = '#1d1a16'; c.textAlign = 'center'; c.fillText(d.status ? 'Imbas & saksikan!' : 'Imbas & daftar!', sx0 + sw / 2, sy0 + 50); c.textAlign = 'left';
    const qS = Math.min(sw - 80, sh - 150); drawQR(c, d.url, sx0 + (sw - qS) / 2, sy0 + 76, qS);
    font(c, 18, 700, MONO); c.fillStyle = '#1d1a16'; c.textAlign = 'center'; [d.slots, d.countdown].filter(Boolean).forEach((t, i) => c.fillText(wrap(c, t.toUpperCase(), sw - 40, 1)[0], sx0 + sw / 2, sy0 + 76 + qS + 34 + i * 26)); c.textAlign = 'left';
  },
};
function hash(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }
export const COMBOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap(l => 'ABCDEFGHIJ'.split('').map(t => `${l}${t}`));
export const LAYOUT_NAMES = { 1: 'Tajuk gergasi', 2: 'Tajuk menegak', 3: 'Bola tengah', 4: 'Tiket', 5: 'Papan skor', 6: 'Tarikh gergasi', 7: 'Carta undian', 8: 'Belah diagonal', 9: 'Kulit majalah', 10: 'Kolaj polaroid' };
export const TREAT_NAMES = { A: 'Risograph', B: 'Neon', C: 'Gradien', D: 'Minimalis', E: 'Retro', F: 'Komik', G: 'Aurora', H: 'Pelan teknikal', I: 'Kertas kraf', J: 'Swiss' };
export async function makeKitPoster(d, combo) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const club = { tb: css('--tb') || '#1f4aa8', or: css('--or') || '#ff7a1a', hd1: css('--hd1') || '#0b1a3f', hd2: css('--hd2') || '#1d3f8c' };
  const lay = combo.slice(0, -1), T = treatment(combo.slice(-1), club), R = rand(hash(d.url + combo)); SX = T.sx;
  background(c, T, R); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  await L[lay](c, T, d);
  return new Promise(res => cv.toBlob(b => res(b), 'image/png'));
}
