// Poster juara (PNG 1080×1350) untuk dikongsi ke WhatsApp
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function fit(c, s, maxW, size, weight = 800, min = 18) {
  let f = size;
  for (; f > min; f -= 2) { c.font = `${weight} ${f}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; if (c.measureText(s).width <= maxW) return s; }
  let t = s; while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t === s ? s : t + '…';
}
// places: [{ place, label, people: [{ name, sub }] }]
export async function makePoster({ title, club, date, logos, places }) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const hd1 = css('--hd1') || '#0b1a3f', hd2 = css('--hd2') || '#1d3f8c', or = css('--or') || '#ff7a1a';
  const g = c.createLinearGradient(0, 0, W * .5, H); g.addColorStop(0, hd2); g.addColorStop(1, hd1);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // jalur meja: garisan tepi & tengah
  c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 5; rr(c, 30, 30, W - 60, H - 60, 36); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(W / 2 - 2, 30, 4, H - 60);
  // logo
  const imgs = (await Promise.all((logos || []).map(loadImg))).filter(Boolean);
  let total = imgs.reduce((s, im) => s + 130 * im.width / im.height, 0) + (imgs.length - 1) * 20, x = (W - total) / 2;
  imgs.forEach(im => { const w = 130 * im.width / im.height; c.drawImage(im, x, 70, w, 130); x += w + 20; });
  c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.75)';
  c.fillText(fit(c, club || '', W - 160, 30, 600), W / 2, 250);
  c.fillStyle = '#fff'; c.fillText(fit(c, title, W - 140, 62, 900), W / 2, 330);
  c.fillStyle = or; c.fillText(fit(c, '🏆  KEPUTUSAN AKHIR  🏆', W - 200, 40, 800), W / 2, 395);
  // kad tempat
  const col = { 1: ['#ffd34d', '#b8860b', '🥇'], 2: ['#e5e7eb', '#9ca3af', '🥈'], 3: ['#f0b27a', '#a0522d', '🥉'] };
  let y = 440;
  for (const p of places) {
    const [lt, dk, md] = col[p.place] || col[3], big = p.place === 1, h = big ? 250 : Math.max(150, 70 + p.people.length * 70);
    const cg = c.createLinearGradient(0, y, 0, y + h); cg.addColorStop(0, lt); cg.addColorStop(1, dk);
    c.fillStyle = cg; rr(c, 90, y, W - 180, h, 28); c.fill();
    c.textAlign = 'left'; c.fillStyle = 'rgba(0,0,0,.55)'; c.font = '800 28px system-ui, sans-serif';
    c.fillText(`${md}  ${p.label.toUpperCase()}`, 130, y + 52);
    c.fillStyle = '#111';
    p.people.forEach((pp, i) => {
      const yy = y + (big ? 140 : 105) + i * 70;
      c.fillText(fit(c, pp.name, W - 300, big ? 72 : 46, 900), 130, yy);
      if (pp.sub) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(fit(c, pp.sub, W - 300, 26, 600), 130, yy + (big ? 46 : 34)); c.fillStyle = '#111'; }
    });
    y += h + 26;
  }
  c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.7)';
  c.fillText(fit(c, `${date ? date + ' · ' : ''}Tahniah kepada semua pemenang!`, W - 160, 28, 600), W / 2, H - 70);
  return new Promise(res => cv.toBlob(b => res(b), 'image/png'));
}
export async function sharePoster(opts) {
  const blob = await makePoster(opts);
  const { shareBlob } = await import('./reg-poster.js');
  return shareBlob(blob, `Juara-${(opts.title || 'pertandingan').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')}.png`, opts.title);
}
