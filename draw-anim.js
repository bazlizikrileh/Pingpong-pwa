// Animasi cabutan / undian ("video undian") — kad diagih satu persatu.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {object} o
 *  title, subtitle, intro (html), prep (teks semasa mengocok)
 *  boxes: [{ label, slots, vs }]   vs=true → paparan "A lwn B"
 *  seq:   [{ box, name, head }]    head = teks kecil di atas nama
 *  doneText
 */
export function playDeal(o) {
  document.getElementById('drw')?.remove();
  const ov = document.createElement('div');
  ov.id = 'drw';
  ov.className = 'drw';
  ov.innerHTML = `
    <div class="drw-top">
      ${(o.logos && o.logos.length ? o.logos : [null]).map(src => `<div class="drw-logo">${src ? `<img src="${esc(src)}" alt="">` : '🏓'}</div>`).join('')}
      <div style="flex:1"><b style="font-size:18px">${esc(o.title)}</b><br><small>${esc(o.subtitle || '')}</small></div>
      <button class="btn" data-x style="background:#fff;color:#000">✕</button>
    </div>
    <div class="drw-stat" id="drs">${o.intro || ''}</div>
    <div class="drw-grid">${o.boxes.map((b, i) => `
      <div class="drw-box" id="drb${i}"><b>${esc(b.label)}</b>
        ${Array.from({ length: b.slots }, (_, k) => `${b.vs && k === Math.floor(b.slots / 2) ? '<div class="drw-vs">lwn</div>' : ''}<div class="drw-slot"></div>`).join('')}
      </div>`).join('')}</div>
    <div style="text-align:center;margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <button class="btn" data-skip style="background:#fff;color:#000">⏭️ Langkau ke keputusan</button>
      <button class="btn" data-vid style="background:#25d366;color:#fff">📤 Kongsi video (WhatsApp)</button></div>
    <p class="drw-vmsg" id="drv"></p>`;
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';

  let k = 0, tm = null;
  const stat = ov.querySelector('#drs');
  const fill = (s, hl) => {
    const box = ov.querySelector('#drb' + s.box);
    const slot = [...box.querySelectorAll('.drw-slot')].find(x => !x.dataset.f);
    if (!slot) return;
    slot.dataset.f = 1;
    slot.textContent = s.name;
    slot.className = 'drw-slot filled' + (hl ? ' hl' : '');
    if (hl) {
      box.classList.add('hl');
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => { slot.classList.remove('hl'); box.classList.remove('hl'); }, 900);
    }
  };
  const step = () => {
    if (k >= o.seq.length) { stat.innerHTML = `<b style="font-size:18px">✅ ${esc(o.doneText || 'Cabutan selesai')}</b>`; return; }
    const s = o.seq[k++];
    stat.innerHTML = `<small>${esc(s.head || '')}</small>
      <div class="drw-now">🎴 ${esc(s.name)} <span class="drw-to">→ ${esc(o.boxes[s.box].label)}</span></div>
      <small>${o.seq.length - k} kad lagi</small>`;
    fill(s, true);
    tm = setTimeout(step, o.speed || 1300);
  };
  const close = () => { clearTimeout(tm); ov.remove(); document.body.style.overflow = ''; };
  ov.querySelector('[data-x]').onclick = close;
  const vb = ov.querySelector('[data-vid]'), vm = ov.querySelector('#drv');
  // Langkah 1: sediakan video. Langkah 2: pengguna tekan sekali lagi untuk kongsi
  // (Android hanya membenarkan menu kongsi terus selepas ketikan, bukan selepas menunggu video siap).
  let made = null;
  vb.onclick = async () => {
    if (vb.disabled) return;
    if (made) {
      const r = await made.share();
      vm.textContent = r.shared ? '✅ Video dikongsi.' : r.cancelled ? 'Perkongsian dibatalkan. Tekan sekali lagi untuk berkongsi.' : '⬇️ Telefon ini tidak membenarkan kongsi terus, jadi video dimuat turun. Hantar dari galeri / Fail ke WhatsApp.';
      return;
    }
    vb.disabled = true;
    vm.textContent = 'Video cabutan sedang disediakan dalam telefon ini. Jangan tutup skrin…';
    try {
      const m = await import('./draw-video.js');
      made = await m.prepareDrawVideo(o, p => (vb.textContent = `⏳ Menyediakan video… ${Math.round(p * 100)}%`));
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
  tm = setTimeout(() => {
    stat.innerHTML = `<b style="font-size:18px">🔀 ${esc(o.prep || 'Mengocok dek…')}</b>`;
    tm = setTimeout(step, 1500);
  }, o.introMs ?? 1800);
}
