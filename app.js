import * as E from './engine.js';
import { store } from './store.js';
import { playDeal } from './draw-anim.js';
import * as cloud from './cloud.js';
import * as LV from './live.js';

const VERSION = '2.8.1';
const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');
const $head = document.getElementById('thead');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ENTRY = { single: 'Perseorangan', double: 'Regu (pasangan pilihan)', double_draw: 'Regu (pasangan diundi)', team: 'Trio / Kuartet (diundi)' };
const ENTRY_SHORT = { single: 'Perseorangan', double: 'Regu', double_draw: 'Regu diundi', team: 'Trio' };
const UNIT = t => t.entryMode === 'single' ? 'Pemain' : t.entryMode === 'team' ? E.teamWord(t) : t.entryMode === 'double_draw' ? 'Regu' : 'Pasangan';
const FORMAT = { group_ko: 'Kumpulan + kalah mati', rr: 'Liga (semua lawan semua)', ko: 'Kalah mati sahaja' };
const POOL = { '0': 'Tiada pool kalah', '3': 'Tempat ke-3 sahaja', '34': 'Tempat ke-3 & ke-4' };
const STAGE = { setup: 'Persediaan', group: 'Langsung', ko: 'Langsung', done: 'Tamat' };

function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  const nav = document.getElementById('tabs');
  el.style.bottom = nav && !nav.hidden && getComputedStyle(nav).position === 'fixed' ? (nav.offsetHeight + 10) + 'px' : '';
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), ms);
}
const load = id => { const t = store.get(id); return t ? E.migrate(t) : null; };
const save = (t, opts) => { try { store.save(t, opts); } catch (e) { toast(e.message, 4000); } };
const canAdmin = t => store.canAdmin(t.id);
const canEdit = t => store.canEdit(t.id);
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

// ---------- Kelab ----------
const CLUBS = {
  ksas: { short: 'KSAS Kumpulan Rimau', name: 'Kelab Santai Antara Sahabat (K.S.A.S) Johor Bahru · Kumpulan Rimau', logos: ['logos/ksas.webp', 'logos/ksas-pingpong.webp'], theme: { tb: '#1f4aa8', tb2: '#173a86', or: '#ff7a1a', w: '#eaf1ff', hd1: '#0b1a3f', hd2: '#1d3f8c' }, waGroup: 'KSAS Rimau - Laporan Skor' },
  kskpkpjb: { short: 'KSKPKPJB', name: 'Kelab Sukan Kebajikan Perubatan Kesihatan dan Pergigian Johor Bahru', logos: ['logos/kskpkpjb.webp'], theme: { tb: '#16803c', tb2: '#0d5a2a', or: '#e3262e', w: '#e8f6ec', hd1: '#07301b', hd2: '#0f5a2c' }, waGroup: '' },
};
function clubOf(t) {
  if (t.clubId === undefined || t.clubId === null) t.clubId = /ksas|rimau/i.test(t.club || '') ? 'ksas' : /kskp/i.test(t.club || '') ? 'kskpkpjb' : (t.club ? 'lain' : '');
  const c = CLUBS[t.clubId];
  if (c) return { ...c, id: t.clubId };
  return { id: t.clubId, short: t.club || '', name: t.club || '', logos: t.logo ? [t.logo] : [] };
}
const logosHtml = (t, cls = 'logo-badge') => clubOf(t).logos.map(src => `<span class="${cls}"><img src="${esc(src)}" alt=""></span>`).join('');
const DEFAULT_THEME = { tb: '#1f4aa8', tb2: '#173a86', or: '#ff7a1a', w: '#eaf1ff', hd1: '#0b1a3f', hd2: '#1d3f8c' };
function applyTheme(t) {
  const th = (t && clubOf(t).theme) || DEFAULT_THEME, r = document.documentElement.style;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  r.setProperty('--tb', th.tb); r.setProperty('--tb2', th.tb2); r.setProperty('--or', th.or);
  if (!dark) r.setProperty('--w', th.w); else r.removeProperty('--w');
  r.setProperty('--hd1', th.hd1 || th.tb2); r.setProperty('--hd2', th.hd2 || th.tb);
  r.setProperty('--brand', th.tb2);
  document.querySelector('meta[name=theme-color]').setAttribute('content', th.hd1 || th.tb2);
}
function resizeLogo(file) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 256 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/png'));
    };
    img.onerror = fail; img.src = URL.createObjectURL(file);
  });
}

// ---------- Avatar & nama ----------
const AV = ['#1f3a8a', '#7c2d5a', '#0f766e', '#6d28d9', '#b45309', '#15803d', '#9f1239', '#1d4ed8', '#4d7c0f', '#7e22ce'];
const initials = n => n.split(/\s+|&/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avColor = n => AV[[...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AV.length];
const av = n => `<span class="av" style="background:${avColor(n)}">${esc(initials(n) || '?')}</span>`;
function pn(t, id, cls = '', ph = '') {
  if (!id) return `<span class="pn ${cls}"><span class="nm muted">${ph ? esc(ph) : '…'}</span></span>`;
  if (id === 'BYE') return `<span class="pn ${cls}"><span class="nm muted">BYE</span></span>`;
  const n = E.pname(t, id), p = E.pobj(t, id) || {}, mem = p.members || [];
  if (mem.length > 1) {
    const i = t.participants.indexOf(p), tag = E.isTeam(t) ? (n.match(/\d+/) || [i + 1])[0] : i + 1;
    const nm = E.isTeam(t) ? `<span class="nm">${esc(n)}</span>` : `<span class="nm nm2">${mem.map(x => `<span>${esc(x)}</span>`).join('')}</span>`;
    return `<span class="pn ${cls}" data-pid="${id}"><span class="av av-n" style="background:${avColor(n)}" title="${esc(E.isTeam(t) ? n : 'Regu ' + (i + 1))}">${E.isTeam(t) ? esc((n[0] || '') + tag) : 'R' + tag}</span>${nm}</span>`;
  }
  return `<span class="pn ${cls}" data-pid="${id}">${av(n)}<span class="nm">${esc(n)}</span></span>`;
}

// ---------- Penghala ----------
window.addEventListener('hashchange', () => render());
window.addEventListener('load', () => { render(); cloud.init(); });
let _dirty = false;
const busy = () => {
  const a = document.activeElement;
  return !!document.getElementById('drw') || (a && $app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || !document.getElementById('modal').hidden;
};
function softRender() {
  if (/^#\/(pentadbir|baru)/.test(location.hash)) return;   // borang: jangan lukis semula
  if (busy()) { _dirty = true; return; }
  _dirty = false; render(true);
}
document.addEventListener('focusout', () => setTimeout(() => { if (_dirty && !busy()) softRender(); }, 150));
cloud.onChange(what => {
  updateTop();
  if (_cur && cloud.isVerifier()) cloud.watchSubmissions(_cur);
  if (what === 'pending' || what === 'tournaments' || what === 'role' || what === 'auth' || what === 'error') softRender();
});
function pendingFor(tid) { return (cloud.state.pending[tid] || []); }
function updateTop() {
  const b = document.getElementById('acct'), u = cloud.state.user;
  b.textContent = u && !u.anon ? (cloud.state.role === 'owner' ? '👑 ' : cloud.isAdmin() ? '🛡️ ' : cloud.isVerifier() ? '✅ ' : '') + (u.name || u.email).split(' ')[0] : 'Log masuk';
  const n = _cur ? pendingFor(_cur).length : Object.values(cloud.state.pending).reduce((a, l) => a + l.length, 0);
  const bell = document.getElementById('bell');
  bell.hidden = !(cloud.isVerifier() && n); document.getElementById('bellN').textContent = n;
}
document.getElementById('acct').onclick = () => showAccount();
document.getElementById('bell').onclick = () => { if (_cur) { location.hash = `#/t/${_cur}/keputusan`; setTimeout(() => document.getElementById('pendBox')?.scrollIntoView({ behavior: 'smooth' }), 200); } };
document.addEventListener('click', e => {
  const p = e.target.closest('[data-pid]');
  if (p && !e.target.closest('a.mrow, a.mc, a.bm, input, select, button')) { const t = current(); if (t) showProfile(t, p.dataset.pid); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('modal').hidden = true; });
let _cur = null, _back = 'keputusan';
const current = () => (_cur ? load(_cur) : null);

function render(keep = false) {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const y = window.scrollY;
  if (!keep) window.scrollTo(0, 0);
  document.getElementById('modal').hidden = true;
  applyTheme(null); $head.hidden = true; $tabs.hidden = true; _cur = null;
  document.getElementById('brand-title').textContent = 'Pingpong Portal';
  updateTop();
  if (!parts.length) { viewHome(); if (keep) window.scrollTo(0, y); return; }
  if (parts[0] === 'baru') return viewNew();
  if (parts[0] === 'pentadbir') return viewAdmin();
  if (parts[0] === 't') {
    const t = load(parts[1]);
    if (!t) {
      if (!cloud.state.tournaments && !cloud.state.failed) { $app.innerHTML = '<div class="empty">Memuatkan data…</div>'; return; }
      location.hash = '#/'; return;
    }
    if (cloud.isVerifier() && store.isCloud(t.id)) cloud.watchSubmissions(t.id);
    _cur = t.id;
    applyTheme(t);
    const page = parts[2] || defaultPage(t);
    if (page !== 'm') _back = page;
    renderHead(t, page);
    const views = { tetapan: viewSetup, pemain: viewPemain, langsung: viewLive, jadual: viewJadual, kumpulan: viewGroups, keputusan: viewResults, kalahmati: viewKnockout, pool: viewPool, laporan: viewReport, ranking: viewRanking, peraturan: viewRules };
    updateTop();
    if (page === 'm') viewMatch(t, parts[3]); else if (views[page]) views[page](t); else { location.hash = '#/'; return; }
    guideCard(t, page);
    if (page !== 'langsung') myStrip(t);
    if (keep) window.scrollTo(0, y);
    return;
  }
  location.hash = '#/';
}
const defaultPage = t => t.stage === 'setup' ? (canAdmin(t) ? 'tetapan' : 'pemain') : t.stage === 'done' ? (t.format === 'rr' ? 'kumpulan' : 'kalahmati') : 'langsung';

const BLN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${BLN[+m[2] - 1]} ${m[1]}` : (d || ''); };
function renderHead(t, page) {
  const c = clubOf(t);
  document.getElementById('brand-title').textContent = '← Semua pertandingan';
  $head.hidden = false;
  const f = E.SET_FORMATS[t.groupFormat];
  const play = t.matches.filter(m => m.status !== 'bye' && m.a !== 'BYE' && m.b !== 'BYE');
  const done = play.filter(m => m.status === 'done').length, pct = play.length ? Math.round(done / play.length * 100) : 0;
  const nT = E.numTablesOf(t), onT = LV.liveState(t).live.length;
  const stg = t.stage === 'setup' ? 'Persediaan' : t.stage === 'done' ? 'Tamat' : t.stage === 'group' ? (t.format === 'rr' ? 'Liga' : 'Kumpulan') : 'Kalah mati';
  const sub = [c.short, fmtDate(t.date), ENTRY_SHORT[t.entryMode], `Best of ${f.full ? '3' : f.bo}`].filter(Boolean).map(esc).join(' · ');
  $head.innerHTML = `${store.isLocal(t.id) ? '<div class="hb-test">🧪 MOD UJIAN · telefon ini sahaja</div>' : ''}<div class="hb-top">${c.logos.length ? `<div class="hb-logos">${c.logos.map(src => `<img src="${esc(src)}" alt="">`).join('')}</div>` : ''}
      <div class="hb-tt"><h1>${esc(t.name)}</h1><p>${sub}<span class="hb-cl" title="${store.isCloud(t.id) ? 'Dikongsi di awan' : 'Disimpan di peranti ini sahaja'}">${store.isCloud(t.id) ? '☁️' : '📱'}</span></p></div></div>
    <div class="hb-board">
      <div class="seg"><small>Peringkat</small><b class="${t.stage === 'group' || t.stage === 'ko' ? 'on' : ''}">${t.stage === 'group' || t.stage === 'ko' ? '<i class="pulse"></i>' : ''}${stg}</b></div>
      <div class="seg wide"><small>Perlawanan</small><b>${done}<em>/${play.length}</em></b><span class="rally"><span class="fill" style="width:${pct}%"></span><span class="ball" style="left:${pct}%"></span></span></div>
      <div class="seg"><small>Meja</small><b>${onT ? `${onT}<em>/${nT}</em>` : nT}</b></div>
    </div>`;
  const pw = UNIT(t) === 'Pemain' ? 'Pemain' : UNIT(t);
  const tabs = [['tetapan', '⚙️', 'Tetapan'], ['pemain', '👥', UNIT(t)], ['langsung', '🟢', 'Langsung'], ['jadual', '📋', 'Jadual'],
    ['kumpulan', '📊', t.format === 'rr' ? 'Liga' : 'Kumpulan'], ['keputusan', '📝', 'Keputusan']];
  if (t.format !== 'rr') tabs.push(['kalahmati', '⚔️', 'Knockout'], ['pool', '🥉', 'Pool']);
  tabs.push(['laporan', '🖨️', 'Laporan']);
  const alias = { m: (t.matches.find(x => x.id === location.hash.split('/')[4]) || {}).stage === 'group' ? 'keputusan' : 'kalahmati', ranking: 'kalahmati', peraturan: 'pemain' };
  const cur = alias[page] || page;
  const half = Math.ceil(tabs.length / 2);
  const rows = tabs.length > 4 ? [tabs.slice(0, half), tabs.slice(half)] : [tabs];
  // baris yang mengandungi tab aktif berada paling bawah (besar); baris lain di atas (kecil)
  const ai = rows.findIndex(r => r.some(x => x[0] === cur));
  const order = rows.length > 1 ? (ai === 0 ? [rows[1], rows[0]] : [rows[0], rows[1]]) : rows;
  $tabs.hidden = false;
  $tabs.innerHTML = order.map((r, i) => `<div class="trow ${i < order.length - 1 ? 'pas' : ''}">${r.map(([k, ic, l]) =>
    `<a href="#/t/${t.id}/${k}" class="${k === cur ? 'active' : ''}"><span class="ic">${ic}</span><span>${l}</span></a>`).join('')}</div>`).join('');
}
const section = (eyebrow, title) => `<div class="eyebrow">${esc(eyebrow)}</div><h2 class="h-big">${esc(title)}</h2><div class="rule"></div>`;

// ---------- Video undian ----------
const subtitleOf = t => [t.name, t.date].filter(Boolean).join(' · ');
function playGroupDraw(t) {
  const G = t.groups;
  if (!G.length) return toast('Kumpulan belum dijana');
  const seq = [], max = Math.max(...G.map(g => g.members.length));
  const go = (t.drawOrder || {}).groups;
  for (let r = 0; r < max; r++) (go && go[r] ? go[r] : G.map((_, gi) => gi)).forEach(gi => {
    const id = G[gi] && G[gi].members[r];
    if (id) seq.push({ box: gi, name: E.pname(t, id), head: `PUSINGAN ${r + 1} · SATU NAMA KE SETIAP KUMPULAN` });
  });
  playDeal({
    title: 'Cabutan Kumpulan', subtitle: subtitleOf(t), logos: clubOf(t).logos,
    intro: '<small>1. Semua nama dimasukkan ke dalam satu dek kad &nbsp; 2. Dek dikocok &nbsp; 3. Kad dicabut satu persatu dan dimasukkan ke kumpulan secara rawak. Setiap kumpulan mendapat satu nama dahulu sebelum pusingan seterusnya</small>',
    boxes: G.map(g => ({ label: `Kumpulan ${g.name}`, slots: g.members.length })), seq,
  });
}
function playUnitDraw(t) {
  const P = t.participants;
  if (!P.length) return toast('Belum diundi');
  const team = E.isTeam(t), lab = team ? E.teamWord(t) : 'Regu';
  const seq = [];
  const uo = (t.drawOrder || {}).units, sz = P[0].members.length;
  if (uo && uo.length === sz && uo.every(r => r.length === P.length))
    uo.forEach((perm, r) => perm.forEach(i => seq.push({ box: i, name: P[i].members[r], head: `PUSINGAN ${r + 1} · ${r === 0 ? 'ORANG PERTAMA' : r === 1 ? 'ORANG KEDUA' : 'ORANG KE-' + (r + 1)} SETIAP ${lab.toUpperCase()}` })));
  else P.forEach((p, i) => p.members.forEach(n => seq.push({ box: i, name: n, head: `${lab.toUpperCase()} ${i + 1}` })));
  playDeal({
    title: `Undian ${lab}`, subtitle: subtitleOf(t), logos: clubOf(t).logos,
    intro: `<small>1. Semua ${seq.length} nama peserta dimasukkan ke dalam satu dek kad &nbsp; 2. Dek dikocok &nbsp; 3. Kad dicabut satu persatu dan dimasukkan ke ${lab.toLowerCase()} secara rawak. Setiap ${lab.toLowerCase()} mendapat orang pertama dahulu, barulah orang kedua (${P[0].members.length} orang setiap ${lab.toLowerCase()})</small>`,
    boxes: P.map((p, i) => ({ label: team ? p.name : `Regu ${i + 1}`, slots: p.members.length })), seq, doneText: 'Undian selesai',
  });
}
function playBracketDraw(t, b) {
  const ms = t.matches.filter(m => m.bracket === b && m.round === 1).sort((x, y) => x.slot - y.slot);
  if (!ms.length) return toast('Carta belum dijana');
  const seq = [];
  ms.forEach((m, i) => [m.a, m.b].forEach(id => seq.push({ box: i, name: id === 'BYE' ? 'BYE' : `${E.seedLabel(t, id)} ${E.pname(t, id)}`.trim(), head: `PERLAWANAN ${i + 1}` })));
  playDeal({
    title: b === 'pool' ? 'Undian Pool Kalah' : 'Undian Kalah Mati', subtitle: subtitleOf(t), logos: clubOf(t).logos,
    intro: '<b>🔀 Menyusun bracket…</b>', prep: 'Menyusun bracket…', introMs: 600, speed: 1200,
    boxes: ms.map((m, i) => ({ label: `Perlawanan ${i + 1}`, slots: 2, vs: true })), seq, doneText: 'Bracket lengkap',
  });
}

// ---------- Laman utama ----------
function viewHome() {
  const list = store.list().map(E.migrate);
  $app.innerHTML = `
    ${section('Pingpong Portal', 'Pertandingan')}
    <p class="muted small" style="margin-top:-6px">${cloud.state.failed ? '📴 Tidak dapat menyambung ke awan. Hanya data dalam peranti ini dipaparkan.' : cloud.state.tournaments ? (cloud.state.offline ? '📴 Luar talian — memaparkan salinan terakhir' : '☁️ Disambung ke awan') : '⏳ Menyambung ke awan…'}</p>
    ${cloud.isAdmin() || cloud.state.failed || !cloud.state.ready ? `<div class="row" style="margin-bottom:14px"><a class="pill-btn orange" href="#/baru"><span class="dot"></span>Pertandingan baharu</a></div>` : ''}
    <div class="card">
      ${list.length ? list.map(t => `
        <div class="list-item">
          <a href="#/t/${t.id}" class="grow row" style="text-decoration:none;flex-wrap:nowrap">
            <span class="home-logos">${logosHtml(t, 'logo-badge sm')}</span>
            <span><strong>${esc(t.name)}</strong><br>
            <span class="muted small">${esc(clubOf(t).short || '—')} · ${ENTRY_SHORT[t.entryMode]} · ${t.participants.length} ${UNIT(t).toLowerCase()}${t.date ? ' · ' + esc(t.date) : ''}</span></span>
          </a>
          <span class="btn-stack" style="align-items:flex-end;gap:6px"><span class="pill ${t.stage === 'done' ? 'done' : t.stage === 'setup' ? '' : 'live'}">${STAGE[t.stage]}</span>
            ${store.isLocal(t.id) ? `<span class="cloud-tag">📱 Peranti ini</span>${cloud.isAdmin() ? `<button class="pill-btn small light" data-up="${t.id}">☁️ Pindah ke awan</button>` : ''}` : ''}</span>
        </div>`).join('') : `<div class="empty">Belum ada pertandingan.</div>`}
    </div>
    <details class="card fold noprint"><summary>Sandaran data</summary>
      <p class="muted">Buat masa ini data disimpan dalam peranti ini sahaja. Eksport untuk sandaran atau pindah ke peranti lain.</p>
      <div class="row"><button class="pill-btn light small" id="exp">Eksport</button>
      <label class="pill-btn light small" style="margin:0">Import<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
    </details>
    <p class="muted small" style="text-align:center">Pingpong Portal · Versi ${VERSION}</p>`;
  $app.querySelectorAll('[data-up]').forEach(b => (b.onclick = async e => {
    e.preventDefault();
    if (!confirm('Pindah pertandingan ini ke awan supaya boleh dilihat semua orang?')) return;
    try { await store.upload(b.dataset.up); toast('Dipindah ke awan'); render(true); } catch (err) { toast(err.message, 4000); }
  }));
  document.getElementById('exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' }));
    a.download = `pingpong-sandaran-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  document.getElementById('imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = store.importJSON(await f.text()); toast(`${n} pertandingan diimport`); render(); } catch { toast('Fail tidak sah'); }
  };
}

// ---------- Borang tetapan ----------
const opt = (obj, val) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${String(val) === String(k) ? 'selected' : ''}>${esc(v)}</option>`).join('');
const setOpts = Object.fromEntries(Object.entries(E.SET_FORMATS).map(([k, v]) => [k, v.label]));

function settingsForm(t, locked, part) {
  const all = settingsFormAll(t, locked);
  if (!part) return all;
  const i = all.indexOf('<div class="section-title">Acara</div>'), j = all.indexOf('<div class="section-title">Meja</div>');
  return part === 'info' ? all.slice(0, i) + all.slice(j) : all.slice(i, j);
}
function settingsFormAll(t, locked) {
  const dis = locked ? 'disabled' : '';
  return `
    <div class="section-title" style="margin-top:0">Maklumat</div>
    <label>Nama pertandingan</label><input name="name" value="${esc(t.name)}" required>
    <div class="grid2">
      <div><label>Kelab / Penganjur</label><select name="clubId">${opt({ ksas: 'KSAS Kumpulan Rimau', kskpkpjb: 'KSKPKPJB', lain: 'Lain-lain', '': '— Tiada —' }, clubOf(t).id)}</select></div>
      <div><label>Tarikh</label><input name="date" type="date" value="${esc(t.date)}"></div>
      <div><label>Masa mula</label><input name="startTime" type="time" value="${esc(t.startTime)}"></div>
      <div><label>Minit setiap sesi</label><input name="sessionMin" type="number" min="10" max="90" step="5" value="${t.sessionMin}"></div>
    </div>
    <div class="club-preview" id="clubPrev"></div>
    <div data-show="clubX" class="grid2">
      <div><label>Nama kelab / penganjur</label><input name="club" value="${esc(t.clubId === 'lain' ? t.club : '')}"></div>
      <div><label>Logo (pilihan)</label><input name="logoFile" type="file" accept="image/*"></div>
    </div>

    <div class="section-title">Acara</div>
    <label>Jenis acara</label><select name="entryMode" ${dis}>${opt(ENTRY, t.entryMode)}</select>
    <div data-show="team"><label>Saiz</label><select name="teamSize" ${dis}>${opt({ 3: 'Trio (3 orang)', 4: 'Kuartet (4 orang)' }, t.teamSize)}</select></div>
    <label>Struktur</label><select name="format" ${dis}>${opt(FORMAT, t.format)}</select>
    <div class="grid2">
      <div><label data-label="gf">Format kumpulan</label><select name="groupFormat">${opt(setOpts, t.groupFormat)}</select></div>
      <div data-show="ko"><label>Format kalah mati</label><select name="koFormat">${opt(setOpts, t.koFormat)}</select></div>
    </div>
    <label class="check"><input type="checkbox" name="handicap" ${t.handicap ? 'checked' : ''}> Handicap (mata mula, maks. 5)</label>

    <div data-show="groups">
      <div class="section-title">Kumpulan &amp; kalah mati</div>
      <div class="grid2">
        <div><label>Saiz kumpulan</label><select name="groupSize" ${dis}>${opt({ 4: 'Maks. 4', 5: 'Maks. 5' }, t.groupSize)}</select></div>
        <div><label>Bilangan kumpulan</label><select name="numGroups" ${dis}>${opt({ 0: 'Auto (ikut saiz)', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8' }, t.numGroups)}</select></div>
        <div><label>Tempat ketiga terbaik ke kalah mati</label><select name="bestThirds" ${dis}>${opt({ 0: 'Tiada', 2: '2 terbaik', 4: '4 terbaik', 6: '6 terbaik', 8: '8 terbaik' }, t.bestThirds)}</select></div>
        <div><label>Susunan kalah mati</label><select name="koMode">${opt({ M: 'Bracket cermin automatik (jika genap)', U: 'Undian selepas kumpulan tamat' }, t.koMode)}</select></div>
        <div><label>Peserta pool kalah</label><select name="pool">${opt(POOL, t.pool)}</select></div>
        <div><label>Susunan pool kalah</label><select name="poolMode">${opt({ M: 'Bracket cermin automatik (jika genap)', U: 'Undian selepas kumpulan tamat' }, t.poolMode)}</select></div>
      </div>
    </div>

    <div class="section-title">Meja</div>
    <div class="grid2">
      <div><label>Lokasi</label><select name="venue">${opt(E.VENUES, t.venue)}</select></div>
      <div><label>Bilangan meja</label><select name="numTables">${opt({ 0: 'Auto (≤16: 4 meja · lebih: 8)', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8' }, t.numTables)}</select></div>
    </div>
    <div data-show="venueX"><label>Nama tempat</label><input name="venueName" value="${esc(t.venueName)}" placeholder="cth. Dewan Kelab Sukan HSAJB"></div>

    <div class="section-title">Laporan skor</div>
    <p class="muted small" style="margin:4px 0 0">Pengadil/peserta menghantar skor terus dalam portal dengan PIN acara; penganjur atau pengesah skor mengesahkannya.</p>
    <label class="check"><input type="checkbox" name="waEnabled" ${t.waEnabled ? 'checked' : ''}> Benarkan juga lapor melalui WhatsApp (sandaran)</label>
    <div class="grid2" data-show="wa">
      <div><label>Laporan dihantar ke</label><select name="waMode">${opt({ G: 'Group (peserta pilih group)', N: 'Nombor penganjur' }, t.waMode)}</select></div>
      <div data-show="waG"><label>Nama group</label><input name="waGroup" value="${esc(t.waGroup)}" placeholder="cth. KSAS Rimau - Laporan Skor"></div>
      <div data-show="waN"><label>No. WhatsApp</label><input name="waNumber" type="tel" value="${esc(t.waNumber)}" placeholder="cth. 60123456789"></div>
    </div>`;
}

function wireForm(form) {
  const sync = () => {
    const f = form.format.value;
    const show = (k, on) => form.querySelectorAll(`[data-show="${k}"]`).forEach(el => (el.hidden = !on));
    show('team', form.entryMode.value === 'team');
    show('groups', f === 'group_ko');
    show('ko', f !== 'rr');
    show('venueX', form.venue.value === 'X');
    show('clubX', form.clubId.value === 'lain');
    show('wa', form.waEnabled.checked);
    show('waG', form.waMode.value === 'G'); show('waN', form.waMode.value === 'N');
    form.querySelector('[data-label="gf"]').textContent = f === 'rr' ? 'Format liga' : f === 'ko' ? 'Format (tidak digunakan)' : 'Format kumpulan';
    const c = CLUBS[form.clubId.value];
    form.querySelector('#clubPrev').innerHTML = c ? `${c.logos.map(src => `<span class="logo-badge"><img src="${src}" alt=""></span>`).join('')}<span class="muted small">${esc(c.name)}</span>` : '';
  };
  form.addEventListener('change', e => {
    if (e.target.name === 'clubId' && CLUBS[e.target.value] && !form.waGroup.value) form.waGroup.value = CLUBS[e.target.value].waGroup;
    sync();
  });
  sync();
}

function readSettings(form, t) {
  const v = n => (form[n] ? form[n].value : undefined);
  t.name = v('name').trim() || 'Pertandingan';
  t.clubId = v('clubId');
  t.club = t.clubId === 'lain' ? v('club').trim() : (CLUBS[t.clubId] || {}).short || '';
  t.date = v('date'); t.startTime = v('startTime');
  t.sessionMin = Math.max(5, Number(v('sessionMin')) || 30);
  t.handicap = form.handicap.checked;
  t.groupFormat = v('groupFormat'); t.koFormat = v('koFormat');
  t.koMode = v('koMode'); t.pool = v('pool'); t.poolMode = v('poolMode');
  t.venue = v('venue'); t.numTables = Number(v('numTables')) || 0; t.venueName = v('venueName').trim();
  t.waEnabled = form.waEnabled.checked;
  t.waMode = v('waMode'); t.waGroup = v('waGroup').trim(); t.waNumber = v('waNumber').replace(/\D/g, '');
  if (!form.entryMode.disabled) {
    t.entryMode = v('entryMode'); t.teamSize = Number(v('teamSize')) || 3; t.format = v('format');
    t.numGroups = Number(v('numGroups')) || 0; t.groupSize = Number(v('groupSize')) || 4; t.bestThirds = Number(v('bestThirds')) || 0;
  }
  if (t.stage !== 'setup' && t.matches.length) E.planSchedule(t);
}
async function readLogo(form, t) {
  const file = form.logoFile && form.logoFile.files[0];
  if (!file || t.clubId !== 'lain') return;
  try { t.logo = await resizeLogo(file); } catch { toast('Logo tidak dapat dibaca'); }
}

function viewNew() {
  const t = E.newTournament();
  t.clubId = ls.get('pingpong:lastClub') ?? 'ksas';
  t.waGroup = (CLUBS[t.clubId] || {}).waGroup || '';
  $app.innerHTML = `${section('Pertandingan', 'Cipta baharu')}
    <p class="notice small">${cloud.isAdmin() ? '☁️ Pertandingan ini akan disimpan di awan dan boleh dilihat semua orang.' : '📱 Anda belum log masuk sebagai admin, jadi pertandingan ini disimpan dalam peranti ini sahaja (sesuai untuk ujian). Ia boleh dipindah ke awan kemudian.'}</p>
    <form class="card" id="f">${cloud.isAdmin() ? `<label class="test-chk"><input type="checkbox" id="isTest"> <span>🧪 <b>Pertandingan ujian</b><br><small class="muted">Disimpan di telefon ini sahaja, tidak dikongsi. Sesuai untuk mencuba tetapan, undian dan aliran skor.</small></span></label>` : ''}${settingsForm(t, false)}
      <div style="margin-top:18px" class="row"><button class="pill-btn orange"><span class="dot"></span>Seterusnya: peserta</button> <a href="#/" class="pill-btn light">Batal</a></div>
    </form>`;
  const f = document.getElementById('f');
  if (f) wireForm(f);
  if (f) f.onsubmit = async e => {
    e.preventDefault(); readSettings(f, t); await readLogo(f, t);
    const test = !!(document.getElementById('isTest') || {}).checked || !cloud.isAdmin();
    if (test) { t.test = true; if (!/ujian/i.test(t.name)) t.name += ' (Ujian)'; }
    save(t, { forceCloud: cloud.isAdmin() && !test });
    ls.set('pingpong:lastClub', t.clubId);
    location.hash = `#/t/${t.id}/tetapan`;
  };
}

// ---------- Tetapan & peserta ----------
function entryHint(t) {
  const hc = t.handicap ? ' Handicap dalam kurungan di hujung, cth. <i>Ali, Farmasi (2)</i>.' : '';
  if (t.entryMode === 'single') return 'Satu pemain setiap baris: <i>Nama, Jabatan / Unit</i>.' + hc;
  if (t.entryMode === 'double') return 'Satu pasangan setiap baris: <i>Pemain 1 &amp; Pemain 2, Jabatan / Unit</i>.' + hc;
  return 'Satu peserta setiap baris: <i>Nama, Jabatan / Unit</i>. Peserta diundi rawak ' + (E.isTeam(t) ? `ke dalam ${E.teamWord(t).toLowerCase()} ${t.teamSize} orang. Setiap pertemuan: 1 perseorangan + 1 regu.` : 'berpasangan (bilangan mesti genap).');
}

// Paparan peserta (bukan admin): senarai sahaja
function viewParticipants(t) {
  const unit = UNIT(t);
  $app.innerHTML = `${section('Peserta', `Senarai ${unit}`)}
    <div class="card">${t.participants.length ? `<div class="mlist">${t.participants.map((p, i) => `<div class="list-item"><span class="row" style="flex-wrap:nowrap"><span class="muted small" style="width:22px">${i + 1}.</span>${pn(t, p.id)}</span>
      <span class="muted small" style="text-align:right">${esc(E.isTeam(t) ? p.members.join(', ') : p.unit || '')}${t.handicap && p.hc ? ` · HC ${p.hc}` : ''}</span></div>`).join('')}</div>` : '<p class="muted">Senarai belum diterbitkan.</p>'}
      ${E.usesDraw(t) && t.participants.length ? '<div class="btn-stack" style="margin-top:12px"><button class="pill-btn" id="playU"><span class="dot"></span>▶ Tonton undian</button></div>' : ''}
    </div>
    <p class="muted small">Penganjur: tekan <b>Log masuk</b> di atas untuk mengurus pertandingan ini.</p>`;
  const pu = document.getElementById('playU'); if (pu) pu.onclick = () => playUnitDraw(t);
}

function viewSetupCore(t, part = 'tetapan') {
  if (!canAdmin(t)) return part === 'pemain' ? viewParticipants(t) : viewInfo(t);
  const locked = t.stage !== 'setup';
  const unit = UNIT(t), draw = E.usesDraw(t);
  const plist = t.participants.length ? `<div class="tw"><table><thead><tr><th>#</th><th class="l">${unit}</th><th class="l">Unit</th>${t.handicap ? '<th>HC</th>' : ''}</tr></thead><tbody>
      ${t.participants.map((p, i) => `<tr><td>${i + 1}</td><td class="l">${draw ? pnUnit(t, p.id) : `<input data-pn="${p.id}" value="${esc(p.name)}" style="min-width:130px">`}</td>
      <td class="l muted small">${esc(draw ? p.unit || '' : p.unit || '')}</td>
      ${t.handicap ? `<td><input data-hc="${p.id}" type="number" min="0" max="5" value="${p.hc || 0}" style="width:60px"></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '';
  const isTest = store.isLocal(t.id);
  const op = k => (ls.get('pingpong:fold:' + t.id + ':' + k) ?? '') === '1' ? 'open' : (ls.get('pingpong:fold:' + t.id + ':' + k) ?? '') === '0' ? '' : null;
  const fo = (k, def) => { const v = op(k); return v === null ? (def ? 'open' : '') : v; };
  const listCard = draw
    ? `<h3>${unit} (${t.participants.length})</h3>${plist || `<p class="muted">Belum diundi. ${t.individuals.length ? `${t.individuals.length} individu sedia. Tekan <b>Undi ${unit.toLowerCase()}</b> di bawah.` : 'Tambah senarai individu di bawah.'}</p>`}
       ${t.participants.length ? `<button type="button" class="pill-btn small" id="playU"><span class="dot"></span>▶ Tonton undian</button>` : ''}`
    : `<h3>${unit} (${t.participants.length})</h3>${plist || '<p class="muted">Belum ada peserta. Tambah di bawah.</p>'}`;
  const P = part === 'pemain';
  $app.innerHTML = P ? `
    ${section('Peserta', `Senarai ${unit}`)}
    <div class="card" id="entries">${listCard}
      ${locked && t.participants.length ? '<div class="row" style="margin-top:10px"><button type="button" class="pill-btn light small" id="saveP">Simpan nama/handicap</button></div><p class="muted small">Jadual sudah dijana; senarai dikunci. Nama dan handicap masih boleh dibetulkan.</p>' : ''}</div>

    <details class="card fold" data-fold="add" ${fo('add', !locked)}><summary>➕ Tambah / undi peserta</summary>
      ${locked ? '<p class="muted small">Senarai dikunci kerana jadual sudah dijana. Gunakan <b>↺ Reset jadual</b> untuk mengubah peserta.</p>' : draw ? `
        <p class="muted small">${entryHint(t)}</p>
        <label>Senarai individu (${t.individuals.length})</label>
        <textarea id="ind">${esc(t.individuals.map(x => x.name + (x.unit ? ', ' + x.unit : '')).join('\n'))}</textarea>
        <div class="row" style="margin-top:10px"><button type="button" class="pill-btn light" id="saveP">Simpan senarai</button>
          <button type="button" class="pill-btn orange" id="undi"><span class="dot"></span>Undi ${unit.toLowerCase()}</button></div>` : `
        <p class="muted small">${entryHint(t)}</p>
        <textarea id="people">${esc(t.participants.map(p => p.name + (p.unit ? ', ' + p.unit : '') + (t.handicap && p.hc ? ` (${p.hc})` : '')).join('\n'))}</textarea>
        <div class="row" style="margin-top:10px"><button type="button" class="pill-btn light" id="saveP">Simpan senarai</button></div>`}
      ${!locked && isTest ? `<div class="test-seed"><button type="button" class="pill-btn small seed" id="seed24">👥 Isi 24 peserta (UJIAN)</button>
        <span class="muted small">${t.entryMode === 'single' ? '24 pemain' : t.entryMode === 'double' ? '12 pasangan' : '24 individu sedia untuk diundi'}</span></div>` : ''}
      ${!locked && t.format !== 'ko' ? `<details class="fold sub"><summary>Import kumpulan yang telah diundi</summary>
        <p class="muted small">Gunakan jika undian dibuat di luar sistem. Satu kumpulan setiap baris:<br><i>A | Azim &amp; Jay | Dora &amp; Chenjun | Alex &amp; Maggie</i></p>
        <textarea id="mgt" rows="4"></textarea>
        <button type="button" class="pill-btn light small" id="impg" style="margin-top:8px">Import kumpulan</button></details>` : ''}
    </details>

`
  : `
    ${section('Tetapan', 'Tetapan Pertandingan')}
    <form id="f">
    <details class="card fold" data-fold="info" ${fo('info', false)}><summary>⚙️ Maklumat pertandingan &amp; tetapan meja</summary>
      ${settingsForm(t, locked, 'info')}
      <p class="muted small">Meja: ${E.tablesOf(t).map(esc).join(', ')}</p>
      <button class="pill-btn brand" style="margin-top:6px">Simpan tetapan</button>
    </details>

    <details class="card fold" data-fold="fmt" ${fo('fmt', !locked)}><summary>🏓 Format &amp; jana jadual</summary>
      ${settingsForm(t, locked, 'fmt')}
      <div class="row" style="margin-top:14px">
        <button class="pill-btn light">Simpan format</button>
        ${!locked ? `<button type="button" class="pill-btn brand" id="draw"><span class="dot"></span>Jana ${t.format === 'ko' ? 'carta kalah mati' : 'kumpulan & jadual'}</button>` : ''}
      </div>
      <p class="muted small">${locked ? `Status: ${t.matches.length} perlawanan telah dijana.` : 'Status: jadual belum dijana.'}</p>
      <div class="row noprint" style="margin-top:6px">
        ${locked || t.participants.length ? `<button type="button" class="pill-btn light small" id="reset2">↺ Reset jadual (kekal peserta)</button>` : ''}
        <button type="button" class="pill-btn danger small" id="resetAll">Reset semua</button>
      </div>
    </details>
    </form>
    ${store.isCloud(t.id) ? `<div class="card"><div class="section-title" style="margin-top:0">PIN pengadil &amp; peserta</div>
      <p class="muted small">Kongsi PIN ini dalam group WhatsApp pertandingan. Sesiapa yang ada PIN boleh menghantar skor; skor hanya dikira selepas disahkan penganjur atau pengesah skor.</p>
      <div class="row"><input id="pin" inputmode="numeric" maxlength="8" placeholder="cth. 2468" style="max-width:160px;font-family:var(--mono);font-size:18px">
      <button class="pill-btn brand small" id="savePin">Simpan PIN</button><button class="pill-btn light small" id="genPin">Jana rawak</button></div>
      <p class="muted small" id="pinMsg"></p></div>`
      : `<div class="notice">📱 Pertandingan ini disimpan dalam peranti ini sahaja. ${cloud.isAdmin() ? '<button class="pill-btn small brand" id="upNow">☁️ Pindah ke awan</button>' : 'Log masuk sebagai admin untuk memindahkannya ke awan supaya semua orang boleh melihat dan menghantar skor.'}</div><br>`}
    ${testTools(t)}
    <div class="card noprint"><button class="pill-btn danger small" id="del">Padam pertandingan</button></div>`;
  $app.querySelectorAll('details[data-fold]').forEach(d => (d.ontoggle = () => ls.set('pingpong:fold:' + t.id + ':' + d.dataset.fold, d.open ? '1' : '0')));

  const f = document.getElementById('f');
  if (f) wireForm(f);
  if (f) f.onsubmit = async e => { e.preventDefault(); const was = t.entryMode; readSettings(f, t); await readLogo(f, t); const msg = E.switchEntry(t, was); save(t); toast(msg || 'Tetapan disimpan', msg ? 6000 : 2600); render(); };
  if (!locked && f) ['entryMode', 'teamSize'].forEach(n => f[n] && f[n].addEventListener('change', () => {
    const was = t.entryMode, wasSz = t.teamSize; readSettings(f, t);
    const msg = E.switchEntry(t, was, wasSz); save(t); if (msg) toast(msg, 6000); render();
  }));
  const pinIn = document.getElementById('pin');
  if (pinIn) {
    cloud.getPin(t.id).then(p => { if (document.activeElement !== pinIn) pinIn.value = p || ''; document.getElementById('pinMsg').textContent = p ? `PIN semasa: ${p}` : 'Belum ada PIN — pengadil belum boleh menghantar skor.'; }).catch(() => {});
    document.getElementById('genPin').onclick = () => { pinIn.value = String(Math.floor(1000 + Math.random() * 9000)); };
    document.getElementById('savePin').onclick = async () => {
      const v = pinIn.value.trim();
      if (!/^\d{4,8}$/.test(v)) return toast('PIN mesti 4–8 digit');
      try { await cloud.setPin(t.id, v); document.getElementById('pinMsg').textContent = `✅ PIN disimpan: ${v}`; } catch (err) { toast('Gagal: ' + (err.code || err.message), 4000); }
    };
  }
  const upNow = document.getElementById('upNow');
  wireTestTools(t);
  if (upNow) upNow.onclick = async () => { try { await store.upload(t.id); toast('Dipindah ke awan'); render(); } catch (err) { toast(err.message, 4000); } };
  const readEntries = () => {
    if (locked || !document.getElementById(draw ? 'ind' : 'people')) return;
    if (draw) E.setIndividualsFromLines(t, document.getElementById('ind').value.split('\n'));
    else E.setParticipantsFromLines(t, document.getElementById('people').value.split('\n'));
  };
  const readRenames = () => {
    $app.querySelectorAll('[data-pn]').forEach(i => { const p = E.pobj(t, i.dataset.pn); if (p && i.value.trim()) p.name = i.value.trim(); });
    $app.querySelectorAll('[data-hc]').forEach(i => { const p = E.pobj(t, i.dataset.hc); if (p) p.hc = Math.max(0, Math.min(5, Number(i.value) || 0)); });
  };
  const saveP = document.getElementById('saveP');
  if (saveP) saveP.onclick = () => { readRenames(); readEntries(); save(t); toast('Disimpan'); render(); };
  const undi = document.getElementById('undi');
  if (undi) undi.onclick = () => {
    readEntries();
    if (t.participants.length && !confirm('Undian sedia ada akan diganti. Teruskan?')) return;
    try { E.drawUnits(t); save(t); render(); playUnitDraw(t); } catch (err) { toast(err.message, 4000); }
  };
  const playU = document.getElementById('playU');
  if (playU) playU.onclick = () => playUnitDraw(t);
  const impg = document.getElementById('impg');
  if (impg) impg.onclick = () => {
    const lines = document.getElementById('mgt').value.split('\n');
    if (t.participants.length && !confirm('Senarai sedia ada akan diganti. Teruskan?')) return;
    try {
      if (f) readSettings(f, t); E.importGroups(t, lines); save(t);
      toast(`${t.participants.length} ${unit.toLowerCase()} dalam ${t.groups.length} kumpulan diimport`);
      location.hash = `#/t/${t.id}/kumpulan`;
    } catch (err) { toast(err.message, 4000); }
  };
  const drawBtn = document.getElementById('draw');
  if (drawBtn) drawBtn.onclick = () => {
    readSettings(f, t);
    if (draw) readRenames(); else readEntries();
    if (t.participants.length < 2) return toast(draw ? `Tekan Undi ${unit.toLowerCase()} dahulu di tab 👥 ${unit} sebelum menjana jadual.` : `Perlu sekurang-kurangnya 2 ${unit.toLowerCase()}`);
    if (t.format === 'rr' && t.participants.length > 16 && !confirm('Liga disyorkan sehingga 16 peserta sahaja. Teruskan?')) return;
    if (!confirm(`Jana ${t.format === 'ko' ? 'carta kalah mati' : 'kumpulan dan jadual'} untuk ${t.participants.length} ${unit.toLowerCase()}?`)) return;
    try {
      if (t.format === 'ko') { t.groups = []; t.matches = []; t.rounds = {}; t.stage = 'ko'; E.buildKO(t); }
      else E.drawGroups(t);
      save(t);
      location.hash = `#/t/${t.id}/${t.format === 'ko' ? 'kalahmati' : 'kumpulan'}`;
      setTimeout(() => (t.format === 'ko' ? playBracketDraw(t, 'ko') : t.format === 'rr' ? null : playGroupDraw(t)), 300);
    } catch (err) { toast(err.message, 4000); }
  };
  const r2 = document.getElementById('reset2');
  if (r2) r2.onclick = () => {
    if (!confirm('Padam semua perlawanan dan kumpulan, tetapi KEKALKAN senarai peserta?')) return;
    const msg = E.resetSchedule(t, false); save(t); toast(msg, 6000); render();
  };
  const ra = document.getElementById('resetAll');
  if (ra) ra.onclick = () => {
    if (!confirm(`Padam SEMUA ${unit.toLowerCase()}, individu, kumpulan dan perlawanan? Tetapan pertandingan dikekalkan.`)) return;
    const msg = E.resetSchedule(t, true); save(t); toast(msg, 6000); render();
  };
  const sd = document.getElementById('seed24');
  if (sd) sd.onclick = () => {
    if ((t.participants.length || t.individuals.length) && !confirm('Senarai peserta sedia ada akan diganti dengan 24 nama ujian.')) return;
    const msg = E.seedTest24(t); save(t); toast(msg, 6000); render();
  };
  const dl = document.getElementById('del');
  if (dl) dl.onclick = async () => {
    if (!confirm(`Padam "${t.name}" sepenuhnya?`)) return;
    try { await store.remove(t.id); location.hash = '#/'; } catch (err) { toast(err.message, 4000); }
  };
}

// ---------- Baris perlawanan (gaya LekaPong) ----------
function chipsHtml(t, m) {
  if (!m.rubbers.some(r => r.sets.length)) return '';
  const wa = m.winner === m.a, wb = m.winner === m.b;
  return m.rubbers.map((r, i) => `<div class="chips">${E.isTeam(t) ? `<span class="muted small" style="align-self:center">${i ? 'Regu' : 'Single'}</span>` : ''}${r.sets.map(([x, y]) =>
    `<span class="chip ${(x > y && wa) || (y > x && wb) ? 'w' : ''}">${x}-${y}</span>`).join('')}</div>`).join('');
}
// Kad perlawanan gaya papan skor: dua baris (satu setiap pihak), skor setiap game dalam lajur, jumlah set di kanan.
function sideName(t, id, src) {
  if (!id) return `<span class="mc-n ph">${esc(E.placeholderLabel(src) || 'Menunggu')}</span>`;
  if (id === 'BYE') return '<span class="mc-n ph">BYE</span>';
  const p = E.pobj(t, id) || {}, mem = p.members || [], draw = E.usesDraw(t);
  if (mem.length > 1 && draw) {
    const i = t.participants.indexOf(p) + 1, label = E.isTeam(t) ? p.name : `Regu ${i}`;
    return `<span class="mc-n" data-pid="${id}"><b>${esc(label)}</b><small>${mem.map(esc).join(' · ')}</small></span>`;
  }
  return `<span class="mc-n" data-pid="${id}"><b>${esc(E.pname(t, id))}</b>${p.unit ? `<small>${esc(p.unit)}</small>` : ''}</span>`;
}
function sideAv(t, id) {
  if (!id || id === 'BYE') return '<span class="av av-ph"></span>';
  const p = E.pobj(t, id) || {}, n = E.pname(t, id);
  if ((p.members || []).length > 1 && E.usesDraw(t)) {
    const i = t.participants.indexOf(p) + 1, tag = E.isTeam(t) ? E.teamWord(t)[0] + ((n.match(/\d+/) || [i])[0]) : 'R' + i;
    return `<span class="av av-n" style="background:${avColor(n)}">${esc(tag)}</span>`;
  }
  return av(n);
}
function matchRow(t, m, no) {
  const r = E.evaluateMatch(t, m), team = E.isTeam(t);
  const has = m.rubbers.some(x => x.sets.length), done = m.status === 'done', live = !done && (m.lt || has);
  // lajur: game (single/regu) atau pertemuan (trio: Single, Regu → set dimenangi)
  const cols = team
    ? m.rubbers.map((rb, i) => { const a = rb.sets.filter(([x, y]) => x > y).length, b = rb.sets.filter(([x, y]) => y > x).length; return { a: rb.sets.length ? a : '', b: rb.sets.length ? b : '', lab: i ? 'R' : 'P' }; })
    : (m.rubbers[0] || { sets: [] }).sets.map(([x, y]) => ({ a: x, b: y }));
  const ta = team ? r.ra : r.sa, tb = team ? r.rb : r.sb;
  const h = E.handicapInfo(t, m.a, m.b);
  const ctx = m.stage !== 'group' ? E.stageLabel(t, m) : (t.format === 'rr' ? 'Liga' : `Kumpulan ${m.group}`);
  const status = done ? '<span class="mc-st ok">✓ Selesai</span>'
    : m.lt ? `<span class="mc-st on"><i class="pulse"></i>Meja ${m.lt}</span>`
    : has ? '<span class="mc-st on">Sedang dimainkan</span>'
    : `<span class="mc-st">${[m.table ? esc(m.table.replace(/ \(.*\)/, '')) : '', m.session ? esc(E.sessionTime(t, m.session)) : ''].filter(Boolean).join(' · ')}</span>`;
  const side = (id, src, mine, other, key) => {
    const win = done && m.winner && m.winner === id;
    return `<div class="mc-r ${win ? 'w' : done ? 'l' : ''}">${sideAv(t, id)}${sideName(t, id, src)}
      ${cols.map(c => `<span class="mc-g ${c[key] !== '' && c[key] > c[key === 'a' ? 'b' : 'a'] ? 'gw' : ''}">${c[key]}</span>`).join('')}
      <span class="mc-t">${has || done ? mine : ''}</span></div>`;
  };
  const notes = [h && h.n ? `HC: ${esc(E.pname(t, h.to))} +${h.n}` : '',
    ls.get('pingpong:draft:' + m.id) && !done ? '<span class="draft">✏️ draf</span>' : '',
    ls.get('pingpong:sent:' + m.id) && !done ? '<span class="draft">⏳ menunggu pengesahan</span>' : '',
    _cur && pendingFor(_cur).some(x => x.matchId === m.id) ? '<span class="role-chip">🔔 skor dihantar</span>' : ''].filter(Boolean).join(' · ');
  return `<a class="mc ${done ? 'done' : live ? 'live' : ''}" href="#/t/${t.id}/m/${m.id}" style="--cols:28px minmax(0,1fr) ${'24px '.repeat(cols.length)}40px">
    <div class="mc-h"><span class="mc-code">${esc(no ?? (E.matchCode(m) || ''))}</span><span class="mc-ctx">${esc(ctx)}</span>${status}</div>
    ${side(m.a, m.srcA, ta, tb, 'a')}${side(m.b, m.srcB, tb, ta, 'b')}
    ${notes ? `<div class="mc-f">${notes}</div>` : ''}
  </a>`;
}

// ---------- Pengesahan skor ----------
const fmtRub = (t, rs) => rs.map((sets, i) => (rs.length > 1 ? (i ? 'Regu: ' : 'Single: ') : '') + sets.map(s => s.join('-')).join(', ')).join(' · ');
function pendingCard(t, sub) {
  const m = t.matches.find(x => x.id === sub.matchId);
  if (!m) return '';
  const r = E.evaluateMatch(t, { ...m, rubbers: sub.rubbers.map(sets => ({ sets })) });
  const res = r.complete && r.winner ? `${esc(E.pname(t, r.winner))} menang` : r.complete && r.draw ? 'Seri' : `Belum tamat (${r.sa}-${r.sb})`;
  const stale = (sub.a && sub.a !== m.a) || (sub.b && sub.b !== m.b);
  const differs = m.status === 'done' && JSON.stringify(m.rubbers.map(x => x.sets)) !== JSON.stringify(sub.rubbers);
  return `<div class="pend">
    <div class="small muted">${esc(E.matchCode(m))} · ${esc(E.stageLabel(t, m))}${m.table ? ' · ' + esc(m.table.replace(/ \(.*\)/, '')) : ''} · dari <b>${esc(sub.by || 'tanpa nama')}</b> (${esc(sub.role)})</div>
    <div style="margin-top:4px"><b>${esc(E.pname(t, m.a))}</b> lwn <b>${esc(E.pname(t, m.b))}</b></div>
    <div class="chips" style="justify-content:flex-start">${sub.rubbers.flat().map(([x, y]) => `<span class="chip">${x}-${y}</span>`).join('')}</div>
    <div class="small" style="margin-top:4px">${res}${sub.note ? ' · ' + esc(sub.note) : ''}</div>
    ${stale ? '<div class="notice bad small" style="margin-top:6px">⚠️ Pemain perlawanan ini telah berubah sejak skor dihantar. Semak sebelum mengesahkan.</div>' : ''}
    ${differs ? `<div class="notice bad small" style="margin-top:6px">⚠️ Sudah disahkan dengan skor ${esc(fmtRub(t, m.rubbers.map(x => x.sets)))}. Mengesahkan akan menggantikannya.</div>` : ''}
    <div class="row"><button class="pill-btn ok small" data-ok="${sub.id}">✓ Sahkan</button><button class="pill-btn no small" data-no="${sub.id}">✗ Tolak</button>
    <a class="pill-btn light small" href="#/t/${t.id}/m/${m.id}">Buka kad</a></div></div>`;
}
function wirePending(t, root = $app) {
  const subs = pendingFor(t.id);
  root.querySelectorAll('[data-ok]').forEach(b => (b.onclick = async () => {
    const sub = subs.find(x => x.id === b.dataset.ok); if (!sub) return;
    const m = t.matches.find(x => x.id === sub.matchId);
    if (m.status === 'done' && JSON.stringify(m.rubbers.map(x => x.sets)) !== JSON.stringify(sub.rubbers) && !confirm('Gantikan keputusan yang sudah disahkan?')) return;
    b.disabled = true;
    try {
      E.recordScore(t, m.id, sub.rubbers, { lineup: sub.lineup || m.lineup });
      E.planSchedule(t); LV.afterScore(t);
      await store.save(t);
      await cloud.deleteSubmission(t.id, sub.id);
      ls.set('pingpong:draft:' + m.id, null);
      toast(m.status === 'done' ? `✓ Disahkan · ${E.pname(t, m.winner) || 'Seri'}` : '✓ Disahkan (belum tamat)');
    } catch (err) { b.disabled = false; toast('Gagal: ' + (err.code || err.message), 4000); }
  }));
  root.querySelectorAll('[data-no]').forEach(b => (b.onclick = async () => {
    if (!confirm('Tolak skor yang dihantar ini?')) return;
    try { await cloud.deleteSubmission(t.id, b.dataset.no); toast('Ditolak'); } catch (err) { toast('Gagal: ' + (err.code || err.message), 4000); }
  }));
}

// ---------- Jadual ----------
let jsel = null, jses = 'ALL', jst = 'belum';
function viewResults(t) {
  const playable = t.matches.filter(m => m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE' && m.status !== 'bye');
  const opts = [...t.groups.map(g => [g.name, t.format === 'rr' ? 'Liga' : `Kumpulan ${g.name}`]),
    ...(t.rounds.ko ? [['K', 'Kalah mati']] : []), ...(t.rounds.pool ? [['L', 'Pool kalah']] : []), ['ALL', 'Semua perlawanan']];
  if (!jsel || !opts.some(o => o[0] === jsel)) jsel = t.stage === 'ko' ? (t.rounds.ko ? 'K' : 'ALL') : (opts[0] || ['ALL'])[0];
  const inSel = m => jsel === 'ALL' || (jsel === 'K' ? m.bracket === 'ko' : jsel === 'L' ? m.bracket === 'pool' : m.stage === 'group' && m.group === jsel);
  if (jst === 'belum' && !playable.some(m => m.status !== 'done')) jst = 'semua';
  const sessions = [...new Set(t.matches.filter(m => m.session).map(m => m.session))].sort((a, b) => a - b);
  const shown = playable.filter(inSel).filter(m => jses === 'ALL' || m.session === +jses)
    .filter(m => jst === 'semua' || (jst === 'belum' ? m.status !== 'done' : m.status === 'done'))
    .sort((x, y) => (x.session - y.session) || String(x.table).localeCompare(String(y.table), 'ms', { numeric: true }));
  const done = playable.filter(m => m.status === 'done').length;
  const last = E.lastSession(t);
  let lastS = null;
  $app.innerHTML = `
    ${section('Keputusan', 'Skor Perlawanan')}
    <div class="card soft noprint">
      <div class="grid2">
        <div><label style="margin-top:0">Pilih</label><select id="jsel">${opt(Object.fromEntries(opts), jsel)}</select></div>
        <div><label style="margin-top:0">Sesi</label><select id="jses">${opt({ ALL: 'Semua sesi', ...Object.fromEntries(sessions.map(s => [s, `Sesi ${s} · ${E.sessionTime(t, s)}`])) }, jses)}</select></div>
      </div>
      <div class="row" style="margin-top:10px">${[['belum', 'Belum selesai'], ['selesai', 'Selesai'], ['semua', 'Semua']].map(([k, l]) =>
        `<button class="pill-btn small ${jst === k ? 'brand' : 'light'}" data-f="${k}">${l}</button>`).join('')}</div>
      <p class="muted small" style="margin-bottom:0">${done}/${playable.length} selesai · ${E.numTablesOf(t)} meja · anggaran tamat sekitar <b>${E.sessionTime(t, last + 1)}</b> (${t.sessionMin} min setiap sesi)</p>
    </div>
    ${cloud.isVerifier() && store.isCloud(t.id) ? `<div class="card noprint" id="pendBox"><div class="section-title" style="margin-top:0">🔔 Menunggu pengesahan (${pendingFor(t.id).length})</div>
      ${pendingFor(t.id).map(sub => pendingCard(t, sub)).join('') || '<p class="muted small" style="margin:6px 0 0">Tiada skor menunggu. Skor yang dihantar pengadil/peserta akan muncul di sini secara langsung.</p>'}</div>` : ''}
    ${t.waEnabled && canEdit(t) ? `<details class="card fold noprint" ${ls.get('pingpong:pasteOpen') === '1' ? 'open' : ''} id="pasteBox"><summary>Tampal laporan WhatsApp (penganjur)</summary>
      <p class="muted small">Salin satu atau beberapa mesej LAPOR KEPUTUSAN dari WhatsApp, tampal di bawah dan tekan Proses.</p>
      <textarea id="lp" rows="5" placeholder="Tampal mesej laporan di sini">${esc(ls.get('pingpong:paste') || '')}</textarea>
      <div id="lpr"></div>
      <button class="pill-btn orange small" id="plap" style="margin-top:8px"><span class="dot"></span>Proses laporan</button>
    </details>` : ''}
    ${t.groups.some(g => g.name === jsel) ? `<details class="card fold" ${ls.get('pingpong:mx:' + jsel) === '0' ? '' : 'open'} id="mxBox"><summary>🔢 Matriks keputusan · ${t.format === 'rr' ? 'Liga' : 'Kumpulan ' + esc(jsel)}</summary>${matrixHtml(t, t.groups.find(g => g.name === jsel))}</details>` : ''}
    <div class="card">${shown.length ? shown.map(m => {
      const head = m.session !== lastS ? `<div class="sess">Sesi ${m.session} · ${E.sessionTime(t, m.session)}</div>` : '';
      lastS = m.session; return head + matchRow(t, m);
    }).join('') : '<div class="empty">Tiada perlawanan.</div>'}</div>
    ${t.format === 'group_ko' && E.groupStageComplete(t) && !t.rounds.ko && canAdmin(t) ? `<div class="notice">Semua perlawanan kumpulan selesai. <a href="#/t/${t.id}/kalahmati"><b>Jana kalah mati →</b></a></div>` : ''}`;
  document.getElementById('jsel').onchange = e => { jsel = e.target.value; viewResults(t); };
  document.getElementById('jses').onchange = e => { jses = e.target.value; viewResults(t); };
  $app.querySelectorAll('[data-f]').forEach(b => (b.onclick = () => { jst = b.dataset.f; viewResults(t); }));
  const mxb = document.getElementById('mxBox'); if (mxb) mxb.ontoggle = () => ls.set('pingpong:mx:' + jsel, mxb.open ? '1' : '0');
  wirePending(t);
  if (!document.getElementById('pasteBox')) return;
  document.getElementById('pasteBox').ontoggle = e => ls.set('pingpong:pasteOpen', e.target.open ? '1' : '0');
  document.getElementById('lp').oninput = e => ls.set('pingpong:paste', e.target.value);
  document.getElementById('plap').onclick = () => {
    const text = document.getElementById('lp').value;
    if (!text.trim()) return toast('Tampal mesej dahulu');
    const res = E.applyReports(t, text);
    if (res.saved) { E.planSchedule(t); LV.afterScore(t); save(t); }
    const bad = res.msgs.some(x => x.startsWith('⚠️'));
    ls.set('pingpong:paste', bad ? text : '');
    viewResults(t);
    document.getElementById('pasteBox').open = true;
    document.getElementById('lpr').innerHTML = `<div class="notice ${bad ? 'bad' : ''}" style="margin-top:8px">${res.msgs.map(esc).join('<br>') || 'Tiada laporan dijumpai.'}</div>`;
  };
}

// ---------- Kad skor ----------
function viewMatch(t, mid) {
  const m = t.matches.find(x => x.id === mid);
  if (!m || !m.a || !m.b || m.a === 'BYE' || m.b === 'BYE') { location.hash = `#/t/${t.id}/keputusan`; return; }
  const f = E.fmtFor(t, m.stage);
  const A = E.pobj(t, m.a) || { name: '—', members: [] }, B = E.pobj(t, m.b) || { name: '—', members: [] };
  const team = E.isTeam(t), L = m.lineup || {}, edit = canEdit(t);
  const dkey = 'pingpong:draft:' + m.id;
  let draft = null; try { draft = JSON.parse(ls.get(dkey) || 'null'); } catch {}
  const src = m.status !== 'done' && draft ? draft : m.rubbers.map(r => r.sets);
  const sel = (key, members, val) => `<select data-lu="${key}"><option value="">— pilih —</option>${members.map(n => `<option ${n === val ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const lineupHtml = i => !team ? '' : i === 0
    ? `<div class="lu">${sel('as', A.members, L.as)} <span class="muted">lwn</span> ${sel('bs', B.members, L.bs)}</div>`
    : `<div class="lu">${sel('ad1', A.members, L.ad1)} &amp; ${sel('ad2', A.members, L.ad2)} <span class="muted">lwn</span> ${sel('bd1', B.members, L.bd1)} &amp; ${sel('bd2', B.members, L.bd2)}</div>`;
  const rubberHtml = (r, i) => {
    const rows = Array.from({ length: f.bo }, (_, k) => (src[i] || [])[k] || ['', '']);
    return `<div class="rubber">${team ? `<h3>${i === 0 ? 'Perseorangan' : 'Regu'}</h3>${lineupHtml(i)}` : ''}
      <div class="sets">${rows.map((s, k) => `<div class="set"><span class="muted small">G${k + 1}</span>
        <input inputmode="numeric" data-r="${i}" data-i="${k}" data-s="0" value="${s[0]}">–<input inputmode="numeric" data-r="${i}" data-i="${k}" data-s="1" value="${s[1]}"></div>`).join('')}</div></div>`;
  };
  const h = E.handicapInfo(t, m.a, m.b);
  $app.innerHTML = `
    <a href="#/t/${t.id}/${_back}" class="muted">← Kembali</a>
    <div class="eyebrow">${esc(E.matchCode(m))} · ${esc(E.stageLabel(t, m))}</div>
    <h2 class="h-big" style="font-size:24px">${esc(A.name)} <span class="muted" style="font-weight:500">lwn</span> ${esc(B.name)}</h2>
    <div class="rule"></div>
    <div class="card">
      <div class="muted small">${m.session ? `Sesi ${m.session} · ${E.sessionTime(t, m.session)} · ` : ''}${esc(f.label)}</div>
      ${h ? `<div class="hc">Handicap: ${h.n ? `<b>${esc(E.pname(t, h.to))}</b> mula dengan ${h.n} mata setiap game` : 'sama (tiada mata mula)'}</div>` : ''}
      <label>Meja</label><select id="tbl">${['', ...E.tablesOf(t)].map(x => `<option ${x === m.table ? 'selected' : ''} value="${esc(x)}">${esc(x || '—')}</option>`).join('')}</select>
      <label>Skor setiap game (${esc(A.name)} – ${esc(B.name)})</label>
      ${m.rubbers.map(rubberHtml).join('')}
      <p id="summary" class="muted"></p>
      <div id="decide"></div>
      <div id="dmsg">${m.status === 'done' ? '<span class="ok-badge">✅ Disahkan penganjur</span>' : draft ? '<span class="draft">✏️ Draf skor disimpan di telefon ini</span>' : ''}</div>
      ${edit ? `<div class="btn-stack" style="margin-top:12px">
        <button class="pill-btn brand" id="save"><span class="dot"></span>Simpan markah</button>
        ${t.waEnabled && m.status !== 'done' ? `<button class="pill-btn" id="wa" style="background:#25d366"><span class="dot" style="background:#fff"></span>📲 Lapor via WhatsApp</button>` : ''}
        ${m.status !== 'done' ? `<button class="pill-btn light small" id="tgh">↩️ Tangguh${m.lt ? ` (keluarkan dari Meja ${m.lt})` : ''}</button>` : ''}
        <button class="pill-btn light small" id="clear">Kosongkan</button>
      </div>` : m.status === 'done' ? '' : `
      <div class="section-title">Hantar skor kepada penganjur</div>
      <div class="grid2">
        <div><label>Nama anda</label><input id="sbBy" value="${esc(ls.get('pingpong:myname') || '')}" placeholder="cth. Hatta"></div>
        <div><label>Anda sebagai</label><select id="sbRole">${opt({ pengadil: 'Pengadil', pemain: 'Pemain' }, ls.get('pingpong:myrole') || (m.stage === 'group' ? 'pengadil' : 'pemain'))}</select></div>
        <div><label>PIN acara</label><input id="sbPin" inputmode="numeric" value="${esc(ls.get('pingpong:pin:' + t.id) || '')}" placeholder="dari penganjur" style="font-family:var(--mono)"></div>
      </div>
      <div class="btn-stack" style="margin-top:12px">
        <button class="pill-btn orange" id="send"><span class="dot"></span>📤 Hantar skor</button>
        ${t.waEnabled ? `<button class="pill-btn" id="wa" style="background:#25d366"><span class="dot" style="background:#fff"></span>📲 Lapor via WhatsApp</button>` : ''}
      </div>
      <p class="muted small">Skor akan dipaparkan sebagai rasmi selepas disahkan penganjur. Boleh dihantar semasa perlawanan berjalan (contoh selepas setiap game) dan dihantar semula bila tamat.</p>`}
      ${ls.get('pingpong:sent:' + m.id) && m.status !== 'done' ? '<p class="draft">⏳ Skor anda sudah dihantar dan menunggu pengesahan.</p>' : ''}
    </div>
    ${cloud.isVerifier() && pendingFor(t.id).some(x => x.matchId === m.id) ? `<div class="card"><div class="section-title" style="margin-top:0">🔔 Skor dihantar untuk perlawanan ini</div>${pendingFor(t.id).filter(x => x.matchId === m.id).map(sub => pendingCard(t, sub)).join('')}</div>` : ''}`;
  wirePending(t);
  const read = () => m.rubbers.map((_, i) => Array.from({ length: f.bo }, (_, k) =>
    [0, 1].map(s => $app.querySelector(`[data-r="${i}"][data-i="${k}"][data-s="${s}"]`).value.trim())));
  const clean = rs => rs.map(sets => sets.filter(s => s[0] !== '' && s[1] !== '').map(x => x.map(Number)));
  const readLineup = () => { if (!team) return null; const o = {}; $app.querySelectorAll('[data-lu]').forEach(s => (o[s.dataset.lu] = s.value)); return o; };
  let override = m.override;
  const upd = () => {
    const rs = clean(read());
    const r = E.evaluateMatch(t, { ...m, override, rubbers: rs.map(sets => ({ sets })) });
    const head = team ? `Pertemuan <b>${r.ra}–${r.rb}</b> · Set ${r.sa}-${r.sb} · Mata ${r.pa}-${r.pb}` : `Game <b>${r.sa}–${r.sb}</b>`;
    const res = r.winner ? ` · Pemenang: <b>${esc(E.pname(t, r.winner))}</b>` : r.draw ? ' · <b>Seri</b> (1 mata setiap pasukan)' : '';
    document.getElementById('summary').innerHTML = head + res;
    const fullTie = r.complete && m.stage !== 'group' && r.ra === r.rb && r.sa === r.sb && r.pa === r.pb;
    document.getElementById('decide').innerHTML = fullTie ? `<p style="color:#b91c1c">Seri penuh (set dan mata permainan sama). Penganjur perlu menentukan pemenang:</p>
      <div class="row">${[m.a, m.b].map(id => `<button class="pill-btn small ${override === id ? 'brand' : 'light'}" data-ov="${id}">${esc(E.pname(t, id))}</button>`).join('')}</div><br>` : '';
    document.querySelectorAll('[data-ov]').forEach(b => (b.onclick = () => { override = b.dataset.ov; upd(); }));
  };
  $app.querySelectorAll('.sets input').forEach(i => (i.oninput = () => {
    if (m.status !== 'done') { ls.set(dkey, JSON.stringify(read())); document.getElementById('dmsg').innerHTML = '<span class="draft">✏️ Draf skor disimpan di telefon ini</span>'; }
    upd();
  }));
  upd();
  const tbl = document.getElementById('tbl');
  if (!edit) tbl.disabled = true;
  tbl.onchange = e => { m.table = e.target.value; save(t); toast('Meja dikemas kini'); };
  const send = document.getElementById('send');
  if (send) send.onclick = async () => {
    const pin = document.getElementById('sbPin').value.trim(), by = document.getElementById('sbBy').value.trim(), role = document.getElementById('sbRole').value;
    const rs = clean(read());
    if (!rs.some(x => x.length)) return toast('Isi skor sekurang-kurangnya satu game');
    if (!pin) return toast('Masukkan PIN acara dari penganjur');
    ls.set('pingpong:pin:' + t.id, pin); ls.set('pingpong:myname', by); ls.set('pingpong:myrole', role);
    send.disabled = true;
    try {
      await cloud.submitScore(t.id, { pin, matchId: m.id, a: m.a, b: m.b, rubbers: rs, lineup: readLineup(), by, role });
      ls.set('pingpong:sent:' + m.id, '1');
      toast('📤 Dihantar. Menunggu pengesahan penganjur.', 3500);
      viewMatch(t, mid);
    } catch (err) {
      send.disabled = false;
      toast(err.code === 'permission-denied' ? 'PIN salah atau tidak sah. Semak dengan penganjur.' : 'Gagal menghantar: ' + (err.code || err.message), 4500);
    }
  };
  const sv = document.getElementById('save');
  if (sv) sv.onclick = () => {
    const lu = readLineup();
    if (lu && ((lu.ad1 && lu.ad1 === lu.ad2) || (lu.bd1 && lu.bd1 === lu.bd2))) return toast('Regu mesti dua pemain berbeza');
    E.recordScore(t, m.id, read(), { lineup: lu, override });
    E.planSchedule(t); LV.afterScore(t);
    save(t); ls.set(dkey, null); ls.set('pingpong:sent:' + m.id, null);
    const r = E.evaluateMatch(t, m);
    toast(m.status === 'done' ? (r.draw ? 'Disimpan · Seri' : `Disimpan · ${E.pname(t, m.winner)} menang`) : 'Disimpan (belum tamat)');
    location.hash = `#/t/${t.id}/${_back}`;
  };
  const wa = document.getElementById('wa');
  if (wa) wa.onclick = () => {
    const text = E.reportText(t, m, clean(read()));
    const num = t.waMode === 'N' && t.waNumber ? t.waNumber : '';
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank');
    if (t.waMode !== 'N' && t.waGroup) toast(`Pilih group "${t.waGroup}" dalam WhatsApp`, 4000);
  };
  const tgh = document.getElementById('tgh');
  if (tgh) tgh.onclick = () => {
    if (!confirm('Tangguh perlawanan ini? Ia diletak di hujung giliran' + (m.lt ? ' dan meja diberi kepada perlawanan seterusnya.' : '.'))) return;
    LV.defer(t, m.id); save(t); toast('Ditangguh ke hujung giliran'); location.hash = `#/t/${t.id}/${_back}`;
  };
  const cl = document.getElementById('clear');
  if (cl) cl.onclick = () => {
    if (!confirm('Kosongkan skor perlawanan ini?')) return;
    ls.set(dkey, null);
    E.recordScore(t, m.id, m.rubbers.map(() => []), { override: null }); E.planSchedule(t); save(t); viewMatch(t, mid);
  };
}

// ---------- Kumpulan ----------
// Regu diundi / trio: nama unit tebal, ahli di bawah (regu dua baris, trio sebaris " · ")
function pnUnit(t, id) {
  const p = E.pobj(t, id); if (!p) return pn(t, id);
  const i = t.participants.indexOf(p) + 1, team = E.isTeam(t);
  const label = team ? p.name : `Regu ${i}`, tag = team ? (E.teamWord(t)[0] + ((p.name.match(/\d+/) || [i])[0])) : 'R' + i;
  const mem = team ? `<span class="mem">${p.members.map(esc).join(' · ')}</span>` : p.members.map(x => `<span class="mem">${esc(x)}</span>`).join('');
  return `<span class="pn" data-pid="${id}"><span class="av av-n" style="background:${avColor(p.name)}">${esc(tag)}</span><span class="nm nmu"><b>${esc(label)}</b>${mem}</span></span>`;
}
function standingsTable(t, g) {
  const q = t.format === 'group_ko' ? t.qualifyPerGroup : 1;
  const poolN = t.format === 'group_ko' ? (t.pool === '34' ? 2 : t.pool === '3' ? 1 : 0) : 0;
  const s = E.groupStandings(t, g.name), team = E.isTeam(t);
  const sign = n => (n > 0 ? '+' : '') + n;
  return `<div class="tw"><table><thead><tr><th>#</th><th class="l">${UNIT(t)}</th><th>P</th><th>M</th>${team ? '<th>S</th>' : ''}<th>K</th><th>Mata</th><th>Set ±</th><th>Main ±</th></tr></thead>
    <tbody>${s.map((r, i) => `<tr class="${i < q ? 'q' : i < q + poolN ? 'pq' : ''}"><td>${i + 1}</td><td class="l">${E.usesDraw(t) ? pnUnit(t, r.id) : pn(t, r.id)}</td>
      <td>${r.p}</td><td>${r.w}</td>${team ? `<td>${r.d}</td>` : ''}<td>${r.l}</td><td><b>${r.pts}</b></td><td>${sign(r.sf - r.sa)}</td><td>${sign(r.pf - r.pa)}</td></tr>`).join('')}</tbody></table></div>`;
}
function matrixHtml(t, g) {
  const M = E.matrix(t, g.name), st = E.groupStandings(t, g.name);
  return `<div class="tw"><table class="mx"><thead><tr><th class="l">${UNIT(t)}</th>${M.ids.map((_, i) => `<th>${i + 1}</th>`).join('')}<th>Set ±</th></tr></thead><tbody>
    ${M.ids.map((id, i) => { const r = st.find(x => x.id === id); const d = r.sf - r.sa; return `<tr><td class="l">${i + 1}. ${esc(E.pname(t, id))}</td>${M.rows[i].map(c => c === 'self' ? '<td class="self"></td>' : c ? `<td class="${c.win ? 'win' : ''}">${c.v[0]}-${c.v[1]}</td>` : '<td>·</td>').join('')}<td>${d > 0 ? '+' : ''}${d}</td></tr>`; }).join('')}
  </tbody></table></div><p class="muted small">Baca mengikut baris: skor set pemain di baris itu menentang pemain di lajur. Hijau = menang.</p>`;
}
function viewGroups(t) {
  const T = E.tablesOf(t);
  $app.innerHTML = `
    ${section('Keputusan', t.format === 'rr' ? 'Kedudukan Liga' : 'Peringkat Kumpulan')}
    <div class="card noprint"><div class="btn-stack">
      ${t.format !== 'rr' ? '<button class="pill-btn" id="playG"><span class="dot"></span>▶ Tonton cabutan</button>' : ''}
      <button class="pill-btn orange" id="imgs"><span class="dot"></span>Gambar kedudukan</button>
    </div><div id="imgOut" class="imgs"></div></div>
    ${t.groups.map((g, gi) => `<div class="card">
      <div class="card-head"><h2 style="margin:0">${t.format === 'rr' ? 'Liga' : `Kumpulan ${g.name}`}</h2><span class="pill-tbl">${esc((T[gi % T.length] || '').replace(/ \(.*\)/, ''))}</span></div>
      ${standingsTable(t, g)}
      <details class="fold" ${ls.get('pingpong:mx:' + g.name) === '1' ? 'open' : ''} data-mx="${g.name}"><summary>Matriks keputusan</summary>${matrixHtml(t, g)}</details>
      <details class="fold"><summary>Susunan perlawanan</summary><div class="mlist">${t.matches.filter(m => m.stage === 'group' && m.group === g.name).map((m, i) => matchRow(t, m, `${i + 1}.`)).join('')}</div></details>
    </div>`).join('')}
    ${t.format === 'group_ko' ? `<p class="muted small">Baris berlorek hijau = layak ke kalah mati (johan &amp; naib johan${t.bestThirds ? `, serta ${t.bestThirds} tempat ketiga terbaik` : ''}).${t.pool !== '0' ? ' Lorek oren = pool kalah.' : ''}</p>` : ''}`;
  $app.querySelectorAll('[data-mx]').forEach(d => (d.ontoggle = () => ls.set('pingpong:mx:' + d.dataset.mx, d.open ? '1' : '0')));
  const pg = document.getElementById('playG'); if (pg) pg.onclick = () => playGroupDraw(t);
  document.getElementById('imgs').onclick = () => standingsImages(t);
}

// Gambar kedudukan: PNG 1080 px, 4 kumpulan setiap gambar
async function standingsImages(t) {
  const out = document.getElementById('imgOut');
  out.innerHTML = '<p class="muted">Menyediakan gambar…</p>';
  const logos = await Promise.all(clubOf(t).logos.map(src => new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; })));
  const W = 1080, F = 'Outfit, system-ui, sans-serif', pages = [];
  for (let i = 0; i < t.groups.length; i += 4) pages.push(t.groups.slice(i, i + 4));
  const q = t.format === 'group_ko' ? t.qualifyPerGroup : 1;
  const files = [];
  out.innerHTML = '';
  for (const [pi, pg] of pages.entries()) {
    const cols = pg.length > 1 ? 2 : 1, cw = (W - 60 - (cols - 1) * 20) / cols, rowH = 46;
    const cardH = g => 84 + rowH * g.members.length + 16;
    const lines = []; for (let i = 0; i < pg.length; i += cols) lines.push(pg.slice(i, i + cols));
    const H = 210 + lines.reduce((a, l) => a + Math.max(...l.map(cardH)) + 20, 0) + 70;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const rr = (x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    const fit = (s, w) => { if (c.measureText(s).width <= w) return s; while (s.length > 1 && c.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0f1d3a'; c.fillRect(0, 0, W, 180); c.fillStyle = '#ff7a1a'; c.fillRect(0, 180, W, 6);
    let lx = 30;
    for (const lg of logos.filter(Boolean)) {
      c.fillStyle = '#fff'; rr(lx, 30, 120, 120, 16); c.fill();
      const s = Math.min(104 / lg.width, 104 / lg.height); c.drawImage(lg, lx + (120 - lg.width * s) / 2, 30 + (120 - lg.height * s) / 2, lg.width * s, lg.height * s);
      lx += 134;
    }
    const tx = lx + 12;
    c.fillStyle = '#fff'; c.font = `800 44px ${F}`; c.fillText(t.format === 'rr' ? 'Kedudukan Liga' : 'Peringkat Kumpulan', tx, 78);
    c.font = `600 28px ${F}`; c.fillText(fit(t.name, W - tx - 30), tx, 118);
    c.font = `400 21px ${F}`; c.fillStyle = '#c9d3e6'; c.fillText(fit([t.date, clubOf(t).short].filter(Boolean).join(' · ') + (pages.length > 1 ? ` · ${pi + 1}/${pages.length}` : ''), W - tx - 30), tx, 154);
    let y = 210;
    for (const l of lines) {
      l.forEach((g, ci) => {
        const x = 30 + ci * (cw + 20), st = E.groupStandings(t, g.name);
        c.fillStyle = '#fff'; rr(x, y, cw, cardH(g), 18); c.fill();
        c.fillStyle = '#0f1d3a'; c.font = `800 28px ${F}`; c.fillText(t.format === 'rr' ? 'Liga' : `Kumpulan ${g.name}`, x + 20, y + 44);
        c.font = `600 15px ${F}`; c.fillStyle = '#8a8f99';
        const colX = [cw - 220, cw - 160, cw - 100, cw - 40];
        ['M', 'K', 'Set ±', 'Mata'].forEach((h, k) => { c.textAlign = 'center'; c.fillText(h, x + colX[k], y + 74); });
        c.textAlign = 'left';
        st.forEach((r, i) => {
          const ry = y + 84 + i * rowH;
          if (i < q) { c.fillStyle = 'rgba(30,138,38,.12)'; c.fillRect(x + 10, ry, cw - 20, rowH - 4); }
          c.fillStyle = '#1b2236'; c.font = `700 20px ${F}`; c.fillText(String(i + 1), x + 22, ry + 30);
          c.font = `600 20px ${F}`; c.fillText(fit(E.pname(t, r.id), cw - 300), x + 52, ry + 30);
          c.textAlign = 'center'; c.font = `700 19px JetBrains Mono, monospace`;
          [r.w, r.l, (r.sf - r.sa > 0 ? '+' : '') + (r.sf - r.sa), r.pts].forEach((v, k) => c.fillText(String(v), x + colX[k], ry + 30));
          c.textAlign = 'left';
        });
      });
      y += Math.max(...l.map(cardH)) + 20;
    }
    c.fillStyle = '#8a8f99'; c.font = `400 17px ${F}`; c.fillText('Lorek hijau = layak. Dijana oleh Pingpong Portal.', 30, H - 30);
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
    const file = new File([blob], `kedudukan-${pi + 1}.png`, { type: 'image/png' });
    files.push(file);
    const url = URL.createObjectURL(blob);
    out.insertAdjacentHTML('beforeend', `<img src="${url}" alt="Gambar kedudukan ${pi + 1}"><div class="row" style="margin-top:6px"><a class="pill-btn light small" href="${url}" download="${file.name}">Muat turun ${pi + 1}</a></div>`);
  }
  if (navigator.canShare && navigator.canShare({ files })) {
    out.insertAdjacentHTML('afterbegin', '<button class="pill-btn" id="shr" style="background:#25d366;margin-top:10px">📲 Kongsi ke WhatsApp</button>');
    document.getElementById('shr').onclick = () => navigator.share({ files, title: t.name, text: `Kedudukan kumpulan · ${t.name}` }).catch(() => {});
  }
}

// ---------- Kalah mati ----------
function bracketHtml(t, b) {
  const list = t.matches.filter(m => m.bracket === b);
  const cols = [];
  for (let r = 1; r <= t.rounds[b]; r++) {
    const ms = list.filter(m => m.round === r).sort((x, y) => x.slot - y.slot);
    cols.push(`<div class="col"><h3>${E.roundName(t, b, r).replace('Pool: ', '')}</h3><div class="cb">${ms.map(m => {
      const e = E.evaluateMatch(t, m), team = E.isTeam(t);
      const has = m.rubbers.some(x => x.sets.length);
      const playable = m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE';
      const line = (id, s, src) => `<div class="ln ${m.winner === id && id && id !== 'BYE' && m.status === 'done' ? 'w' : ''}"><span>${id && id !== 'BYE' ? `<span class="sd">${esc(E.seedLabel(t, id))}</span>` : ''}${id ? esc(E.pname(t, id)) : src ? `<i class="ph">${esc(E.placeholderLabel(src))}</i>` : '…'}</span><span class="s">${has ? s : ''}</span></div>`;
      const meta = playable && m.status !== 'done' && m.session ? `<div class="bmeta">${esc(E.matchCode(m))} · Sesi ${m.session} · ${esc((m.table || '').replace(/ \(.*\)/, ''))}</div>` : '';
      const inner = line(m.a, team ? e.ra : e.sa, m.srcA) + line(m.b, team ? e.rb : e.sb, m.srcB) + meta;
      return playable ? `<a class="bm" href="#/t/${t.id}/m/${m.id}">${inner}</a>` : `<div class="bm">${inner}</div>`;
    }).join('')}</div></div>`);
  }
  const f = list.find(m => m.round === t.rounds[b]);
  const champ = f && f.status === 'done' && f.winner ? `<div class="champ">🏆 ${b === 'pool' ? 'Johan pool kalah' : 'Johan'}: ${esc(E.pname(t, f.winner))}</div>` : '';
  return champ + `<div class="bracket">${cols.join('')}</div>`;
}
function viewBrackets(t) {
  if (!t.rounds.ko && !canAdmin(t)) {
    $app.innerHTML = `${section('Kalah mati', 'Carta Kalah Mati')}<div class="card"><p class="muted">Carta kalah mati akan dipaparkan selepas peringkat kumpulan tamat dan penganjur menjana bracket.</p></div>`;
    return;
  }
  if (!t.rounds.ko) {
    const ready = E.groupStageComplete(t);
    const mirror = t.koMode !== 'U' && E.canMirror(t);
    $app.innerHTML = `${section('Kalah mati', 'Carta Kalah Mati')}<div class="card">
      ${ready ? '<p>Semua perlawanan kumpulan selesai.</p>' : '<p class="muted">Masih ada perlawanan kumpulan belum selesai.</p>'}
      <p class="muted small">${mirror ? 'Bracket cermin: A1 lwn naib johan kumpulan terakhir, B1 lwn kumpulan kedua terakhir, dan seterusnya.' : 'Undian: BYE kepada johan kumpulan terbaik; rakan sekumpulan diletak di separuh bracket berlainan.'}${t.pool !== '0' ? ' Pool kalah: ' + POOL[t.pool].toLowerCase() + '.' : ''}</p>
      <button class="pill-btn ${ready ? 'brand' : 'light'}" id="gen"><span class="dot"></span>${ready ? 'Jana kalah mati' : 'Jana sekarang (ikut kedudukan semasa)'}</button></div>`;
    document.getElementById('gen').onclick = () => {
      if (!ready && !confirm('Masih ada perlawanan kumpulan belum selesai. Teruskan?')) return;
      try { E.buildKO(t); save(t); viewBrackets(t); playBracketDraw(t, 'ko'); } catch (err) { toast(err.message); }
    };
    return;
  }
  $app.innerHTML = `${section('Kalah mati', 'Carta Kalah Mati')}
    <div class="row noprint" style="margin-bottom:10px"><button class="pill-btn" data-play="ko"><span class="dot"></span>▶ Tonton undian</button>
</div>
    ${!E.groupStageComplete(t) ? `<div class="notice small">⚡ Carta cermin dijana bersama jadual kumpulan. Nama diisi sebaik kedudukan kumpulan <b>pasti</b> (tiada keputusan baki yang boleh mengubahnya), jadi perlawanan kalah mati boleh bermula sebelum semua kumpulan tamat.</div>` : ''}
    <div class="card">${bracketHtml(t, 'ko')}</div>
    <p class="muted small">Ketik perlawanan untuk isi markah. Label A1, H2 = asal kumpulan (kedudukan pasti).</p>
    ${t.format === 'group_ko' && canAdmin(t) ? '<button class="pill-btn light small noprint" id="regen">Jana semula carta</button>' : ''}`;
  $app.querySelectorAll('[data-play]').forEach(b => (b.onclick = () => playBracketDraw(t, b.dataset.play)));
  const rg = document.getElementById('regen');
  if (rg) rg.onclick = () => {
    if (!confirm('Jana semula? Semua skor kalah mati dan pool kalah akan dipadam.')) return;
    E.buildKO(t); save(t); viewBrackets(t); playBracketDraw(t, 'ko');
  };
}

function viewPool(t) {
  if (!t.rounds.pool) {
    const ready = t.pool !== '0' && t.rounds.ko && E.poolReady(t), early = ready && !E.groupStageComplete(t);
    $app.innerHTML = `${section('Pool kalah', 'Carta Pool Kalah')}<div class="card"><p class="muted">${t.pool === '0' ? 'Pool kalah tidak diadakan.'
      : early ? '✅ Semua peserta pool kalah sudah pasti kedudukannya walaupun ada perlawanan kumpulan yang belum tamat. Pool kalah boleh dijana sekarang.'
      : ready ? 'Peringkat kumpulan tamat. Pool kalah boleh dijana.' : 'Pool kalah dijana selepas kedudukan tempat ke-3' + (t.pool === '34' ? '/ke-4' : '') + ' setiap kumpulan pasti.'}</p>
      ${ready && canAdmin(t) ? '<button class="pill-btn brand" id="genPool"><span class="dot"></span>Jana pool kalah</button>' : ''}</div>`;
    const gp = document.getElementById('genPool');
    if (gp) gp.onclick = () => { try { E.buildPool(t); save(t); viewPool(t); playBracketDraw(t, 'pool'); } catch (err) { toast(err.message); } };
    return;
  }
  $app.innerHTML = `${section('Pool kalah', 'Carta Pool Kalah')}
    <div class="row noprint" style="margin-bottom:10px"><button class="pill-btn" data-play="pool"><span class="dot"></span>▶ Tonton undian</button></div>
    <div class="card">${bracketHtml(t, 'pool')}</div><p class="muted small">Ketik perlawanan untuk isi markah. Label A3, H4 = asal kumpulan.</p>`;
  $app.querySelector('[data-play]').onclick = () => playBracketDraw(t, 'pool');
}

// ---------- Ranking ----------
function viewRanking(t) { $app.innerHTML = rankingHtml(t); }
function rankingHtml(t) {
  if (t.stage !== 'done') return `${section('Ranking', 'Ranking Peserta')}<div class="card"><p class="muted">Ranking dipaparkan selepas perlawanan akhir tamat${t.rounds.pool ? ' (dan akhir pool kalah)' : ''}.</p></div>`;
  const rank = E.finalRanking(t);
  const showB = new Set();
  for (const tr of rank) { const as = tr.rows.map(r => r.st.a.toFixed(2)); tr.rows.forEach((r, i) => { if (as.filter(x => x === as[i]).length > 1) showB.add(r.id); }); }
  const sign = v => (v > 0 ? '+' : '') + v.toFixed(2);
  const ko = t.matches.find(m => m.bracket === 'ko' && m.round === t.rounds.ko);
  let n = 0;
  return `
    ${section('Keputusan akhir', 'Ranking Peserta')}
    ${ko && ko.winner ? `<div class="champ">🏆 Johan: ${esc(E.pname(t, ko.winner))}</div>` : ''}
    <div class="card"><div class="print-only club-head">${logosHtml(t)}<div><b>${esc(t.name)}</b><br><span class="muted">${esc(clubOf(t).name)}</span></div></div>
    <div class="tw"><table class="rank"><thead><tr><th>#</th><th>Tempat*</th><th class="l">${UNIT(t)}</th><th class="l">Pencapaian</th><th>Kump.</th><th>Main</th><th>Set</th><th>(a)</th><th>(b)</th></tr></thead><tbody>
      ${rank.map(tr => tr.rows.map(r => `<tr><td>${++n}</td><td>${tr.ids.length > 1 ? `${tr.place}–${tr.place + tr.ids.length - 1}` : tr.place}</td>
        <td class="l">${pn(t, r.id)}</td><td class="l small">${esc(r.label)}</td><td>${esc(E.seedLabel(t, r.id))}${r.bumped ? ' <span class="dag">†</span>' : ''}</td>
        <td>${r.st.p}</td><td>${r.st.sf}-${r.st.sa}</td><td>${r.st.a === 0 ? '0.00' : sign(r.st.a)}</td><td>${showB.has(r.id) ? r.st.b.toFixed(2) : ''}</td></tr>`).join('')).join('')}
    </tbody></table></div>
    <div class="foot">
      <p>* <b>Tempat:</b> pusingan terakhir yang dicapai, kalah mati utama dahulu, kemudian pool kalah. Yang tersingkir di pusingan yang sama berkongsi Tempat (contoh 5–8).</p>
      <p><b>#:</b> dalam Tempat yang sama disusun ikut (a), kemudian (b), kemudian purata beza mata permainan setiap perlawanan.</p>
      <p><b>†</b> Bersemuka: jika rakan sekumpulan berada dalam Tempat yang sama, pemain yang lebih tinggi dalam kumpulan diletakkan terus di atas rakan sekumpulannya.</p>
      <p><b>Main:</b> perlawanan dimainkan (kumpulan, kalah mati dan pool; BYE tidak dikira). <b>(a)</b> Set ±/main = (set menang − set kalah) ÷ main. <b>(b)</b> Set menang/main, dipaparkan hanya jika (a) sama. Purata = jumlah ÷ bilangan perlawanan, bukan nisbah.</p>
    </div></div>
    <a class="pill-btn light small noprint" href="#/t/${t.id}/laporan">🖨️ Laporan PDF</a>`;
}

// ---------- Peraturan & panduan ----------
function rulesHtml(t) {
  const gf = E.SET_FORMATS[t.groupFormat].label, kf = E.SET_FORMATS[t.koFormat].label;
  const rules = [];
  if (t.format === 'rr') rules.push('Format liga: setiap peserta bertemu semua peserta lain sekali. Juara ialah peserta di tangga teratas selepas semua perlawanan selesai.', `Format perlawanan: ${gf}.`);
  else if (t.format === 'ko') rules.push(`Kalah mati sahaja: ${kf}.`);
  else {
    rules.push(`Format perlawanan - peringkat kumpulan: ${gf}; kalah mati: ${kf}.`);
    rules.push(t.koMode !== 'U' && E.canMirror(t)
      ? 'Kalah mati (bracket cermin): johan setiap kumpulan menentang naib johan kumpulan cermin (A1 lwn naib johan kumpulan terakhir, B1 lwn kumpulan kedua terakhir, dan seterusnya). Johan dan naib johan dari kumpulan yang sama sentiasa berada di separuh bracket berbeza.'
      : `Kalah mati: BYE diberi kepada johan kumpulan terbaik (ikut mata, kemudian beza menang-kalah perlawanan, set dan mata permainan). Johan dan naib johan dari kumpulan yang sama diletakkan di separuh bracket berbeza.${t.bestThirds ? ` ${t.bestThirds} tempat ketiga terbaik turut layak.` : ''} Jika saiz kumpulan tidak sama, perbandingan antara kumpulan tidak mengambil kira keputusan menentang pemain tempat terakhir kumpulan yang lebih besar.`);
    if (t.pool !== '0') rules.push(`Pool kalah: ${t.pool === '34' ? 'peserta tempat ketiga yang tidak layak ke kalah mati utama dan semua peserta tempat keempat' : 'peserta tempat ketiga yang tidak layak ke kalah mati utama'} bermain kalah mati berasingan menggunakan format kalah mati yang sama. BYE (jika ada) diberi kepada peserta terbaik.`);
  }
  rules.push(E.isTeam(t) ? `Pertemuan ${E.teamWord(t).toLowerCase()}: 1 perlawanan perseorangan + 1 perlawanan regu. Menang 2-0: 3 mata. Seri 1-1: 1 mata. Kalah: 0 mata.` : 'Menang: 3 mata. Kalah: 0 mata.');
  rules.push('Jika mata sama, susunan ditentukan mengikut turutan: (1) beza menang-kalah bilangan perlawanan, (2) beza menang-kalah bilangan set, (3) keputusan bersemuka (pertemuan sesama peserta yang masih sama; jika tiga atau lebih, bilangan kemenangan sesama mereka), (4) beza menang-kalah bilangan mata permainan. Contoh: 5-2 (+3).');
  if (t.handicap) rules.push('Handicap (mata mula): angka dalam kurungan ialah mata yang diberi kepada pihak lawan, maksimum 5. Mata mula = beza antara angka kedua-dua pihak. Pihak dengan angka lebih rendah mula dengan mata tersebut pada setiap game.');
  rules.push('Jika kaedah di atas gagal, penganjur berhak menggunakan kaedah yang difikirkan perlu dan munasabah. Keputusan penganjur adalah muktamad.');
  return `<div class="card"><ol class="rules">${rules.map(r => `<li>${esc(r)}</li>`).join('')}</ol></div>
    <div class="card"><div class="section-title" style="margin-top:0">📖 Panduan peserta</div>
      <p><b>1️⃣ Pilih nama anda</b> di tab 🟢 <b>Langsung</b> (👤 Saya). Telefon akan ingat pilihan ini. Status anda:<br>🔴 <b>Bermain sekarang</b>: terus ke meja yang dinyatakan.<br>🟡 <b>Sila bersedia</b>: anda bermain selepas perlawanan semasa di meja itu.<br>🟣 <b>Pengadil</b>: pergi ke meja itu dan catat skor.<br>⏳ <b>Menunggu</b>: dipaparkan berapa perlawanan lagi sebelum giliran anda.<br>📌 Meja tidak tetap. Jika meja lain kosong lebih awal, perlawanan anda mungkin dipindahkan. Bila anda perlu ke meja, jalur berwarna juga dipaparkan di atas tab lain.</p>
      <p><b>2️⃣ Melapor skor.</b> Peringkat kumpulan: pengadil (rakan sekumpulan yang tidak bermain) melapor. Kalah mati &amp; pool: salah seorang pemain melapor. Buka tab 📝 <b>Keputusan</b>, ketik perlawanan bertanda 🟢, isi skor setiap game (disimpan sebagai draf di telefon), masukkan <b>PIN acara</b> dari penganjur dan tekan <b>📤 Hantar skor</b>.</p>
      ${t.waEnabled ? `<p><b>Sandaran:</b> jika tidak dapat menghantar, tekan <b>📲 Lapor via WhatsApp</b> dan hantar ke ${t.waMode === 'N' ? 'nombor penganjur' : `group <b>${esc(t.waGroup || 'laporan skor')}</b>`}.</p>` : ''}
      <p><b>3️⃣ Keputusan rasmi.</b> Skor menjadi rasmi selepas penganjur menekan ✓ Sahkan (🔔 di tab Keputusan). Kedudukan, bracket dan tab Langsung dikemas kini secara automatik.</p>
    </div>
    <div class="card small"><b>Meja:</b> ${E.tablesOf(t).map(esc).join(', ')}<br>${t.date ? `<b>Tarikh:</b> ${esc(t.date)} · ` : ''}<b>Mula:</b> ${esc(E.sessionTime(t, 1))} · <b>Sesi:</b> ${t.sessionMin} minit</div>`;
}
function viewRules(t) { $app.innerHTML = section('Pertandingan', 'Peraturan') + rulesHtml(t); }
function viewSetup(t) { viewSetupCore(t, 'tetapan'); }
function viewPemain(t) {
  viewSetupCore(t, 'pemain');
  $app.insertAdjacentHTML('beforeend', `<details class="card fold" style="margin-top:14px"><summary>📜 Peraturan &amp; panduan peserta</summary>${rulesHtml(t)}</details>`);
}
// Tetapan untuk bukan admin: ringkasan maklumat pertandingan + peraturan
function viewInfo(t) {
  const f = E.SET_FORMATS;
  $app.innerHTML = `${section('Tetapan', 'Maklumat Pertandingan')}
    <div class="card"><table class="rp-info">
      <tr><td>Tarikh</td><td>${esc(fmtDate(t.date) || '-')}</td></tr>
      <tr><td>Mula</td><td>${esc(E.sessionTime(t, 1))} · ${t.sessionMin} minit setiap sesi</td></tr>
      <tr><td>Tempat</td><td>${esc(t.venue === 'X' ? (t.venueName || '-') : E.VENUES[t.venue] || '-')}</td></tr>
      <tr><td>Meja</td><td>${E.tablesOf(t).map(esc).join(', ')}</td></tr>
      <tr><td>Acara</td><td>${esc(ENTRY[t.entryMode])}</td></tr>
      <tr><td>Format</td><td>${esc(FORMAT[t.format])}</td></tr>
      <tr><td>Set</td><td>${esc(f[t.groupFormat].label)}${t.format === 'group_ko' ? ' · Kalah mati: ' + esc(f[t.koFormat].label) : ''}</td></tr>
      ${t.format === 'group_ko' ? `<tr><td>Pool kalah</td><td>${esc(POOL[t.pool])}</td></tr>` : ''}
    </table></div>
    <div class="section-title">📜 Peraturan</div>${rulesHtml(t)}
    <p class="muted small">Penganjur: tekan <b>Log masuk</b> di atas untuk mengurus pertandingan ini.</p>`;
}

// ---------- Panduan peserta (kad lipat di atas setiap tab) ----------
const GUIDE = {
  tetapan: t => canAdmin(t) ? 'Isi maklumat pertandingan dan tetapan meja, pilih format, kemudian tekan <b>Jana</b>. Peserta ditambah atau diundi di tab 👥 ' + UNIT(t) + '.' : 'Maklumat pertandingan, format dan peraturan.',
  pemain: t => canAdmin(t) ? 'Tambah peserta (satu setiap baris), atau isi senarai individu dan tekan <b>Undi</b>. Peraturan pertandingan ada di bahagian bawah.' : 'Semak nama dan unit anda dalam senarai. Peraturan dan cara melapor skor ada di bahagian bawah tab ini.',
  langsung: () => 'Pilih nama anda di <b>👤 Saya</b>. 🔴 bermain sekarang · 🟡 sila bersedia · 🟣 anda pengadil · ⏳ menunggu giliran. Meja tidak tetap: perlawanan diberi ke meja yang kosong dahulu.',
  jadual: () => 'Sesi dan masa ialah anggaran. Semasa pertandingan, ikut meja sebenar di tab 🟢 Langsung. Ketik baris untuk buka kad perlawanan.',
  kumpulan: () => 'Kedudukan: mata → beza menang-kalah perlawanan → beza set → bersemuka → beza mata. Baris berjalur jingga layak ke kalah mati. Ketik nama untuk melihat profil.',
  keputusan: () => 'Ketik perlawanan, isi skor setiap game (disimpan sebagai draf di telefon), masukkan <b>PIN acara</b> dan tekan <b>📤 Hantar skor</b>. Skor rasmi selepas disahkan penganjur.',
  kalahmati: () => 'Carta cermin terisi sebaik kedudukan kumpulan pasti, jadi kalah mati boleh bermula lebih awal. Kalah mati: salah seorang pemain melapor skor.',
  pool: () => 'Pool kalah untuk peserta yang tidak layak ke kalah mati utama. Salah seorang pemain melapor skor.',
  laporan: () => 'Tekan <b>🖨️ Cetak / Simpan PDF</b>, kemudian pilih <b>Simpan sebagai PDF</b>.',
};
function guideCard(t, page) {
  const f = GUIDE[page];
  if (!f) return;
  const open = ls.get('pingpong:guide') === '1';
  const html = `<details class="card fold guide noprint" ${open ? 'open' : ''}><summary>📖 Panduan</summary><p class="small" style="margin:6px 0 0">${f(t)}</p></details>`;
  const h = $app.querySelector('.h-big');
  h ? h.insertAdjacentHTML('afterend', html) : $app.insertAdjacentHTML('afterbegin', html);
  const d = $app.querySelector('details.guide');
  d.ontoggle = () => ls.set('pingpong:guide', d.open ? '1' : '0');
}

// ---------- Langsung (agihan meja, pengadil, status peribadi) ----------
const meKey = t => 'pingpong:me:' + t.id;
const STAT = {
  play: ['#b3261e', '#fff', '🔴', 'Anda bermain SEKARANG'],
  ump: ['#6a1b9a', '#fff', '🟣', 'Anda pengadil SEKARANG'],
  ready: ['#f4b400', '#1a1200', '🟡', 'Sila bersedia: anda seterusnya'],
};
function myStrip(t) {
  const st = LV.myStatus(t, ls.get(meKey(t)));
  if (!st || !STAT[st.kind]) return;
  const [bg, fg, ic, tx] = STAT[st.kind];
  $app.insertAdjacentHTML('afterbegin', `<a class="mystrip noprint" href="#/t/${t.id}/langsung" style="background:${bg};color:${fg}">${ic} ${tx} di Meja ${st.table} <span>· lihat tab Langsung ›</span></a>`);
}
const vsTxt = (t, m) => `<b>${esc(E.pname(t, m.a))}</b> <small>lwn</small> <b>${esc(E.pname(t, m.b))}</b>`;
function viewLive(t) {
  const head = section('Langsung', 'Sedang Berlangsung');
  if (!t.matches.length) { $app.innerHTML = head + '<div class="card"><p class="muted">Belum ada perlawanan untuk dipaparkan. Kumpulan dan jadual perlu dijana dahulu.</p></div>'; return; }
  const { live, occ, cand } = LV.liveState(t), nx = LV.nextUp(t), U = LV.umpirePlan(t), edit = canEdit(t);
  const me = ls.get(meKey(t)) || '', st = LV.myStatus(t, me);
  const playable = t.matches.filter(m => m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE' && m.status !== 'bye');
  const allDone = playable.length && playable.every(m => m.status === 'done');
  const people = t.participants.slice().sort((a, b) => a.name.localeCompare(b.name, 'ms'));
  let stTxt = '';
  if (me && st && STAT[st.kind]) {
    const [bg, fg, ic, tx] = STAT[st.kind], m = st.m, opp = m.a === me ? m.b : m.a;
    stTxt = `<div class="me-card" style="background:${bg};color:${fg}"><div class="me-big">${ic} ${tx}</div><div class="me-tb">MEJA ${st.table}</div>
      <div class="small">${st.kind === 'ump' ? vsTxt(t, m) : 'Lawan: <b>' + esc(E.pname(t, opp)) + '</b>'} · ${esc(E.stageLabel(t, m))}</div></div>`;
  } else if (me && st && st.kind === 'wait') stTxt = `<div class="me-card wait"><div class="me-big">⏳ Menunggu</div><div class="small">${st.ahead ? `${st.ahead} perlawanan lagi sebelum giliran anda` : 'Anda dalam giliran seterusnya'} · lawan <b>${esc(E.pname(t, st.m.a === me ? st.m.b : st.m.a))}</b></div></div>`;
  else if (me && st && st.kind === 'none') stTxt = '<div class="me-card wait"><div class="small">Tiada perlawanan menunggu untuk anda buat masa ini.</div></div>';
  else if (me && !st) stTxt = '<div class="me-card wait"><div class="small">Perlawanan belum bermula. Status anda akan dipaparkan di sini.</div></div>';
  const T = LV.tableList(t), halls = [...new Set(T.map(x => x.hall))];
  const tableCard = ({ k }) => {
    const m = occ[k], mine = m && me && (m.a === me || m.b === me || m.ump === me), u = m ? LV.umpireOf(t, m, U) : '';
    return `<div class="tt${mine ? ' me' : ''}${m ? '' : ' free'}"><div class="tt-h"><b>MEJA ${k}</b>${m ? `<small>${esc(E.matchCode(m) || '')} · ${esc(E.stageLabel(t, m))}</small>` : ''}</div>
      ${m ? `<a class="tt-top" href="#/t/${t.id}/m/${m.id}"><div>${esc(E.pname(t, m.a))}</div><div class="tt-net"></div><div>${esc(E.pname(t, m.b))}</div></a>
        ${u ? `<div class="tt-u">🟣 Pengadil: <b>${esc(E.pname(t, u))}</b></div>` : ''}
        ${edit ? `<div class="row tt-act"><a class="pill-btn small light" href="#/t/${t.id}/m/${m.id}">📝 Skor</a><button class="pill-btn small light" data-tgh="${m.id}">⏸️ Tangguh</button></div>` : ''}`
      : '<div class="tt-top tt-empty"><div>Meja kosong</div></div>'}
      ${nx[k] ? `<div class="tt-n">⏭️ Bersedia: ${vsTxt(t, nx[k])}</div>` : ''}</div>`;
  };
  const queued = cand.filter(m => !Object.values(nx).includes(m));
  $app.innerHTML = `${head}
    <div class="card me-box"><label style="margin-top:0">👤 Saya</label>
      <select id="meSel"><option value="">— pilih nama anda —</option>${people.map(p => `<option value="${p.id}" ${p.id === me ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      ${stTxt}</div>
    <div class="row" style="justify-content:space-between;margin-top:14px"><div class="section-title" style="margin:0">🟢 Sedang berlangsung <span class="muted small">(${live.length}/${T.length} meja)</span></div>
      ${edit && !allDone ? '<button class="pill-btn brand small" id="agih"><span class="dot"></span>▶️ Agih meja kosong</button>' : ''}</div>
    ${canAdmin(t) ? `<div class="row tb-set"><label>🏓 Meja digunakan</label><select id="ntSel">${opt({ 0: `Auto (${E.numTablesOf({ ...t, numTables: 0 })})`, 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8' }, t.numTables)}</select>
      <select id="vnSel">${opt({ B: 'Balai B (1–4) · C (5–8)', C: 'Balai C (5–8)', X: t.venueName || 'Lain-lain' }, t.venue)}</select></div>` : ''}
    ${allDone ? `<div class="notice">✅ Semua perlawanan telah tamat. Lihat keputusan dan ranking di tab ${t.format === 'rr' ? '📊 Liga' : '⚔️ Knockout'}.</div>`
      : !live.length ? `<p class="muted small">${cand.length ? 'Belum bermula. Penganjur tekan ▶️ Agih meja kosong untuk memulakan perlawanan.' : 'Tiada perlawanan sedia untuk dimainkan buat masa ini. Menunggu keputusan perlawanan lain.'}</p>` : ''}
    ${live.length ? halls.map(h => `${halls.length > 1 || h !== 'Balai B' ? `<div class="hall">${esc(h)}</div>` : ''}<div class="ttg">${T.filter(x => x.hall === h).map(tableCard).join('')}</div>`).join('') : ''}
    ${queued.length && !allDone ? `<div class="section-title">Giliran seterusnya</div><div class="card q-list">${queued.slice(0, 10).map((m, i) => `<a class="q-row" href="#/t/${t.id}/m/${m.id}"><span class="no">${i + 1}</span><span>${vsTxt(t, m)}<br><small class="muted">${esc(E.matchCode(m) || '')} · ${esc(E.stageLabel(t, m))}${m.tg ? ' · ⏸️ ditangguh' : ''}</small></span></a>`).join('')}
      ${queued.length > 10 ? `<p class="muted small">+ ${queued.length - 10} lagi</p>` : ''}</div>` : ''}
    <p class="muted small">📌 Meja tidak tetap. Bila satu perlawanan tamat dan skornya disahkan, meja itu terus diagih kepada perlawanan seterusnya yang pemainnya bebas (keutamaan kepada meja asal kumpulan). Pengadil peringkat kumpulan ialah rakan sekumpulan yang tidak bermain.</p>`;
  document.getElementById('meSel').onchange = e => { ls.set(meKey(t), e.target.value || null); viewLive(t); };
  const setTb = () => { t.numTables = Number(document.getElementById('ntSel').value) || 0; t.venue = document.getElementById('vnSel').value; E.planSchedule(t); save(t); toast(`${E.numTablesOf(t)} meja digunakan`); render(true); };
  ['ntSel', 'vnSel'].forEach(id => { const el = document.getElementById(id); if (el) el.onchange = setTb; });
  const ag = document.getElementById('agih');
  if (ag) ag.onclick = () => {
    const n = LV.allocate(t);
    if (!n) return toast('Tiada meja kosong atau tiada perlawanan sedia untuk diagih.');
    save(t); toast(`${n} perlawanan diagih ke meja.`); render(true);
  };
  $app.querySelectorAll('[data-tgh]').forEach(b => (b.onclick = () => {
    if (!confirm('Perlawanan ini akan dikeluarkan dari meja dan diletak di hujung giliran. Teruskan?')) return;
    LV.defer(t, b.dataset.tgh); save(t); toast('Ditangguh'); render(true);
  }));
}

// ---------- Jadual (ringkas, ikut portal) ----------
let jdSel = null, jdSes = '';
function viewJadual(t) {
  const head = section('Jadual', 'Jadual Perlawanan');
  const all = t.matches.filter(m => m.status !== 'bye' && m.a !== 'BYE' && m.b !== 'BYE');
  if (!all.length) { $app.innerHTML = head + `<div class="card"><p class="muted">Jadual belum dijana.${canAdmin(t) ? ' Jana kumpulan dan jadual di tab ⚙️ Tetapan.' : ''}</p></div>`; return; }
  const opts = [...t.groups.map(g => [g.name, t.format === 'rr' ? 'Liga' : `Kumpulan ${g.name}`]),
    ...(t.rounds.ko ? [['K', 'Kalah mati']] : []), ...(t.rounds.pool ? [['L', 'Pool kalah']] : []), ['ALL', 'Semua perlawanan']];
  if (!jdSel || !opts.some(o => o[0] === jdSel)) jdSel = opts[0][0];
  const inSel = m => jdSel === 'ALL' || (jdSel === 'K' ? m.bracket === 'ko' : jdSel === 'L' ? m.bracket === 'pool' : m.stage === 'group' && m.group === jdSel);
  const NS = E.lastSession(t), U = LV.umpirePlan(t);
  const rows = all.filter(inSel).filter(m => !jdSes || m.session === +jdSes)
    .sort((x, y) => (x.session || 999) - (y.session || 999) || String(x.table).localeCompare(String(y.table), 'ms', { numeric: true }));
  const tno = m => m.lt || (m.table ? (m.table.match(/\d+/) || [''])[0] : '');
  $app.innerHTML = `${head}
    <div class="card soft noprint"><div class="grid2">
      <div><label style="margin-top:0">Pilih</label><select id="jdSel">${opt(Object.fromEntries(opts), jdSel)}</select></div>
      <div><label style="margin-top:0">Tapis sesi</label><select id="jdSes">${opt({ '': 'Semua sesi', ...Object.fromEntries(Array.from({ length: NS }, (_, i) => [i + 1, `Sesi ${i + 1} - ${E.sessionTime(t, i + 1)}`])) }, jdSes)}</select></div></div>
      <p class="muted small" style="margin-bottom:0">${E.numTablesOf(t)} meja digunakan · anggaran tamat sekitar <b>${E.sessionTime(t, NS + 1)}</b> (${t.sessionMin} min setiap sesi)</p></div>
    <div class="card tw" style="padding:6px"><table class="jd"><thead><tr><th>Game</th><th>Sesi</th><th>Masa</th><th>Meja</th><th class="l">${UNIT(t)}</th><th class="l">Pengadil</th>${t.handicap ? '<th>HC</th>' : ''}<th>Skor</th></tr></thead><tbody>
    ${rows.map(m => { const r = E.evaluateMatch(t, m), u = LV.umpireOf(t, m, U), h = t.handicap && m.a && m.b ? E.handicapInfo(t, m.a, m.b) : null;
      return `<tr class="${m.lt && m.status !== 'done' ? 'onlive' : ''}" data-go="${m.a && m.b ? m.id : ''}"><td>${esc(E.matchCode(m) || '')}</td><td>${m.session || '-'}</td><td>${m.session ? esc(E.sessionTime(t, m.session)) : '-'}</td><td>${tno(m) || '-'}${m.lt && m.status !== 'done' ? ' 🟢' : ''}</td>
        <td class="l">${m.a ? esc(E.pname(t, m.a)) : `<i class="muted">${esc(E.placeholderLabel(m.srcA) || 'Menunggu')}</i>`} <small class="muted">lwn</small> ${m.b ? esc(E.pname(t, m.b)) : `<i class="muted">${esc(E.placeholderLabel(m.srcB) || 'Menunggu')}</i>`}</td>
        <td class="l">${u ? esc(E.pname(t, u)) : '-'}</td>${t.handicap ? `<td>${h && h.n ? esc(E.pname(t, h.to)).split(' ')[0] + ' +' + h.n : '-'}</td>` : ''}
        <td>${m.status === 'done' ? (E.isTeam(t) ? `${r.ra}-${r.rb}` : `${r.sa}-${r.sb}`) + ' ✅' : '-'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="muted small">Sesi dan meja ialah anggaran. Semasa pertandingan, ikut tab 🟢 Langsung untuk meja sebenar.</p>`;
  document.getElementById('jdSel').onchange = e => { jdSel = e.target.value; viewJadual(t); };
  document.getElementById('jdSes').onchange = e => { jdSes = e.target.value; viewJadual(t); };
  $app.querySelectorAll('tr[data-go]').forEach(tr => tr.dataset.go && (tr.onclick = () => (location.hash = `#/t/${t.id}/m/${tr.dataset.go}`)));
}

// ---------- Knockout + ranking ----------
function viewKnockout(t) {
  viewBrackets(t);
  if (t.stage === 'done') $app.insertAdjacentHTML('beforeend', rankingHtml(t));
  const ko = t.matches.filter(m => m.bracket === 'ko' && m.status !== 'bye' && m.a !== 'BYE' && m.b !== 'BYE');
  if (t.rounds.ko && ko.some(m => m.a || m.b)) {
    let h = '';
    for (let r = t.rounds.ko; r >= 1; r--) {
      const ms = ko.filter(m => m.round === r).sort((x, y) => x.slot - y.slot);
      if (ms.length) h += `<div class="sess">${esc(E.roundName(t, 'ko', r))}</div>${ms.map(m => matchRow(t, m)).join('')}`;
    }
    $app.insertAdjacentHTML('beforeend', `<div class="section-title">Keputusan kalah mati</div><div class="card mlist">${h}</div>`);
  }
}

// ---------- Laporan (PDF melalui cetak) ----------
const gamesTxt = m => m.rubbers.map((r, i) => (m.rubbers.length > 1 ? (i ? 'R: ' : 'P: ') : '') + r.sets.map(s => s.join('-')).join(', ')).join(' · ');
function viewReport(t) {
  const c = clubOf(t), f = E.SET_FORMATS;
  const played = t.matches.filter(m => m.status === 'done' && m.a !== 'BYE' && m.b !== 'BYE');
  const resRow = m => { const r = E.evaluateMatch(t, m), team = E.isTeam(t);
    return `<tr><td>${esc(E.matchCode(m) || '')}</td><td class="l">${m.winner === m.a ? '<b>' + esc(E.pname(t, m.a)) + '</b>' : esc(E.pname(t, m.a))}</td><td><b>${team ? `${r.ra}-${r.rb}` : `${r.sa}-${r.sb}`}</b></td><td class="l">${m.winner === m.b ? '<b>' + esc(E.pname(t, m.b)) + '</b>' : esc(E.pname(t, m.b))}</td><td class="l small">${esc(gamesTxt(m))}</td></tr>`; };
  const resTable = ms => ms.length ? `<div class="tw"><table class="rp"><thead><tr><th>Game</th><th class="l">${UNIT(t)}</th><th>Skor</th><th class="l">${UNIT(t)}</th><th class="l">Game</th></tr></thead><tbody>${ms.map(resRow).join('')}</tbody></table></div>` : '<p class="muted small">Belum ada keputusan.</p>';
  const ko = b => { const R = t.rounds[b]; if (!R) return ''; let h = '';
    for (let r = 1; r <= R; r++) { const ms = played.filter(m => m.bracket === b && m.round === r).sort((x, y) => x.slot - y.slot); if (ms.length) h += `<h4>${esc(E.roundName(t, b, r))}</h4>${resTable(ms)}`; }
    return h ? `<h3>${b === 'ko' ? 'Kalah Mati' : 'Pool Kalah'}</h3>${h}` : ''; };
  const final = t.matches.find(m => m.bracket === 'ko' && m.round === t.rounds.ko);
  const body = `<div class="rp-head">${c.logos.map(s => `<img src="${esc(s)}" alt="">`).join('')}<div><h2>${esc(t.name)}</h2><div class="muted">${esc(c.name)}</div></div></div>
    <table class="rp-info"><tr><td>Tarikh</td><td>${esc(t.date || '-')}</td><td>Tempat</td><td>${esc(t.venue === 'X' ? (t.venueName || '-') : E.VENUES[t.venue] || '-')}</td></tr>
      <tr><td>Kategori</td><td>${esc(ENTRY[t.entryMode])}</td><td>Format</td><td>${esc(FORMAT[t.format])}</td></tr>
      <tr><td>Peserta</td><td>${t.participants.length} ${esc(UNIT(t).toLowerCase())}</td><td>Set</td><td>${esc(f[t.groupFormat].label)}${t.format === 'group_ko' ? ' · KO: ' + esc(f[t.koFormat].label) : ''}</td></tr>
      <tr><td>Perlawanan</td><td>${played.length} selesai</td><td>Meja</td><td>${E.numTablesOf(t)}</td></tr></table>
    ${final && final.winner ? `<div class="champ">🏆 Johan: ${esc(E.pname(t, final.winner))}${final.a && final.b ? ` · Naib johan: ${esc(E.pname(t, final.winner === final.a ? final.b : final.a))}` : ''}</div>` : ''}
    ${t.groups.length ? `<h3>${t.format === 'rr' ? 'Kedudukan Liga' : 'Kedudukan Kumpulan'}</h3>${t.groups.map(g => `<h4>${t.format === 'rr' ? 'Liga' : 'Kumpulan ' + esc(g.name)}</h4>${standingsTable(t, g)}`).join('')}` : ''}
    ${t.groups.length ? `<h3>Keputusan Peringkat ${t.format === 'rr' ? 'Liga' : 'Kumpulan'}</h3>${t.groups.map(g => { const ms = played.filter(m => m.stage === 'group' && m.group === g.name).sort((x, y) => x.gn - y.gn); return ms.length ? `<h4>${t.format === 'rr' ? 'Liga' : 'Kumpulan ' + esc(g.name)}</h4>${resTable(ms)}` : ''; }).join('') || '<p class="muted small">Belum ada keputusan.</p>'}` : ''}
    ${ko('ko')}${ko('pool')}
    ${t.stage === 'done' && t.format !== 'rr' ? rankingHtml(t).replace(/<button[^>]*>Cetak<\/button>/, '') : ''}
    <p class="muted small rp-foot">Dijana oleh Pingpong Portal · ${new Date().toLocaleString('ms-MY')}</p>`;
  $app.innerHTML = `${section('Laporan', 'Laporan Pertandingan')}
    <div class="card noprint"><p class="muted small" style="margin-top:0">Laporan lengkap: maklumat, kedudukan, keputusan semua perlawanan${t.rounds.ko ? ', kalah mati' : ''}${t.stage === 'done' ? ' dan ranking' : ''}. Tekan butang di bawah dan pilih <b>Simpan sebagai PDF</b>.</p>
      <button class="pill-btn brand" id="prt"><span class="dot"></span>🖨️ Cetak / Simpan PDF</button></div>
    <div class="card report">${body}</div>`;
  document.getElementById('prt').onclick = () => window.print();
}

// ---------- Mod ujian ----------
function testTools(t) {
  if (store.isCloud(t.id)) return `<div class="card soft"><div class="section-title" style="margin-top:0">🧪 Ujian</div>
    <p class="muted small">Buat salinan pertandingan ini di telefon anda untuk dicuba (undian, skor, agihan meja) tanpa menjejaskan pertandingan sebenar.</p>
    <button class="pill-btn light small" id="tCopy">🧪 Salin sebagai ujian</button></div>`;
  const ready = t.matches.filter(m => m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE' && m.status !== 'done' && m.status !== 'bye').length;
  return `<div class="card test-card"><div class="section-title" style="margin-top:0">🧪 Alat ujian</div>
    <p class="muted small">Isi skor rawak untuk melihat kedudukan, tab Langsung, kalah mati dan ranking berfungsi. ${ready ? `${ready} perlawanan sedia untuk diisi.` : t.matches.length ? 'Tiada perlawanan sedia. Jika peringkat kumpulan tamat, jana kalah mati di tab ⚔️ Knockout.' : 'Undi dan jana kumpulan dahulu.'}</p>
    <div class="row"><button class="pill-btn orange small" id="tOne" ${ready ? '' : 'disabled'}><span class="dot"></span>🎲 Isi 1 perlawanan</button>
      <button class="pill-btn light small" id="tAll" ${ready ? '' : 'disabled'}>🎲 Isi semua yang sedia</button>
      <button class="pill-btn light small" id="tClr" ${t.matches.some(m => m.status === 'done' || m.lt) ? '' : 'disabled'}>↺ Kosongkan semua skor</button></div></div>`;
}
const rnd = n => Math.floor(Math.random() * n);
function randomGame(aWins) {
  const deuce = Math.random() < .15, lo = deuce ? 10 + rnd(3) : rnd(10), hi = deuce ? lo + 2 : 11;
  return aWins ? [hi, lo] : [lo, hi];
}
function randomScore(t, m) {
  const f = E.fmtFor(t, m.stage), need = Math.ceil(f.bo / 2), bias = Math.random();
  return m.rubbers.map(() => {
    const sets = []; let a = 0, b = 0;
    while (f.full ? sets.length < f.bo : a < need && b < need) { const w = Math.random() < bias; sets.push(randomGame(w)); w ? a++ : b++; }
    return sets;
  });
}
function fillRandom(t, max) {
  let n = 0;
  for (let guard = 0; guard < 500 && n < max; guard++) {
    const live = LV.liveState(t);
    const m = live.live[0] || live.cand[0];
    if (!m) break;
    for (let k = 0; k < 6; k++) { E.recordScore(t, m.id, randomScore(t, m)); if (m.status === 'done') break; }
    if (m.status !== 'done') { E.recordScore(t, m.id, m.rubbers.map(x => x.sets), { override: m.a }); }
    if (m.status !== 'done') break;
    n++; E.planSchedule(t); LV.afterScore(t);
  }
  return n;
}
function wireTestTools(t) {
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
  on('tCopy', () => {
    const c = JSON.parse(JSON.stringify(t)); c.id = E.uid(); c.test = true; c.name = t.name.replace(/ \(Ujian\)$/, '') + ' (Ujian)';
    save(c); toast('Salinan ujian dibuat di telefon ini'); location.hash = `#/t/${c.id}/tetapan`;
  });
  const go = max => { const n = fillRandom(t, max); save(t); toast(n ? `${n} perlawanan diisi skor rawak` : 'Tiada perlawanan sedia'); render(true); };
  on('tOne', () => go(1));
  on('tAll', () => go(999));
  on('tClr', () => {
    if (!confirm('Kosongkan semua skor dan buang carta kalah mati? Kumpulan dan peserta dikekalkan.')) return;
    t.matches = t.matches.filter(m => m.stage === 'group');
    t.matches.forEach(m => { m.rubbers.forEach(r => (r.sets = [])); m.winner = null; m.override = null; m.lt = 0; m.tg = 0; m.ump = undefined; if (m.status !== 'bye') m.status = 'pending'; });
    t.rounds = {}; t.stage = t.groups.length ? 'group' : 'setup';
    E.earlyBracket(t); E.planSchedule(t); save(t); toast('Semua skor dikosongkan'); render(true);
  });
}

// ---------- Akaun ----------
const ROLE = { owner: 'Pemilik (admin utama)', admin: 'Admin pertandingan', verifier: 'Pengesah skor', '': 'Penonton' };
function showAccount() {
  const md = document.getElementById('modal'), u = cloud.state.user;
  const signed = u && !u.anon;
  md.innerHTML = `<div class="sheet">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">Akaun</h2><button class="pill-btn light small" id="mx">✕</button></div>
    ${cloud.state.failed ? '<p class="notice bad small">Tidak dapat menyambung ke awan. Semak internet dan cuba lagi.</p>' : ''}
    ${signed ? `<p>Log masuk sebagai <b>${esc(u.email)}</b><br><span class="role-chip">${ROLE[cloud.state.role] || 'Penonton'}</span></p>
      ${!cloud.state.role ? '<p class="muted small">Akaun ini belum diberi peranan. Minta admin utama menambah e-mel anda di halaman Pentadbir.</p>' : ''}
      <div class="btn-stack">${cloud.state.role === 'owner' ? '<a class="pill-btn brand" href="#/pentadbir" id="goAdm"><span class="dot"></span>Pentadbir &amp; peranan</a>' : ''}
      <button class="pill-btn light" id="out">Log keluar</button></div>`
    : `<p class="muted">Penonton dan pemain tidak perlu log masuk. Pengadil menghantar skor dengan PIN acara pada kad perlawanan.</p>
      <p><b>Penganjur / pengesah skor:</b> log masuk dengan akaun Google yang telah didaftarkan oleh admin utama.</p>
      <button class="pill-btn brand" id="gin"><span class="dot"></span>Log masuk dengan Google</button>`}
  </div>`;
  md.hidden = false;
  md.onclick = e => { if (e.target === md || e.target.id === 'mx' || e.target.id === 'goAdm') md.hidden = true; };
  const gin = document.getElementById('gin');
  if (gin) gin.onclick = async () => {
    gin.disabled = true;
    try { await cloud.signInGoogle(); md.hidden = true; toast('Berjaya log masuk'); }
    catch (err) { gin.disabled = false; toast(err.code === 'auth/unauthorized-domain' ? 'Domain belum dibenarkan dalam Firebase' : err.code === 'auth/popup-closed-by-user' ? 'Log masuk dibatalkan' : 'Gagal: ' + (err.code || err.message), 4500); }
  };
  const out = document.getElementById('out');
  if (out) out.onclick = async () => { await cloud.signOutAll(); md.hidden = true; toast('Log keluar'); render(); };
}

let _rolesUnsub = null;
function viewAdmin() {
  if (cloud.state.role !== 'owner') { $app.innerHTML = `${section('Pentadbir', 'Peranan')}<div class="card"><p class="muted">Hanya admin utama (${esc(cloud.ownerEmail())}) boleh membuka halaman ini.</p></div>`; return; }
  $app.innerHTML = `${section('Pentadbir', 'Peranan')}
    <div class="card"><p class="muted small"><b>Admin pertandingan:</b> cipta dan urus pertandingan, jana jadual, simpan dan sahkan skor.<br><b>Pengesah skor:</b> sahkan atau tolak skor yang dihantar dan betulkan markah. Sesuai untuk AJK di setiap dewan.</p>
      <div class="grid2"><div><label>E-mel Google</label><input id="rEmail" type="email" placeholder="nama@gmail.com"></div>
      <div><label>Nama</label><input id="rName" placeholder="cth. Hatta"></div>
      <div><label>Peranan</label><select id="rRole">${opt({ verifier: 'Pengesah skor', admin: 'Admin pertandingan' }, 'verifier')}</select></div></div>
      <button class="pill-btn brand" id="rAdd" style="margin-top:12px"><span class="dot"></span>Tambah / kemas kini</button></div>
    <div class="card"><div class="section-title" style="margin-top:0">Senarai</div><div id="rList" class="muted">Memuatkan…</div></div>`;
  if (_rolesUnsub) _rolesUnsub();
  _rolesUnsub = cloud.watchRoles(list => {
    const el = document.getElementById('rList'); if (!el) return;
    el.innerHTML = `<div class="list-item"><span><b>${esc(cloud.ownerEmail())}</b><br><span class="muted small">Pemilik</span></span><span class="role-chip">Admin utama</span></div>` +
      list.map(r => `<div class="list-item"><span><b>${esc(r.name || r.email)}</b><br><span class="muted small">${esc(r.email)}</span></span>
      <span class="row"><span class="role-chip">${ROLE[r.role] || r.role}</span><button class="pill-btn no small" data-rm="${esc(r.email)}">Buang</button></span></div>`).join('');
    el.querySelectorAll('[data-rm]').forEach(b => (b.onclick = async () => { if (confirm(`Buang ${b.dataset.rm}?`)) await cloud.removeRole(b.dataset.rm); }));
  });
  document.getElementById('rAdd').onclick = async () => {
    const em = document.getElementById('rEmail').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast('E-mel tidak sah');
    try { await cloud.setRole(em, document.getElementById('rRole').value, document.getElementById('rName').value.trim()); toast('Disimpan'); document.getElementById('rEmail').value = ''; document.getElementById('rName').value = ''; }
    catch (err) { toast('Gagal: ' + (err.code || err.message), 4000); }
  };
}

// ---------- Profil pemain ----------
function showProfile(t, id) {
  const p = E.pobj(t, id); if (!p) return;
  const st = E.playerStats(t, id);
  const g = t.groups.find(x => x.members.includes(id));
  const gpos = g ? E.groupStandings(t, g.name).findIndex(r => r.id === id) + 1 : 0;
  let place = '';
  if (t.stage === 'done') for (const tr of E.finalRanking(t)) if (tr.ids.includes(id)) place = `${tr.ids.length > 1 ? `${tr.place}–${tr.place + tr.ids.length - 1}` : tr.place} (${tr.rows.find(r => r.id === id).label})`;
  const ms = t.matches.filter(m => (m.a === id || m.b === id) && m.status !== 'bye' && m.a !== 'BYE' && m.b !== 'BYE')
    .sort((x, y) => (x.session || 0) - (y.session || 0));
  const U = LV.umpirePlan(t), duty = t.matches.filter(m => m.stage === 'group' && LV.umpireOf(t, m, U) === id);
  const dutyDone = duty.filter(m => m.status === 'done').length;
  const md = document.getElementById('modal');
  md.innerHTML = `<div class="sheet">
    <div class="row" style="justify-content:space-between"><div class="row">${av(p.name)}<h2 style="margin:0">${esc(p.name)}</h2></div><button class="pill-btn light small" id="mx">✕</button></div>
    <p class="muted small">${[p.unit, E.isTeam(t) ? p.members.join(', ') : '', g ? `Kumpulan ${g.name} · tempat ${gpos}` : '', place ? `Tempat akhir: ${place}` : ''].filter(Boolean).map(esc).join(' · ')}</p>
    <div class="stat-grid">
      <div class="stat"><b>${st.p}</b><span>Main</span></div><div class="stat"><b>${st.w}</b><span>Menang</span></div><div class="stat"><b>${st.l}</b><span>Kalah</span></div>
      <div class="stat"><b>${st.p ? Math.round(st.w / st.p * 100) : 0}%</b><span>% menang</span></div><div class="stat"><b>${st.sf}-${st.sa}</b><span>Set</span></div><div class="stat"><b>${(st.pf - st.pa > 0 ? '+' : '') + (st.pf - st.pa)}</b><span>Beza mata</span></div>
    </div>
    ${duty.length ? `<div class="section-title">🟣 Tugas pengadil: ${duty.length} perlawanan${dutyDone ? ` (${dutyDone} selesai)` : ''}</div><div class="mlist">${duty.map(m => matchRow(t, m)).join('')}</div>` : ''}
    <div class="section-title">Perlawanan</div><div class="mlist">${ms.map(m => matchRow(t, m)).join('') || '<p class="muted">Tiada.</p>'}</div>
  </div>`;
  md.hidden = false;
  md.onclick = e => { if (e.target === md || e.target.id === 'mx' || e.target.closest('a.mrow, a.mc')) md.hidden = true; };
}

// ---------- PWA ----------
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  const b = document.getElementById('install-btn'); b.hidden = false;
  b.onclick = async () => { b.hidden = true; deferredPrompt.prompt(); deferredPrompt = null; };
});
