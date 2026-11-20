// Animasi cabutan / undian ("video undian") — kad diagih satu persatu.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {object} o
 *  title, subtitle, intro (html), prep (teks semasa mengocok)
 *  boxes: [{ label, slots, vs }]   vs=true → paparan "A lwn B"
 *  seq:   [{ box, name, head }]    head = teks kecil di atas nama
 *  slot (dalam seq) = slot tertentu dalam kotak; boxes[].slotLabels = label slot kosong; hideTo = jangan tunjuk destinasi
 *  chips: [{ label, fn, on }] → pautan terus (cth. setiap sesi); auto: teruskan ke o.next selepas selesai
 *  video: pilihan video berlainan untuk dikongsi (cth. { scenes: [...] } semua sesi); videoLabel
 *  nav: [{ label, fn }] butang navigasi (cth. sesi lepas / ulang / seterusnya)
 *  doneText, next: { label, fn } → butang selepas selesai (cth. sesi seterusnya)
 */
// Kekalkan skrin menyala semasa undian / video disediakan (Screen Wake Lock API, jika disokong)
let _wl = null, _wlWant = 0;
export async function keepAwake(on) {
  _wlWant = Math.max(0, _wlWant + (on ? 1 : -1));
  try {
    if (_wlWant && !_wl && 'wakeLock' in navigator && document.visibilityState === 'visible') { _wl = await navigator.wakeLock.request('screen'); _wl.addEventListener('release', () => { _wl = null; }); }
    else if (!_wlWant && _wl) { const w = _wl; _wl = null; await w.release(); }
  } catch {}
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (_wlWant && document.visibilityState === 'visible') { _wlWant--; keepAwake(true); } });   // dilepaskan oleh telefon bila ditutup → minta semula
export function playDeal(o) {
  document.getElementById('drw')?.remove();
  const ov = document.createElement('div');
  ov.id = 'drw';
  ov.className = 'drw';
  ov.innerHTML = `
    <div class="drw-top">
      ${(o.logos && o.logos.length ? o.logos : [null]).map(src => `<div class="drw-logo">${src ? `<img src="${esc(src)}" alt="">` : '⚪'}</div>`).join('')}
      <div style="flex:1"><b style="font-size:18px">${esc(o.title)}</b><br><small>${esc(o.subtitle || '')}</small></div>
      ${o.sound ? `<button class="btn" data-snd style="background:rgba(255,255,255,.15);color:#fff">🔊</button>` : ''}
      <button class="btn" data-x style="background:#fff;color:#000">✕</button>
    </div>
    <div class="drw-stat" id="drs">${o.intro || ''}</div>
    <div class="drw-grid">${o.boxes.map((b, i) => `
      <div class="drw-box" id="drb${i}"><b>${esc(b.label)}</b>
        ${Array.from({ length: b.slots }, (_, k) => `${b.vs && k === Math.floor(b.slots / 2) ? '<div class="drw-vs">lwn</div>' : ''}<div class="drw-slot">${b.slotLabels ? `<small class="drw-sl">${esc(b.slotLabels[k] || '')}</small>` : ''}</div>`).join('')}
      </div>`).join('')}</div>
    ${o.chips && o.chips.length ? `<div class="drw-chips">${o.chips.map((x, i) => `<button class="btn${x.on ? ' on' : ''}" data-chip="${i}">${esc(x.label)}</button>`).join('')}</div>` : ''}
    ${o.nav && o.nav.length ? `<div class="drw-nav">${o.nav.map((n, i) => `<button class="btn" data-nav="${i}" ${n.fn ? '' : 'disabled'}>${esc(n.label)}</button>`).join('')}</div>` : ''}
    <div style="text-align:center;margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <button class="btn" data-skip style="background:#fff;color:#000">⏭️ Langkau ke keputusan</button>
      <button class="btn" data-vid style="background:#25d366;color:#fff">${esc(o.videoLabel || '📤 Kongsi video (WhatsApp)')}</button></div>
    <p class="drw-vmsg" id="drv"></p>`;
  document.body.appendChild(ov);
  keepAwake(true);
  // bunyi semasa undian (pilihan)
  let S = null;
  if (o.sound) import('./sound.js').then(m => { S = m; const sb = ov.querySelector('[data-snd]'); const upd = () => (sb.textContent = S.soundOn() ? '🔊' : '🔇'); upd();
    sb.onclick = () => { S.setSound(!S.soundOn()); upd(); if (S.soundOn() && o.music) S.musicOn(o.musicStyle || 0); };
    // gaya muzik: teruskan yang sedang berbunyi (undian berterusan), jika tidak pilih secara rawak; video guna gaya yang sama
    const st = S.playingStyle() ?? S.randomStyle(); o.musicStyle = st; if (o.video) o.video.musicStyle = st;
    if (o.music) S.musicOn(st); if (o.scene) S.sfx('scene'); }).catch(() => {});
  const snd = (k, i) => { try { S && S.sfx(k, i); } catch {} };
  document.body.style.overflow = 'hidden';

  let k = 0, tm = null, busy = false, pend = null;
  // jadual langkah seterusnya — dijeda bila aplikasi ditutup / bertukar ke aplikasi lain
  const sched = (fn, ms) => { pend = { fn, at: Date.now() + ms }; return setTimeout(() => { pend = null; fn(); }, ms); };
  const onVis = () => {
    if (document.hidden) { if (pend && !busy) { clearTimeout(tm); pend.left = Math.max(0, pend.at - Date.now()); pend.paused = true; } }
    else if (pend && pend.paused) { const p = pend; tm = sched(p.fn, Math.max(600, p.left)); }
  };
  document.addEventListener('visibilitychange', onVis);
  const stat = ov.querySelector('#drs');
  const fill = (s, hl) => {
    const box = ov.querySelector('#drb' + s.box);
    const all = [...box.querySelectorAll('.drw-slot')];
    const slot = s.slot != null ? all[s.slot] : all.find(x => !x.dataset.f);
    if (!slot || slot.dataset.f) return;
    slot.dataset.f = 1;
    const lab = slot.querySelector('.drw-sl');
    slot.innerHTML = (lab ? lab.outerHTML + ' ' : '') + esc(s.name);
    slot.className = 'drw-slot filled' + (hl ? ' hl' : '');
    if (hl) {
      box.classList.add('hl');
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => { slot.classList.remove('hl'); box.classList.remove('hl'); }, 900);
    }
  };
  const step = () => {
    if (k >= o.seq.length) {
      snd('done');
      stat.innerHTML = `<b style="font-size:18px">✅ ${esc(o.doneText || 'Cabutan selesai')}</b>${o.next ? `<div style="margin-top:8px"><button class="btn" data-next style="background:#ff7a1a;color:#fff">${esc(o.next.label)}</button></div>` : ''}`;
      const nb = stat.querySelector('[data-next]'); if (nb) nb.onclick = () => { close(); o.next.fn(); };
      if (o.auto && o.next && !busy) tm = sched(() => { if (!busy) { close(); o.next.fn(); } }, o.autoMs ?? 1600);
      else if (S && o.music) S.musicOff(3500);   // undian tamat & tiada sesi seterusnya → muzik pudar
      return;
    }
    const s = o.seq[k++];
    stat.innerHTML = `<small>${esc(s.head || '')}</small>
      <div class="drw-now">🎴 ${esc(s.name)}${o.hideTo ? '' : ` <span class="drw-to">→ ${esc(o.boxes[s.box].label)}</span>`}</div>
      <small>${o.seq.length - k} kad lagi</small>`;
    fill(s, true); snd('card', k);
    tm = sched(step, o.speed || 1300);
  };
  let awake = true;
  const close = () => { if (awake) { awake = false; keepAwake(false); } clearTimeout(tm); pend = null; document.removeEventListener('visibilitychange', onVis); ov.remove(); document.body.style.overflow = ''; if (S && o.music) S.musicOff(700); };
  ov.querySelector('[data-x]').onclick = close;
  ov.querySelectorAll('[data-chip]').forEach(b => (b.onclick = () => { const x = o.chips[+b.dataset.chip]; if (x && x.fn) { close(); x.fn(); } }));
  ov.querySelectorAll('[data-nav]').forEach(b => (b.onclick = () => { const n = o.nav[+b.dataset.nav]; if (!n || !n.fn) return; close(); n.fn(); }));
  const vb = ov.querySelector('[data-vid]'), vm = ov.querySelector('#drv');
  // Langkah 1: sediakan video. Langkah 2: pengguna tekan sekali lagi untuk kongsi
  // (Android hanya membenarkan menu kongsi terus selepas ketikan, bukan selepas menunggu video siap).
  let made = null;
  vb.onclick = async () => {
    if (vb.disabled) return;
    // semasa video disediakan / dikongsi: jangan auto ke sesi seterusnya (ia akan menutup paparan ini)
    busy = true; if (k >= o.seq.length) clearTimeout(tm);
    if (made) {
      const r = await made.share();
      busy = false; if (o.auto && o.next && k >= o.seq.length) tm = sched(() => { if (!busy) { close(); o.next.fn(); } }, 4000);
      vm.textContent = r.shared ? '✅ Video dikongsi.' : r.cancelled ? 'Perkongsian dibatalkan. Tekan sekali lagi untuk berkongsi.' : '⬇️ Telefon ini tidak membenarkan kongsi terus, jadi video dimuat turun. Hantar dari galeri / Fail ke WhatsApp.';
      return;
    }
    vb.disabled = true;
    vm.textContent = `Video cabutan sedang disediakan dalam telefon ini. Jangan tutup skrin…${o.auto ? ' (Undian di skrin dijeda dahulu; ia bersambung selepas video dikongsi.)' : ''}`;
    try {
      const m = await import('./draw-video.js');
      const vo = o.video || o, tot = m.duration(vo);
      made = await m.prepareDrawVideo(vo, (p, mode) => {
        vb.textContent = mode === 'audio' ? '🎵 Menyediakan muzik…' : mode === 'shrink' ? `🗜️ Mengecilkan saiz video… ${Math.round(p * 100)}%` : `⏳ ${mode === 'rec' ? 'Merakam' : 'Menyediakan'} video… ${Math.round(p * 100)}%`;
        if (mode === 'rec') vm.textContent = `Telefon ini perlahan mengekod, jadi video dirakam secara terus (~${Math.ceil(tot / 60)} minit). Jangan tutup skrin…`;
      });
      vb.textContent = '📤 Hantar video ke WhatsApp';
      vm.innerHTML = `✅ Video siap (${(made.file.size / 1048576).toFixed(1)} MB). Tekan butang hijau untuk pilih WhatsApp. <a href="#" id="drvDl" style="color:#fff">Atau simpan ke telefon</a>`;
      ov.querySelector('#drvDl').onclick = e => { e.preventDefault(); made.download(); vm.textContent = '⬇️ Video dimuat turun ke telefon.'; };
    } catch (e) { vb.textContent = '📤 Kongsi video (WhatsApp)'; vm.textContent = 'Gagal menyediakan video: ' + (e && e.message || e); }
    vb.disabled = false;
  };

  ov.querySelector('[data-skip]').onclick = () => {
    clearTimeout(tm);
    while (k < o.seq.length) fill(o.seq[k++], false);
    step();
  };
  tm = sched(() => {
    stat.innerHTML = `<b style="font-size:18px">🔀 ${esc(o.prep || 'Mengocok dek…')}</b>`; snd('shuffle');
    tm = sched(step, o.shufMs ?? 1500);
  }, o.introMs ?? 1800);
}
