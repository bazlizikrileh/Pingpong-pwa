// Video cabutan (MP4) untuk dikongsi ke WhatsApp — dilukis pada kanvas & dikod dalam telefon.
// Utama: WebCodecs (H.264) + mp4-muxer (lebih laju dari masa nyata). Sandaran: MediaRecorder.
const W = 720, H = 1280;
const scaleFor = o => (duration(o) > 40 ? 0.75 : 1); // video panjang: 540×960 (lebih ringan)
const fpsFor = o => (duration(o) > 40 ? 20 : 30); // video panjang: kurang bingkai supaya telefon tidak berat
const T_STD = { INTRO: 2.2, SHUF: 1.4, STEP: 0.75, FLY: 0.45, OUTRO: 3 }, T_FAST = { INTRO: 1.4, SHUF: 0.8, STEP: 0.45, FLY: 0.3, OUTRO: 2.2 };
const T_SHORT = { INTRO: 0.7, SHUF: 0.5, STEP: 0.45, FLY: 0.3, OUTRO: 1.4 };
const TM = o => (o.short ? T_SHORT : o.fast ? T_FAST : T_STD);

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
const _fit = new Map();
// Cache ukuran teks: elak ukur berulang kali setiap bingkai (berat di telefon)
function fitText(c, s, maxW, size, weight = 700, min = 12) {
  const key = s + '|' + maxW + '|' + size + '|' + weight + '|' + min, hit = _fit.get(key);
  if (hit) { c.font = hit[1]; return hit[0]; }
  const r = fitText0(c, s, maxW, size, weight, min);
  if (_fit.size > 4000) _fit.clear();
  _fit.set(key, [r, c.font]); return r;
}
function fitText0(c, s, maxW, size, weight = 700, min = 12) {
  let f = size;
  for (; f > min; f--) { c.font = `${weight} ${f}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; if (c.measureText(s).width <= maxW) return s; }
  c.font = `${weight} ${min}px system-ui, sans-serif`;
  let t = s; while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t === s ? s : t + '…';
}

export function duration(o) { if (o.scenes) return o.scenes.reduce((a, x) => a + duration(x), 0); const { INTRO, SHUF, STEP, OUTRO } = TM(o); return INTRO + SHUF + o.seq.length * STEP + OUTRO; }

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
    const va = Math.max(1, Math.floor(b.slots / 2));
    const slots = Array.from({ length: b.slots }, (_, k) => ({ x: x + 8, y: y + lh + 4 + k * sh + (b.vs && k >= va ? 18 : 0), w: bw - 16, h: sh - 6 }));
    return { x, y, w: bw, h: bh, lh, slots, vsY: b.vs ? y + lh + 4 + va * sh - 2 : 0 };
  });
}

function makeDrawer(o, logos, cv, sc = 1) {
  if (!cv) { cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc); }
  const c = cv.getContext('2d');
  const hd1 = css('--hd1') || '#0b1a3f', hd2 = css('--hd2') || '#1d3f8c', or = css('--or') || '#ff7a1a';
  const L = layout(o);
  // tempat setiap kad: kotak & slot ke-berapa
  const cnt = o.boxes.map(() => 0);
  const dest = o.seq.map(s => ({ ...s, slot: s.slot != null ? s.slot : cnt[s.box]++ }));
  const { INTRO, SHUF, STEP, FLY } = TM(o), T0 = INTRO + SHUF;

  const draw = t => {
    c.setTransform(sc, 0, 0, sc, 0, 0);
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
      if (!o.hideTo) { c.fillStyle = or; c.fillText(fitText(c, '→ ' + o.boxes[cur.box].label, W - 120, 42, 800), W / 2, 362); }
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
      B.slots.forEach((S, si) => { c.strokeStyle = '#cbd5e1'; c.setLineDash([6, 5]); c.lineWidth = 2; rr(c, S.x, S.y, S.w, S.h, 10); c.stroke(); c.setLineDash([]);
        if (b.slotLabels && b.slotLabels[si]) { c.fillStyle = '#94a3b8'; c.fillText(fitText(c, b.slotLabels[si], S.w - 20, Math.min(20, S.h * .45), 600), S.x + 10, S.y + S.h * .65); } });
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
      const sl = (o.boxes[d.box].slotLabels || [])[d.slot];
      c.fillText(fitText(c, (sl ? sl + ' · ' : '') + d.name, S.w - 20, Math.min(26, S.h * .55), 700), -S.w / 2 + 10, S.h * .2);
      c.restore();
    }
    // kaki
    c.fillStyle = 'rgba(255,255,255,.55)'; c.textAlign = 'center';
    c.fillText(fitText(c, `Pingpong Portal · ${new Date().toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}`, W - 80, 20, 600), W / 2, H - 38);
    c.textAlign = 'left';
  };
  return { cv, draw };
}

// sasaran saiz ~6 MB (mudah dihantar di WhatsApp); grafik kebanyakannya statik, jadi kadar bit rendah masih jelas
const bitrateFor = o => Math.max(300_000, Math.min(2_500_000, Math.floor(6 * 8 * 1048576 / Math.max(1, duration(o)))));
async function pickCodec() {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of ['avc1.42001f', 'avc1.4d001f', 'avc1.640028', 'avc1.42002a']) {
    try { const r = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 2_500_000, framerate: 30 }); if (r.supported) return { codec, mux: 'avc' }; } catch {}
  }
  return null;
}

async function encodeWebCodecs(o, D, onP, cfg) {
  const { Muxer, ArrayBufferTarget } = await import('./vendor/mp4-muxer.js');
  const FPS = fpsFor(o);
  const target = new ArrayBufferTarget();
  const VW = D.cv.width, VH = D.cv.height;
  const muxer = new Muxer({ target, video: { codec: cfg.mux, width: VW, height: VH, frameRate: FPS }, fastStart: 'in-memory' });
  let err = null;
  const enc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => (err = e) });
  const br = bitrateFor(o); // video panjang: kadar bit lebih rendah supaya saiz < ~12 MB untuk WhatsApp
  const conf = { codec: cfg.codec, width: VW, height: VH, bitrate: br, framerate: FPS, avc: { format: 'avc' }, latencyMode: 'realtime' };
  try { if (!(await VideoEncoder.isConfigSupported(conf)).supported) delete conf.latencyMode; } catch { delete conf.latencyMode; }
  enc.configure(conf);
  const total = Math.ceil(duration(o) * FPS);
  const STALL = new Error('STALL');
  for (let i = 0; i < total; i++) {
    if (err) throw err;
    D.draw(i / FPS);
    const vf = new VideoFrame(D.cv, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close();
    // tunggu pengekod (telefon lebih perlahan) — elak barisan bingkai bertimbun dalam memori sehingga telefon hang
    const w0 = Date.now();
    while (enc.encodeQueueSize > 3) { if (err) throw err; if (Date.now() - w0 > 6000) { try { enc.close(); } catch {} throw STALL; } await new Promise(r => setTimeout(r, 10)); }
    if (i % 6 === 0) { onP && onP(i / total); await new Promise(r => setTimeout(r, 0)); }
  }
  onP && onP(0.99);
  await Promise.race([enc.flush(), new Promise((_, no) => setTimeout(() => no(STALL), 15000))]).catch(e => { try { enc.close(); } catch {} throw e; });
  enc.close(); muxer.finalize();
  if (err) throw err;
  return new Blob([target.buffer], { type: 'video/mp4' });
}

async function encodeRecorder(o, D, onP) {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const type = types.find(x => window.MediaRecorder && MediaRecorder.isTypeSupported(x));
  if (!type) throw new Error('Telefon ini tidak menyokong rakaman video.');
  const FPS = fpsFor(o);
  const stream = D.cv.captureStream(FPS), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.round(bitrateFor(o) * 0.6) }), parts = [];
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

// Video berterusan: beberapa babak (cth. semua sesi) dalam satu video
function makeSceneDrawer(o, logos, sc = 1) {
  // satu kanvas sahaja dikongsi semua babak (jimat memori telefon)
  const cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
  const ends = []; let acc = 0;
  o.scenes.forEach(x => { acc += duration(x); ends.push(acc); });
  let cur = -1, D = null;
  const draw = t => {
    let i = ends.findIndex(e => t < e); if (i < 0) i = ends.length - 1;
    if (i !== cur) { cur = i; D = makeDrawer(o.scenes[i], logos, cv, sc); }
    D.draw(t - (i ? ends[i - 1] : 0));
  };
  return { cv, draw };
}
export async function makeDrawVideo(o, onP) {
  const logos = await Promise.all((o.logos || []).map(loadImg));
  const sc = scaleFor(o);
  const D = o.scenes ? makeSceneDrawer(o, logos, sc) : makeDrawer(o, logos, null, sc);
  const cfg = await pickCodec();
  if (cfg) {
    try { return await encodeWebCodecs(o, D, onP, cfg); }
    catch (e) {
      // pengekod telefon tersekat → rakam secara masa nyata (lebih lama tetapi stabil)
      if (e && e.message === 'STALL' && window.MediaRecorder) { onP && onP(0, 'rec'); return encodeRecorder(o, D, p => onP && onP(p, 'rec')); }
      throw e;
    }
  }
  return encodeRecorder(o, D, p => onP && onP(p, 'rec'));
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
