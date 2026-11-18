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
];
export const loopLen = style => 8 * 4 * 60 / STYLES[style || 0].bpm;
export const randomStyle = () => Math.floor(Math.random() * STYLES.length);
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
    const S = STYLES[style] || STYLES[0], bt = 60 / S.bpm, chords = S.prog;
    const bars = Math.ceil((dur - 0.3) / (bt * 4));
    for (let b = 0; b < bars; b++) {
      const ch = chords[Math.floor(b / 2) % 4], t0 = 0.3 + b * 4 * bt;
      if (style === 2) {
        // Arena: kick 4/4 kuat, snare besar pada 2 & 4, bass 8 berdenyut, "brass" sawtooth pada awal bar
        tone('sawtooth', NOTE(ch[1]), t0, 0.01, 0.035, bt * 0.9); tone('sawtooth', NOTE(ch[2]), t0, 0.01, 0.03, bt * 0.9); tone('sawtooth', NOTE(ch[3]), t0, 0.01, 0.03, bt * 0.9);
        for (let q = 0; q < 4; q++) {
          const t = t0 + q * bt; if (t > dur - 0.6) break;
          tone('sine', 170, t, 0.003, 0.42, 0.15, 42);
          if (q % 2 === 1) { hiss(t, 0.18, 0.16, 'bandpass', 1300, 0, 0.7); tone('triangle', 190, t, 0.002, 0.12, 0.09, 120); }
          hiss(t + bt / 2, 0.035, 0.06, 'highpass', 8000);
          for (let e = 0; e < 2; e++) tone('square', NOTE(ch[0] - 12), t + e * bt / 2, 0.004, 0.06, bt * 0.38);
        }
        if (b % 4 === 3) for (let k = 0; k < 4; k++) tone('triangle', 110 - k * 12, t0 + 3 * bt + k * bt / 4, 0.003, 0.18, 0.12, 60); // tom fill
      } else if (style === 1) {
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
          if (q === 3 && b % 2 === 1) [0, 1, 2].forEach(k => tone('triangle', NOTE(ch[1 + k] + 12), t + k * bt / 3, 0.005, 0.035, 0.15));
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
  if (!loopBufs[style]) { loopPs[style] = loopPs[style] || renderSoundtrack(loopLen(style) + 0.6, [], c.sampleRate, true, false, style).then(b => (loopBufs[style] = b)); await loopPs[style]; }
  if (loopSrc || muted()) return;
  const loopBuf = loopBufs[style];
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.connect(c.destination);
  loopGain = c.createGain(); loopGain.gain.value = 1.25; loopGain.connect(comp);
  loopSrc = c.createBufferSource(); loopSrc.buffer = loopBuf; loopSrc.loop = true; loopSrc.loopStart = 0.3; loopSrc.loopEnd = 0.3 + loopLen(style); playing = style;
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
  const LOOP = loopLen(style), LEAD = 0.3;
  const loopB = await renderSoundtrack(LOOP + LEAD + 0.3, [], sr, true, false, style);
  const kinds = {}; const need = new Set(events.map(e => e.kind === 'card' ? 'card' + (e.i % 12) : e.kind));
  await Promise.all([...need].map(async k => {
    const ev = k.startsWith('card') ? { t: 0.01, kind: 'card', i: +k.slice(4) } : { t: 0.01, kind: k };
    kinds[k] = (await renderSoundtrack(k === 'end' ? 3 : 1.2, [ev], sr, false, false)).getChannelData(0);
  }));
  const N = Math.ceil(dur * sr), out = new Float32Array(N), lp = loopB.getChannelData(0);
  const l0 = Math.round(LEAD * sr), ll = Math.round(LOOP * sr);
  for (let i = l0; i < N; i++) out[i] = lp[l0 + ((i - l0) % ll)] * 0.75;
  for (const e of events) {
    const b = kinds[e.kind === 'card' ? 'card' + (e.i % 12) : e.kind]; if (!b) continue;
    const o = Math.round(e.t * sr);
    for (let j = 0; j < b.length && o + j < N; j++) out[o + j] += b[j];
  }
  const fo = Math.round(1.2 * sr);
  for (let i = 0; i < N; i++) { let v = Math.tanh(out[i] * 1.2); if (i > N - fo) v *= (N - i) / fo; out[i] = v; }
  const buf = new AudioBuffer({ length: N, numberOfChannels: 1, sampleRate: sr });
  buf.copyToChannel(out, 0);
  return buf;
}
