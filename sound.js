// Runut bunyi video cabutan: muzik latar ringan + kesan bunyi (kocok kad, cabut kad, sesi selesai) — dijana dalam telefon.
// Tiada fail audio luar; semuanya disintesis dengan OfflineAudioContext.
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

// events: [{ t, kind: 'scene'|'shuffle'|'card'|'done'|'end', i }]
export async function renderSoundtrack(dur, events, sr = 44100, music = true) {
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
    // 112 bpm, I–V–vi–IV (C–G–Am–F), 2 bar setiap kord
    const bt = 60 / 112, chords = [[48, 60, 64, 67], [43, 59, 62, 67], [45, 60, 64, 69], [41, 60, 65, 69]];
    const bars = Math.ceil((dur - 1) / (bt * 4));
    for (let b = 0; b < bars; b++) {
      const ch = chords[Math.floor(b / 2) % 4], t0 = 0.3 + b * 4 * bt;
      if (b % 2 === 0) ch.slice(1).forEach(n => tone('triangle', NOTE(n), t0, 0.25, 0.018, 8 * bt - 0.4)); // pad
      for (let q = 0; q < 4; q++) {
        const t = t0 + q * bt; if (t > dur - 0.6) break;
        tone('sine', 140, t, 0.003, 0.32, 0.16, 45); // kick
        hiss(t + bt / 2, 0.05, 0.05, 'highpass', 7000); // hi-hat
        tone('triangle', NOTE(ch[0] - 12 + (q === 3 ? 7 : 0)), t, 0.01, 0.11, bt * 0.8); // bass
        const ar = ch.slice(1); tone('square', NOTE(ar[q % 3] + 12), t + bt / 2, 0.005, 0.012, 0.18); // arpeggio pluck
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
  out.gain.setValueAtTime(1.6, Math.max(0, dur - 1.2)); out.gain.linearRampToValueAtTime(0.0001, dur);
  return ctx.startRendering();
}
