// Runut bunyi video cabutan: muzik latar ringan + kesan bunyi (kocok kad, cabut kad, sesi selesai) — dijana dalam telefon.
// Tiada fail audio luar; semuanya disintesis dengan OfflineAudioContext.
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

// events: [{ t, kind: 'scene'|'shuffle'|'card'|'done'|'end', i }]
// Tiga gaya muzik latar (dipilih secara rawak setiap undian)
// Semua gaya bertenaga / suspens — untuk membakar semangat sebelum perlawanan
export const STYLES = [
  { name: 'Bertenaga', bpm: 128, prog: [[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [43, 55, 59, 62]] },   // Am–F–C–G, rentak sukan
  { name: 'Suspens', bpm: 120, prog: [[45, 57, 60, 64], [41, 57, 60, 65], [50, 57, 62, 65], [40, 56, 59, 64]] },     // Am–F–Dm–E, minor tegang
  { name: 'Arena', bpm: 138, prog: [[40, 55, 59, 64], [48, 55, 60, 64], [43, 55, 59, 62], [38, 54, 57, 62]] },      // Em–C–G–D, gaya stadium
  { name: 'Ceria', bpm: 112, prog: [[48, 60, 64, 67], [43, 59, 62, 67], [45, 60, 64, 69], [41, 60, 65, 69]] },       // C–G–Am–F, pop riang (asal)
  // ---- 10 lagu sebenar (Pixabay, lesen bebas royalti) — dipotong 70 s, kenyaringan diseragamkan ----
  { name: 'Sukan', file: 'music/sukan.mp3', track: 1 },
  { name: 'Dram Pantas', file: 'music/dram.mp3', track: 1 },
  { name: 'Bertenaga', file: 'music/bertenaga.mp3', track: 1 },
  { name: 'Rock Sukan', file: 'music/rock.mp3', track: 1 },
  { name: 'Semangat', file: 'music/semangat.mp3', track: 1 },
  { name: 'Aksi', file: 'music/aksi.mp3', track: 1 },
  { name: 'Epik', file: 'music/epik.mp3', track: 1 },
  { name: 'Pertempuran', file: 'music/pertempuran.mp3', track: 1 },
  { name: 'Wira', file: 'music/wira.mp3', track: 1 },
  { name: 'Motivasi', file: 'music/motivasi.mp3', track: 1 },
];
export const RECAP = STYLES.map((x, i) => [i, x]).filter(([, x]) => x.track);
// Lagu sebenar: dimuat turun bila perlu, dijadikan gelung lancar (hujung bercantum ke awal dengan resapan 2 saat)
const _trk = {};
async function trackBuffer(style, sr) {
  const k = style + '@' + sr; if (_trk[k]) return _trk[k];
  _trk[k] = (async () => {
    const r = await fetch(STYLES[style].file); if (!r.ok) throw new Error('lagu tidak dapat dimuat');
    const ab = await r.arrayBuffer(), ctx = new OfflineAudioContext(2, 1, sr), buf = await ctx.decodeAudioData(ab);
    const X = Math.min(Math.floor(2 * sr), Math.floor(buf.length / 4)), L = buf.length - X;
    const out = new AudioBuffer({ length: L, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const s = buf.getChannelData(ch), o = out.getChannelData(ch);
      for (let i = 0; i < L; i++) o[i] = i < X ? s[i] * (i / X) + s[L + i] * (1 - i / X) : s[i];
    }
    return out;
  })();
  try { return await _trk[k]; } catch (e) { delete _trk[k]; throw e; }
}
export const isTrack = style => !!(STYLES[style] && STYLES[style].file);
export const loopLen = style => 8 * 4 * 60 / STYLES[style || 0].bpm;
export const randomStyle = () => RECAP[Math.floor(Math.random() * RECAP.length)][0];   // lagu sebenar dipilih secara rawak
export async function renderSoundtrack(dur, events, sr = 44100, music = true, fade = true, style = 0) {
  const ctx = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
  const master = ctx.createDynamicsCompressor(); master.threshold.value = -14; master.ratio.value = 4;
  const out = ctx.createGain(); out.gain.value = 1.6; master.connect(out); out.connect(ctx.destination);
  const noise = ctx.createBuffer(1, sr, sr), nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const tone = (type, f, t, a, peak, d, f2) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    env(g, t, a, peak, d); o.connect(g); g.connect(master); o.start(t); o.stop(t + a + d + 0.05);
  };
  const hiss = (t, d, peak, ftype, f, f2, q = 1) => {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; s.loop = true;
    fl.type = ftype; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d); fl.Q.value = q;
    env(g, t, 0.005, peak, d); s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + d + 0.05);
  };
  if (music) {
    const S = STYLES[style] || STYLES[0], bt = 60 / S.bpm, chords = S.prog, V = S.v || {}, kind = S.kind ?? style;
    const bars = Math.ceil((dur - 0.3) / (bt * 4));
    for (let b = 0; b < bars; b++) {
      const ch = chords[Math.floor(b / 2) % 4], t0 = 0.3 + b * 4 * bt;
      if (kind === 3) {
        // Ceria (asal): pad lembut, kick, hi-hat, bass, arpeggio
        if (b % 2 === 0) ch.slice(1).forEach(n => tone('triangle', NOTE(n), t0, 0.25, 0.018, 8 * bt - 0.4));
        for (let q = 0; q < 4; q++) {
          const t = t0 + q * bt; if (t > dur - 0.6) break;
          tone('sine', 140, t, 0.003, 0.32, 0.16, 45);
          hiss(t + bt / 2, 0.05, 0.05, 'highpass', 7000);
          tone('triangle', NOTE(ch[0] - 12 + (q === 3 ? 7 : 0)), t, 0.01, 0.11, bt * 0.8);
          const ar = ch.slice(1); tone('square', NOTE(ar[q % 3] + 12), t + bt / 2, 0.005, 0.012, 0.18);
        }
      } else if (kind === 2) {
        // Arena: kick 4/4 kuat, snare besar pada 2 & 4, bass 8 berdenyut, "brass" sawtooth pada awal bar
        const stab = t => { tone('sawtooth', NOTE(ch[1]), t, 0.01, 0.035, bt * 0.9); tone('sawtooth', NOTE(ch[2]), t, 0.01, 0.03, bt * 0.9); tone('sawtooth', NOTE(ch[3]), t, 0.01, 0.03, bt * 0.9); };
        stab(t0); if (V.stab2) stab(t0 + 2.5 * bt);
        if (V.hat16) for (let h = 0; h < 16; h++) if (h % 2) hiss(t0 + h * bt / 4, 0.02, 0.035, 'highpass', 9000);
        for (let q = 0; q < 4; q++) {
          const t = t0 + q * bt; if (t > dur - 0.6) break;
          tone('sine', 170, t, 0.003, 0.42, 0.15, 42);
          if (q % 2 === 1) { hiss(t, 0.18, 0.16, 'bandpass', 1300, 0, 0.7); tone('triangle', 190, t, 0.002, 0.12, 0.09, 120); }
          hiss(t + bt / 2, 0.035, 0.06, 'highpass', 8000);
          for (let e = 0; e < 2; e++) tone('square', NOTE(ch[0] - 12), t + e * bt / 2, 0.004, 0.06, bt * 0.38);
        }
        if (b % 4 === 3) for (let k = 0; k < 4; k++) tone('triangle', 110 - k * 12, t0 + 3 * bt + k * bt / 4, 0.003, 0.18, 0.12, 60); // tom fill
      } else if (kind === 1) {
        // Suspens: ostinato bass 16 not, timpani, string "tremolo", detik jam
        if (b % 2 === 0) ch.slice(1).forEach(n => tone('sawtooth', NOTE(n), t0, 0.6, 0.012, 8 * bt - 0.8));
        for (let q = 0; q < 4; q++) {
          const t = t0 + q * bt; if (t > dur - 0.6) break;
          for (let e = 0; e < 4; e++) tone('triangle', NOTE(ch[0] - 12 + (e === 2 ? 12 : 0)), t + e * bt / 4, 0.003, 0.08, bt * 0.2);
          if (q === 0) { tone('sine', 75, t, 0.005, 0.45, 0.6, 45); hiss(t, 0.25, 0.05, 'lowpass', 300); } // timpani
          if (q === 2) tone('sine', 120, t, 0.003, 0.3, 0.14, 45);
          hiss(t + bt / 2, 0.02, 0.05, 'highpass', 9000); // detik
        }
        if (b % 4 === 3) hiss(t0 + 2 * bt, 2 * bt, 0.08, 'bandpass', 300, 4000, 1.2); // riser
      } else {
        // Bertenaga: kick 4/4, tepukan pada 2 & 4, bass oktaf berdenyut, lead pendek
        if (b % 2 === 0) ch.slice(1).forEach(n => tone('sawtooth', NOTE(n), t0, 0.05, 0.008, 8 * bt - 0.4));
        for (let q = 0; q < 4; q++) {
          const t = t0 + q * bt; if (t > dur - 0.6) break;
          tone('sine', 160, t, 0.003, 0.38, 0.14, 45);
          if (q % 2 === 1) { hiss(t, 0.12, 0.12, 'bandpass', 1500, 0, 0.8); hiss(t + 0.012, 0.1, 0.07, 'bandpass', 2200, 0, 0.8); }
          hiss(t + bt / 2, 0.04, 0.05, 'highpass', 8000);
          tone('square', NOTE(ch[0] - 12), t, 0.005, 0.055, bt * 0.4); tone('square', NOTE(ch[0]), t + bt / 2, 0.005, 0.05, bt * 0.35);
          if (q === 3 && b % 2 === 1 && V.arp !== 2) [0, 1, 2].forEach(k => tone('triangle', NOTE(ch[1 + k] + 12), t + k * bt / 3, 0.005, 0.035, 0.15));
          if (V.arp === 2) for (let e = 0; e < 2; e++) tone('triangle', NOTE(ch[1 + ((q * 2 + e) % 3)] + 12), t + e * bt / 2, 0.005, 0.03, bt * 0.4);   // arpeggio 8 not
          if (V.hat16) hiss(t + bt / 4, 0.02, 0.03, 'highpass', 9000), hiss(t + 3 * bt / 4, 0.02, 0.03, 'highpass', 9000);
        }
      }
    }
  }
  for (const e of events) {
    const t = e.t; if (t >= dur) continue;
    if (e.kind === 'scene') hiss(t, 0.45, 0.12, 'bandpass', 400, 3000, 0.8); // whoosh
    else if (e.kind === 'shuffle') for (let i = 0; i < 9; i++) hiss(t + i * 0.055, 0.04, 0.12, 'bandpass', 2500 + (i % 3) * 600, 0, 2); // kocok kad
    else if (e.kind === 'card') { const f = 700 + (e.i % 12) * 45; tone('sine', f, t, 0.004, 0.22, 0.09, f * 1.5); hiss(t, 0.02, 0.08, 'highpass', 3000); }
    else if (e.kind === 'done') [72, 76, 79, 84].forEach((n, k) => tone('sine', NOTE(n), t + k * 0.08, 0.005, 0.16, 0.5));
    else if (e.kind === 'boom') { tone('sine', 90, t, 0.003, 0.6, 0.7, 38); hiss(t, 0.5, 0.18, 'lowpass', 900, 120); [60, 67, 72].forEach(n => tone('sawtooth', NOTE(n), t, 0.01, 0.04, 0.6)); }
    else if (e.kind === 'tick') tone('square', 1800 + (e.i % 4) * 200, t, 0.002, 0.05, 0.03);
    else if (e.kind === 'end') { [60, 64, 67, 72].forEach(n => tone('triangle', NOTE(n), t, 0.02, 0.07, 2.2)); [72, 76, 79, 84, 88].forEach((n, k) => tone('sine', NOTE(n), t + k * 0.1, 0.005, 0.14, 0.7)); }
  }
  // pudar di hujung
  if (fade) { out.gain.setValueAtTime(1.6, Math.max(0, dur - 1.2)); out.gain.linearRampToValueAtTime(0.0001, dur); }
  return ctx.startRendering();
}

// ---------- Bunyi masa nyata untuk paparan undian dalam PWA ----------
let AC = null, loopBufs = {}, loopSrc = null, loopGain = null, offT = null, loopPs = {};
const muted = () => { try { return localStorage.getItem('pingpong:drwSound') === '0'; } catch { return false; } };
export const soundOn = () => !muted();
export function setSound(on) { try { localStorage.setItem('pingpong:drwSound', on ? '1' : '0'); } catch {} if (!on) musicOff(0); }
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
}
// Kesan bunyi ringkas: dijana segera (tanpa fail)
export function sfx(kind, i = 0) {
  if (muted()) return; const c = ac(); if (!c) return;
  const t = c.currentTime + 0.01, out = c.createGain(); out.gain.value = 1.3; out.connect(c.destination);
  const tone = (type, f, at, a, peak, d, f2) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, at); if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + a + d);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + d); o.connect(g); g.connect(out); o.start(at); o.stop(at + a + d + 0.05); };
  const hiss = (at, d, peak, ftype, f, f2, q = 1) => { const n = c.createBuffer(1, Math.ceil(c.sampleRate * (d + 0.05)), c.sampleRate), x = n.getChannelData(0); for (let k = 0; k < x.length; k++) x[k] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = n; fl.type = ftype; fl.frequency.setValueAtTime(f, at); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, at + d); fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + d); s.connect(fl); fl.connect(g); g.connect(out); s.start(at); s.stop(at + d + 0.05); };
  if (kind === 'scene') hiss(t, 0.45, 0.2, 'bandpass', 400, 3000, 0.8);
  else if (kind === 'shuffle') for (let k = 0; k < 9; k++) hiss(t + k * 0.055, 0.04, 0.2, 'bandpass', 2500 + (k % 3) * 600, 0, 2);
  else if (kind === 'card') { const f = 700 + (i % 12) * 45; tone('sine', f, t, 0.004, 0.35, 0.09, f * 1.5); hiss(t, 0.02, 0.12, 'highpass', 3000); }
  else if (kind === 'done') [72, 76, 79, 84].forEach((n, k) => tone('sine', NOTE(n), t + k * 0.08, 0.005, 0.25, 0.5));
}
// Muzik latar berulang (gelung ~17 saat), bersambung antara sesi
export async function musicOn(style = 0) {
  if (muted()) return; const c = ac(); if (!c) return;
  clearTimeout(offT); offT = null;
  if (loopSrc) return; // muzik sedang berbunyi (cth. sesi seterusnya) — teruskan gaya yang sama
  if (isTrack(style) && !loopBufs[style]) { try { loopBufs[style] = await trackBuffer(style, c.sampleRate); } catch (e) { console.warn('lagu', e); style = 0; } }
  if (!loopBufs[style]) { loopPs[style] = loopPs[style] || renderSoundtrack(loopLen(style) + 0.6, [], c.sampleRate, true, false, style).then(b => (loopBufs[style] = b)); await loopPs[style]; }
  if (loopSrc || muted()) return;
  const loopBuf = loopBufs[style];
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.connect(c.destination);
  loopGain = c.createGain(); loopGain.gain.value = isTrack(style) ? 0.42 : 0.85; loopGain.connect(comp);
  loopSrc = c.createBufferSource(); loopSrc.buffer = loopBuf; loopSrc.loop = true;
  if (isTrack(style)) { loopSrc.loopStart = 0; loopSrc.loopEnd = loopBuf.duration; } else { loopSrc.loopStart = 0.3; loopSrc.loopEnd = 0.3 + loopLen(style); }
  playing = style;
  loopSrc.connect(loopGain); loopSrc.start();
}
let playing = null;
export const playingStyle = () => (loopSrc ? playing : null);
export function musicOff(delay = 500) {
  clearTimeout(offT);
  offT = setTimeout(() => { if (loopSrc) { try { loopGain.gain.setTargetAtTime(0.0001, AC.currentTime, 0.15); const s = loopSrc; setTimeout(() => { try { s.stop(); } catch {} }, 600); } catch {} loopSrc = null; } }, delay);
}

// Versi pantas untuk video panjang: muzik dirender sekali (gelung ~17 s) dan disalin berulang,
// setiap kesan bunyi dirender sekali dan dicampur terus — jauh lebih ringan untuk telefon.
export async function buildSoundtrack(dur, events, sr = 44100, style = 0) {
  if (isTrack(style)) { try { return await buildFromTrack(dur, events, sr, style); } catch (e) { console.warn('lagu', e); style = 0; } }
  const LOOP = loopLen(style), LEAD = 0.3;
  const loopB = await renderSoundtrack(LOOP + LEAD + 0.3, [], sr, true, false, style);
  const kinds = {}; const need = new Set(events.map(e => e.kind === 'card' ? 'card' + (e.i % 12) : e.kind === 'tick' ? 'tick' + (e.i % 4) : e.kind));
  await Promise.all([...need].map(async k => {
    const ev = k.startsWith('card') ? { t: 0.01, kind: 'card', i: +k.slice(4) } : k.startsWith('tick') ? { t: 0.01, kind: 'tick', i: +k.slice(4) } : { t: 0.01, kind: k };
    kinds[k] = (await renderSoundtrack(k === 'end' ? 3 : 1.2, [ev], sr, false, false)).getChannelData(0);
  }));
  const N = Math.ceil(dur * sr), out = new Float32Array(N), lp = loopB.getChannelData(0);
  const l0 = Math.round(LEAD * sr), ll = Math.round(LOOP * sr);
  for (let i = l0; i < N; i++) out[i] = lp[l0 + ((i - l0) % ll)] * 0.75;
  for (const e of events) {
    const b = kinds[e.kind === 'card' ? 'card' + (e.i % 12) : e.kind === 'tick' ? 'tick' + (e.i % 4) : e.kind]; if (!b) continue;
    const o = Math.round(e.t * sr);
    for (let j = 0; j < b.length && o + j < N; j++) out[o + j] += b[j];
  }
  const fo = Math.round(1.2 * sr);
  for (let i = 0; i < N; i++) { let v = Math.tanh(out[i] * 1.2); if (i > N - fo) v *= (N - i) / fo; out[i] = v; }
  const buf = new AudioBuffer({ length: N, numberOfChannels: 1, sampleRate: sr });
  buf.copyToChannel(out, 0);
  return buf;
}

// Runut bunyi video daripada lagu sebenar + kesan bunyi (mono, untuk pengekod video)
async function sfxBufs(events, sr) {
  const kinds = {}; const key = e => (e.kind === 'card' ? 'card' + (e.i % 12) : e.kind === 'tick' ? 'tick' + (e.i % 4) : e.kind);
  await Promise.all([...new Set(events.map(key))].map(async k => {
    const ev = k.startsWith('card') ? { t: 0.01, kind: 'card', i: +k.slice(4) } : k.startsWith('tick') ? { t: 0.01, kind: 'tick', i: +k.slice(4) } : { t: 0.01, kind: k };
    kinds[k] = (await renderSoundtrack(k === 'end' ? 3 : 1.2, [ev], sr, false, false)).getChannelData(0);
  }));
  return { kinds, key };
}
async function buildFromTrack(dur, events, sr, style) {
  const lp = await trackBuffer(style, sr), { kinds, key } = await sfxBufs(events, sr);
  const N = Math.ceil(dur * sr), out = new Float32Array(N), ll = lp.length, nc = lp.numberOfChannels;
  const chs = [...Array(nc)].map((_, c) => lp.getChannelData(c));
  const fi = Math.round(0.4 * sr);
  for (let i = 0; i < N; i++) { let v = 0; for (let c = 0; c < nc; c++) v += chs[c][i % ll]; out[i] = (v / nc) * 0.62 * (i < fi ? i / fi : 1); }
  for (const e of events) { const b = kinds[key(e)]; if (!b) continue; const o = Math.round(e.t * sr), g = e.kind === 'tick' ? 0.5 : 0.8; for (let j = 0; j < b.length && o + j < N; j++) out[o + j] += b[j] * g; }
  const fo = Math.round(2 * sr);
  for (let i = 0; i < N; i++) { let v = Math.tanh(out[i] * 1.1); if (i > N - fo) v *= (N - i) / fo; out[i] = v; }
  const buf = new AudioBuffer({ length: N, numberOfChannels: 1, sampleRate: sr }); buf.copyToChannel(out, 0);
  return buf;
}

// Hentikan semua bunyi bila aplikasi ditutup / bertukar ke aplikasi lain; sambung semula bila kembali
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (!AC) return;
  if (document.hidden) AC.suspend().catch(() => {}); else AC.resume().catch(() => {});
});
// Pratonton muzik (video ringkasan): mainkan lagu pilihan dengan pudar masuk; pulangkan fungsi henti
let _pv = null;
export async function previewMusic(style) {
  stopPreview();
  const c = ac(); if (!c) return () => {};
  let buf = null;
  try { buf = isTrack(style) ? await trackBuffer(style, c.sampleRate) : await renderSoundtrack(loopLen(style) + 0.6, [], c.sampleRate, true, false, style); } catch { return () => {}; }
  const g = c.createGain(), src = c.createBufferSource();
  g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(isTrack(style) ? 0.5 : 0.9, c.currentTime + 0.4);
  src.buffer = buf; src.loop = true; src.connect(g); g.connect(c.destination); src.start();
  const stop = (ms = 400) => { try { g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(g.gain.value, c.currentTime); g.gain.linearRampToValueAtTime(0.0001, c.currentTime + ms / 1000); src.stop(c.currentTime + ms / 1000 + 0.05); } catch {} if (_pv === stop) _pv = null; };
  _pv = stop; return stop;
}
export function stopPreview(ms) { if (_pv) _pv(ms); }
