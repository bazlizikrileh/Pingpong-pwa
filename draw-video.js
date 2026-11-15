// Video cabutan (MP4) untuk dikongsi ke WhatsApp — dilukis pada kanvas & dikod dalam telefon.
// Utama: WebCodecs (H.264) + mp4-muxer (lebih laju dari masa nyata). Sandaran: MediaRecorder.
const W = 720, H = 1280, FPS = 30;
const INTRO = 2.2, SHUF = 1.4, STEP = 0.75, FLY = 0.45, OUTRO = 3;

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function fitText(c, s, maxW, size, weight = 700, min = 12) {
  let f = size;
  for (; f > min; f--) { c.font = `${weight} ${f}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; if (c.measureText(s).width <= maxW) return s; }
  c.font = `${weight} ${min}px system-ui, sans-serif`;
  let t = s; while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t === s ? s : t + '…';
}

export function duration(o) { return INTRO + SHUF + o.seq.length * STEP + OUTRO; }

function layout(o) {
  const n = o.boxes.length, cols = n <= 2 ? n : n <= 6 ? 2 : n <= 12 ? 3 : 4;
  const rows = Math.ceil(n / cols), top = 470, bottom = H - 70, gap = 14, pad = 34;
  const bw = (W - pad * 2 - gap * (cols - 1)) / cols;
  const maxSlots = Math.max(...o.boxes.map(b => b.slots + (b.vs ? 0.5 : 0)));
  const bh = Math.min((bottom - top - gap * (rows - 1)) / rows, 54 + maxSlots * 62);
  const used = rows * bh + gap * (rows - 1), y0 = top + Math.max(0, (bottom - top - used) / 2);
  return o.boxes.map((b, i) => {
    const x = pad + (i % cols) * (bw + gap), y = y0 + Math.floor(i / cols) * (bh + gap);
    const lh = Math.min(40, bh * .28), sh = (bh - lh - 10 - (b.vs ? 18 : 0)) / b.slots;
    const slots = Array.from({ length: b.slots }, (_, k) => ({ x: x + 8, y: y + lh + 4 + k * sh + (b.vs && k ? 18 : 0), w: bw - 16, h: sh - 6 }));
    return { x, y, w: bw, h: bh, lh, slots, vsY: b.vs ? y + lh + 4 + sh - 2 : 0 };
  });
}

function makeDrawer(o, logos) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const hd1 = css('--hd1') || '#0b1a3f', hd2 = css('--hd2') || '#1d3f8c', or = css('--or') || '#ff7a1a';
  const L = layout(o);
  // tempat setiap kad: kotak & slot ke-berapa
  const cnt = o.boxes.map(() => 0);
  const dest = o.seq.map(s => ({ ...s, slot: cnt[s.box]++ }));
  const T0 = INTRO + SHUF;

  const draw = t => {
    // latar
    const g = c.createLinearGradient(0, 0, W * .4, H); g.addColorStop(0, hd2); g.addColorStop(1, hd1);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3; rr(c, 16, 16, W - 32, H - 32, 28); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(16, H / 2, W - 32, 2);
    // kepala
    let lx = 40;
    logos.forEach(im => { if (!im) return; const h = 92, w = h * im.width / im.height; c.drawImage(im, lx, 44, w, h); lx += w + 10; });
    c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';
    const tx = lx + 8, tw = W - tx - 40;
    c.fillText(fitText(c, o.title, tw, 40, 800), tx, 92);
    c.fillStyle = 'rgba(255,255,255,.75)'; c.fillText(fitText(c, o.subtitle || '', tw, 24, 500), tx, 128);
    // papan status
    c.fillStyle = 'rgba(4,8,20,.55)'; rr(c, 34, 176, W - 68, 270, 24); c.fill();
    const k = Math.floor((t - T0) / STEP), cur = t >= T0 && k < dest.length ? dest[k] : null;
    c.textAlign = 'center';
    if (t < INTRO) {
      c.fillStyle = '#ffb02e'; c.fillText(fitText(c, '🎴 ' + (o.title || 'Cabutan'), W - 120, 46, 800), W / 2, 270);
      c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText(fitText(c, `${dest.length} kad dimasukkan ke dalam dek`, W - 120, 28, 600), W / 2, 330);
      c.fillText(fitText(c, 'Dikocok, kemudian dicabut satu persatu', W - 120, 24, 500), W / 2, 372);
    } else if (t < T0) {
      // kad dikocok
      for (let i = 0; i < 7; i++) {
        const a = Math.sin(t * 9 + i * 1.7) * .35, dx = Math.sin(t * 7 + i) * 60;
        c.save(); c.translate(W / 2 + dx, 300); c.rotate(a);
        c.fillStyle = i % 2 ? '#fff' : '#ffe2c7'; rr(c, -60, -80, 120, 160, 12); c.fill();
        c.strokeStyle = or; c.lineWidth = 4; rr(c, -52, -72, 104, 144, 9); c.stroke(); c.restore();
      }
      c.fillStyle = '#fff'; c.fillText(fitText(c, '🔀 ' + (o.prep || 'Mengocok dek…'), W - 120, 30, 700), W / 2, 425);
    } else if (cur) {
      c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText(fitText(c, cur.head || '', W - 120, 22, 700), W / 2, 225);
      c.fillStyle = '#fff'; c.fillText(fitText(c, cur.name, W - 120, 54, 800), W / 2, 300);
      c.fillStyle = or; c.fillText(fitText(c, '→ ' + o.boxes[cur.box].label, W - 120, 42, 800), W / 2, 362);
      c.fillStyle = 'rgba(255,255,255,.65)'; c.fillText(fitText(c, `${dest.length - k - 1} kad lagi`, W - 120, 22, 600), W / 2, 412);
    } else {
      c.fillStyle = '#7ee2a0'; c.fillText(fitText(c, '✅ ' + (o.doneText || 'Cabutan selesai'), W - 120, 48, 800), W / 2, 300);
      c.fillStyle = 'rgba(255,255,255,.8)'; c.fillText(fitText(c, 'Semoga berjaya kepada semua peserta!', W - 120, 26, 600), W / 2, 360);
    }
    c.textAlign = 'left';
    // kotak
    const shown = t < T0 ? 0 : Math.min(dest.length, Math.floor((t - T0) / STEP) + 1);
    o.boxes.forEach((b, i) => {
      const B = L[i], hot = cur && cur.box === i;
      c.fillStyle = '#fff'; rr(c, B.x, B.y, B.w, B.h, 16); c.fill();
      if (hot) { c.strokeStyle = or; c.lineWidth = 5; rr(c, B.x, B.y, B.w, B.h, 16); c.stroke(); }
      c.fillStyle = '#0f172a'; c.fillText(fitText(c, b.label, B.w - 24, Math.min(26, B.lh * .7), 800), B.x + 12, B.y + B.lh * .78);
      if (b.vs) { c.fillStyle = '#94a3b8'; c.textAlign = 'center'; c.fillText(fitText(c, 'lwn', 60, 15, 700), B.x + B.w / 2, B.vsY + 12); c.textAlign = 'left'; }
      B.slots.forEach(S => { c.strokeStyle = '#cbd5e1'; c.setLineDash([6, 5]); c.lineWidth = 2; rr(c, S.x, S.y, S.w, S.h, 10); c.stroke(); c.setLineDash([]); });
    });
    for (let j = 0; j < shown; j++) {
      const d = dest[j], S = L[d.box].slots[d.slot];
      if (!S) continue;
      const p = j === shown - 1 && cur ? ease((t - T0 - j * STEP) / FLY) : 1;
      const sx = W / 2 - S.w / 2, sy = 270;
      const x = sx + (S.x - sx) * p, y = sy + (S.y - sy) * p, sc = 1.25 - .25 * p;
      c.save(); c.translate(x + S.w / 2, y + S.h / 2); c.scale(sc, sc);
      c.fillStyle = j === shown - 1 && cur ? or : '#e2e8f0'; rr(c, -S.w / 2, -S.h / 2, S.w, S.h, 10); c.fill();
      c.fillStyle = j === shown - 1 && cur ? '#fff' : '#0f172a';
      c.fillText(fitText(c, d.name, S.w - 20, Math.min(26, S.h * .55), 700), -S.w / 2 + 10, S.h * .2);
      c.restore();
    }
    // kaki
    c.fillStyle = 'rgba(255,255,255,.55)'; c.textAlign = 'center';
    c.fillText(fitText(c, `Pingpong Portal · ${new Date().toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}`, W - 80, 20, 600), W / 2, H - 38);
    c.textAlign = 'left';
  };
  return { cv, draw };
}

async function pickCodec() {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of ['avc1.42001f', 'avc1.4d001f', 'avc1.640028', 'avc1.42002a']) {
    try { const r = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 2_500_000, framerate: FPS }); if (r.supported) return { codec, mux: 'avc' }; } catch {}
  }
  return null;
}

async function encodeWebCodecs(o, D, onP, cfg) {
  const { Muxer, ArrayBufferTarget } = await import('./vendor/mp4-muxer.js');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: cfg.mux, width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
  let err = null;
  const enc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => (err = e) });
  enc.configure({ codec: cfg.codec, width: W, height: H, bitrate: 2_500_000, framerate: FPS, avc: { format: 'avc' } });
  const total = Math.ceil(duration(o) * FPS);
  for (let i = 0; i < total; i++) {
    if (err) throw err;
    D.draw(i / FPS);
    const vf = new VideoFrame(D.cv, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close();
    if (enc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 0));
    if (i % 15 === 0) { onP && onP(i / total); await new Promise(r => setTimeout(r, 0)); }
  }
  await enc.flush(); enc.close(); muxer.finalize();
  if (err) throw err;
  return new Blob([target.buffer], { type: 'video/mp4' });
}

async function encodeRecorder(o, D, onP) {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const type = types.find(x => window.MediaRecorder && MediaRecorder.isTypeSupported(x));
  if (!type) throw new Error('Telefon ini tidak menyokong rakaman video.');
  const stream = D.cv.captureStream(FPS), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_500_000 }), parts = [];
  rec.ondataavailable = e => e.data.size && parts.push(e.data);
  const done = new Promise(r => (rec.onstop = r));
  const dur = duration(o); rec.start(500);
  const t0 = performance.now();
  await new Promise(res => {
    const tick = () => { const t = (performance.now() - t0) / 1000; D.draw(Math.min(t, dur)); onP && onP(t / dur); t < dur ? requestAnimationFrame(tick) : res(); };
    tick();
  });
  rec.stop(); await done;
  return new Blob(parts, { type: type.split(';')[0] });
}

export async function makeDrawVideo(o, onP) {
  const logos = await Promise.all((o.logos || []).map(loadImg));
  const D = makeDrawer(o, logos);
  const cfg = await pickCodec();
  return cfg ? encodeWebCodecs(o, D, onP, cfg) : encodeRecorder(o, D, onP);
}

export async function prepareDrawVideo(o, onP) {
  const blob = await makeDrawVideo(o, onP);
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const clean = s => (s || '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  const fname = `${clean(o.title || 'Cabutan')}-${clean(o.subtitle).slice(0, 40)}.${ext}`;
  const file = new File([blob], fname, { type: blob.type });
  const download = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };
  const share = async () => {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: o.title, text: `${o.title}${o.subtitle ? ' · ' + o.subtitle : ''}` }); return { shared: true }; }
      catch (e) { if (e && e.name === 'AbortError') return { cancelled: true }; }
    }
    download(); return { downloaded: true };
  };
  return { blob, file, share, download };
}
