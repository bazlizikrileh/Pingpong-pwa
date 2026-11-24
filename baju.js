// Halaman tempahan baju rasmi KSAS Rimau — berasingan daripada app pingpong.
// Data: Firestore koleksi bajuOrders/{id} — { uid, name, size, sleeve, print, note, status: unpaid|claimed|paid, at }
// id = uid peranti (tanpa nama) atau uid_1 … uid_9 (satu telefon boleh order beberapa helai / untuk orang lain).
import { firebaseConfig } from './firebase-config.js';

const BASE = 45, LONG = 5;
// Kolar: nama → caj tambahan (order lama tanpa kolar = Round neck)
const COLLARS = [['Round neck', 0], ['V neck', 3], ['Polo button', 5], ['Polo V / Retro', 12]];
const collarOf = o => (COLLARS.some(c => c[0] === o.collar) ? o.collar : 'Round neck');
const collarExtra = o => COLLARS.find(c => c[0] === collarOf(o))[1];
// Saiz dewasa + saiz budak (disimpan K20 … K36)
const ADULT = [['3XS', 16, 23], ['2XS', 17, 24], ['XS', 18, 25], ['S', 19, 26], ['M', 20, 27], ['L', 21, 28], ['XL', 22, 29], ['2XL', 23, 30], ['3XL', 24, 31],
  ['4XL', 25, 32], ['5XL', 26, 33], ['6XL', 27, 34], ['7XL', 28, 35], ['8XL', 29, 36], ['9XL', 30, 36.5], ['10XL', 31, 36.5]];
const KIDS = [['K20', 10.5, 14.5], ['K22', 11.5, 15.5], ['K24', 12.5, 16.5], ['K26', 13.5, 17.5], ['K28', 14.5, 18.5], ['K30', 15.5, 20], ['K32', 16.5, 21.5], ['K34', 17.5, 22.5], ['K36', 18.5, 23.5]];
const SIZES = [...ADULT, ...KIDS].map(s => s[0]);
const sz = s => (s && s[0] === 'K' ? 'Budak ' + s.slice(1) : s);
const extra = s => (['4XL', '5XL'].includes(s) ? 5 : ['6XL', '7XL'].includes(s) ? 7 : ['8XL', '9XL', '10XL'].includes(s) ? 10 : 0);
const price = o => BASE + collarExtra(o) + (o.sleeve === 'Panjang' ? LONG : 0) + extra(o.size);
const desc = (o, sep = ' · ') => [collarOf(o), sz(o.size), o.sleeve].join(sep);
const DEADLINE = Date.parse('2026-12-12T23:59:59+08:00');
const ACC = '8881057822185';
const OWNER_HASH = '775ee7a41c79e60559c753e4dd4a0f3db5737d1972d9d93934d4bc33ab5e13cb';
const COL = 'bajuOrders';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rm = n => 'RM ' + n;
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const isOpen = () => Date.now() <= DEADLINE;
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }
const STATUS = { paid: '✅ Disahkan', claimed: '💰 Dah bayar', unpaid: '⏳ Belum bayar' };

// owner = boleh urus order (pemilik ATAU admin dalam bajuAdmins); realOwner = pemilik sebenar (boleh urus senarai admin)
let realOwner = false, admins = [], unsubAdmins = null;
// viewAs = pemilik/admin melihat halaman seperti ahli biasa (paparan sahaja; tiada perubahan kuasa)
let viewAs = false;
const adm = () => owner && !viewAs;
let F, auth, db, user = null, owner = false, orders = [], loaded = false, editing = '', filter = 'all';

// ---------- Paparan ----------
function shell() {
  $('#app').innerHTML = `
  <section class="card hero">
    <img src="baju/jersi.jpg" alt="Contoh design jersi KSAS Rimau">
    <h1>Order Baju Rasmi KSAS Rimau</h1>
    <div>${isOpen() ? '<span class="pill">Order dibuka</span>' : '<span class="pill closed">Order ditutup</span>'}<span class="pill">Tutup 12/12/2026</span><span class="pill">Pakai: game Januari 2027</span></div>
    <p class="muted">Hasil jualan menjadi dana group Rimau untuk jamuan &amp; hadiah game bulanan. Ringkasan kutipan &amp; perbelanjaan akan dikongsi dalam group.</p>
  </section>
  <section class="card">
    <h2>👕 Butiran &amp; harga</h2>
    <p class="muted" style="margin-top:0">Kain eyelet 165 gsm · nama belakang baju ikut pilihan sendiri</p>
    <table>
      <tr><td>Round neck, lengan pendek</td><td class="n"><b>${rm(BASE)}</b></td></tr>
      <tr><th colspan="2">Kolar</th></tr>
      ${COLLARS.slice(1).map(c => `<tr><td>${c[0]}</td><td class="n">+${rm(c[1])}</td></tr>`).join('')}
      <tr><th colspan="2">Lengan</th></tr>
      <tr><td>Lengan panjang</td><td class="n">+${rm(LONG)}</td></tr>
      <tr><th colspan="2">Big size</th></tr>
      <tr><td>4XL – 5XL</td><td class="n">+RM 5</td></tr>
      <tr><td>6XL – 7XL</td><td class="n">+RM 7</td></tr>
      <tr><td>8XL – 10XL</td><td class="n">+RM 10</td></tr>
    </table>
    <p class="note">Contoh: Polo button, lengan panjang, 6XL = 45 + 5 + 5 + 7 = <b>RM 62</b></p>
    <details style="margin-top:10px"><summary style="font-weight:600;cursor:pointer">👔 Rupa kolar</summary>
      <img src="baju/kolar.jpg" alt="Jenis kolar baju" style="width:100%;border-radius:12px;margin-top:8px">
      <p class="note">Pilihan yang ada: <b>Round neck</b>, <b>V neck</b>, <b>Polo</b> (button) dan <b>Premium Retro</b> (Polo V / Retro).</p>
    </details>
    <details style="margin-top:8px"><summary style="font-weight:600;cursor:pointer">📏 Carta saiz (inci)</summary>
      <img src="baju/saiz.jpg" alt="Carta saiz baju" data-zoom="baju/saiz.jpg" style="width:100%;border-radius:12px;margin-top:8px;background:#fff;cursor:zoom-in">
      <p class="note">Lebar = ketiak ke ketiak · Panjang = bahu ke bawah. Saiz budak untuk Round neck, Polo button &amp; V neck. Ketik gambar untuk besarkan.</p>
      <div class="row2" style="align-items:start;font-size:12px;gap:8px">
        <table><tr><th>Dewasa</th><th class="n">Lebar</th><th class="n">Panjang</th></tr>${ADULT.map(s => `<tr><td>${s[0]}</td><td class="n">${s[1]}"</td><td class="n">${s[2]}"</td></tr>`).join('')}</table>
        <table><tr><th>Budak</th><th class="n">Lebar</th><th class="n">Panjang</th></tr>${KIDS.map(s => `<tr><td>${s[0].slice(1)}</td><td class="n">${s[1]}"</td><td class="n">${s[2]}"</td></tr>`).join('')}</table>
      </div>
    </details>
  </section>
  <section class="card" id="formCard"></section>
  <section class="card" id="mine" hidden></section>
  <section class="card">
    <h2>💳 Bayaran</h2>
    <div class="pay">
      <img id="qr" src="baju/qr-duitnow.jpg" alt="QR DuitNow">
      <div>
        <div class="muted">AmBank Berhad</div>
        <div style="font-weight:600">AHMAD BAZLI BIN AHMAD ZIKRILEH</div>
        <div class="acc">${ACC}</div>
        <button class="btn sm" id="copyAcc" style="margin-top:6px">📋 Salin no. akaun</button>
      </div>
    </div>
    <p class="note">Ketik QR untuk besarkan / simpan. Selepas bayar, tekan <b>📎 Muat naik resit</b> pada order anda (atau <b>💰 Saya dah bayar</b> dan hantar resit kepada Ahmad). Status jadi ✅ selepas disahkan.</p>
  </section>
  <section class="card" id="admin" hidden></section>
  <section class="card" id="listCard"></section>`;
  $('#copyAcc').onclick = () => copy(ACC, 'No. akaun disalin');
  $('#qr').onclick = () => zoom('baju/qr-duitnow.jpg');
  document.querySelectorAll('[data-zoom]').forEach(i => (i.onclick = () => zoom(i.dataset.zoom)));
  $('#zoom').onclick = () => ($('#zoom').hidden = true);
  renderForm();
}

function renderForm(o = null) {
  const c = $('#formCard');
  if (!isOpen() && !adm() && !o) { c.innerHTML = '<h2>📝 Order</h2><p class="muted">Order telah ditutup pada 12/12/2026. Hubungi Ahmad jika ada pertanyaan.</p>'; return; }
  const v = o || { name: '', size: 'L', sleeve: 'Pendek', print: '', note: '', collar: 'Round neck' };
  const opt = (s, l) => `<option value="${s}"${s === v.size ? ' selected' : ''}>${l}</option>`;
  c.innerHTML = `
    <h2>📝 ${o ? 'Ubah order' : 'Order baju'}</h2>
    <label for="fName">Nama penuh / nama panggilan</label>
    <input id="fName" maxlength="50" autocomplete="name" value="${esc(v.name)}" placeholder="cth. Ahmad">
    <label for="fCollar">Kolar</label>
    <select id="fCollar">${COLLARS.map(([k, x]) => `<option value="${k}"${k === collarOf(v) ? ' selected' : ''}>${k}${x ? ` (+RM ${x})` : ''}</option>`).join('')}</select>
    <div class="row2">
      <div><label for="fSize">Saiz</label><select id="fSize"><optgroup label="Dewasa">${ADULT.map(s => opt(s[0], s[0] + (extra(s[0]) ? ` (+RM ${extra(s[0])})` : ''))).join('')}</optgroup><optgroup label="Budak">${KIDS.map(s => opt(s[0], 'Budak ' + s[0].slice(1))).join('')}</optgroup></select></div>
      <div><label for="fPrint">Nama atas baju</label><input id="fPrint" maxlength="20" value="${esc(v.print)}" placeholder="cth. AHMAD" style="text-transform:uppercase"></div>
    </div>
    <label>Lengan</label>
    <div class="seg"><button type="button" class="btn${v.sleeve === 'Pendek' ? ' on' : ''}" data-sl="Pendek">Pendek</button><button type="button" class="btn${v.sleeve === 'Panjang' ? ' on' : ''}" data-sl="Panjang">Panjang (+RM 5)</button></div>
    <label for="fNote">Catatan (pilihan)</label>
    <input id="fNote" maxlength="100" value="${esc(v.note)}" placeholder="cth. untuk anak / ambil sendiri">
    <label>Resit bayaran (pilihan)</label>
    <input type="file" id="fRcpt" accept="image/*,application/pdf,.pdf" hidden>
    <button type="button" class="btn" id="fRcptBtn" style="width:100%">📎 ${o && o.rcpt ? 'Tukar resit' : 'Lampirkan resit'} (gambar / screenshot / PDF)</button>
    <p class="note" style="margin-top:4px">Belum bayar? Boleh lampir kemudian dalam <b>Order saya</b>. Had fail 3 MB.</p>
    <div class="total"><span>Jumlah</span><b id="fTotal"></b></div>
    <button class="btn main" id="fSave">${o ? 'Simpan perubahan' : 'Hantar order'}</button>
    ${o ? '<button class="btn" id="fCancel" style="width:100%;margin-top:8px">Batal ubah</button>' : '<p class="note">Satu telefon boleh order beberapa helai (contoh untuk keluarga) — hantar satu per satu.</p>'}`;
  let sleeve = v.sleeve;
  const upd = () => ($('#fTotal').textContent = rm(price({ size: $('#fSize').value, sleeve, collar: $('#fCollar').value })));
  c.querySelectorAll('[data-sl]').forEach(b => (b.onclick = () => { sleeve = b.dataset.sl; c.querySelectorAll('[data-sl]').forEach(x => x.classList.toggle('on', x === b)); upd(); }));
  $('#fSize').onchange = upd; $('#fCollar').onchange = upd; upd();
  $('#fRcptBtn').onclick = () => $('#fRcpt').click();
  $('#fRcpt').onchange = () => { const f = $('#fRcpt').files[0]; $('#fRcptBtn').textContent = f ? `📎 ${f.name.length > 28 ? f.name.slice(0, 25) + '…' : f.name} ✓` : '📎 Lampirkan resit (gambar / screenshot / PDF)'; };
  $('#fSave').onclick = () => save({ file: $('#fRcpt').files[0] || null, name: $('#fName').value, collar: $('#fCollar').value, size: $('#fSize').value, sleeve, print: $('#fPrint').value, note: $('#fNote').value });
  if (o) $('#fCancel').onclick = () => { editing = ''; renderForm(); };
}

const line = (o, i) => `${i + 1}. ${o.print || o.name} – ${desc(o, ' – ')}${o.status === 'paid' ? ' 💰✅' : o.status === 'claimed' ? ' 💰' : ''}`;

function renderLists() {
  const mine = orders.filter(o => user && o.uid === user.uid);
  const m = $('#mine');
  m.hidden = !mine.length;
  if (mine.length) {
    m.innerHTML = `<h2>🧾 Order saya</h2><ul class="list">${mine.map(o => `
      <li><div class="who"><b>${esc(o.name)}</b> · ${desc(o)}${o.print ? ' · ' + esc(o.print) : ''} — <b>${rm(price(o))}</b>
        <small class="st ${o.status}">${STATUS[o.status]}${o.rcpt ? ' · 📎 resit dihantar' : ''}</small>
        ${o.status === 'paid' ? (o.rcpt ? `<div class="acts"><button class="btn sm" data-rview="${o.id}">📎 Lihat resit</button></div>` : '') : `<div class="acts">
          <button class="btn sm${o.rcpt ? '' : ' ok'}" data-rup="${o.id}">📎 ${o.rcpt ? 'Tukar resit' : 'Muat naik resit'}</button>${o.rcpt ? `<button class="btn sm" data-rview="${o.id}">👁 Lihat</button>` : ''}
          ${o.status === 'unpaid' ? `<button class="btn sm ok" data-claim="${o.id}">💰 Saya dah bayar</button>` : `<button class="btn sm" data-unclaim="${o.id}">↩ Belum bayar</button>`}
          ${isOpen() ? `<button class="btn sm" data-edit="${o.id}">✏️ Ubah</button><button class="btn sm danger" data-del="${o.id}">🗑 Batal</button>` : ''}</div>`}
      </div></li>`).join('')}</ul>
      ${user ? `<button class="btn sm${pushIsOn(tMember(user.uid)) ? ' ok' : ''}" id="memPush" style="margin-top:8px">${pushIsOn(tMember(user.uid)) ? '🔔 Notifikasi pengesahan: HIDUP' : '🔔 Beritahu saya bila bayaran disahkan'}</button>` : ''}
      <p class="note">Order anda disimpan pada telefon / pelayar ini — buka link yang sama untuk semak status.</p>
      <p class="note">Jumlah saya: <b>${rm(mine.reduce((s, o) => s + price(o), 0))}</b>. Selepas bayar, muat naik gambar, screenshot atau PDF resit — status terus jadi 💰 dan admin akan sahkan. Resit hanya boleh dilihat oleh anda dan admin.</p>`;
  }
  // Senarai awam
  const paid = orders.filter(o => o.status === 'paid').length, claimed = orders.filter(o => o.status === 'claimed').length;
  const shown = orders.filter(o => filter === 'all' || o.status === filter);
  $('#listCard').hidden = !adm() && !publicList;
  if (!adm()) {
    // Paparan ahli: nama & status bayaran sahaja
    if (publicList) $('#listCard').innerHTML = `
      <h2>👥 Senarai order (${orders.length})</h2>
      ${!loaded ? '<p class="muted">Memuatkan…</p>' : !orders.length ? '<p class="muted">Belum ada order. Jadilah yang pertama! 🐯</p>' : `<ul class="list">${orders.map((o, i) => `
        <li><span class="no">${i + 1}.</span><div class="who"><b>${esc(o.name)}</b></div><span class="st ${o.status}">${STATUS[o.status]}</span></li>`).join('')}</ul>`}
      <p class="note">✅ disahkan · 💰 dah bayar, menunggu semakan · ⏳ belum bayar</p>`;
    renderAdmin(); bindActs(); return;
  }
  $('#listCard').innerHTML = `
    <h2>📋 Senarai order (${orders.length})</h2>
    <div class="stats"><div><b>${paid}</b><span>✅ Disahkan</span></div><div><b>${claimed}</b><span>💰 Dah bayar</span></div><div><b>${orders.length - paid - claimed}</b><span>⏳ Belum bayar</span></div></div>
    <div class="filters">${[['all', 'Semua'], ['unpaid', '⏳ Belum'], ['claimed', '💰 Dah bayar'], ['paid', '✅ Disahkan']].map(([k, t]) => `<button class="btn sm${filter === k ? ' on' : ''}" data-f="${k}">${t}</button>`).join('')}</div>
    ${!loaded ? '<p class="muted">Memuatkan…</p>' : !shown.length ? '<p class="muted">Tiada order lagi.</p>' : `<ul class="list">${shown.map(o => `
      <li><span class="no">${orders.indexOf(o) + 1}.</span><div class="who"><b>${esc(o.name)}</b> · ${desc(o)}${o.print ? ' · ' + esc(o.print) : ''}
        ${adm() ? `<small>${rm(price(o))}${o.note ? ' · ' + esc(o.note) : ''}</small><div class="acts">
          ${o.rcpt ? `<button class="btn sm" data-rview="${o.id}">📎 Resit</button>` : ''}
          ${o.status === 'paid' ? `<button class="btn sm" data-set="${o.id}:unpaid">↩ Batal sah</button>` : `<button class="btn sm ok" data-set="${o.id}:paid">✅ Sah bayar</button>`}
          <button class="btn sm" data-edit="${o.id}">✏️</button><button class="btn sm danger" data-del="${o.id}">🗑</button></div>` : ''}
      </div><span class="st ${o.status}">${STATUS[o.status]}${o.rcpt && o.status !== 'paid' ? ' 📎' : ''}</span></li>`).join('')}</ul>`}`;
  renderAdmin();
  bindActs();
}

function renderAdmin() {
  const a = $('#admin');
  $('#adminBtn').textContent = viewAs ? '↩ Kembali ke admin' : owner ? 'Log keluar' : 'Admin';
  // Paparan ahli: bar atas bertukar warna supaya jelas sedang pratonton
  const top = document.querySelector('.top');
  top.style.background = viewAs ? '#b45309' : '';
  top.firstElementChild.textContent = viewAs ? '👁 Paparan ahli' : '🐯 Baju Rasmi KSAS Rimau';
  a.hidden = !adm();
  if (!adm()) return;
  const keep = [$('#aEmail')?.value || '', $('#aName')?.value || ''];   // jangan hilang teks yang sedang ditaip bila senarai dikemas kini
  const tally = {};
  orders.forEach(o => { const k = collarOf(o) + '|' + o.size + '|' + o.sleeve; tally[k] = (tally[k] || 0) + 1; });
  const rows = COLLARS.flatMap(([c]) => SIZES.flatMap(s => ['Pendek', 'Panjang'].map(sl => [c, sz(s), sl, tally[c + '|' + s + '|' + sl] || 0]))).filter(r => r[3]);
  const expect = orders.reduce((s, o) => s + price(o), 0);
  const got = orders.filter(o => o.status === 'paid').reduce((s, o) => s + price(o), 0);
  const claim = orders.filter(o => o.status === 'claimed').reduce((s, o) => s + price(o), 0);
  a.innerHTML = `
    <h2>🛠️ Panel admin</h2>
    <div class="stats"><div><b>${rm(expect)}</b><span>Jumlah order</span></div><div><b>${rm(got)}</b><span>✅ Disahkan</span></div><div><b>${rm(expect - got)}</b><span>Belum sah (${rm(claim)} dakwa bayar)</span></div></div>
    <h2 style="font-size:15px">Ringkasan untuk kilang (${orders.length} helai)</h2>
    ${rows.length ? `<table><tr><th>Kolar</th><th>Saiz</th><th>Lengan</th><th class="n">Helai</th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="n">${r[3]}</td></tr>`).join('')}</table>` : '<p class="muted">Tiada order lagi.</p>'}
    <div class="acts" style="margin-top:12px">
      <button class="btn sm on" data-msg="list">💬 Mesej senarai order</button>
      <button class="btn sm" data-msg="owe">💬 Mesej peringatan bayar</button>
      <button class="btn sm" id="dlCsv">⬇️ Muat turun CSV</button>
    </div>
    <div class="acts" style="margin-top:10px">
      <button class="btn sm${pushIsOn(T_ADMIN) ? ' ok' : ''}" id="admPush">${pushIsOn(T_ADMIN) ? '🔔 Notifikasi order baru: HIDUP' : '🔕 Hidupkan notifikasi order baru'}</button>
      <button class="btn sm" id="viewAsBtn">👁 Lihat sebagai ahli</button>
    </div>
    <p class="note">Admin boleh tambah order bagi pihak ahli (guna borang di atas) dan masih boleh tambah/ubah selepas order ditutup.</p>
    ${realOwner ? `<h2 style="font-size:15px;margin-top:16px">👥 Admin order</h2>
      ${admins.length ? `<ul class="list">${admins.map(x => `<li><div class="who"><b>${esc(x.name || '—')}</b><small>${esc(x.id)}</small></div><button class="btn sm danger" data-rmadm="${esc(x.id)}">Buang</button></li>`).join('')}</ul>` : '<p class="muted">Belum ada admin tambahan.</p>'}
      <div class="row2"><div><label for="aEmail">E-mel Google</label><input id="aEmail" type="email" placeholder="nama@gmail.com" autocomplete="off"></div>
      <div><label for="aName">Nama</label><input id="aName" maxlength="50" placeholder="cth. Ali"></div></div>
      <button class="btn sm on" id="aAdd" style="margin-top:10px">➕ Tambah admin</button>
      <p class="note">Admin tambahan boleh sah bayaran, ubah/padam order dan muat turun senarai, tetapi tidak boleh urus senarai admin. Mereka log masuk dengan akaun Google e-mel tersebut.</p>` : ''}`;
  $('#admPush').onclick = () => (pushIsOn(T_ADMIN) ? pushOff(T_ADMIN) : pushOn(T_ADMIN));
  $('#viewAsBtn').onclick = () => { viewAs = true; if (!editing) renderForm(); renderLists(); scrollTo({ top: 0, behavior: 'smooth' }); };
  if (realOwner) {
    $('#aEmail').value = keep[0]; $('#aName').value = keep[1];
    $('#aAdd').onclick = async () => {
      const email = $('#aEmail').value.trim().toLowerCase(), name = $('#aName').value.trim().slice(0, 50);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('E-mel tidak sah');
      $('#aEmail').value = ''; $('#aName').value = '';
      try { await F.setDoc(F.doc(db, 'bajuAdmins', email), { name, at: F.serverTimestamp() }); toast('Admin ditambah'); } catch (e) { fail(e); }
    };
    document.querySelectorAll('[data-rmadm]').forEach(b => (b.onclick = async () => {
      if (!confirm(`Buang ${b.dataset.rmadm} daripada admin order?`)) return;
      try { await F.deleteDoc(F.doc(db, 'bajuAdmins', b.dataset.rmadm)); toast('Admin dibuang'); } catch (e) { fail(e); }
    }));
  }
  document.querySelectorAll('[data-msg]').forEach(b => (b.onclick = () => showMsg(b.dataset.msg)));
  $('#dlCsv').onclick = () => {
    const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = ['No,Nama,Kolar,Saiz,Lengan,Nama atas baju,Harga (RM),Status,Catatan', ...orders.map((o, i) => [i + 1, q(o.name), q(collarOf(o)), q(sz(o.size)), o.sleeve, q(o.print), price(o), q(STATUS[o.status].slice(2).trim()), q(o.note)].join(','))].join('\n');
    const u = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: u, download: 'order-baju-rimau.csv' }).click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
}

function bindActs() {
  document.querySelectorAll('[data-f]').forEach(b => (b.onclick = () => { filter = b.dataset.f; renderLists(); }));
  if ($('#memPush')) $('#memPush').onclick = () => { const t = tMember(user.uid); pushIsOn(t) ? pushOff(t) : pushOn(t); };
  document.querySelectorAll('[data-rup]').forEach(b => (b.onclick = () => pickReceipt(b.dataset.rup)));
  document.querySelectorAll('[data-rview]').forEach(b => (b.onclick = () => viewReceipt(b.dataset.rview)));
  document.querySelectorAll('[data-claim]').forEach(b => (b.onclick = () => setStatus(b.dataset.claim, 'claimed')));
  document.querySelectorAll('[data-unclaim]').forEach(b => (b.onclick = () => setStatus(b.dataset.unclaim, 'unpaid')));
  document.querySelectorAll('[data-set]').forEach(b => (b.onclick = () => { const [id, s] = b.dataset.set.split(':'); setStatus(id, s); }));
  document.querySelectorAll('[data-edit]').forEach(b => (b.onclick = () => {
    const o = orders.find(x => x.id === b.dataset.edit); if (!o) return;
    editing = o.id; renderForm(o); $('#formCard').scrollIntoView({ behavior: 'smooth' });
  }));
  document.querySelectorAll('[data-del]').forEach(b => (b.onclick = async () => {
    const o = orders.find(x => x.id === b.dataset.del); if (!o || !confirm(`Batalkan order ${o.name} (${desc(o, ', ')})?`)) return;
    try { if (o.rcpt) await deleteReceipt(o.id); await F.deleteDoc(F.doc(db, COL, o.id)); toast('Order dibatalkan'); if (editing === o.id) { editing = ''; renderForm(); } } catch (e) { fail(e); }
  }));
}

// ---------- Notifikasi push (guna Worker & sw.js app pingpong; topik adm:baju & reg:baju:<uid>) ----------
// /sub menggantikan semua topik peranti, jadi topik baju disimpan dalam localStorage 'baju:topics' dan digabung
// dengan topik app pingpong (app pingpong juga menambah 'baju:topics' semasa pushSync).
const T_ADMIN = 'adm:baju', tMember = uid => 'reg:baju:' + uid, NLINK = 'baju';
let P = null;
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const bajuTopics = () => lsGet('baju:topics', []);
async function pushMod() {
  if (!P) P = await import('./push.js');
  return P.pushAvailable() ? P : null;
}
async function syncBaju(list) {
  try { localStorage.setItem('baju:topics', JSON.stringify(list)); } catch {}
  const m = await pushMod(); if (!m) return;
  const prev = localStorage.getItem('pingpong:pushTopics') || '';
  let app = []; try { app = JSON.parse(prev.slice(0, prev.indexOf(']') + 1)) || []; } catch {}
  app = app.filter(t => t !== T_ADMIN && !t.startsWith('reg:baju:'));
  await m.syncTopics([...new Set([...app, ...list])].slice(0, 30), true);
}
async function pushOn(topic) {
  const m = await pushMod();
  if (!m) return toast('Telefon / pelayar ini tidak menyokong notifikasi. Di iPhone: Tambah ke Skrin Utama dahulu.');
  if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
  if ((await Notification.requestPermission()) !== 'granted') return toast('Notifikasi tidak dibenarkan — semak tetapan pelayar');
  await m.subscribe();
  await syncBaju([...new Set([...bajuTopics(), topic])]);
  renderLists(); toast('🔔 Notifikasi dihidupkan');
}
async function pushOff(topic) { await syncBaju(bajuTopics().filter(t => t !== topic)); renderLists(); toast('🔕 Notifikasi dimatikan'); }
const pushIsOn = topic => bajuTopics().includes(topic) && 'Notification' in window && Notification.permission === 'granted';
async function notify(topics, title, body, tag) { try { const m = await pushMod(); if (m) m.send(topics, title, body, NLINK, tag); } catch {} }

// ---------- Mesej WhatsApp untuk group (pratonton sebelum hantar) ----------
const ORGANISER = 'Ahmad', LINK = 'https://pingpongsantai-portal.pages.dev/baju.html';
// Nama dalam mesej WhatsApp = nama atas baju (jika ada), bukan nama penuh
const bn = o => o.print || o.name;
const ICON = { paid: '✅', claimed: '💰', unpaid: '⏳' };
// Baris ringkas: "1) HANIF – M ✅" — kolar/lengan hanya jika bukan Round neck / Pendek.
// "1)" bukan "1." supaya WhatsApp tidak jadikan senarai bernombor (inden & baris jadi sempit).
const shortDesc = o => [sz(o.size), collarOf(o) !== 'Round neck' ? collarOf(o) : '', o.sleeve === 'Panjang' ? 'Lengan panjang' : ''].filter(Boolean).join(' · ');
function buildMsg(kind, withLink = false) {
  const linkTxt = t => (withLink ? `${t}\n${LINK}` : `${t}: link di 📌 pin atas group`);
  const n = orders.length, ok = orders.filter(o => o.status === 'paid').length;
  const head = `🐯 *Order Baju Rasmi KSAS Rimau*\n_Anjuran ${ORGANISER}_\n━━━━━━━━━━━━━━\n⏰ Tutup order & bayaran: Sabtu, 12 Dis 2026\n🎯 Pakai pada game Januari 2027\n`;
  if (kind === 'owe') {
    const l = orders.filter(o => o.status !== 'paid');
    return head + `\n⏳ *Belum disahkan bayaran (${l.length})*\n` + (l.length ? l.map((o, i) => `${i + 1}) ${bn(o)} – ${rm(price(o))} ${ICON[o.status]}`).join('\n') : 'Semua bayaran telah disahkan 🎉') +
      `\n\n💳 AmBank · AHMAD BAZLI BIN AHMAD ZIKRILEH\n*${ACC}*\n📎 ${linkTxt('Muat naik resit dalam link')}\n\n💰 = resit diterima, menunggu semakan\n⏳ = belum bayar`;
  }
  return head + `\n👕 *Senarai order (${n} helai)*\n` + (n ? orders.map((o, i) => `${i + 1}) ${bn(o)} – ${shortDesc(o)} ${ICON[o.status]}`).join('\n') : 'Belum ada order') +
    `\n\n✅ Disahkan bayar: ${ok}/${n}\n📝 ${linkTxt('Order & bayar')}\n\n✅ = disahkan · 💰 = menunggu semakan · ⏳ = belum bayar`;
}
// *tebal* _condong_ ~coret~ → HTML untuk pratonton ala WhatsApp
const waHtml = t => esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_\n]+)_/g, '$1<i>$2</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>')
  .replace(/(https?:\/\/[^\s<]+)/g, '<span style="color:#53bdeb">$1</span>').replace(/\n/g, '<br>');
function showMsg(kind, withLink = false) {
  const text = buildMsg(kind, withLink), z = $('#zoom');
  z.innerHTML = `<div style="width:100%;max-width:420px;max-height:100%;display:flex;flex-direction:column;gap:10px" onclick="event.stopPropagation()">
    <div style="color:#fff;font-weight:700;text-align:center">👁 Pratonton mesej — ${kind === 'owe' ? 'peringatan bayar' : 'senarai order'}</div>
    <div style="background:#0b141a;border-radius:14px;padding:12px;overflow:auto;flex:1">
      <div style="background:#005c4b;color:#e9edef;border-radius:10px 0 10px 10px;padding:8px 10px;font:14.5px/1.4 system-ui,sans-serif;margin-left:24px;word-break:break-word">${waHtml(text)}</div>
    </div>
    <label style="display:flex;gap:8px;align-items:center;color:#fff;font-size:13px;font-weight:500;margin:0"><input type="checkbox" id="mLink" style="width:auto"${withLink ? ' checked' : ''}> Sertakan link (WhatsApp akan tunjuk kad pratonton &amp; mesej jadi sempit — tekan ✕ pada kad sebelum hantar)</label>
    <div style="display:flex;gap:8px">
      <button class="btn" id="mCopy" style="flex:1">📋 Salin</button>
      <button class="btn on" id="mWa" style="flex:1;background:#25d366;border-color:#25d366">Hantar ke WhatsApp</button>
    </div>
    <button class="btn" id="mClose">Tutup</button></div>`;
  z.hidden = false;
  $('#mLink').onchange = () => showMsg(kind, $('#mLink').checked);
  $('#mCopy').onclick = () => copy(text, 'Mesej disalin');
  $('#mWa').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  $('#mClose').onclick = () => (z.hidden = true);
}

// ---------- Resit bayaran ----------
// bajuReceipts/{orderId}: { uid, img, at, n } — dibaca oleh pemilik order & admin sahaja.
// Fail besar dipecah: img dalam {orderId} (bahagian 1) + {orderId}__1 … __4 (bahagian 2–5), n = bilangan bahagian.
const RCOL = 'bajuReceipts', CHUNK = 880000, MAXPARTS = 5, PDF_MAX = 3 * 1024 * 1024;
async function readReceipt(f) {
  const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (!pdf && !f.type.startsWith('image/')) throw new Error('jenis');
  if (pdf && f.size > PDF_MAX) throw new Error('pdfbesar');
  return pdf ? new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^;,]*/, 'data:application/pdf')); r.onerror = no; r.readAsDataURL(f); }) : shrink(f);
}
async function uploadReceipt(id, f, uid) {
  const data = await readReceipt(f);
  const parts = []; for (let i = 0; i < data.length; i += CHUNK) parts.push(data.slice(i, i + CHUNK));
  if (parts.length > MAXPARTS) throw new Error('pdfbesar');
  for (let k = 1; k < parts.length; k++) await F.setDoc(F.doc(db, RCOL, `${id}__${k}`), { uid, img: parts[k], at: F.serverTimestamp() });
  await F.setDoc(F.doc(db, RCOL, id), { uid, img: parts[0], at: F.serverTimestamp(), n: parts.length });
}
async function deleteReceipt(id) {
  for (const x of [id, ...Array.from({ length: MAXPARTS - 1 }, (_, k) => `${id}__${k + 1}`)]) await F.deleteDoc(F.doc(db, RCOL, x)).catch(() => {});
}
const rcptErr = e => (e && e.message === 'jenis' ? 'Sila pilih gambar, screenshot atau PDF resit' : e && e.message === 'pdfbesar' ? 'Fail terlalu besar (had 3 MB) — cuba screenshot resit' : e && e.message === 'besar' ? 'Gambar terlalu besar — cuba screenshot' : null);
function zoom(src) { const z = $('#zoom'); z.innerHTML = ''; const i = new Image(); i.src = src; i.alt = 'Gambar'; z.append(i); z.hidden = false; }
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    for (const [max, q] of [[2000, 0.82], [1600, 0.75], [1300, 0.68], [1000, 0.6]]) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL('image/jpeg', q);
      if (d.length < 1700000) return d;
    }
    throw new Error('besar');
  } finally { URL.revokeObjectURL(url); }
}
function pickReceipt(id) {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*,application/pdf,.pdf' });
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    toast('Memuat naik resit…');
    try {
      const o = orders.find(x => x.id === id);
      await uploadReceipt(id, f, o ? o.uid : auth.currentUser.uid);
      await F.setDoc(F.doc(db, COL, id), o && o.status === 'paid' ? { rcpt: true } : { rcpt: true, status: 'claimed' }, { merge: true });
      if (!adm() && o) notify([T_ADMIN], '📎 Resit baju baru', `${o.name} · ${rm(price(o))} — sila semak & sahkan`, 'baju-rcpt-' + id);
      toast('Resit dihantar 📎 — menunggu pengesahan admin');
    } catch (e) { const m = rcptErr(e); if (m) toast(m); else fail(e); }
  };
  inp.click();
}
async function viewReceipt(id) {
  try {
    toast('Memuatkan resit…');
    const d = await F.getDoc(F.doc(db, RCOL, id));
    if (!d.exists()) return toast('Resit tidak dijumpai');
    let src = d.data().img;
    for (let k = 1; k < Math.min(d.data().n || 1, MAXPARTS); k++) src += (await F.getDoc(F.doc(db, RCOL, `${id}__${k}`))).data().img;
    if (src.startsWith('data:application/pdf')) {
      // PDF: buka sebagai fail (pelayar telefon tidak papar PDF dalam gambar)
      const bin = atob(src.split(',')[1]), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
      const o = orders.find(x => x.id === id);
      const z = $('#zoom'); z.innerHTML = '';
      const box = document.createElement('div'); box.style.cssText = 'background:var(--card);color:var(--ink);border-radius:16px;padding:20px;text-align:center;max-width:320px';
      box.innerHTML = `<div style="font-size:40px">📄</div><b>Resit PDF</b><p class="muted">${esc(o ? o.name : '')}</p>`;
      const a = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener', download: `resit-${(o ? o.name : id).replace(/[^\w-]+/g, '_')}.pdf`, className: 'btn on', textContent: '📥 Buka / muat turun PDF' });
      a.style.cssText = 'display:inline-block;text-decoration:none;margin-top:8px'; a.onclick = e => e.stopPropagation();
      box.append(a); z.append(box); z.hidden = false;
      return;
    }
    zoom(src);
  } catch (e) { fail(e); }
}

// ---------- Tindakan ----------
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { prompt('Salin teks ini:', text); }
}
function fail(e) {
  console.error(e);
  toast(e && e.code === 'permission-denied' ? 'Tidak dibenarkan (order mungkin sudah ditutup / disahkan)' : 'Gagal — semak internet dan cuba lagi');
}
async function ensureUser() {
  if (auth.currentUser) return auth.currentUser;
  await F.signInAnonymously(auth);
  return auth.currentUser;
}
async function save(v) {
  const d = { name: v.name.trim().replace(/\s+/g, ' ').slice(0, 50), collar: v.collar, size: v.size, sleeve: v.sleeve, print: v.print.trim().toUpperCase().slice(0, 20), note: v.note.trim().slice(0, 100) };
  if (!d.name) return toast('Sila isi nama');
  if (!SIZES.includes(d.size)) return toast('Pilih saiz');
  if (!COLLARS.some(c => c[0] === d.collar)) return toast('Pilih kolar');
  if (d.size[0] === 'K' && d.collar === 'Polo V / Retro') return toast('Saiz budak hanya untuk Round neck, V neck & Polo button');
  if (v.file) { try { await readReceipt(v.file); } catch (e) { return toast(rcptErr(e) || 'Fail resit tidak dapat dibaca'); } }
  const btn = $('#fSave'); btn.disabled = true;
  // Lampir resit selepas order disimpan; status terus 💰 (kecuali sudah ✅)
  const attach = async (id, uid, wasPaid) => {
    if (!v.file) return '';
    toast('Memuat naik resit…');
    try { await uploadReceipt(id, v.file, uid); await F.setDoc(F.doc(db, COL, id), wasPaid ? { rcpt: true } : { rcpt: true, status: 'claimed' }, { merge: true }); return ' Resit dihantar 📎'; }
    catch (e) { console.error(e); return ' (Resit gagal dimuat naik — cuba lagi dalam Order saya)'; }
  };
  try {
    if (editing) {
      const o = orders.find(x => x.id === editing);
      await F.setDoc(F.doc(db, COL, editing), d, { merge: true });
      toast('Order dikemas kini.' + await attach(editing, o ? o.uid : auth.currentUser.uid, o && o.status === 'paid')); editing = '';
    } else {
      const u = await ensureUser();
      const used = new Set(orders.map(o => o.id));
      const id = owner ? 'adm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        : [u.uid, ...Array.from({ length: 9 }, (_, i) => `${u.uid}_${i + 1}`)].find(x => !used.has(x));
      if (!id) { btn.disabled = false; return toast('Had 10 order dari satu telefon'); }
      await F.setDoc(F.doc(db, COL, id), { ...d, uid: u.uid, status: 'unpaid', at: F.serverTimestamp() });
      const r = await attach(id, u.uid, false);
      if (!owner) notify([T_ADMIN], '🐯 Order baju baru', `${d.name} · ${desc(d)} · ${rm(price(d))}${r.includes('📎') ? ' · 📎 resit dilampir' : ''}`, 'baju-new-' + id);
      toast(`Order diterima — ${rm(price(d))}.` + (r || ' Sila buat bayaran 💳'));
      if (!owner) return renderDone({ ...d, id, rcpt: r.includes('📎') });
    }
    renderForm();
  } catch (e) { btn.disabled = false; fail(e); }
}
// Pengesahan selepas order dihantar (ahli)
function renderDone(o) {
  const c = $('#formCard');
  c.innerHTML = `
    <div style="text-align:center"><div style="font-size:46px;line-height:1">✅</div><h2 style="margin:6px 0 2px">Order diterima!</h2>
    <p class="muted" style="margin:0">Terima kasih, ${esc(o.name)} 🐯</p></div>
    <div class="total"><span>${esc(desc(o))}${o.print ? ' · ' + esc(o.print) : ''}</span><b>${rm(price(o))}</b></div>
    <p style="margin:12px 0 4px"><b>Langkah seterusnya:</b></p>
    <p class="muted" style="margin:0">${o.rcpt ? '📎 Resit diterima — admin akan semak &amp; sahkan. Status jadi ✅ selepas disahkan.' : '1. Bayar ke AmBank <b>' + ACC + '</b> atau scan QR di bawah.<br>2. Lampirkan resit dalam <b>Order saya</b>.'}<br>Tutup order &amp; bayaran: <b>12/12/2026</b>.</p>
    <button class="btn main" id="dNotif">🔔 Beritahu saya bila bayaran disahkan</button>
    <button class="btn" id="dMore" style="width:100%;margin-top:8px">➕ Order baju lain</button>
    <p class="note">Tip: screenshot skrin ini sebagai rekod. Order anda juga tersimpan dalam <b>Order saya</b> pada telefon ini.</p>`;
  if (pushIsOn(tMember(auth.currentUser.uid))) $('#dNotif').remove();
  else $('#dNotif').onclick = () => pushOn(tMember(auth.currentUser.uid)).then(() => $('#dNotif') && $('#dNotif').remove());
  $('#dMore').onclick = () => renderForm();
  c.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function setStatus(id, status) {
  try {
    await F.setDoc(F.doc(db, COL, id), { status }, { merge: true }); toast(STATUS[status]);
    const o = orders.find(x => x.id === id);
    if (status === 'paid' && adm() && o) notify([tMember(o.uid)], '✅ Bayaran baju disahkan', `${o.name} · ${desc(o)} · ${rm(price(o))}. Terima kasih! 🐯`, 'baju-paid-' + id);
  } catch (e) { fail(e); }
}
async function adminToggle() {
  if (viewAs) { viewAs = false; if (!editing) renderForm(); renderLists(); $('#admin').scrollIntoView({ behavior: 'smooth' }); return; }
  if (owner || (auth.currentUser && !auth.currentUser.isAnonymous)) { await F.signOut(auth); toast('Log keluar'); return; }
  const p = new F.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  try { await F.signInWithPopup(auth, p); }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) return F.signInWithRedirect(auth, p);
    if (e.code !== 'auth/popup-closed-by-user') fail(e);
  }
}

// ---------- Mula ----------
// Admin: semua order. Ahli: hanya order sendiri (id = uid atau uid_1 … uid_9) — senarai penuh tidak dibaca umum.
let unsubOrders = [];
const toOrder = d => { const x = d.data(); return { id: d.id, ...x, status: STATUS[x.status] ? x.status : 'unpaid', t: x.at?.toMillis?.() || Date.now() }; };
function watchOrders() {
  unsubOrders.forEach(f => f()); unsubOrders = []; orders = []; loaded = false;
  const done = () => { orders.sort((a, b) => a.t - b.t); loaded = true; renderLists(); };
  // Senarai penuh (admin; dan ahli jika peraturan membenarkan bacaan awam). Jika ditolak → ahli baca order sendiri sahaja.
  const ownOnly = () => {
    if (!user) { publicList = false; loaded = true; renderLists(); return; }
    const mine = new Map();
    for (const id of [user.uid, ...Array.from({ length: 9 }, (_, i) => `${user.uid}_${i + 1}`)]) {
      unsubOrders.push(F.onSnapshot(F.doc(db, COL, id), d => { if (d.exists()) mine.set(id, toOrder(d)); else mine.delete(id); orders = [...mine.values()]; done(); },
        e => { console.warn(id, e); done(); }));
    }
  };
  let first = true;
  const un = F.onSnapshot(F.collection(db, COL), snap => { first = false; publicList = true; orders = []; snap.forEach(d => orders.push(toOrder(d))); done(); },
    e => { console.warn(e); publicList = false; if (owner) { loaded = true; renderLists(); toast('Tidak dapat memuatkan senarai order'); } else if (first) ownOnly(); });
  unsubOrders.push(un);
}
let publicList = false;

async function start() {
  shell(); renderLists();
  try {
    F = await import('./vendor/firebase.js');
    const app = F.initializeApp(firebaseConfig);
    auth = F.getAuth(app);
    try { await F.setPersistence(auth, F.browserLocalPersistence); } catch {}
    db = F.initializeFirestore(app, {});
    try { await F.getRedirectResult(auth); } catch {}
    $('#adminBtn').onclick = adminToggle;
    F.onAuthStateChanged(auth, async u => {
      user = u;
      const was = owner; viewAs = false;
      if (unsubAdmins) { unsubAdmins(); unsubAdmins = null; } admins = [];
      const email = u && !u.isAnonymous && u.emailVerified && u.email ? u.email.toLowerCase() : '';
      realOwner = !!email && (await sha256(email)) === OWNER_HASH;
      owner = realOwner;
      if (email && !realOwner) { try { owner = (await F.getDoc(F.doc(db, 'bajuAdmins', email))).exists(); } catch { owner = false; } }
      if (realOwner) unsubAdmins = F.onSnapshot(F.collection(db, 'bajuAdmins'), snap => { admins = []; snap.forEach(d => admins.push({ id: d.id, ...d.data() })); admins.sort((a, b) => a.id.localeCompare(b.id)); renderLists(); }, e => console.warn(e));
      if (u && !u.isAnonymous && !owner) toast('Akaun ini bukan admin order baju');
      else if (owner && !was) toast(realOwner ? 'Log masuk sebagai pemilik' : 'Log masuk sebagai admin order');
      if (was !== owner && !editing) renderForm();
      watchOrders();
      renderLists();
    });
  } catch (e) {
    console.error(e);
    $('#listCard').innerHTML = '<p class="muted">Tidak dapat bersambung. Semak internet dan muat semula.</p>';
  }
}
start();
