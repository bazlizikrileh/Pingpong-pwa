// Ilustrasi carrom dilukis dengan kod (kanvas): buah (hitam/putih/ratu), striker, papan pandangan atas / perspektif.
// Digunakan oleh poster, laporan dan video (menggantikan bola, bet dan meja pingpong).

const TAU = Math.PI * 2;
export const COIN = {
  black: { base: '#1d1d20', hi: '#4a4a52', ring: '#6b6b74', edge: '#000000' },
  white: { base: '#f4ead2', hi: '#ffffff', ring: '#c9ab78', edge: '#9c7a45' },
  queen: { base: '#d62828', hi: '#ff7a7a', ring: '#ffb3b3', edge: '#7a0f0f' },
};

// Satu buah carrom: cakera dengan gelang alur (seperti buah kayu sebenar)
export function coin(c, x, y, r, kind = 'white', o = {}) {
  const K = typeof kind === 'string' ? COIN[kind] || COIN.white : kind;
  c.save();
  if (o.shadow !== false) { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = r * .5; c.shadowOffsetY = r * .18; }
  const g = c.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
  g.addColorStop(0, K.hi); g.addColorStop(.55, K.base); g.addColorStop(1, K.base);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.shadowColor = 'transparent';
  c.lineWidth = Math.max(1, r * .07); c.strokeStyle = K.edge; c.stroke();
  c.strokeStyle = K.ring; c.lineWidth = Math.max(1, r * .08);
  c.beginPath(); c.arc(x, y, r * .68, 0, TAU); c.stroke();
  c.beginPath(); c.arc(x, y, r * .4, 0, TAU); c.stroke();
  c.restore();
}

// Striker: lebih besar, putih dengan corak bintang / gelang warna
export function striker(c, x, y, r, accent = '#2f5bb7', o = {}) {
  c.save();
  if (o.shadow !== false) { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = r * .5; c.shadowOffsetY = r * .2; }
  const g = c.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e6e9ef');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = accent; c.lineWidth = r * .12; c.beginPath(); c.arc(x, y, r * .86, 0, TAU); c.stroke();
  c.fillStyle = accent; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .22 : r * .5; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); c.fill();
  c.restore();
}

// Susunan permulaan: ratu di tengah, 6 buah gelang dalam, 12 gelang luar (selang-seli hitam/putih)
export function rack(c, cx, cy, r, o = {}) {
  const pts = [[cx, cy, 'queen']];
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; pts.push([cx + Math.cos(a) * r * 2.02, cy + Math.sin(a) * r * 2.02, i % 2 ? 'black' : 'white']); }
  if (o.full !== false) for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + Math.PI / 6, d = i % 2 ? r * 3.5 : r * 4.04; pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, i % 2 ? 'white' : 'black']); }
  const k = o.k == null ? 1 : o.k;   // pecahan (animasi)
  pts.forEach(([x, y, kind], i) => { if (i < Math.ceil(pts.length * k)) coin(c, x, y, r, kind, { shadow: o.shadow }); });
  return pts;
}

// Papan carrom pandangan atas (segi empat), cx/cy = tengah, s = sisi luar
export function boardTop(c, cx, cy, s, o = {}) {
  const x = cx - s / 2, y = cy - s / 2, f = s * .075, w = s - 2 * f;
  const frame = o.frame || '#6e3410', frame2 = o.frame2 || '#8c4618', surf = o.surface || '#f4deb0', line = o.line || '#8a4a1c';
  c.save();
  if (o.shadow !== false) { c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = s * .05; c.shadowOffsetY = s * .02; }
  c.fillStyle = frame; rrect(c, x, y, s, s, s * .06); c.fill(); c.shadowColor = 'transparent';
  c.fillStyle = frame2; rrect(c, x + f * .3, y + f * .3, s - f * .6, s - f * .6, s * .05); c.fill();
  const sg = c.createLinearGradient(x, y, x + s, y + s); sg.addColorStop(0, lighten(surf, 12)); sg.addColorStop(1, surf);
  c.fillStyle = sg; c.fillRect(x + f, y + f, w, w);
  const pr = w * .07, X0 = x + f, Y0 = y + f, X1 = X0 + w, Y1 = Y0 + w;
  c.fillStyle = '#16100c';
  [[X0 + pr, Y0 + pr], [X1 - pr, Y0 + pr], [X0 + pr, Y1 - pr], [X1 - pr, Y1 - pr]].forEach(([px, py]) => { c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill(); });
  c.strokeStyle = line; c.lineWidth = Math.max(1, w * .007);
  const m = w * .2, L = w * .6;
  [w * .13, w * .165].forEach(off => {
    c.beginPath();
    c.moveTo(X0 + m, Y0 + off); c.lineTo(X0 + m + L, Y0 + off);
    c.moveTo(X0 + m, Y1 - off); c.lineTo(X0 + m + L, Y1 - off);
    c.moveTo(X0 + off, Y0 + m); c.lineTo(X0 + off, Y0 + m + L);
    c.moveTo(X1 - off, Y0 + m); c.lineTo(X1 - off, Y0 + m + L);
    c.stroke();
  });
  // garisan pepenjuru dari poket (anak panah)
  c.beginPath();
  [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]].forEach(([px, py, dx, dy]) => { c.moveTo(px + dx * w * .17, py + dy * w * .17); c.lineTo(px + dx * w * .3, py + dy * w * .3); });
  c.stroke();
  c.beginPath(); c.arc(cx, cy, w * .2, 0, TAU); c.stroke();
  c.beginPath(); c.arc(cx, cy, w * .03, 0, TAU); c.stroke();
  if (o.rack !== false) rack(c, cx, cy, w * .036, { full: o.full, k: o.k, shadow: false });
  if (o.striker !== false) striker(c, cx + (o.sx || 0) * w, Y1 - w * .148 + (o.sy || 0) * w, w * .05, o.accent, { shadow: false });
  c.restore();
  return { X0, Y0, X1, Y1, w, pr };
}

const _pc = new Map();
// Papan perspektif (dilihat dari depan, condong) — untuk tajuk video / poster
export function boardPersp(c, cx, y, topW, botW, h, o = {}) {
  c.save();
  c.translate(cx, y);
  // jelmaan: petakan segi empat sama unit ke trapezium dengan setTransform tidak boleh (bukan afin) → lukis jalur
  const N = 60, S = 600, key = JSON.stringify(o);
  let cv = _pc.get(key);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    boardTop(cv.getContext('2d'), S / 2, S / 2, S, { ...o, shadow: false });
    if (_pc.size > 40) _pc.clear(); _pc.set(key, cv);
  }
  for (let i = 0; i < N; i++) {
    const v0 = i / N, v1 = (i + 1) / N;
    const w0 = topW + (botW - topW) * v0, w1 = topW + (botW - topW) * v1;
    const wm = (w0 + w1) / 2; c.drawImage(cv, 0, v0 * S, S, S / N + .5, -wm / 2, v0 * h, wm, h / N + 1);
  }
  // kaki / tebal papan
  c.fillStyle = o.edge || '#4a220a';
  c.beginPath(); c.moveTo(-botW / 2, h); c.lineTo(botW / 2, h); c.lineTo(botW / 2, h + h * .06); c.lineTo(-botW / 2, h + h * .06); c.fill();
  c.restore();
}

function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function lighten(hex, n) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const v = [1, 3, 5].map(i => Math.min(255, parseInt(hex.slice(i, i + 2), 16) + n));
  return '#' + v.map(x => x.toString(16).padStart(2, '0')).join('');
}
