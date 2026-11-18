import * as E from './engine.js';
import { store } from './store.js';
import { playDeal } from './draw-anim.js';
import * as cloud from './cloud.js';
import * as LV from './live.js';
import * as PUSH from './push.js';

const VERSION = '3.11.2';
const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');
const $head = document.getElementById('thead');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ENTRY = { single: 'Perseorangan', double: 'Regu (pasangan pilihan)', double_draw: 'Regu (pasangan diundi)', mixer: 'Regu bertukar (pasangan diundi setiap pusingan)', team: 'Trio / Kuartet (diundi)' };
const ENTRY_SHORT = { single: 'Perseorangan', double: 'Regu', double_draw: 'Regu diundi', mixer: 'Regu bertukar', team: 'Trio' };
const UNIT = t => t.entryMode === 'single' || t.entryMode === 'mixer' ? 'Pemain' : t.entryMode === 'team' ? E.teamWord(t) : t.entryMode === 'double_draw' ? 'Regu' : 'Pasangan';
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
const save = (t, opts) => {
  let before = null;
  try { if (store.isCloud(t.id) && PUSH.pushAvailable()) before = store.get(t.id); } catch {}
  try { store.save(t, opts); } catch (e) { toast(e.message, 4000); return; }
  if (before) try { pushStatusDiff(E.migrate(before), t); pushEvents(E.migrate(before), t); } catch (e) { console.warn(e); }
};
// Pendaftaran dibuka → beritahu pelanggan kelab; tarikh/masa berubah → jadualkan peringatan "esok"
function pushEvents(a, b) {
  const pub = !(b.hidden ?? !!b.test);
  if (pub && regOn(b) && !regOn(a) && b.clubId) {
    const at = startAt(b), d = at ? new Date(at) : null;
    PUSH.send(['club:' + b.clubId], '🏓 Pendaftaran dibuka', `${b.name}${d ? ` · ${HARI[d.getDay()]}, ${fmtDate(b.date)}` : ''}. Tekan untuk daftar.`, `#/daftar/${b.id}`, 'open-' + b.id);
  }
  const sig = x => `${x.date}|${x.startTime}|${x.name}|${x.hidden ?? !!x.test}|${x.stage === 'done'}`;
  if (sig(a) !== sig(b)) {
    const at = startAt(b); let when = 0;
    if (at && pub && b.stage !== 'done') { const d = new Date(at); d.setDate(d.getDate() - 1); d.setHours(20, 30, 0, 0); when = Math.min(d.getTime(), at - 3 * 3600e3); }
    const venue = b.venue === 'X' ? b.venueName : E.VENUES[b.venue];
    PUSH.schedule('remind-' + b.id, when > Date.now() ? when : 0, ['t:' + b.id], '⏰ Esok: ' + b.name, `${E.sessionTime(b, 1)}${venue ? ' · ' + venue : ''}. Jumpa di meja!`, `#/t/${b.id}/langsung`, 'remind-' + b.id);
  }
}
// Hantar push kepada peserta yang statusnya berubah (bermain / pengadil / bersedia) selepas meja diagih
function pushStatusDiff(a, b) {
  const key = (t, pid) => { const st = LV.myStatus(t, pid); return st && ['play', 'ump', 'ready'].includes(st.kind) ? `${st.kind}:${st.table}:${st.m.id}` : ''; };
  const TXT = { play: '🔴 Anda bermain SEKARANG', ump: '🟣 Anda pengadil SEKARANG', ready: '🟡 Sila bersedia: anda seterusnya' };
  for (const p of (E.isMixer(b) ? b.individuals : b.participants)) {
    const kb = key(b, p.id);
    if (!kb || kb === key(a, p.id)) continue;
    const st = LV.myStatus(b, p.id);
    PUSH.send([`me:${b.id}:${p.id}`], `${TXT[st.kind]} · Meja ${st.table}`, `${E.pname(b, st.m.a)} lwn ${E.pname(b, st.m.b)} · ${b.name}`, `#/t/${b.id}/langsung`, 'me-' + b.id);
  }
}
// Topik push peranti ini: penganjur (adm), nama dipilih (me), pendaftaran (reg)
let _pushT = null;
function pushSync() {
  clearTimeout(_pushT);
  _pushT = setTimeout(async () => {
    if (!PUSH.pushAvailable() || !notifOn()) return;
    const T = [];
    for (const x of store.list()) {
      if (!store.isCloud(x.id)) continue;
      if (store.canEdit(x.id)) T.push('adm:' + x.id);
      const me = ls.get('pingpong:me:' + x.id); if (me) T.push(`me:${x.id}:${me}`);
      if (ls.get('pingpong:regd:' + x.id) && cloud.myUid()) T.push(`reg:${x.id}:${cloud.myUid()}`);
      if ((me || ls.get('pingpong:regd:' + x.id)) && x.stage !== 'done') T.push('t:' + x.id);   // peringatan "esok"
    }
    clubSubs().forEach(c => T.unshift('club:' + c));
    try { await PUSH.syncTopics(T.slice(0, 30)); } catch (e) { console.warn('push', e); }
  }, 800);
}
const clubSubs = () => { try { return JSON.parse(ls.get('pingpong:clubSubs') || '[]'); } catch { return []; } };
const canAdmin = t => store.canAdmin(t.id);
const canEdit = t => store.canEdit(t.id);
const isHidden = t => t.hidden ?? !!t.test;
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

// ---------- Kelab ----------
const CLUBS = {
  ksas: { short: 'KSAS Kumpulan Rimau', name: 'Kelab Santai Antara Sahabat (K.S.A.S) Johor Bahru · Kumpulan Rimau', logos: ['logos/ksas.webp', 'logos/ksas-pingpong.webp'], thumb: 'logos/ksas-pingpong.webp', theme: { tb: '#1f4aa8', tb2: '#173a86', or: '#ff7a1a', w: '#eaf1ff', hd1: '#0b1a3f', hd2: '#1d3f8c' }, waGroup: 'KSAS Rimau - Laporan Skor' },
  ksasall: { short: 'KSAS', name: 'Kelab Santai Antara Sahabat (K.S.A.S) Johor Bahru', logos: ['logos/ksas.webp', 'logos/ksas-pingpong.webp'], theme: { tb: '#1f4aa8', tb2: '#173a86', or: '#ff7a1a', w: '#eaf1ff', hd1: '#0b1a3f', hd2: '#1d3f8c' }, waGroup: '' },
  kroni: { short: 'Kroni Shell KSAS', name: 'Kroni Shell · Kelab Santai Antara Sahabat (K.S.A.S) Johor Bahru', logos: [], ownLogo: true, theme: { tb: '#c8102e', tb2: '#9b0d23', or: '#ffc600', w: '#fff4d1', hd1: '#4a0a0f', hd2: '#a3111f' }, waGroup: '' },
  kskpkpjb: { short: 'KSKPKPJB', name: 'Kelab Sukan Kebajikan Perubatan Kesihatan dan Pergigian Johor Bahru', logos: ['logos/kskpkpjb.webp'], theme: { tb: '#16803c', tb2: '#0d5a2a', or: '#e3262e', w: '#e8f6ec', hd1: '#07301b', hd2: '#0f5a2c' }, waGroup: '' },
};
function clubOf(t) {
  if (t.clubId === undefined || t.clubId === null) t.clubId = /ksas|rimau/i.test(t.club || '') ? 'ksas' : /kskp/i.test(t.club || '') ? 'kskpkpjb' : (t.club ? 'lain' : '');
  const c = CLUBS[t.clubId];
  if (c) return { ...c, id: t.clubId, logos: c.ownLogo ? (t.logo ? [t.logo] : []) : c.logos };
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
document.addEventListener('click', e => { const b = e.target.closest('[data-rcard]'); if (!b) return; const [tid, mid] = b.dataset.rcard.split('|'), t = load(tid), m = t && t.matches.find(x => x.id === mid); if (m) shareResultCard(t, m).catch(err => toast('Gagal: ' + (err.message || err))); });
window.addEventListener('hashchange', () => { if (window._lsWake && !/\/ls\//.test(location.hash)) window._lsWake.release().catch(() => {}); const md = document.getElementById('modal'); if (md) md.hidden = true; render(); });
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
  try { checkNotify(); } catch (e) { console.warn(e); }
  if (what === 'role' || what === 'tournaments' || what === 'auth') pushSync();
  updateTop();
  if (_cur && cloud.isVerifier()) cloud.watchSubmissions(_cur);
  if (['pending', 'tournaments', 'role', 'auth', 'error', 'regs', 'poster'].includes(what)) softRender();
  else if (what === 'live' && /^#\/tv\//.test(location.hash)) tvLiveRefresh();
  else if (what === 'live' && /^#\/t\/[^/]+\/ls\//.test(location.hash)) { if (_lsOnLive) _lsOnLive(); }
  else if (what === 'live' && !/^#\/t\/[^/]+\/(ls|m)\//.test(location.hash)) softRender();
});
// ---------- Notifikasi telefon ----------
// Tanpa pelayan: berfungsi semasa app dibuka atau baru diletak di latar belakang.
const notifOn = () => 'Notification' in window && Notification.permission === 'granted' && ls.get('pingpong:notif') !== '0';
async function notify(title, body, tag, url) {
  if (!notifOn()) return;
  const opts = { body, tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [200, 100, 200], data: { url } };
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) await reg.showNotification(title, opts); else new Notification(title, opts); } catch {}
}
async function askNotif() {
  if (!('Notification' in window)) return toast('Pelayar ini tidak menyokong notifikasi. Pasang app ke skrin utama dahulu.', 4000);
  if (Notification.permission === 'granted' && ls.get('pingpong:notif') !== '0') { ls.set('pingpong:notif', '0'); PUSH.unsubscribe().catch(() => {}); toast('🔕 Notifikasi dimatikan'); return; }
  const p = await Notification.requestPermission();
  ls.set('pingpong:notif', p === 'granted' ? '1' : '0');
  toast(p === 'granted' ? '🔔 Notifikasi dihidupkan' : 'Notifikasi tidak dibenarkan. Benarkan dalam tetapan pelayar.', 4000);
  if (p === 'granted') {
    if (PUSH.pushAvailable()) { try { await PUSH.subscribe(); pushSync(); } catch (e) { console.warn('push', e); toast('Push tidak dapat diaktifkan: ' + (e.message || e), 4000); } }
    notify('🔔 Notifikasi Pingpong Portal', PUSH.pushAvailable() ? 'Notifikasi akan sampai walaupun app ditutup.' : 'Notifikasi berfungsi.', 'test');
  }
}
const notifBtn = (label = '🔔 Hidupkan notifikasi') => !('Notification' in window) || notifOn() ? '' : `<button type="button" class="pill-btn light small" data-notif="1">${label}</button>`;
document.addEventListener('click', e => { if (e.target.closest('[data-notif]')) { askNotif().then(() => render(true)); } });
const _seen = { pend: {}, reg: {}, me: {}, myReg: {} };
function checkNotify() {
  // a) skor menunggu pengesahan (penganjur / pengesah)
  if (cloud.isVerifier()) for (const [tid, list] of Object.entries(cloud.state.pending)) {
    const seen = _seen.pend[tid], t = seen && load(tid);
    if (seen) list.filter(x => !seen.has(x.id)).forEach(x => {
      const m = t && t.matches.find(mm => mm.id === x.matchId);
      notify('🔔 Skor menunggu pengesahan', `${m ? E.matchCode(m) + ' · ' : ''}${t ? E.pname(t, x.a) + ' lwn ' + E.pname(t, x.b) : ''} · dihantar oleh ${x.by || '-'}`, 'pend-' + x.id, `#/t/${tid}/keputusan`);
    });
    _seen.pend[tid] = new Set(list.map(x => x.id));
  }
  // b) pendaftaran baharu (admin) dan status pendaftaran sendiri
  for (const [tid, list] of Object.entries(cloud.state.regs)) {
    const t = load(tid); if (!t) continue;
    if (canAdmin(t)) {
      const seen = _seen.reg[tid];
      if (seen) list.filter(r => !seen.has(r.uid)).forEach(r => notify('🏓 Pendaftaran baharu', `${r.name} · ${t.name}`, 'reg-' + r.uid, `#/t/${tid}/pemain`));
      _seen.reg[tid] = new Set(list.map(r => r.uid));
    }
    const mine = list.find(r => r.uid === cloud.myUid());
    if (mine) { const k = _seen.myReg[tid]; if (k && k !== mine.status && mine.status !== 'pending') notify(mine.status === 'ok' ? '✅ Pendaftaran disahkan' : '✕ Pendaftaran ditolak', t.name, 'myreg-' + tid, `#/t/${tid}/pemain`); _seen.myReg[tid] = mine.status; }
  }
  // c) status peribadi 👤 Saya: bermain / pengadil / bersedia
  for (const x of store.list()) {
    const me = ls.get('pingpong:me:' + x.id); if (!me) continue;
    const t = load(x.id); if (!t) continue;
    const st = LV.myStatus(t, me), key = st && STAT[st.kind] ? `${st.kind}:${st.table}:${st.m.id}` : '';
    const prev = _seen.me[t.id];
    if (prev !== undefined && key && key !== prev) {
      const [, , ic, tx] = STAT[st.kind];
      notify(`${ic} ${tx} · Meja ${st.table}`, `${E.pname(t, st.m.a)} lwn ${E.pname(t, st.m.b)} · ${t.name}`, 'me-' + t.id, `#/t/${t.id}/langsung`);
    }
    _seen.me[t.id] = key;
  }
}
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
  document.body.classList.remove('tv'); if (parts[0] !== 'tv') stopTV();
  document.getElementById('brand-title').textContent = 'Pingpong Portal';
  updateTop();
  if (!parts.length) { viewHome(); if (keep) window.scrollTo(0, y); return; }
  if (parts[0] === 'baru') return viewNew();
  if (parts[0] === 'pentadbir') return viewAdmin();
  if (parts[0] === 'tv') {
    const t = load(parts[1]);
    if (!t) { $app.innerHTML = '<div class="empty">Memuatkan data…</div>'; return; }
    _cur = t.id; applyTheme(t); viewTV(t); return;
  }
  if (parts[0] === 'daftar') {
    const t = load(parts[1]);
    if (!t) { $app.innerHTML = cloud.state.tournaments || cloud.state.failed ? '<div class="empty">Pertandingan tidak dijumpai.</div>' : '<div class="empty">Memuatkan data…</div>'; return; }
    _cur = t.id; applyTheme(t); renderHead(t, 'daftar'); $tabs.hidden = true; updateTop();
    viewDaftar(t); if (keep) window.scrollTo(0, y); return;
  }
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
    if (page !== 'm' && page !== 'ls' && page !== 'kadskor') _back = page;
    renderHead(t, page);
    const views = { tetapan: viewSetup, pemain: viewPemain, langsung: viewLive, jadual: viewJadual, kumpulan: viewGroups, keputusan: viewResults, kalahmati: viewKnockout, pool: viewPool, laporan: viewReport, ranking: viewRanking, peraturan: viewRules };
    updateTop();
    if (page === 'm') viewMatch(t, parts[3]); else if (page === 'ls') viewLiveScore(t, parts[3]); else if (page === 'kadskor') viewKadSkor(t); else if (views[page]) views[page](t); else { location.hash = '#/'; return; }
    if (page === 'kumpulan' && t.format === 'rr' && t.stage === 'done') { $app.insertAdjacentHTML('beforeend', '<div class="row" style="margin:12px 0"><button class="pill-btn orange" id="posterBtn"><span class="dot"></span>🏆 Kongsi poster juara</button></div>'); wirePoster(t); }
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
// Kira detik ke masa mula (tarikh + masa mula pertandingan)
const startAt = t => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.date || ''); if (!m) return 0; const [h, mi] = (t.startTime || '21:00').split(':').map(Number); return new Date(+m[1], +m[2] - 1, +m[3], h || 0, mi || 0).getTime(); };
function cdText(t) {
  let s = Math.max(0, Math.floor((startAt(t) - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s %= 86400; const h = Math.floor(s / 3600); s %= 3600; const mi = Math.floor(s / 60); s %= 60;
  const p = n => String(n).padStart(2, '0');
  return d ? `${d}<em>h</em> ${p(h)}<em>j</em> ${p(mi)}<em>m</em>` : `${p(h)}:${p(mi)}<em>:${p(s)}</em>`;
}
let _cdTimer = null;
function renderHead(t, page) {
  clearInterval(_cdTimer);
  _cdTimer = setInterval(() => { const el = document.getElementById('cdown'); if (!el) return clearInterval(_cdTimer); if (startAt(t) <= Date.now()) { clearInterval(_cdTimer); renderHead(t, page); } else el.innerHTML = cdText(t); }, 1000);
  const c = clubOf(t);
  document.getElementById('brand-title').textContent = '← Semua pertandingan';
  $head.hidden = false;
  const f = E.SET_FORMATS[t.groupFormat];
  const play = t.matches.filter(m => m.status !== 'bye' && m.a !== 'BYE' && m.b !== 'BYE');
  const done = play.filter(m => m.status === 'done').length, pct = play.length ? Math.round(done / play.length * 100) : 0;
  const nT = E.numTablesOf(t), onT = LV.liveState(t).live.length;
  const stg = t.stage === 'setup' ? 'Persediaan' : t.stage === 'done' ? 'Tamat' : t.stage === 'group' ? (E.isMixer(t) ? 'Regu bertukar' : t.format === 'rr' ? 'Liga' : 'Kumpulan') : 'Kalah mati';
  const sub = [c.short, fmtDate(t.date), E.isTeam(t) ? E.teamWord(t) + (t.tieFormat === 'SSD' ? ' S+S+D' : '') : ENTRY_SHORT[t.entryMode], (f.full ? `${f.bo} set` : `Best of ${f.bo}`)].filter(Boolean).map(esc).join(' · ');
  $head.innerHTML = `${store.isLocal(t.id) ? '<div class="hb-test">🧪 MOD UJIAN · telefon ini sahaja</div>' : ''}<div class="hb-top">${c.logos.length ? `<div class="hb-logos">${c.logos.map(src => `<img src="${esc(src)}" alt="">`).join('')}</div>` : ''}
      <div class="hb-tt"><h1>${esc(t.name)}</h1><p>${sub}<span class="hb-cl" title="${store.isCloud(t.id) ? 'Dikongsi di awan' : 'Disimpan di peranti ini sahaja'}">${store.isCloud(t.id) ? '☁️' : '📱'}</span></p></div></div>
    <div class="hb-board">
      ${startAt(t) > Date.now() && !done ? `<div class="seg cd"><small>Bermula dalam</small><b id="cdown">${cdText(t)}</b></div>`
        : `<div class="seg"><small>Peringkat</small><b class="${t.stage === 'group' || t.stage === 'ko' ? 'on' : ''}">${t.stage === 'group' || t.stage === 'ko' ? '<i class="pulse"></i>' : ''}${stg}</b></div>`}
      <div class="seg wide"><small>Perlawanan</small><b>${done}<em>/${play.length}</em></b><span class="rally"><span class="fill" style="width:${pct}%"></span><span class="ball" style="left:${pct}%"></span></span></div>
      <div class="seg"><small>Meja</small><b>${onT ? `${onT}<em>/${nT}</em>` : nT}</b></div>
    </div>${sponsorStrip(t)}`;
  const pw = UNIT(t) === 'Pemain' ? 'Pemain' : UNIT(t);
  const tabs = [['tetapan', '⚙️', 'Tetapan'], ['pemain', '👥', UNIT(t)], ['langsung', '🟢', 'Langsung'], ['jadual', '📋', 'Jadual'],
    ['kumpulan', '📊', E.isMixer(t) ? 'Individu' : t.format === 'rr' ? 'Liga' : 'Kumpulan'], ['keputusan', '📝', 'Keputusan']];
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
let _homeClub = '';
function viewHome() {
  const all = store.list().map(E.migrate).filter(t => store.isLocal(t.id) || store.canAdmin(t.id) || !isHidden(t));
  const clubs = [...new Map(all.filter(t => t.clubId && CLUBS[t.clubId]).map(t => [t.clubId, CLUBS[t.clubId].short])).entries()];
  if (_homeClub && !clubs.some(([k]) => k === _homeClub)) _homeClub = '';
  const list = all.filter(t => !_homeClub || t.clubId === _homeClub);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const past = t => t.stage === 'done' || (t.date && new Date(t.date + 'T23:59') < today);
  const sortD = (x, y) => (x.date || '9999').localeCompare(y.date || '9999');
  const up = list.filter(t => !past(t)).sort(sortD), arc = list.filter(past).sort((x, y) => -sortD(x, y));
  const mine = myRegTids().map(id => all.find(t => t.id === id)).filter(t => t && !past(t));
  const subs = clubSubs();
  const card = t => {
    if (store.isCloud(t.id) && regOn(t)) cloud.watchRegistrations(t.id);
    const own = posterOf(t), c = clubOf(t), at = startAt(t), d = at ? new Date(at) : null;
    const venue = t.venue === 'X' ? t.venueName : E.VENUES[t.venue];
    const tags = [
      regOn(t) ? (regLive(t) ? '<span class="tg ok">Pendaftaran dibuka</span>' : '<span class="tg">Penuh</span>') : '',
      t.stage === 'group' || t.stage === 'ko' ? '<span class="tg live">● Sedang berlangsung</span>' : '',
      t.hcMode && t.hcMode !== 'off' ? '<span class="tg">Handicap</span>' : '',
      t.regCond ? `<span class="tg">${esc(t.regCond)}</span>` : '',
      store.isCloud(t.id) && isHidden(t) ? '<span class="tg mute">🙈 Tersembunyi</span>' : '',
      store.isLocal(t.id) ? '<span class="tg mute">📱 Peranti ini</span>' : '',
      cloud.isAdmin() ? `<span class="tg mute">👤 ${esc(t.createdBy ? t.createdBy.name : 'pencipta tidak direkod')}</span>` : '',
    ].join('');
    return `<div class="hc">
      <a class="hc-thumb" href="#/t/${t.id}">${own ? `<img src="${own}" alt="">` : `<span class="hc-logo">${c.thumb || c.logos[0] ? `<img src="${esc(c.thumb || c.logos[0])}" alt="">` : '🏓'}</span>`}</a>
      <div class="hc-body">
        <div class="hc-date">${d ? `${HARI[d.getDay()]} · ${esc(fmtDate(t.date))}${t.startTime ? ' · ' + esc(E.sessionTime(t, 1)) : ''}` : esc(t.date || 'Tarikh belum ditetapkan')}</div>
        <a href="#/t/${t.id}" class="hc-name">${esc(t.name)}</a>
        <div class="hc-meta">${esc(c.short || '—')} · ${E.isTeam(t) ? esc(E.teamWord(t)) : ENTRY_SHORT[t.entryMode]}${venue ? ' · ' + esc(venue) : ''}</div>
        <div class="hc-tags">${tags}</div>
        <div class="hc-act">${regLive(t) ? `<a class="pill-btn orange small" href="#/daftar/${t.id}"><span class="dot"></span>Daftar →</a>` : ''}<a class="pill-btn light small" href="#/t/${t.id}">Lihat</a>
          ${store.isLocal(t.id) && cloud.isAdmin() ? `<button class="pill-btn small light" data-up="${t.id}">☁️ Pindah ke awan</button>` : ''}</div>
      </div></div>`;
  };
  $app.innerHTML = `
    ${section('Pingpong Portal', 'Pertandingan')}
    <p class="muted small" style="margin-top:-6px">${cloud.state.failed ? '📴 Tidak dapat menyambung ke awan. Hanya data dalam peranti ini dipaparkan.' : cloud.state.tournaments ? (cloud.state.offline ? '📴 Luar talian — memaparkan salinan terakhir' : '☁️ Disambung ke awan') : '⏳ Menyambung ke awan…'}</p>
    ${cloud.isAdmin() || cloud.state.failed || !cloud.state.ready ? `<div class="row" style="margin-bottom:14px"><a class="pill-btn orange" href="#/baru"><span class="dot"></span>Pertandingan baharu</a></div>` : ''}
    ${clubs.length > 1 ? `<div class="hc-chips"><button class="chip ${!_homeClub ? 'on' : ''}" data-hclub="">Semua kelab</button>${clubs.map(([k, n]) => `<button class="chip ${_homeClub === k ? 'on' : ''}" data-hclub="${k}">${esc(n)}</button>`).join('')}</div>` : ''}
    ${(_homeClub || clubs.length === 1) && store.isCloud ? (() => { const k = _homeClub || clubs[0][0], on = subs.includes(k) && notifOn(); return `<div class="hc-sub"><span>${on ? '🔔' : '🔕'} ${on ? 'Anda akan dimaklumkan bila' : 'Dapatkan notifikasi bila'} <b>${esc(CLUBS[k].short)}</b> membuka pendaftaran</span><button class="pill-btn small ${on ? 'light' : 'brand'}" data-csub="${k}">${on ? 'Berhenti' : 'Langgan'}</button></div>`; })() : ''}
    ${mine.length ? `<div class="section-title">📝 Pertandingan saya</div><div class="my-list">${mine.map(t => `<a class="my-item" href="#/daftar/${t.id}"><b>${esc(t.name)}</b><span>${esc(fmtDate(t.date) || '')} · Lihat pendaftaran →</span></a>`).join('')}</div>` : ''}
    <div class="section-title">Akan datang</div>
    ${up.length ? `<div class="hc-list">${up.map(card).join('')}</div>` : '<div class="card empty">Tiada pertandingan akan datang.</div>'}
    ${arc.length ? `<details class="card fold" ${ls.get('pingpong:arcOpen') === '1' ? 'open' : ''} id="arcF"><summary>🗂️ Arkib pertandingan lepas (${arc.length})</summary><div class="hc-list" style="margin-top:10px">${arc.map(card).join('')}</div></details>` : ''}
    <details class="card fold noprint"><summary>Sandaran data</summary>
      <p class="muted">Eksport untuk sandaran atau pindah ke peranti lain.</p>
      <div class="row"><button class="pill-btn light small" id="exp">Eksport</button>
      <label class="pill-btn light small" style="margin:0">Import<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
    </details>
    <p class="muted small" style="text-align:center">Pingpong Portal · Versi ${VERSION}</p>`;
  $app.querySelectorAll('[data-hclub]').forEach(b => (b.onclick = () => { _homeClub = b.dataset.hclub; viewHome(); }));
  const af = document.getElementById('arcF'); if (af) af.ontoggle = () => ls.set('pingpong:arcOpen', af.open ? '1' : '0');
  $app.querySelectorAll('[data-csub]').forEach(b => (b.onclick = async () => {
    const k = b.dataset.csub, cur = clubSubs(), on = cur.includes(k) && notifOn();
    if (!on && !notifOn()) { await askNotif(); if (!notifOn()) return; }
    ls.set('pingpong:clubSubs', JSON.stringify(on ? cur.filter(x => x !== k) : [...new Set([...cur, k])]));
    pushSync(); toast(on ? '🔕 Langganan kelab dihentikan' : `🔔 Anda akan dimaklumkan bila ${CLUBS[k].short} membuka pendaftaran`, 3500); viewHome();
  }));
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
      <div><label>Kelab / Penganjur</label><select name="clubId">${opt({ ksasall: 'KSAS', ksas: 'KSAS Kumpulan Rimau', kroni: 'Kroni Shell KSAS', kskpkpjb: 'KSKPKPJB', lain: 'Lain-lain', '': '— Tiada —' }, clubOf(t).id)}</select></div>
      <div><label>Tarikh</label><input name="date" type="date" value="${esc(t.date)}"></div>
      <div><label>Masa mula</label><input name="startTime" type="time" value="${esc(t.startTime)}"></div>
      <div><label>Minit setiap sesi</label><input name="sessionMin" type="number" min="10" max="90" step="5" value="${t.sessionMin}"></div>
    </div>
    <div class="club-preview" id="clubPrev"></div>
    <div data-show="clubX" class="grid2">
      <div><label>Nama kelab / penganjur</label><input name="club" value="${esc(t.clubId === 'lain' ? t.club : '')}"></div>
    </div>
    <div data-show="clubLogo"><label>Logo (pilihan)</label><input name="logoFile" type="file" accept="image/*"></div>

    <div class="section-title">Acara</div>
    <label>Jenis acara</label><select name="entryMode" ${dis}>${opt(ENTRY, t.entryMode)}</select>
    <div data-show="team"><label>Saiz</label><select name="teamSize" ${dis}>${opt({ 3: 'Trio (3 orang)', 4: 'Kuartet (4 orang)' }, t.teamSize)}</select></div>
    <div data-show="team"><label>Setiap pertemuan</label><select name="tieFormat" ${dis}>${opt({ SD: 'Single + Double', SSD: 'Single + Single + Double (ikut markah)' }, t.tieFormat)}</select></div>
    <div data-show="tieRule"><label>Keputusan sama (kumpulan)</label><select name="tieRule">${opt({ draw: 'Seri', next: 'Tiada seri (beza set, kemudian mata)' }, t.tieRule || 'draw')}</select></div>
    <div data-show="mixer" class="notice small" style="margin:8px 0">🔀 <b>Regu bertukar:</b> setiap pusingan pemain diundi menjadi regu baharu. Mata dikira untuk setiap individu (menang, kemudian beza set dan beza mata). Pasangan yang sama dielakkan.</div>
    <div data-show="mixer" class="grid2">
      <div><label>Bilangan pusingan</label><input name="mixRounds" type="number" min="1" max="40" value="${t.mixRounds || ''}" placeholder="Auto: ${E.mixRoundsAuto(Math.max(4, t.individuals.length))}" ${dis}></div>
      <div><label>Imbang regu ikut tahap</label><select name="mixLv" ${dis}>${opt({ '': 'Tidak (undian bebas)', ksas: 'Tahap KSAS', kroni: 'Tahap Kroni Shell' }, t.mixLv || '')}</select></div>
    </div>
    <p data-show="mixer" class="muted small" style="margin:4px 0 0">Auto = setiap pemain berpasangan dengan semua pemain lain sekali. Tahap ditulis dalam senarai individu, cth. <i>Ali (Naga)</i>. Jika Handicap ikut tahap dipilih, tahap itu juga digunakan untuk imbang.</p>
    <div data-show="notmixer"><label>Struktur</label><select name="format" ${dis}>${opt(FORMAT, t.format)}</select></div>
    <div class="grid2">
      <div><label data-label="gf">Format kumpulan</label><select name="groupFormat">${opt(setOpts, t.groupFormat)}</select></div>
      <div data-show="ko"><label>Format kalah mati</label><select name="koFormat">${opt(setOpts, t.koFormat)}</select></div>
    </div>
    <label class="check" style="margin-top:10px"><input type="checkbox" name="liveAuto" ${t.liveAuto !== false ? 'checked' : ''}> <span>🎯 Jaga skor: <b>simpan / hantar automatik</b> bila perlawanan tamat<br><small class="muted">Jika tidak ditanda, penjaga skor perlu menekan butang Simpan / Hantar sendiri. Skor boleh sentiasa diisi manual di tab 📝 Keputusan.</small></span></label>
    <label>Handicap</label><select name="hcMode">${opt({ off: 'Tiada', manual: 'Manual (0–5)', ksas: 'Tahap KSAS dalaman', kroni: 'Tahap Kroni Shell' }, t.hcMode || (t.handicap ? 'manual' : 'off'))}</select>

    <div data-show="groups">
      <div class="section-title">Kumpulan &amp; kalah mati</div>
      <div class="grid2">
        <div><label>Saiz kumpulan</label><select name="groupSize" ${dis}>${opt({ 4: 'Maks. 4', 5: 'Maks. 5' }, t.groupSize)}</select></div>
        <div><label>Bilangan kumpulan</label><select name="numGroups" ${dis}>${opt({ 0: 'Auto (ikut saiz)', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8' }, t.numGroups)}</select></div>
        <div><label>Tempat ke-3 terbaik layak</label><select name="bestThirds" ${dis}>${opt({ 0: 'Tiada', 2: '2 terbaik', 4: '4 terbaik', 6: '6 terbaik', 8: '8 terbaik' }, t.bestThirds)}</select></div>
        <div><label>Susunan kalah mati</label><select name="koMode">${opt({ M: 'Cermin (automatik)', U: 'Undian' }, t.koMode)}</select></div>
        <div><label>Peserta pool kalah</label><select name="pool">${opt(POOL, t.pool)}</select></div>
        <div><label>Susunan pool kalah</label><select name="poolMode">${opt({ M: 'Cermin (automatik)', U: 'Undian' }, t.poolMode)}</select></div>
      </div>
    </div>

    <div class="section-title">Meja</div>
    <div class="grid2">
      <div><label>Lokasi</label><select name="venue">${opt(E.VENUES, t.venue)}</select></div>
      <div><label>Bilangan meja</label><select name="numTables">${opt({ 0: 'Auto', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8' }, t.numTables)}</select></div>
    </div>
    <div data-show="venueX"><label>Nama tempat</label><input name="venueName" value="${esc(t.venueName)}" placeholder="cth. Dewan Kelab Sukan HSAJB"></div>

    <div class="section-title">Pendaftaran peserta</div>
    <label class="check"><input type="checkbox" name="regOpen" ${t.regOpen ? 'checked' : ''}> Buka pendaftaran melalui pautan</label>
    ${t.regOpen && !regOn(t) ? '<p class="notice small" style="margin:4px 0 8px">🔒 Pendaftaran ditutup secara automatik kerana jadual telah dijana. Reset jadual untuk membukanya semula.</p>' : ''}
    <div data-show="reg">
      <div class="grid2"><div><label>Yuran</label><input name="regFee" value="${esc(t.regFee || '')}" placeholder="cth. Percuma / RM10"></div>
      <div><label>Had peserta</label><input name="regMax" maxlength="30" value="${esc(t.regMaxText || (t.regMax ? String(t.regMax) : ''))}" placeholder="cth. 16 / tiada had"></div></div>
      <label>Hadiah (satu baris setiap tempat)</label><textarea name="prizes" rows="3" placeholder="Johan: RM100 + piala&#10;Naib johan: RM50&#10;Ketiga: Hadiah saguhati">${esc(t.prizes || '')}</textarea>
      <label>Catatan</label><textarea name="regNote" rows="3" placeholder="cth. Terbuka untuk semua ahli KSAS">${esc(t.regNote || '')}</textarea>
      <label>Syarat penyertaan (pilihan)</label><input name="regCond" maxlength="60" value="${esc(t.regCond || '')}" placeholder="cth. Wanita sahaja / Staf HSAJB sahaja">
      ${E.HC_SCHEMES[t.hcMode] ? `<label>Tahap dibenarkan</label><div class="lv-allow">${E.HC_SCHEMES[t.hcMode].levels.map(l => `<label class="check"><input type="checkbox" name="regLv" value="${l[0]}" ${!(t.regLevels || []).length || t.regLevels.includes(l[0]) ? 'checked' : ''}> ${esc(l[1])}</label>`).join('')}</div><p class="muted small" style="margin-top:0">Tanda semua = terbuka kepada semua tahap.</p>` : ''}
    </div>

    <div class="section-title">Laporan skor</div>
    <label class="check"><input type="checkbox" name="waEnabled" ${t.waEnabled ? 'checked' : ''}> Benarkan lapor melalui WhatsApp (sandaran kepada PIN)</label>
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
    const mx = form.entryMode.value === 'mixer';
    show('team', form.entryMode.value === 'team');
    show('mixer', mx); show('notmixer', !mx);
    { const gf = form.groupFormat; [...gf.options].forEach(o => { o.hidden = o.disabled = mx && !['3', '5'].includes(o.value); }); if (mx && !['3', '5'].includes(gf.value)) gf.value = '3'; }
    show('groups', f === 'group_ko' && !mx);
    show('ko', f !== 'rr' && !mx);
    show('venueX', form.venue.value === 'X');
    show('clubX', form.clubId.value === 'lain');
    show('tieRule', (form.entryMode.value === 'team' && form.tieFormat.value === 'SSD' && Number(form.teamSize.value) >= 4) || (form.entryMode.value !== 'team' && form.groupFormat.value === 'F2'));
    show('clubLogo', form.clubId.value === 'lain' || form.clubId.value === 'kroni');
    show('wa', form.waEnabled.checked);
    show('reg', form.regOpen.checked);
    show('waG', form.waMode.value === 'G'); show('waN', form.waMode.value === 'N');
    form.querySelector('[data-label="gf"]').textContent = mx ? 'Format setiap perlawanan' : f === 'rr' ? 'Format liga' : f === 'ko' ? 'Format (tidak digunakan)' : 'Format kumpulan';
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
  t.hcMode = v('hcMode'); t.handicap = t.hcMode !== 'off';
  t.tieRule = v('tieRule') || 'draw';
  t.groupFormat = v('groupFormat'); t.koFormat = v('koFormat'); if (form.liveAuto) t.liveAuto = form.liveAuto.checked;
  t.koMode = v('koMode'); t.pool = v('pool'); t.poolMode = v('poolMode');
  t.venue = v('venue'); t.numTables = Number(v('numTables')) || 0; t.venueName = v('venueName').trim();
  t.waEnabled = form.waEnabled.checked;
  t.regOpen = form.regOpen.checked; t.regNote = v('regNote').trim(); t.regCond = String(v('regCond') || '').trim();
  { const S = E.HC_SCHEMES[t.hcMode], ch = [...form.querySelectorAll('input[name=regLv]')]; if (S && ch.length) { const sel = ch.filter(x => x.checked).map(x => x.value); t.regLevels = sel.length === ch.length ? [] : sel; } }
  t.regFee = v('regFee').trim(); t.regMaxText = String(v('regMax') || '').trim(); t.regMax = Number((t.regMaxText.match(/\d+/) || [0])[0]) || 0; t.prizes = v('prizes').trim();
  t.waMode = v('waMode'); t.waGroup = v('waGroup').trim(); t.waNumber = v('waNumber').replace(/\D/g, '');
  if (!form.entryMode.disabled) {
    t.entryMode = v('entryMode'); t.teamSize = Number(v('teamSize')) || 3; t.format = v('format');
    if (t.entryMode === 'mixer') { t.format = 'rr'; t.mixRounds = Math.max(0, Math.min(40, Number(v('mixRounds')) || 0)); t.mixLv = v('mixLv') || ''; if (!['3', '5'].includes(t.groupFormat)) t.groupFormat = '3'; E.relevel(t); }
    t.tieFormat = t.teamSize >= 4 ? v('tieFormat') || 'SD' : 'SD';
    t.numGroups = Number(v('numGroups')) || 0; t.groupSize = Number(v('groupSize')) || 4; t.bestThirds = Number(v('bestThirds')) || 0;
  }
  if (t.stage !== 'setup' && t.matches.length) E.planSchedule(t);
}
async function readLogo(form, t) {
  const file = form.logoFile && form.logoFile.files[0];
  if (!file || !(t.clubId === 'lain' || t.clubId === 'kroni')) return;
  try { t.logo = await resizeLogo(file); } catch { toast('Logo tidak dapat dibaca'); }
}

function viewNew() {
  const t = E.newTournament();
  if (cloud.state.user && !cloud.state.user.anon) t.createdBy = { name: cloud.state.user.name || (cloud.state.user.email || '').split('@')[0], at: Date.now() };
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
  const ex = t.entryMode === 'double' ? 'Ali &amp; Abu, Farmasi' : 'Ali, Farmasi';
  const hc = t.hcMode === 'manual' ? ' (2)' : E.HC_SCHEMES[t.hcMode] ? (t.hcMode === 'kroni' ? ' (Lion W)' : ' (Naga)') : '';
  return `Satu ${t.entryMode === 'double' ? 'pasangan' : 'nama'} setiap baris, cth. <i>${ex}${hc}</i>`;
}

// Paparan peserta (bukan admin): senarai sahaja
function viewParticipants(t) {
  const unit = UNIT(t);
  $app.innerHTML = `${section('Peserta', `Senarai ${unit}`)}
    <div class="card">${t.participants.length ? `<div class="mlist">${t.participants.map((p, i) => `<div class="list-item"><span class="row" style="flex-wrap:nowrap"><span class="muted small" style="width:22px">${i + 1}.</span>${pn(t, p.id)}</span>
      <span class="muted small" style="text-align:right">${esc(E.isTeam(t) ? p.members.join(', ') : p.unit || '')}${t.hcMode === 'manual' && p.hc ? ` · HC ${p.hc}` : ''}</span></div>`).join('')}</div>` : '<p class="muted">Senarai belum diterbitkan.</p>'}
      ${E.usesDraw(t) && t.participants.length ? '<div class="btn-stack" style="margin-top:12px"><button class="pill-btn" id="playU"><span class="dot"></span>▶ Tonton undian</button></div>' : ''}
    </div>
    <p class="muted small">Penganjur: tekan <b>Log masuk</b> di atas untuk mengurus pertandingan ini.</p>`;
  const pu = document.getElementById('playU'); if (pu) pu.onclick = () => playUnitDraw(t);
}

function viewSetupCore(t, part = 'tetapan') {
  if (!canAdmin(t)) return part === 'pemain' ? viewParticipants(t) : viewInfo(t);
  const locked = t.stage !== 'setup';
  const unit = UNIT(t), draw = E.usesDraw(t);
  const plist = t.participants.length ? `<div class="tw"><table><thead><tr><th>#</th><th class="l">${unit}</th><th class="l">Unit</th>${t.hcMode === 'manual' ? '<th>HC</th>' : ''}</tr></thead><tbody>
      ${t.participants.map((p, i) => `<tr><td>${i + 1}</td><td class="l">${draw ? pnUnit(t, p.id) : `<input data-pn="${p.id}" value="${esc(p.name)}" style="min-width:130px">`}</td>
      <td class="l muted small">${esc(draw ? p.unit || '' : p.unit || '')}</td>
      ${t.hcMode === 'manual' ? `<td><input data-hc="${p.id}" type="number" min="0" max="5" value="${p.hc || 0}" style="width:60px"></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '';
  const isTest = store.isLocal(t.id);
  const op = k => (ls.get('pingpong:fold:' + t.id + ':' + k) ?? '') === '1' ? 'open' : (ls.get('pingpong:fold:' + t.id + ':' + k) ?? '') === '0' ? '' : null;
  const fo = (k, def) => { const v = op(k); return v === null ? (def ? 'open' : '') : v; };
  const mixer = E.isMixer(t);
  const listCard = mixer
    ? `<h3>Pemain (${t.individuals.length})</h3>${t.individuals.length ? `<div class="mlist">${t.individuals.map((x, i) => `<div class="list-item"><span class="row" style="flex-wrap:nowrap"><span class="muted small" style="width:22px">${i + 1}.</span>${pn(t, x.id)}</span><span class="muted small">${esc([x.unit, E.levelOf(t, x.name) && E.levelInfo(t, E.levelOf(t, x.name)) ? E.levelInfo(t, E.levelOf(t, x.name))[1] : ''].filter(Boolean).join(' · '))}</span></div>`).join('')}</div>
       <p class="muted small">${t.individuals.length >= 4 ? `${E.mixRoundsAuto(t.individuals.length)} pusingan (auto) · ${Math.floor(t.individuals.length / 4)} perlawanan setiap pusingan${t.individuals.length % 4 ? ` · ${t.individuals.length % 4} pemain rehat bergilir setiap pusingan` : ''}. Regu diundi bila jadual dijana di ⚙️ Tetapan.` : 'Perlu sekurang-kurangnya 4 pemain.'}</p>` : '<p class="muted">Tambah senarai pemain di bawah.</p>'}`
    : draw
    ? `<h3>${unit} (${t.participants.length})</h3>${plist || `<p class="muted">Belum diundi. ${t.individuals.length ? `${t.individuals.length} individu sedia. Tekan <b>Undi ${unit.toLowerCase()}</b> di bawah.` : 'Tambah senarai individu di bawah.'}</p>`}
       ${t.participants.length && !E.isMixer(t) ? `<button type="button" class="pill-btn small" id="playU"><span class="dot"></span>▶ Tonton undian</button>` : ''}`
    : `<h3>${unit} (${t.participants.length})</h3>${plist || '<p class="muted">Belum ada peserta. Tambah di bawah.</p>'}`;
  const P = part === 'pemain';
  $app.innerHTML = P ? `
    ${section('Peserta', `Senarai ${unit}`)}
    <div class="card" id="entries">${listCard}
      ${locked && t.participants.length ? '<div class="row" style="margin-top:10px"><button type="button" class="pill-btn light small" id="saveP">Simpan nama/handicap</button></div><p class="muted small">Senarai dikunci (jadual sudah dijana). Ejaan nama masih boleh dibetulkan.</p>' : ''}</div>

    <details class="card fold" data-fold="add" ${fo('add', !locked)}><summary>➕ Tambah / undi peserta</summary>
      ${locked ? '<p class="muted small">Dikunci. Gunakan <b>↺ Reset jadual</b> di Tetapan untuk mengubah peserta.</p>' : draw ? `
        <p class="muted small">${entryHint(t)}</p>
        <label>Senarai individu (${t.individuals.length})</label>
        <p class="muted small" style="margin:0 0 4px">Nama dalam kotak ini ialah senarai rasmi dan dikira ✅ disahkan.</p>
        <textarea id="ind">${esc(t.individuals.map(x => x.name + (x.unit ? ', ' + x.unit : '') + (E.lvScheme(t) && E.levelOf(t, x.name) && E.levelInfo(t, E.levelOf(t, x.name)) ? ` (${E.levelInfo(t, E.levelOf(t, x.name))[1]})` : x.lv ? ` (${x.lv})` : '')).join('\n'))}</textarea>
        <div class="row" style="margin-top:10px"><button type="button" class="pill-btn light" id="saveP">Simpan senarai</button>
          ${mixer ? '' : `<button type="button" class="pill-btn orange" id="undi"><span class="dot"></span>Undi ${unit.toLowerCase()}</button>`}</div>` : `
        <p class="muted small">${entryHint(t)}</p>
        <textarea id="people">${esc(t.participants.map(p => p.name + (p.unit ? ', ' + p.unit : '') + (t.hcMode === 'manual' && p.hc ? ` (${p.hc})` : '') + (E.HC_SCHEMES[t.hcMode] && !p.name.includes(' & ') && E.levelOf(t, p.name) ? ` (${E.levelInfo(t, E.levelOf(t, p.name))[1]})` : '')).join('\n'))}</textarea>
        <div class="row" style="margin-top:10px"><button type="button" class="pill-btn light" id="saveP">Simpan senarai</button></div>`}
      ${!locked && isTest ? `<div class="test-seed"><button type="button" class="pill-btn small seed" id="seed24">👥 Isi 24 peserta (UJIAN)</button>
        <span class="muted small">${t.entryMode === 'single' ? '24 pemain' : t.entryMode === 'double' ? '12 pasangan' : '24 individu sedia untuk diundi'}</span></div>` : ''}
      ${!locked && t.format !== 'ko' && !mixer ? `<details class="fold sub"><summary>Import kumpulan yang telah diundi</summary>
        <p class="muted small">Satu kumpulan setiap baris, cth. <i>A | Azim | Dora | Alex</i></p>
        <textarea id="mgt" rows="4"></textarea>
        <button type="button" class="pill-btn light small" id="impg" style="margin-top:8px">Import kumpulan</button></details>` : ''}
    </details>

`
  : `
    ${section('Tetapan', 'Tetapan Pertandingan')}
    <form id="f">
    <details class="card fold" data-fold="info" ${fo('info', false)}><summary>⚙️ Maklumat pertandingan &amp; tetapan meja</summary>
      ${settingsForm(t, locked, 'info')}

      <button class="pill-btn brand" style="margin-top:6px">Simpan tetapan</button>
    </details>

    <details class="card fold" data-fold="fmt" ${fo('fmt', !locked)}><summary>🏓 Format &amp; jana jadual</summary>
      ${settingsForm(t, locked, 'fmt')}
      <div class="row" style="margin-top:14px">
        <button class="pill-btn light">Simpan format</button>
        ${!locked ? `<button type="button" class="pill-btn brand" id="draw"><span class="dot"></span>Jana ${E.isMixer(t) ? 'pusingan & jadual' : t.format === 'ko' ? 'carta kalah mati' : 'kumpulan & jadual'}</button>` : ''}
      </div>
      <p class="muted small">${locked ? `Status: ${t.matches.length} perlawanan telah dijana.` : 'Status: jadual belum dijana.'}</p>
      <div class="row noprint" style="margin-top:6px">
        ${locked || t.participants.length ? `<button type="button" class="pill-btn light small" id="reset2">↺ Reset jadual (kekal peserta)</button>` : ''}
        <button type="button" class="pill-btn danger small" id="resetAll">Reset semua</button>
      </div>
    </details>
    </form>
    ${store.isCloud(t.id) ? `<div class="card"><div class="section-title" style="margin-top:0">PIN pengadil &amp; peserta</div>
      <p class="muted small">Kongsi dengan peserta. Skor yang dihantar perlu disahkan penganjur.</p>
      <div class="row"><input id="pin" inputmode="numeric" maxlength="8" placeholder="cth. 2468" style="max-width:160px;font-family:var(--mono);font-size:18px">
      <button class="pill-btn brand small" id="savePin">Simpan PIN</button><button class="pill-btn light small" id="genPin">Jana rawak</button></div>
      <p class="muted small" id="pinMsg"></p></div>
      <div class="card"><label class="test-chk" style="margin:0"><input type="checkbox" id="hideChk" ${isHidden(t) ? 'checked' : ''}> <span>🙈 <b>Sembunyikan dari senarai awam</b><br><small class="muted">Peserta tidak nampak di laman utama, tetapi pautan terus masih boleh dibuka.</small></span></label></div>`
      : `<div class="notice">📱 Pertandingan ini disimpan dalam peranti ini sahaja. ${cloud.isAdmin() ? '<button class="pill-btn small brand" id="upNow">☁️ Pindah ke awan</button>' : 'Log masuk sebagai admin untuk memindahkannya ke awan supaya semua orang boleh melihat dan menghantar skor.'}</div><br>`}
    ${canAdmin(t) ? `<div class="card owner-card"><div class="section-title" style="margin-top:0">👤 Rekod pentadbir</div>
      <p class="small" style="margin:0">Dicipta oleh: <b>${esc(t.createdBy ? t.createdBy.name : 'tidak direkod')}</b>${t.createdBy && t.createdBy.at ? ` · ${esc(new Date(t.createdBy.at).toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' }))}` : ''}</p>
      ${t.lastEdit ? `<p class="small" style="margin:4px 0 0">Kemas kini terakhir: <b>${esc(t.lastEdit.name)}</b> · ${esc(new Date(t.lastEdit.at).toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' }))}</p>` : ''}
      ${!t.createdBy ? '<p class="muted small" style="margin:4px 0 0">Pertandingan ini dicipta sebelum rekod pencipta wujud.</p>' : ''}</div>` : ''}
    ${extrasCard(t)}
    ${testTools(t)}
    <div class="card noprint"><button class="pill-btn danger small" id="del">Padam pertandingan</button></div>`;
  $app.querySelectorAll('details[data-fold]').forEach(d => (d.ontoggle = () => ls.set('pingpong:fold:' + t.id + ':' + d.dataset.fold, d.open ? '1' : '0')));

  const f = document.getElementById('f');
  wireExtras(t);
  const hc = document.getElementById('hideChk');
  if (hc) hc.onchange = () => { t.hidden = hc.checked; save(t); toast(hc.checked ? '🙈 Disembunyikan dari senarai awam' : '👁 Dipaparkan dalam senarai awam'); };
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
    if (E.isMixer(t)) {
      const n = t.individuals.length;
      if (n < 4) return toast('Perlu sekurang-kurangnya 4 pemain dalam senarai individu (tab 👥 Pemain).', 4000);
      const R = t.mixRounds || E.mixRoundsAuto(n);
      if (!confirm(`Jana ${R} pusingan regu bertukar untuk ${n} pemain?${n % 4 ? `\n${n % 4} pemain akan rehat secara bergilir setiap pusingan.` : ''}`)) return;
      try { E.buildMixer(t); save(t); toast(`${t.matches.length} perlawanan dalam ${R} pusingan dijana`); location.hash = `#/t/${t.id}/jadual`; } catch (err) { toast(err.message, 4000); }
      return;
    }
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
  if (mem.length > 1 && draw && !E.isMixer(t)) {
    const i = t.participants.indexOf(p) + 1, label = E.isTeam(t) ? p.name : `Regu ${i}`;
    return `<span class="mc-n" data-pid="${id}"><b>${esc(label)}</b><small>${mem.map(esc).join(' · ')}</small></span>`;
  }
  return `<span class="mc-n" data-pid="${id}"><b>${esc(E.pname(t, id))}</b>${p.unit ? `<small>${esc(p.unit)}</small>` : ''}</span>`;
}
function sideAv(t, id) {
  if (!id || id === 'BYE') return '<span class="av av-ph"></span>';
  const p = E.pobj(t, id) || {}, n = E.pname(t, id);
  if ((p.members || []).length > 1 && E.usesDraw(t) && !E.isMixer(t)) {
    const i = t.participants.indexOf(p) + 1, tag = E.isTeam(t) ? E.teamWord(t)[0] + ((n.match(/\d+/) || [i])[0]) : 'R' + i;
    return `<span class="av av-n" style="background:${avColor(n)}">${esc(tag)}</span>`;
  }
  return av(n);
}
function matchRow(t, m, no) {
  const r = E.evaluateMatch(t, m), team = E.isTeam(t);
  const has = m.rubbers.some(x => x.sets.length), done = m.status === 'done', live = !done && (m.lt || has);
  // Skor belum disahkan (Jaga skor / dihantar) → dipapar samar-samar dalam kotak
  let ghost = null, cur = null;
  if (!done && !has) {
    const x = liveOf(t, m);
    if (x) { ghost = x.rs || []; if (!liveDone(t, m, x) && x.cur && (x.cur[0] || x.cur[1])) cur = { ri: x.ri || 0, g: x.cur }; }
    else { const sub = _cur === t.id && pendingFor(t.id).filter(y => y.matchId === m.id).pop();
      if (sub && sub.rubbers) ghost = sub.rubbers.map(r => (Array.isArray(r) ? r : String(r || '').split(',').map(g => g.split('-').map(Number))).filter(g => g.length === 2 && !isNaN(g[0]) && !isNaN(g[1]))); }
  }
  const setsOf = i => (ghost ? ghost[i] || [] : (m.rubbers[i] || { sets: [] }).sets);
  const f = E.fmtFor(t, m.stage);
  // lajur: set (single/regu) atau pertemuan (trio: Single, Regu → set dimenangi)
  const cols = team
    ? m.rubbers.map((rb, i) => { const ss = setsOf(i), a = ss.filter(([x, y]) => x > y).length, b = ss.filter(([x, y]) => y > x).length;
        const c = cur && cur.ri === i && !ss.length; return { a: ss.length ? a : c ? 0 : '', b: ss.length ? b : c ? 0 : '', cur: c }; })
    : (() => { const ss = setsOf(0).map(([x, y]) => ({ a: x, b: y }));
        if (cur && cur.ri === 0) ss.push({ a: cur.g[0], b: cur.g[1], cur: true });
        return ss; })();
  const [ta, tb] = E.tieScore(t, r);
  const h = E.handicapInfo(t, m.a, m.b);
  const ctx = m.mr ? `Pusingan ${m.mr}` : m.stage !== 'group' ? E.stageLabel(t, m) : (t.format === 'rr' ? 'Liga' : `Kumpulan ${m.group}`);
  const status = done ? '<span class="mc-st ok">✓ Selesai</span>'
    : m.lt ? `<span class="mc-st on"><i class="pulse"></i>Meja ${m.lt}</span>`
    : has ? '<span class="mc-st on">Sedang dimainkan</span>'
    : `<span class="mc-st">${[m.table ? esc(m.table.replace(/ \(.*\)/, '')) : '', m.session ? esc(E.sessionTime(t, m.session)) : ''].filter(Boolean).join(' · ')}</span>`;
  const side = (id, src, mine, other, key) => {
    const win = done && m.winner && m.winner === id;
    return `<div class="mc-r ${win ? 'w' : done ? 'l' : ''}">${sideAv(t, id)}${sideName(t, id, src)}
      ${cols.map(c => `<span class="mc-g ${ghost ? 'gh' : ''} ${c.cur ? 'cur' : ''} ${!c.cur && c[key] !== '' && c[key] > c[key === 'a' ? 'b' : 'a'] ? 'gw' : ''}">${c[key]}</span>`).join('')}
      <span class="mc-t ${ghost ? 'gh' : ''}">${has || done ? mine : ghostTot(key)}</span></div>`;
  };
  const ghostTot = key => {
    if (!ghost || !ghost.some(s => s.length)) return '';
    const a = team ? cols.filter(c => !c.cur && c.a !== '' && c.a > c.b).length : cols.filter(c => !c.cur && c.a !== '' && c.a > c.b).length;
    const b = team ? cols.filter(c => !c.cur && c.b !== '' && c.b > c.a).length : cols.filter(c => !c.cur && c.b !== '' && c.b > c.a).length;
    return key === 'a' ? a : b;
  };
  const notes = [h && h.n ? `HC: ${esc(E.pname(t, h.to))} +${h.n}` : '',
    ls.get('pingpong:draft:' + m.id) && !done ? '<span class="draft">✏️ draf</span>' : '',
    ls.get('pingpong:sent:' + m.id) && !done ? '<span class="draft">⏳ menunggu pengesahan</span>' : '',
    _cur && pendingFor(_cur).some(x => x.matchId === m.id) ? '<span class="role-chip">🔔 skor dihantar</span>' : ''].filter(Boolean).join(' · ');
  return `<a class="mc ${done ? 'done' : live ? 'live' : ''}" href="#/t/${t.id}/m/${m.id}" style="--cols:28px minmax(0,1fr) ${'24px '.repeat(cols.length)}40px">
    <div class="mc-h"><span class="mc-code">${esc(no ?? (E.matchCode(m) || ''))}</span><span class="mc-ctx">${esc(ctx)}</span>${status}</div>
    ${side(m.a, m.srcA, ta, tb, 'a')}${side(m.b, m.srcB, tb, ta, 'b')}
    ${ghost ? `<div class="mc-f gh-note">${liveOf(t, m) ? (liveDone(t, m, liveOf(t, m)) ? '🏁 Tamat di Jaga skor' : '<i class="pulse"></i> Sedang dijaga skor') : ''}${liveOf(t, m) ? ' · ' : ''}skor samar = belum disahkan</div>` : ''}
    ${notes ? `<div class="mc-f">${notes}</div>` : ''}
  </a>`;
}

// ---------- Pengesahan skor ----------
const fmtRub = (t, rs) => rs.map((sets, i) => (rs.length > 1 ? E.rubberLabel(t, i) + ': ' : '') + sets.map(s => s.join('-')).join(', ')).join(' · ');
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
// Penerangan format set yang mudah difahami
function fmtText(f) {
  if (!f) return '';
  return f.full ? `<b>${f.bo} set</b> · semua ${f.bo === 2 ? 'kedua-dua' : f.bo} set dimainkan${f.bo % 2 === 0 ? ' (boleh seri)' : ''}`
    : `<b>Terbaik ${f.bo} set</b> · menang ${Math.ceil(f.bo / 2)} set dahulu`;
}
function liveLine(t, m) {
  const x = liveOf(t, m); if (!x) return '';
  const parts = m.rubbers.map((_, i) => (x.rs[i] || []).map((g, k) => `S${k + 1} ${g[0]}–${g[1]}`).join(' · ')).map((p, i) => (E.isTeam(t) && p ? `${esc(E.rubberLabel(t, i))}: ` : '') + p).filter(Boolean);
  const fin = liveDone(t, m, x);
  return `<div class="mr-live"><span class="lv-dot"></span> ${fin ? '🏁 Tamat di Jaga skor · menunggu disimpan' : 'Sedang dijaga skor'}${parts.length ? ' · ' + parts.join(' · ') : ''}${fin ? '' : ` · <b>(${x.cur[0]}–${x.cur[1]})</b>`}</div>`;
}
function viewResults(t) {
  if (store.isCloud(t.id)) cloud.watchLive(t.id);
  const playable = t.matches.filter(m => m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE' && m.status !== 'bye');
  const mxR = E.isMixer(t) ? [...new Set(t.matches.map(m => m.mr))].sort((a, b) => a - b) : [];
  const opts = [...mxR.map(r => ['mr' + r, `Pusingan ${r}`]), ...t.groups.map(g => [g.name, t.format === 'rr' ? 'Liga' : `Kumpulan ${g.name}`]),
    ...(t.rounds.ko ? [['K', 'Kalah mati']] : []), ...(t.rounds.pool ? [['L', 'Pool kalah']] : []), ['ALL', 'Semua perlawanan']];
  if (!jsel || !opts.some(o => o[0] === jsel)) jsel = mxR.length ? 'ALL' : t.stage === 'ko' ? (t.rounds.ko ? 'K' : 'ALL') : (opts[0] || ['ALL'])[0];
  const inSel = m => jsel === 'ALL' || (jsel.startsWith('mr') ? m.mr === +jsel.slice(2) : jsel === 'K' ? m.bracket === 'ko' : jsel === 'L' ? m.bracket === 'pool' : m.stage === 'group' && m.group === jsel);
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
    <div class="fmt-box">🏓 Format set: ${t.groups.length || E.isMixer(t) ? `${t.rounds.ko || t.format === 'group_ko' ? 'Kumpulan — ' : ''}${fmtText(E.fmtFor(t, 'group'))}` : ''}${t.format === 'group_ko' || t.rounds.ko ? `<br>Kalah mati — ${fmtText(E.fmtFor(t, 'ko'))}` : ''}<br><span class="muted small">Setiap set hingga 11 mata (beza 2).${E.isTeam(t) ? ' Format ini untuk setiap perlawanan dalam pertemuan pasukan.' : ''}</span></div>
    ${store.isLocal(t.id) && t.matches.length ? testBar(t) : ''}
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
  wireTestTools(t);
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
  const types = E.rubberTypes(t);
  const sKey = i => { const n = types.slice(0, i + 1).filter(x => x === 'S').length; return n === 1 ? 's' : 's' + n; };
  const rubTitle = i => t.tieFormat === 'SSD' ? (types[i] === 'D' ? 'Double' : `Single ${types.slice(0, i + 1).filter(x => x === 'S').length}`) : (i === 0 ? 'Perseorangan' : 'Regu');
  const lineupHtml = i => !team ? '' : types[i] === 'S'
    ? `<div class="lu">${sel('a' + sKey(i), A.members, L['a' + sKey(i)])} <span class="muted">lwn</span> ${sel('b' + sKey(i), B.members, L['b' + sKey(i)])}</div>`
    : `<div class="lu">${sel('ad1', A.members, L.ad1)} &amp; ${sel('ad2', A.members, L.ad2)} <span class="muted">lwn</span> ${sel('bd1', B.members, L.bd1)} &amp; ${sel('bd2', B.members, L.bd2)}</div>`;
  const hcText = (h, lu) => {
    if (!h) return '';
    if (h.pending) return '<div class="hc-r warn">Handicap dikira selepas pemain dipilih.</div>';
    if (h.missing) return '<div class="hc-r warn">⚠️ Ada pemain belum ditetapkan tahap handicap (tab 👥 ' + esc(UNIT(t)) + ').</div>';
    if (!h.n) return '<div class="hc-r">Handicap: sama (tiada mata mula)</div>';
    const who = team ? (h.to === m.a ? A.name : B.name) + (h.kind === 'D' ? ' (regu)' : '') : E.pname(t, h.to);
    return `<div class="hc-r">Handicap: <b>${esc(who)}</b> mula <b>${h.n}-0</b> setiap set${h.sa != null ? ` <span class="muted">(nilai ${h.sa} lwn ${h.sb})</span>` : ''}</div>`;
  };
  const rubberHtml = (r, i) => {
    const rows = Array.from({ length: f.bo }, (_, k) => (src[i] || [])[k] || ['', '']);
    return `<div class="rubber">${team ? `<h3>${rubTitle(i)}</h3>${lineupHtml(i)}<div id="hc${i}">${hcText(E.handicapInfo(t, m.a, m.b, i, L), L)}</div>` : ''}
      <div class="sets">${rows.map((s, k) => `<div class="set"><span class="muted small">Set ${k + 1}</span>
        <input inputmode="numeric" data-r="${i}" data-i="${k}" data-s="0" value="${s[0]}">–<input inputmode="numeric" data-r="${i}" data-i="${k}" data-s="1" value="${s[1]}"></div>`).join('')}</div></div>`;
  };
  const h = E.handicapInfo(t, m.a, m.b);
  $app.innerHTML = `
    <a href="#/t/${t.id}/${_back}" class="muted">← Kembali</a>
    <div class="eyebrow">${esc(E.matchCode(m))} · ${esc(E.stageLabel(t, m))}</div>
    <h2 class="h-big" style="font-size:24px">${esc(A.name)} <span class="muted" style="font-weight:500">lwn</span> ${esc(B.name)}</h2>
    <div class="rule"></div>
    <div class="fmt-box">🏓 ${fmtText(f)}${team ? ' <span class="muted small">(setiap perlawanan)</span>' : ''}</div>
    ${liveLine(t, m)}
    ${m.status === 'done' ? `<div class="row noprint" style="margin:-4px 0 10px"><button type="button" class="pill-btn orange small" data-rcard="${t.id}|${m.id}"><span class="dot"></span>📸 Kongsi kad keputusan</button></div>` : ''}
    <div class="card">
      <div class="muted small">${m.session ? `Sesi ${m.session} · ${E.sessionTime(t, m.session)} · ` : ''}${esc(f.label)}</div>
      ${h && !team ? hcText(h) : ''}
      <label>Meja</label><select id="tbl">${['', ...E.tablesOf(t)].map(x => `<option ${x === m.table ? 'selected' : ''} value="${esc(x)}">${esc(x || '—')}</option>`).join('')}</select>
      <label>Skor setiap game (${esc(A.name)} – ${esc(B.name)})</label>
      ${m.rubbers.map(rubberHtml).join('')}
      ${team && t.tieFormat === 'SSD' ? '<p id="dupa" class="small" style="color:#b3261e"></p><p id="dupb" class="small" style="color:#b3261e"></p>' : ''}
      <p id="summary" class="muted"></p>
      <div id="decide"></div>
      <div id="dmsg">${m.status === 'done' ? '<span class="ok-badge">✅ Disahkan penganjur</span>' : draft ? '<span class="draft">✏️ Draf skor disimpan di telefon ini</span>' : ''}</div>
      ${edit ? `<div class="btn-stack" style="margin-top:12px">
        <button class="pill-btn brand" id="save"><span class="dot"></span>Simpan markah</button>
        ${t.waEnabled && m.status !== 'done' ? `<button class="pill-btn" id="wa" style="background:#25d366"><span class="dot" style="background:#fff"></span>📲 Lapor via WhatsApp</button>` : ''}
        ${m.status !== 'done' ? `<a class="pill-btn light small" href="#/t/${t.id}/ls/${m.id}">🎯 Skor langsung (tekan mata)</a>` : ''}
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
    if (team) {
      const lu = readLineup();
      types.forEach((_, i) => { const el = document.getElementById('hc' + i); if (el) el.innerHTML = hcText(E.handicapInfo(t, m.a, m.b, i, lu), lu); });
      if (t.tieFormat === 'SSD') ['a', 'b'].forEach(k => {
        const used = ['s', 's2', 'd1', 'd2'].map(x => lu[k + x]).filter(Boolean), dup = used.filter((n, i) => used.indexOf(n) !== i);
        const el = document.getElementById('dup' + k); if (el) el.textContent = dup.length ? `⚠️ ${dup.join(', ')} dipilih lebih dari sekali (setiap ahli main sekali sahaja).` : '';
      });
    }
    const rs = clean(read());
    const r = E.evaluateMatch(t, { ...m, override, rubbers: rs.map(sets => ({ sets })) });
    const head = !team ? `Game <b>${r.sa}–${r.sb}</b>` : t.tieFormat === 'SSD' ? `Markah <b>${r.ma}–${r.mb}</b> · Set ${r.sa}-${r.sb} · Mata ${r.pa}-${r.pb}` : `Pertemuan <b>${r.ra}–${r.rb}</b> · Set ${r.sa}-${r.sb} · Mata ${r.pa}-${r.pb}`;
    const res = r.winner ? ` · Pemenang: <b>${esc(E.pname(t, r.winner))}</b>` : r.draw ? (E.usesMarks(t) ? ' · <b>Seri</b>' : ' · <b>Seri</b> (1 mata setiap pasukan)') : '';
    document.getElementById('summary').innerHTML = head + res;
    const fullTie = r.complete && !r.winner && !r.draw && r.sa === r.sb && r.pa === r.pb;
    document.getElementById('decide').innerHTML = fullTie ? `<p style="color:#b91c1c">Seri penuh (set dan mata permainan sama). Penganjur perlu menentukan pemenang:</p>
      <div class="row">${[m.a, m.b].map(id => `<button class="pill-btn small ${override === id ? 'brand' : 'light'}" data-ov="${id}">${esc(E.pname(t, id))}</button>`).join('')}</div><br>` : '';
    document.querySelectorAll('[data-ov]').forEach(b => (b.onclick = () => { override = b.dataset.ov; upd(); }));
  };
  $app.querySelectorAll('[data-lu]').forEach(x => (x.onchange = () => upd()));
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
      PUSH.send(['adm:' + t.id], '🔔 Skor menunggu pengesahan', `${E.matchCode(m)} · ${E.pname(t, m.a)} lwn ${E.pname(t, m.b)} · oleh ${by || '-'}`, `#/t/${t.id}/keputusan`, 'pend-' + t.id);
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
    window.open(waLink(text, num), '_blank');
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
  const p = E.pobj(t, id); if (!p || E.isMixer(t)) return pn(t, id);
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
function viewMixStandings(t) {
  const S = E.mixStandings(t), done = t.matches.filter(m => m.status === 'done').length;
  const nm = id => esc(E.pname(t, id)), sgn = x => (x > 0 ? '+' : '') + x;
  $app.innerHTML = `${section('Keputusan', 'Kedudukan Individu')}
    <div class="fmt-box">🔀 Regu bertukar · ${done}/${t.matches.length} perlawanan selesai<br><span class="muted small">Mata: Menang 3 · Kalah 0. Sama mata → beza set → beza mata. Tekan nama untuk lihat rekod dengan setiap pasangan.</span></div>
    <div class="card"><div class="tw"><table class="mx-st"><thead><tr><th>#</th><th class="l">Pemain</th><th>Main</th><th>M</th><th>K</th><th>±Set</th><th>±Skor</th><th>Mata</th></tr></thead><tbody>
    ${S.map((r, i) => `<tr><td>${i + 1}</td><td class="l"><details class="mx-d"><summary><b>${nm(r.id)}</b>${E.levelOf(t, E.pname(t, r.id)) && E.levelInfo(t, E.levelOf(t, E.pname(t, r.id))) ? ` <span class="muted small">${esc(E.levelInfo(t, E.levelOf(t, E.pname(t, r.id)))[1])}</span>` : ''}</summary>
      ${r.with.length ? `<div class="mx-w">${r.with.map(w => `<span class="${w.draw ? '' : w.win ? 'ok' : 'no'}">P${w.mr} · ${nm(w.mate)} · ${w.draw ? 'Seri' : w.win ? 'Menang' : 'Kalah'} ${w.s}</span>`).join('')}</div>` : '<span class="muted small">Belum bermain</span>'}</details></td>
      <td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${sgn(r.sf - r.sa)}</td><td>${sgn(r.pf - r.pa)}</td><td><b>${r.pts}</b></td></tr>`).join('')}
    </tbody></table></div></div>
    <details class="card fold"><summary>🔁 Senarai pusingan & pemain rehat</summary>${[...new Set(t.matches.map(m => m.mr))].map(r => `<div class="sess">Pusingan ${r}${(t.mixRest || {})[r] && t.mixRest[r].length ? ` · rehat: ${t.mixRest[r].map(nm).join(', ')}` : ''}</div><div class="mlist">${t.matches.filter(m => m.mr === r).map(m => matchRow(t, m)).join('')}</div>`).join('')}</details>`;
}
function viewGroups(t) {
  if (E.isMixer(t)) return viewMixStandings(t);
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
      const inner = line(m.a, E.tieScore(t, e)[0], m.srcA) + line(m.b, E.tieScore(t, e)[1], m.srcB) + meta;
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
  rules.push(!E.isTeam(t) ? 'Menang: 3 mata. Kalah: 0 mata.'
    : t.tieFormat === 'SSD' ? `Pertemuan ${E.teamWord(t).toLowerCase()}: Single 1 + Single 2 + Double, ketiga-tiga dimainkan. Setiap ahli bermain sekali sahaja (dua pemain single, dua lagi double). Setiap perlawanan: menang 3 markah, seri (1-1) 1 markah, kalah 0. Pemenang pertemuan = jumlah markah tertinggi. ${t.tieRule === 'next' ? 'Jika markah sama: beza set, kemudian jumlah mata.' : 'Jika markah sama di peringkat kumpulan: seri.'} Kedudukan kumpulan: jumlah markah, kemudian beza set, kemudian bersemuka. Kalah mati: jika markah sama, penentu beza set, kemudian jumlah mata.`
    : `Pertemuan ${E.teamWord(t).toLowerCase()}: 1 perlawanan perseorangan + 1 perlawanan regu. Menang 2-0: 3 mata. Seri 1-1: 1 mata. Kalah: 0 mata.`);
  rules.push('Jika mata sama, susunan ditentukan mengikut turutan: (1) beza menang-kalah bilangan perlawanan, (2) beza menang-kalah bilangan set, (3) keputusan bersemuka (pertemuan sesama peserta yang masih sama; jika tiga atau lebih, bilangan kemenangan sesama mereka), (4) beza menang-kalah bilangan mata permainan. Contoh: 5-2 (+3).');
  const HS = E.HC_SCHEMES[t.hcMode];
  if (t.hcMode === 'manual') rules.push('Handicap (mata mula): angka dalam kurungan ialah mata yang diberi kepada pihak lawan, maksimum 5. Mata mula = beza antara angka kedua-dua pihak. Pihak dengan angka lebih rendah mula dengan mata tersebut pada setiap game.');
  else if (HS) rules.push(`Handicap ${HS.name} (mata mula setiap game). Nilai single: ${HS.levels.map(l => `${l[1]} ${l[2]}`).join(', ')}. Single: pihak bernilai rendah mula dengan beza nilai (cth. ${HS.levels[HS.levels.length - 1][1]} lwn ${HS.levels[0][1]}: mula ${HS.levels[0][2] - HS.levels[HS.levels.length - 1][2]}-0). Nilai double: ${HS.levels.map(l => `${l[1]} ${l[3]}`).join(', ')}. Double: nilai dua ahli dijumlahkan, beza maksimum ${HS.capD} mata.`);
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
// Senarai semua individu (untuk tahap handicap)
function personsOf(t) {
  const names = E.usesDraw(t) && t.individuals.length ? t.individuals.map(x => x.name) : t.participants.flatMap(p => p.members && p.members.length ? p.members : [p.name]);
  return [...new Set(names)];
}
// Senarai penuh peserta untuk paparan awam: nama dalam senarai penganjur (✅) + pendaftaran yang belum dimasukkan (⏳/✅)
function rosterOf(t) {
  const regs = (cloud.state.regs[t.id] || []).filter(r => r.status !== 'no');
  const key = s => String(s || '').trim().toLowerCase();
  const regName = r => r.partner ? `${r.name} & ${r.partner}` : r.name;
  const base = E.usesDraw(t) ? personsOf(t) : t.participants.map(p => p.name);
  const units = Object.fromEntries([...t.individuals, ...t.participants].map(x => [key(x.name), x.unit || '']));
  const out = base.map(n => { const r = regs.find(x => key(regName(x)) === key(n) || key(x.name) === key(n)); return { name: n, partner: '', unit: r ? r.unit : units[key(n)] || '', level: r ? r.level : E.levelOf(t, n) || '', status: 'ok', uid: r ? r.uid : '' }; });
  const have = new Set(base.map(key));
  regs.forEach(r => { if (!have.has(key(regName(r))) && !have.has(key(r.name))) out.push({ ...r }); });
  return out;
}
function levelsCard(t) {
  const S = E.HC_SCHEMES[t.hcMode]; if (!S) return '';
  const P = personsOf(t); if (!P.length) return '';
  const admin = canAdmin(t), missing = P.filter(n => !E.levelOf(t, n)).length;
  const chip = c => { const L = E.levelInfo(t, c); return L ? `<span class="lv lv-${c}">${esc(L[1])}</span>` : '<span class="lv none">—</span>'; };
  return `<details class="card fold" data-fold="lv" ${missing && admin ? 'open' : ''}><summary>🎚️ Tahap handicap · ${esc(S.name)}${missing ? ` <span class="role-chip">${missing} belum</span>` : ''}</summary>
    <table class="lv-tab"><tr><th></th>${S.levels.map(l => `<th>${esc(l[1])}</th>`).join('')}</tr><tr><td>Single</td>${S.levels.map(l => `<td>${l[2]}</td>`).join('')}</tr><tr><td>Double</td>${S.levels.map(l => `<td>${l[3]}</td>`).join('')}</tr></table>
    <p class="muted small">Pihak bernilai rendah mula dengan beza nilai. Double: jumlah dua ahli, maks. ${S.capD}.</p>
    <div class="lv-list">${P.map(n => `<div class="lv-row"><span>${esc(n)}</span>${admin ? `<select data-lvn="${esc(n)}">${opt({ '': '— tahap —', ...Object.fromEntries(S.levels.map(l => [l[0], `${l[1]} (S${l[2]} · D${l[3]})`])) }, E.levelOf(t, n))}</select>` : chip(E.levelOf(t, n))}</div>`).join('')}</div></details>`;
}
// ---------- Pautan kongsi ----------
const regFull = t => !!t.regMax && rosterOf(t).length >= t.regMax;
// Pendaftaran tutup sendiri bila jadual dijana / pertandingan bermula atau tamat
const regOn = t => !!t.regOpen && t.stage === 'setup' && !(t.matches || []).length;
const regLive = t => regOn(t) && !regFull(t);
// wa.me di komputer merosakkan emoji (jadi �); guna WhatsApp Web terus
const waLink = (text, num = '') => (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? `https://wa.me/${num}?text=` : `https://web.whatsapp.com/send?${num ? 'phone=' + num + '&' : ''}text=`) + encodeURIComponent(text);
const shareUrl = t => `${location.origin}${location.pathname}#/${regLive(t) ? 'daftar/' + t.id : 't/' + t.id + '/pemain'}`;
// Mesej WhatsApp pendaftaran: butiran acara + senarai peserta bernombor + pautan daftar
const HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
function waText(t) {
  const c = clubOf(t), S = E.HC_SCHEMES[t.hcMode], f = E.SET_FORMATS[t.groupFormat];
  const at = startAt(t), d = at ? new Date(at) : null;
  const regs = rosterOf(t);
  const days = at ? Math.ceil((at - Date.now()) / 86400000) : null;
  const medal = ['🥇', '🥈', '🥉'];
  const prizes = (t.prizes || '').split('\n').map(x => x.trim()).filter(Boolean);
  const L = [];
  L.push(`🏓 *${t.name}*`);
  if (c.short) L.push(`_${c.short}_`);
  L.push('━━━━━━━━━━━━━━');
  if (d) L.push(`📅 ${HARI[d.getDay()]}, ${fmtDate(t.date)} · ${E.sessionTime(t, 1)}`);
  const venue = t.venue === 'X' ? t.venueName : E.VENUES[t.venue];
  if (venue) L.push(`📍 ${venue}`);
  L.push(`🎯 ${E.isTeam(t) ? E.teamWord(t) + (t.tieFormat === 'SSD' ? ' (S + S + D)' : ' (S + D)') : ENTRY[t.entryMode]} · ${f.label.replace(/ \(.*\)/, '')}`);
  if (t.hcMode === 'manual') L.push('⚖️ Handicap');
  else if (S) L.push(`⚖️ Handicap ${S.name}`);
  if (t.regFee) L.push(`💰 Yuran: ${t.regFee}`);
  if (prizes.length) { L.push('🏆 Hadiah:'); prizes.forEach((p, i) => L.push(`   ${medal[i] || '🏅'} ${p}`)); }
  if (t.regNote) L.push(`📝 ${t.regNote.replace(/\n+/g, '\n   ')}`);
  L.push('');
  L.push(`👥 *Peserta (${regs.length}${t.regMax ? '/' + t.regMax : ''})*`);
  if (regs.length) regs.forEach((r, i) => L.push(`${i + 1}. ${r.name}${r.partner ? ' & ' + r.partner : ''} ${r.status === 'ok' ? '✅' : '⏳'}`));
  else L.push('_Belum ada. Jadi yang pertama!_');
  if (!t.regMax && t.regMaxText) L.push(`_Had peserta: ${t.regMaxText}_`);
  if (t.regMax) L.push(regs.length < t.regMax ? `_Tinggal ${t.regMax - regs.length} tempat lagi_` : '_🔒 Tempat penuh_');
  L.push('');
  if (days != null && days > 0) L.push(`⏰ ${days === 1 ? 'Esok!' : days + ' hari lagi'}`);
  L.push(regLive(t) ? `👉 *Daftar di sini:*\n${shareUrl(t)}` : `${regOn(t) ? '🔒 *Pendaftaran ditutup (tempat penuh)*\n' : ''}🔗 ${shareUrl(t)}`);
  L.push('_✅ disahkan · ⏳ menunggu pengesahan_');
  return L.join('\n');
}
function regPosterData(t) {
  const c = clubOf(t), S = E.HC_SCHEMES[t.hcMode], f = E.SET_FORMATS[t.groupFormat];
  const at = startAt(t), d = at ? new Date(at) : null, days = at ? Math.ceil((at - Date.now()) / 86400000) : null;
  const regs = rosterOf(t), venue = t.venue === 'X' ? t.venueName : E.VENUES[t.venue];
  const live = regLive(t), full = regOn(t) && regFull(t);
  return {
    title: t.name, club: c.name || c.short, logos: c.logos,
    when: d ? `${HARI[d.getDay()]}, ${fmtDate(t.date)}` : fmtDate(t.date), time: d ? E.sessionTime(t, 1) : '', venue,
    format: `${E.isTeam(t) ? E.teamWord(t) + (t.tieFormat === 'SSD' ? ' (S + S + D)' : ' (S + D)') : ENTRY[t.entryMode]} · ${f.label.replace(/ \(.*\)/, '')}`,
    hc: t.hcMode === 'manual' ? 'Handicap' : S ? `Handicap ${S.name}` : '', fee: t.regFee || '',
    prizes: (t.prizes || '').split('\n').map(x => x.trim()).filter(Boolean), note: t.regNote || '',
    // poster dikongsi sekali sahaja: tunjuk had sahaja, bukan bilangan semasa/baki atau kiraan hari (cepat lapuk)
    slots: t.regMax ? `👥 Terhad ${t.regMax} penyertaan` : t.regMaxText ? `👥 Had: ${t.regMaxText}` : '',
    countdown: '',
    url: shareUrl(t), status: live ? '' : full ? 'TEMPAT PENUH' : 'JOM SAKSIKAN', clubShort: c.short || '',
    dateParts: d ? { day: String(d.getDate()), mon: ['JAN', 'FEB', 'MAC', 'APR', 'MEI', 'JUN', 'JUL', 'OGO', 'SEP', 'OKT', 'NOV', 'DIS'][d.getMonth()], monN: String(d.getMonth() + 1).padStart(2, '0'), year: String(d.getFullYear()), wd: HARI[d.getDay()] } : null,
  };
}
// Poster sendiri: kecilkan ke ≤1080px & mampatkan supaya muat satu dokumen Firestore (<1MB)
async function shrinkImage(file) {
  const url = URL.createObjectURL(file), im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, 1080 / im.width, 1600 / im.height), cv = document.createElement('canvas');
  cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
  cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    let d = cv.toDataURL('image/webp', q); if (!d.startsWith('data:image/webp')) d = cv.toDataURL('image/jpeg', q);
    if (d.length < 950000) return d;
  }
  throw new Error('Gambar terlalu besar');
}
const posterOf = t => (store.isCloud(t.id) ? (cloud.watchPoster(t.id), cloud.state.posters[t.id] || '') : '');
function posterAdminRow(t) {
  if (!canAdmin(t) || !store.isCloud(t.id)) return '';
  const has = !!posterOf(t);
  return `<div class="share-row"><span class="muted small">🖼️ Poster sendiri:</span>
    <label class="pill-btn light small" style="cursor:pointer">${has ? '🔄 Tukar' : '📤 Muat naik'}<input type="file" accept="image/*" id="psUp" hidden></label>
    ${has ? '<button type="button" class="pill-btn light small" id="psDel">🗑️ Buang</button>' : '<span class="muted small">(cth. reka di Canva, simpan sebagai PNG/JPG)</span>'}</div>`;
}
function wirePosterAdmin(t) {
  const up = document.getElementById('psUp'), del = document.getElementById('psDel');
  if (up) up.onchange = async () => {
    const f = up.files[0]; if (!f) return;
    toast('Memuat naik poster…', 2000);
    try { await cloud.setPoster(t.id, await shrinkImage(f)); toast('✅ Poster dipaparkan di halaman pendaftaran'); }
    catch (e) { toast('Gagal: ' + (e.code || e.message), 4000); }
  };
  if (del) del.onclick = async () => { if (!confirm('Buang poster sendiri? Poster automatik akan digunakan semula.')) return; await cloud.delPoster(t.id).catch(e => toast('Gagal: ' + (e.code || e.message))); };
}
async function showRegPoster(t, auto = false, combo = null) {
  const own = !auto && posterOf(t);
  if (own) {
    const md = document.getElementById('modal');
    md.innerHTML = `<div class="sheet"><div class="row" style="justify-content:space-between"><h3 style="margin:0">🖼️ Poster</h3><button class="pill-btn light small" id="mx">✕</button></div>
      <div class="rp-box"><img src="${own}" alt="Poster" class="rp-img">
      <div class="btn-stack" style="margin-top:10px"><button class="pill-btn orange" id="rpShare"><span class="dot"></span>📤 Kongsi poster</button>
      <button class="pill-btn light small" id="rpAuto">⚙️ Guna poster automatik (dengan kod QR)</button></div></div></div>`;
    md.hidden = false; md.onclick = e => { if (e.target === md || e.target.id === 'mx') md.hidden = true; };
    document.getElementById('rpAuto').onclick = () => showRegPoster(t, true);
    document.getElementById('rpShare').onclick = async () => {
      const blob = await (await fetch(own)).blob(), m = await import('./reg-poster.js');
      const r = await m.shareBlob(blob, `Poster-${t.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')}.${blob.type.includes('webp') ? 'webp' : 'jpg'}`, t.name);
      if (r === 'download') toast('Poster dimuat turun ke telefon');
    };
    return;
  }
  const md = document.getElementById('modal');
  md.innerHTML = `<div class="sheet"><div class="row" style="justify-content:space-between"><h3 style="margin:0">🖼️ Poster</h3><button class="pill-btn light small" id="mx">✕</button></div>
    <div class="rp-styles" id="rpBar"></div>
    <div id="rpBox" class="rp-box"><p class="muted">Menjana poster…</p></div></div>`;
  md.hidden = false; md.onclick = e => { if (e.target === md || e.target.id === 'mx') md.hidden = true; };
  try {
    const K = await import('./poster-kit.js'), m = await import('./reg-poster.js');
    const lockKey = 'pingpong:posterLock:' + t.id, locked = ls.get(lockKey);
    if (!combo) combo = locked && K.COMBOS.includes(locked) ? locked : K.COMBOS[Math.floor(Math.random() * K.COMBOS.length)];
    document.getElementById('rpBar').innerHTML = `<button type="button" class="pill-btn small orange" id="rpRand">🎲 Rawak lagi</button>
      <button type="button" class="pill-btn small ${locked === combo ? 'brand' : 'light'}" id="rpLock">${locked === combo ? '📌 Dikunci' : '📌 Kunci gaya ini'}</button>
      <span class="muted small" style="align-self:center">Gaya ${combo} · ${K.LAYOUT_NAMES[combo.slice(0, -1)]} · ${K.TREAT_NAMES[combo.slice(-1)]}</span>`;
    document.getElementById('rpRand').onclick = () => { let n; do n = K.COMBOS[Math.floor(Math.random() * K.COMBOS.length)]; while (n === combo); showRegPoster(t, true, n); };
    document.getElementById('rpLock').onclick = () => { ls.set(lockKey, locked === combo ? null : combo); showRegPoster(t, true, combo); };
    const blob = await K.withSponsors(await K.makeKitPoster(regPosterData(t), combo), sponsorsOf(t));
    const name = `Poster-${(t.name || 'pertandingan').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')}.png`;
    document.getElementById('rpBox').innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Poster" class="rp-img">
      <div class="btn-stack" style="margin-top:10px"><button class="pill-btn orange" id="rpShare"><span class="dot"></span>📤 Kongsi poster</button></div>
      <p class="muted small" style="text-align:center">Kod QR membawa terus ke halaman ${regLive(t) ? 'pendaftaran' : 'pertandingan'}. Jana semula untuk kemas kini bilangan tempat.</p>`;
    document.getElementById('rpShare').onclick = async () => { const r = await m.shareBlob(blob, name, t.name); if (r === 'download') toast('Poster dimuat turun ke telefon'); };
  } catch (e) { document.getElementById('rpBox').innerHTML = `<p>Gagal menjana poster: ${esc(e.message || String(e))}</p>`; }
}
function shareRow(t) {
  return `<div class="share-row"><span class="muted small">🔗 Kongsi:</span>
    <a class="pill-btn small" style="background:#25d366;color:#fff" target="_blank" rel="noopener" href="${waLink(waText(t))}">WhatsApp</a>
    <button type="button" class="pill-btn light small" data-share="msg">📋 Salin mesej</button>
    <button type="button" class="pill-btn light small" data-share="copy">🔗 Salin pautan</button>
    <button type="button" class="pill-btn light small" data-share="preview">👁️ Lihat mesej</button>
    <button type="button" class="pill-btn light small" data-share="poster">🖼️ Poster</button></div>${posterAdminRow(t)}`;
}
function wireShare(t) {
  wirePosterAdmin(t);
  const dp = document.getElementById('dPoster'); if (dp) dp.onclick = () => showRegPoster(t);
  $app.querySelectorAll('[data-share]').forEach(b => (b.onclick = async () => {
    const k = b.dataset.share;
    if (k === 'poster') return showRegPoster(t);
    const txt = k === 'copy' ? shareUrl(t) : waText(t);
    if (k === 'preview') {
      const md = document.getElementById('modal');
      md.innerHTML = `<div class="sheet"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Mesej WhatsApp</h3><button class="pill-btn light small" id="mx">✕</button></div>
        <div class="wa-bubble">${esc(txt).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>')}</div></div>`;
      md.hidden = false; md.onclick = e => { if (e.target === md || e.target.id === 'mx') md.hidden = true; };
      return;
    }
    try { await navigator.clipboard.writeText(txt); toast(k === 'copy' ? 'Pautan disalin' : 'Mesej disalin. Tampal dalam WhatsApp.'); } catch { prompt('Salin:', txt); }
  }));
}

// ---------- Pendaftaran sendiri ----------
// Status bayaran yuran (disimpan dalam data pertandingan; hanya penganjur nampak)
const payKey = r => String(r.partner ? `${r.name} & ${r.partner}` : r.name).trim().toLowerCase();
const isPaid = (t, r) => !!(t.paid || {})[payKey(r)];
const feeAmt = t => { const m = String(t.regFee || '').replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : 0; };
function payBar(t, rows) {
  const n = rows.filter(r => r.status !== 'no'), paid = n.filter(r => isPaid(t, r)).length, amt = feeAmt(t);
  return `<div class="pay-bar"><span>💰 Bayar: <b>${paid}/${n.length}</b>${amt ? ` · Kutipan <b>RM${(paid * amt).toFixed(amt % 1 ? 2 : 0)}</b> / RM${(n.length * amt).toFixed(amt % 1 ? 2 : 0)}` : ''}</span>
    ${paid < n.length ? '<button type="button" class="pill-btn light small" id="payCopy">📋 Salin senarai belum bayar</button>' : '<span class="muted small">Semua sudah bayar ✓</span>'}</div>`;
}
const REG_ST = { pending: ['⏳', 'Menunggu'], ok: ['✓', 'Disahkan'], no: ['✕', 'Ditolak'] };
function regCard(t) {
  if (!store.isCloud(t.id)) return '';
  cloud.watchRegistrations(t.id);
  const regs = cloud.state.regs[t.id] || [], admin = canAdmin(t), uid = cloud.myUid();
  if (!regOn(t) && !regs.length) return `<div class="card">${shareRow(t)}</div>`;
  const rows = [...rosterOf(t), ...(admin ? regs.filter(r => r.status === 'no') : [])];
  const mine = regs.find(r => r.uid === uid), ok = regs.filter(r => r.status === 'ok');
  const S = E.HC_SCHEMES[t.hcMode], lvName = c => { const L = E.levelInfo(t, c); return L ? L[1] : ''; };
  const notIn = ok.filter(r => !personsOf(t).some(n => n.toLowerCase() === r.name.toLowerCase()));
  const formHtml = r => `<div class="reg-form" id="regForm" ${mine && !r ? 'hidden' : ''}>
      <div class="grid2"><div><label>Nama paparan</label><input id="rgName" maxlength="40" value="${esc(r ? r.name : (cloud.state.user?.name || '').split(' ').slice(0, 2).join(' '))}"></div>
      <div><label>Unit / Jabatan / Kumpulan</label><input id="rgUnit" maxlength="40" value="${esc(r ? r.unit : '')}"></div></div>
      ${S ? `<label>Tahap</label><select id="rgLv">${opt({ '': '— pilih tahap —', ...Object.fromEntries(S.levels.map(l => [l[0], l[1]])) }, r ? r.level : '')}</select>` : ''}
      ${t.entryMode === 'double' ? `<label>Nama pasangan</label><input id="rgPartner" maxlength="40" value="${esc(r ? r.partner : '')}" placeholder="pasangan anda">` : ''}
      <label>Catatan (pilihan)</label><input id="rgNote" maxlength="140" value="${esc(r ? r.note : '')}">
      <div class="row" style="margin-top:10px"><button type="button" class="pill-btn orange" id="rgSave"><span class="dot"></span>${r ? 'Simpan perubahan' : 'Daftar'}</button></div></div>`;
  return `<div class="card reg-card">
    <div class="row" style="justify-content:space-between"><div class="section-title" style="margin:0">🏓 Pendaftaran</div>
      <span class="role-chip">${regLive(t) ? '🟢 Dibuka' : regOn(t) ? '🔒 Penuh' : 'Ditutup'}</span></div>
    <p class="small" style="margin:6px 0"><b>Peserta: ${rosterOf(t).length}${t.regMax ? '/' + t.regMax : ''}</b> · ${rosterOf(t).filter(r => r.status === 'ok').length} disahkan · ${regs.filter(r => r.status === 'pending').length} menunggu${t.entryMode !== 'single' && E.usesDraw(t) ? ` · ${t.entryMode === 'team' ? E.teamWord(t).toLowerCase() : 'regu'} diundi oleh penganjur` : ''}</p>
    ${t.regNote ? `<p class="muted small" style="margin:0 0 8px;white-space:pre-line">${esc(t.regNote)}</p>` : ''}
    ${t.regCond || (t.regLevels || []).length ? `<div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap">${condTags(t)}</div>` : ''}
    ${mine ? `<div class="notice small">Anda telah mendaftar sebagai <b>${esc(mine.name)}</b>${mine.level ? ` (${esc(lvName(mine.level))})` : ''} · ${REG_ST[mine.status][0]} ${REG_ST[mine.status][1]}
        ${regOn(t) ? `<a class="pill-btn light small" href="#/daftar/${t.id}">Ubah / batal</a>` : ''}</div>`
      : regOn(t) ? `<a class="pill-btn orange" href="#/daftar/${t.id}"><span class="dot"></span>📝 ${admin ? 'Buka halaman pendaftaran' : 'Daftar penyertaan'}</a>` : ''}
    ${rows.length ? `<div class="reg-list">${rows.map((r, i) => `<div class="reg-row ${r.status}"><span class="no">${i + 1}</span><span class="nm"><b>${esc(r.name)}</b>${r.partner ? ` &amp; ${esc(r.partner)}` : ''}
        <small>${[r.level ? lvName(r.level) : '', r.unit].filter(Boolean).map(esc).join(' · ')}${admin && r.note ? ` · <i>${esc(r.note)}</i>` : ''}${admin && !r.uid ? '<i>ditambah penganjur</i>' : ''}</small></span>
        <span class="st">${REG_ST[r.status][0]}</span>
        ${admin ? `<button type="button" class="pay ${isPaid(t, r) ? 'on' : ''}" data-pay="${esc(payKey(r))}" title="Status bayaran">${isPaid(t, r) ? '💰' : '○'}</button>` : ''}
        ${admin && r.uid ? `<span class="act">${r.status !== 'ok' ? `<button type="button" class="pill-btn small light" data-rok="${r.id}">✓</button>` : ''}${r.status !== 'no' ? `<button type="button" class="pill-btn small light" data-rno="${r.id}">✕</button>` : ''}<button type="button" class="pill-btn small light" data-rdel="${r.id}">🗑</button></span>` : ''}</div>`).join('')}</div>` : ''}
    ${admin && rows.length ? payBar(t, rows) : ''}
    ${admin && notIn.length ? `<button type="button" class="pill-btn brand" id="rgImport" style="margin-top:10px"><span class="dot"></span>➕ Masukkan ${notIn.length} yang disahkan ke senarai</button>` : ''}
    ${shareRow(t)}
  </div>`;
}
function wireReg(t) {
  wireShare(t);
  const $ = id => document.getElementById(id);
  if ($('rgLogin')) $('rgLogin').onclick = async () => { try { await cloud.signInGoogle(); toast('Berjaya log masuk'); render(); } catch (e) { toast('Log masuk gagal: ' + (e.code || e.message)); } };
  $app.querySelectorAll('[data-rgedit]').forEach(b => (b.onclick = () => { _rgEdit = b.dataset.rgedit; render(); setTimeout(() => { const f = $('regForm'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); }));
  if ($('rgBack')) $('rgBack').onclick = () => { _rgEdit = null; render(); };
  $app.querySelectorAll('[data-rgcancel]').forEach(b => (b.onclick = async () => { if (!confirm('Batalkan pendaftaran ini?')) return; try { await cloud.unregister(t.id, b.dataset.rgcancel); toast('Pendaftaran dibatalkan'); } catch (e) { toast('Gagal: ' + (e.code || e.message)); } }));
  if ($('rgSave')) $('rgSave').onclick = async () => {
    const name = $('rgName').value.trim();
    if (!name) return toast('Isi nama paparan');
    if ($('rgLv') && !$('rgLv').value) return toast('Pilih tahap anda');
    if ($('rgPartner') && !$('rgPartner').value.trim()) return toast('Isi nama pasangan');
    if ($('rgCond') && !$('rgCond').checked) return toast('Sila sahkan anda memenuhi syarat penyertaan');
    $('rgSave').disabled = true;
    try {
      const editId = _rgEdit && _rgEdit !== 'new' ? _rgEdit : '', isNew = !editId;
      const firstReg = !(cloud.state.regs[t.id] || []).some(r => r.uid === cloud.myUid());
      const data = { name, unit: $('rgUnit').value.trim(), level: $('rgLv') ? $('rgLv').value : '', partner: $('rgPartner') ? $('rgPartner').value.trim() : '', note: $('rgNote').value.trim() };
      await cloud.register(t.id, data, editId);
      if (firstReg || (editId && editId === cloud.myUid())) ls.set('pingpong:profile', JSON.stringify({ name: data.name, unit: data.unit, level: data.level }));
      ls.set('pingpong:myRegs', JSON.stringify([...new Set([t.id, ...myRegTids()])].slice(0, 30)));
      _rgEdit = null;
      if (isNew) PUSH.send(['adm:' + t.id], '🏓 Pendaftaran baharu', `${name} · ${t.name}`, `#/t/${t.id}/pemain`, 'reg-' + t.id);
      pushSync();
      ls.set('pingpong:regd:' + t.id, '1'); toast('✅ Pendaftaran dihantar. Menunggu pengesahan penganjur.', 3500);
    } catch (e) { $('rgSave').disabled = false; toast(e.code === 'permission-denied' ? 'Pendaftaran sudah ditutup' : 'Gagal: ' + (e.code || e.message), 4000); }
  };
  $app.querySelectorAll('[data-rok],[data-rno]').forEach(b => (b.onclick = async () => {
    const rid = b.dataset.rok || b.dataset.rno, ok = !!b.dataset.rok, rg = (cloud.state.regs[t.id] || []).find(x => x.id === rid), uid = rg ? rg.uid : rid;
    try { await cloud.setRegStatus(t.id, rid, ok ? 'ok' : 'no'); PUSH.send([`reg:${t.id}:${uid}`], ok ? '✅ Pendaftaran disahkan' : '✕ Pendaftaran ditolak', t.name, `#/daftar/${t.id}`, 'myreg-' + t.id); } catch (e) { toast('Gagal: ' + (e.code || e.message)); }
  }));
  $app.querySelectorAll('[data-pay]').forEach(b => (b.onclick = () => { t.paid = { ...(t.paid || {}) }; const k = b.dataset.pay; if (t.paid[k]) delete t.paid[k]; else t.paid[k] = 1; save(t); render(); }));
  if ($('payCopy')) $('payCopy').onclick = async () => {
    const list = rosterOf(t).filter(r => r.status !== 'no' && !isPaid(t, r)), amt = feeAmt(t);
    const txt = `💰 *Peringatan yuran · ${t.name}*\n${amt ? `Yuran: RM${amt}\n` : t.regFee ? `Yuran: ${t.regFee}\n` : ''}\nBelum bayar:\n${list.map((r, i) => `${i + 1}. ${r.partner ? r.name + ' & ' + r.partner : r.name}`).join('\n')}`;
    try { await navigator.clipboard.writeText(txt); toast('Senarai disalin. Tampal dalam WhatsApp.'); } catch { prompt('Salin:', txt); }
  };
  $app.querySelectorAll('[data-rdel]').forEach(b => (b.onclick = async () => { if (confirm('Padam pendaftaran ini?')) try { await cloud.unregister(t.id, b.dataset.rdel); } catch (e) { toast('Gagal: ' + (e.code || e.message)); } }));
  if ($('rgImport')) $('rgImport').onclick = () => {
    const regs = (cloud.state.regs[t.id] || []).filter(r => r.status === 'ok' && !personsOf(t).some(n => n.toLowerCase() === r.name.toLowerCase()));
    if (t.matches.length) return toast('Jadual sudah dijana. Gunakan ↺ Reset jadual dahulu untuk menambah peserta.', 4000);
    regs.forEach(r => {
      if (r.level) { E.setLevel(t, r.name, r.level); }
      if (E.usesDraw(t)) t.individuals.push({ id: E.uid(), name: r.name, unit: r.unit || '' });
      else if (t.entryMode === 'double') t.participants.push({ id: E.uid(), name: `${r.name} & ${r.partner}`, unit: r.unit || '', hc: 0, members: [r.name, r.partner] });
      else t.participants.push({ id: E.uid(), name: r.name, unit: r.unit || '', hc: 0, members: [r.name] });
    });
    save(t); toast(`${regs.length} peserta dimasukkan ke senarai${E.usesDraw(t) ? '. Tekan Undi bila senarai lengkap.' : ''}`, 4000); render();
  };
}
// Profil mini (disimpan di telefon ini sahaja): isi borang secara automatik
const profile = () => { try { return JSON.parse(ls.get('pingpong:profile') || '{}'); } catch { return {}; } };
const myRegTids = () => { try { return JSON.parse(ls.get('pingpong:myRegs') || '[]'); } catch { return []; } };
let _rgEdit = null;
function condTags(t) {
  const S = E.HC_SCHEMES[t.hcMode], lv = (t.regLevels || []).length && S ? S.levels.filter(l => t.regLevels.includes(l[0])).map(l => l[1]) : [];
  return `${t.regCond ? `<span class="role-chip cond">⚠️ ${esc(t.regCond)}</span>` : ''}${lv.length ? `<span class="role-chip cond">🎚️ ${esc(lv.join(', '))} sahaja</span>` : ''}`;
}
// ---------- Halaman pendaftaran berasingan: #/daftar/<id> ----------
function viewDaftar(t) {
  const c = clubOf(t), f = E.SET_FORMATS, S = E.HC_SCHEMES[t.hcMode];
  if (!store.isCloud(t.id)) { $app.innerHTML = '<div class="card"><p class="muted">Pendaftaran hanya untuk pertandingan di awan.</p></div>'; return; }
  cloud.watchRegistrations(t.id);
  const uid = cloud.myUid(), mineList = (cloud.state.regs[t.id] || []).filter(r => uid && r.uid === uid), regs = rosterOf(t), ok = regs.filter(r => r.status === 'ok');
  const mine = mineList[0] || null;
  const lvName = x => { const L = E.levelInfo(t, x); return L ? L[1] : ''; };
  if (_rgEdit && _rgEdit !== 'new' && !mineList.some(x => x.id === _rgEdit)) _rgEdit = null;
  const r = _rgEdit && _rgEdit !== 'new' ? mineList.find(x => x.id === _rgEdit) : null;
  const prof = profile(), first = !mineList.length;
  const lvOpts = S ? S.levels.filter(l => !(t.regLevels || []).length || t.regLevels.includes(l[0]) || (r && r.level === l[0])) : [];
  const form = `<div class="reg-form" id="regForm">
      ${!first && !r ? '<div class="section-title" style="margin-top:0">➕ Daftar orang lain</div>' : ''}
      <label>Nama</label><input id="rgName" maxlength="40" value="${esc(r ? r.name : first ? prof.name || '' : '')}" placeholder="nama seperti dikenali" autocomplete="${first ? 'name' : 'off'}">
      <label>Unit / Jabatan / Kumpulan (pilihan)</label><input id="rgUnit" maxlength="40" value="${esc(r ? r.unit : first ? prof.unit || '' : '')}">
      ${S ? `<label>Tahap</label><select id="rgLv">${opt({ '': '— pilih tahap —', ...Object.fromEntries(lvOpts.map(l => [l[0], l[1]])) }, r ? r.level : first ? prof.level || '' : '')}</select>` : ''}
      ${t.entryMode === 'double' ? `<label>Nama pasangan</label><input id="rgPartner" maxlength="40" value="${esc(r ? r.partner : '')}">` : ''}
      <label>Catatan (pilihan)</label><input id="rgNote" maxlength="140" value="${esc(r ? r.note : '')}" placeholder="cth. no. telefon / saiz baju">
      ${t.regCond ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="rgCond" ${r ? 'checked' : ''}> <span>Saya memenuhi syarat: <b>${esc(t.regCond)}</b></span></label>` : ''}
      <button type="button" class="pill-btn orange big" id="rgSave" style="margin-top:14px;width:100%"><span class="dot"></span>${r ? 'Simpan perubahan' : 'Daftar sekarang'}</button>
      ${_rgEdit ? '<button type="button" class="pill-btn light small" id="rgBack" style="margin-top:8px">Batal</button>' : ''}
      <p class="muted small" style="margin-bottom:0">Tiada log masuk diperlukan. Pendaftaran disimpan untuk telefon ini, jadi anda boleh mengubah atau membatalkannya dari telefon yang sama.</p></div>`;
  const info = [['📅', fmtDate(t.date)], ['⏰', t.startTime ? E.sessionTime(t, 1) : ''], ['📍', t.venue === 'X' ? t.venueName : E.VENUES[t.venue]],
    ['🏓', `${E.isTeam(t) ? E.teamWord(t) + (t.tieFormat === 'SSD' ? ' (Single + Single + Double)' : '') : ENTRY[t.entryMode]} · ${f[t.groupFormat].label}`],
    ['⚖️', t.hcMode === 'manual' ? 'Handicap' : S ? `Handicap ${S.name}` : ''], ['💰', t.regFee ? 'Yuran: ' + t.regFee : '']].filter(x => x[1]);
  const prizes = (t.prizes || '').split('\n').map(x => x.trim()).filter(Boolean);
  const active = regs.length, full = t.regMax && active >= t.regMax && !r;
  const showForm = regOn(t) && !full && (first || _rgEdit);
  const own = posterOf(t);
  $app.innerHTML = `
    ${own ? `<img src="${own}" alt="Poster ${esc(t.name)}" class="d-poster" id="dPoster">` : ''}
    <div class="card daftar-info">
      <div class="eyebrow">${esc(c.name || c.short || '')}</div>
      <div class="d-info">${info.map(([i, v]) => `<div><span>${i}</span>${esc(v)}</div>`).join('')}</div>
      ${attachLinks(t)}
      ${prizes.length ? `<div class="d-prize">${prizes.map((p, i) => `<div><span>${['🥇', '🥈', '🥉'][i] || '🏅'}</span>${esc(p)}</div>`).join('')}</div>` : ''}
      ${t.regNote ? `<p class="d-note">${esc(t.regNote)}</p>` : ''}
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><span class="role-chip">${regLive(t) ? '🟢 Pendaftaran dibuka' : regOn(t) ? '🔒 Penuh' : '🔒 Pendaftaran ditutup'}</span><span class="role-chip">${active}${t.regMax ? '/' + t.regMax : ''} peserta · ${ok.length} disahkan</span>${condTags(t)}</div>
    </div>
    <div class="card reg-card">
      <div class="section-title" style="margin-top:0">📝 ${mineList.length ? 'Pendaftaran dari telefon ini' : 'Daftar penyertaan'}</div>
      ${mineList.length ? `<div class="my-regs">${mineList.map(x => `<div class="notice small my-reg"><div><b>${esc(x.name)}</b>${x.partner ? ` &amp; ${esc(x.partner)}` : ''}${x.level ? ` <span class="muted">(${esc(lvName(x.level))})</span>` : ''}<br>${REG_ST[x.status][0]} ${x.status === 'pending' ? 'Menunggu pengesahan penganjur' : REG_ST[x.status][1]}</div>
        ${regOn(t) ? `<div class="row" style="gap:6px"><button type="button" class="pill-btn light small" data-rgedit="${x.id}">Ubah</button><button type="button" class="pill-btn light small" data-rgcancel="${x.id}">Batal</button></div>` : ''}</div>`).join('')}
        ${mineList.some(x => x.status === 'pending') ? notifBtn('🔔 Beritahu bila disahkan') : ''}</div>` : ''}
      ${showForm ? form : full && !mineList.length ? '<p class="notice">Maaf, tempat sudah penuh.</p>' : !regOn(t) && !mineList.length ? '<p class="muted">Pendaftaran telah ditutup.</p>' : ''}
      ${regOn(t) && !full && mineList.length && !_rgEdit && mineList.length < 10 ? '<button type="button" class="pill-btn light" data-rgedit="new" style="margin-top:10px">➕ Daftar orang lain (keluarga / rakan)</button>' : ''}
    </div>
    <div class="card"><div class="section-title" style="margin-top:0">👥 Peserta (${regs.length}${t.regMax ? '/' + t.regMax : ''})</div>
      ${regs.length ? `<div class="reg-list">${regs.map((x, i) => `<div class="reg-row ${x.status}"><span class="no">${i + 1}</span><span class="nm"><b>${esc(x.name)}</b>${x.partner ? ` &amp; ${esc(x.partner)}` : ''}
        <small>${[x.level ? lvName(x.level) : '', x.unit].filter(Boolean).map(esc).join(' · ')}</small></span><span class="st" title="${REG_ST[x.status][1]}">${REG_ST[x.status][0]}</span></div>`).join('')}</div>
        <p class="muted small">✓ disahkan · ⏳ menunggu pengesahan penganjur</p>` : '<p class="muted">Belum ada peserta. Jadilah yang pertama!</p>'}
      ${shareRow(t)}
    </div>
    <p class="center"><a class="muted" href="#/t/${t.id}">Lihat halaman pertandingan →</a></p>`;
  wireReg(t);
}
function viewPemain(t) {
  viewSetupCore(t, 'pemain');
  const rc = regCard(t);
  if (rc) { const h = $app.querySelector('.h-big'); h ? h.insertAdjacentHTML('afterend', rc) : $app.insertAdjacentHTML('afterbegin', rc); wireReg(t); }
  const lc = levelsCard(t);
  if (lc) {
    const ent = document.getElementById('entries');
    ent ? ent.insertAdjacentHTML('afterend', lc) : $app.insertAdjacentHTML('beforeend', lc);
    $app.querySelectorAll('[data-lvn]').forEach(sel => (sel.onchange = () => { E.setLevel(t, sel.dataset.lvn, sel.value); save(t); toast('Tahap disimpan'); }));
    const d = $app.querySelector('details[data-fold=lv]'); if (d) d.ontoggle = () => {};
  }
  $app.insertAdjacentHTML('beforeend', `<details class="card fold" style="margin-top:14px"><summary>📜 Peraturan &amp; panduan peserta</summary>${rulesHtml(t)}</details>`);
}
// Tetapan untuk bukan admin: ringkasan maklumat pertandingan + peraturan
function viewInfo(t) {
  const f = E.SET_FORMATS;
  $app.innerHTML = `${section('Tetapan', 'Maklumat Pertandingan')}
    ${(t.attachments || []).length ? `<div class="card"><div class="section-title" style="margin-top:0">📎 Lampiran</div>${attachLinks(t)}</div>` : ''}
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
// Panduan mengikut peranan: penonton, peserta, pengadil / penjaga skor, pengesah, penganjur
const ROLES = { penonton: '👀 Penonton', peserta: '🏓 Peserta', pengadil: '🎯 Pengadil', pengesah: '✅ Pengesah', penganjur: '👑 Penganjur' };
const BEZA = '<b>Beza 🎯 Jaga skor dan 📝 Keputusan:</b> 🎯 Jaga skor (tab Langsung) diguna <i>semasa</i> perlawanan, mata demi mata, dan penonton nampak skor bergerak. 📝 Keputusan diguna <i>selepas</i> perlawanan untuk mengisi skor akhir sahaja. Guna salah satu, bukan kedua-duanya.';
const GUIDE = {
  tetapan: {
    penonton: ['Maklumat pertandingan: tarikh, masa, tempat, format dan peraturan.', 'Kertas kerja atau dokumen lain ada di 📎 Lampiran (jika disediakan).'],
    peserta: ['Semak tarikh, masa, format set dan syarat penyertaan.', 'Dokumen seperti kertas kerja ada di 📎 Lampiran.'],
    pengadil: ['Semak format set (contoh Terbaik 5 set, atau 2 set kedua-dua dimainkan) dan peraturan handicap sebelum menjaga skor.'],
    pengesah: ['Maklumat pertandingan untuk rujukan. Hanya penganjur boleh mengubah tetapan.'],
    penganjur: ['<b>Maklumat &amp; meja:</b> isi tarikh, masa, tempat, bilangan meja → Simpan.', '<b>Format:</b> pilih format → <b>Jana</b> kumpulan &amp; jadual (selepas peserta lengkap).', '<b>PIN acara:</b> tetapkan dan beri kepada pengadil sahaja. Tukar PIN untuk menyekat semua penjaga skor lama.', '<b>Pendaftaran:</b> buka pendaftaran, yuran, had, syarat dan tahap dibenarkan.', '<b>Pilihan:</b> 🤝 penaja, 📎 lampiran, 🙈 sembunyi dari senarai awam.'],
  },
  pemain: {
    penonton: ['Senarai peserta dan status pendaftaran.'],
    peserta: ['Tekan <b>📝 Daftar penyertaan</b>. Tiada log masuk diperlukan.', 'Status: ⏳ menunggu · ✓ disahkan. Tekan 🔔 untuk dimaklumkan bila disahkan.', 'Boleh <b>➕ Daftar orang lain</b> (keluarga / rakan) dari telefon yang sama.'],
    pengadil: ['Kenal pasti pemain dan tahap handicap mereka.'],
    pengesah: ['Senarai peserta untuk rujukan. Pengesahan pendaftaran dibuat oleh penganjur.'],
    penganjur: ['<b>Pendaftaran:</b> ✓ sahkan / ✕ tolak / 🗑 padam setiap pendaftar.', '<b>Bayaran:</b> tekan ○ → 💰 bila sudah bayar. 📋 Salin senarai belum bayar untuk peringatan WhatsApp.', '<b>Masukkan ke senarai:</b> tekan ➕ Masukkan … yang disahkan, atau tambah nama sendiri dalam kotak.', '<b>Undi</b> regu/pasukan bila senarai lengkap. Tetapkan 🎚️ tahap handicap setiap pemain.', '<b>Kongsi:</b> WhatsApp, 🖼️ Poster (100 gaya, 🎲 rawak) atau poster sendiri.'],
  },
  langsung: {
    penonton: ['Skor terus di atas meja: <b>🔴 SET 2</b> = set semasa, <b>●</b> = set dimenangi.', 'Tidak perlu menekan apa-apa; skor bergerak sendiri.', '<b>📺 Mod TV</b> untuk skrin besar di dewan.'],
    peserta: ['Pilih nama anda di <b>👤 Saya</b>, kemudian tekan 🔔.', 'Notifikasi: 🟡 sila bersedia · 🔴 bermain sekarang · 🟣 anda pengadil, beserta nombor meja.', 'Meja tidak tetap: perlawanan diberi ke meja yang kosong dahulu.'],
    pengadil: ['Tekan <b>🎯 Jaga skor</b> pada meja anda. Jika butang tiada, tekan pautan <i>"Pengadil / penjaga skor?"</i> di bawah.', 'Masukkan <b>PIN acara</b> sekali sahaja.', 'Tekan separuh skrin pemain untuk <b>+1</b>. Set tamat sendiri pada 11 (beza 2); handicap diisi sendiri.', '<b>−1</b> tolak satu mata · <b>↶ Undur</b> batal tindakan terakhir · <b>⇄ Tukar sisi</b> bila pemain bertukar hujung meja.', 'Tamat → <b>📤 Hantar kepada penganjur</b>.', 'Satu meja satu penjaga. Jika telefon anda bermasalah, minta penganjur tekan 🔓 Lepaskan.', BEZA],
    pengesah: ['Sama seperti pengadil, tetapi keputusan yang anda simpan terus rasmi (<b>✅ Simpan keputusan</b>).', 'Nama penjaga skor dipaparkan pada setiap meja. 🔓 Lepaskan kunci jika penjaga perlu bertukar.', BEZA],
    penganjur: ['<b>▶️ Agih meja kosong</b> untuk memulakan; meja seterusnya diagih sendiri bila skor disimpan.', '<b>⏸️</b> tangguh perlawanan (contoh pemain belum sampai).', '🎯 nama penjaga dan <b>🔓 Lepaskan</b> pada setiap meja.', 'Tetapan meja di bahagian bawah; <b>📺 Mod TV</b> untuk skrin besar.', BEZA],
  },
  jadual: {
    penonton: ['Sesi dan masa ialah anggaran. Semasa pertandingan, ikut meja sebenar di tab 🟢 Langsung.', 'Ketik baris untuk buka kad perlawanan.'],
    penganjur: ['Sesi dan masa ialah anggaran.', '<b>🖨️ Kad skor bercetak</b>: sandaran jika internet atau telefon bermasalah. Kod QR pada kad membuka perlawanan untuk isi skor kemudian.'],
  },
  kumpulan: {
    penonton: ['Kedudukan: mata → beza menang-kalah → beza set → bersemuka → beza mata.', 'Baris berjalur jingga layak ke kalah mati. Ketik nama untuk melihat profil.'],
  },
  keputusan: {
    penonton: ['Senarai keputusan dan skor setiap perlawanan.'],
    peserta: ['Jika meja anda <i>tiada</i> penjaga skor: ketik perlawanan, isi skor setiap set, masukkan <b>PIN acara</b>, tekan <b>📤 Hantar skor</b>.', 'Skor menjadi rasmi selepas disahkan penganjur.', BEZA],
    pengadil: ['Cara alternatif: isi skor akhir selepas perlawanan. Jika anda sudah guna 🎯 Jaga skor, <b>tidak perlu</b> isi lagi di sini.', BEZA],
    pengesah: ['Skor <b>menunggu pengesahan</b> dipaparkan di atas: semak, kemudian ✓ Sahkan atau ✕ Tolak.', 'Anda juga boleh membetulkan skor terus pada kad perlawanan.', 'Perlawanan tamat: <b>📸 Kongsi kad keputusan</b>.'],
    penganjur: ['Skor <b>menunggu pengesahan</b> dipaparkan di atas: ✓ Sahkan atau ✕ Tolak.', 'Ketik perlawanan untuk membetulkan skor.', 'Perlawanan tamat: <b>📸 Kongsi kad keputusan</b> (🎲 gaya lain).'],
  },
  kalahmati: { penonton: ['Carta cermin terisi sebaik kedudukan kumpulan pasti, jadi kalah mati boleh bermula lebih awal.'], penganjur: ['Carta terisi sendiri. Bila tamat: 🏆 Kongsi poster juara.'] },
  pool: { penonton: ['Pool kalah untuk peserta yang tidak layak ke kalah mati utama.'] },
  laporan: { penonton: ['Tekan <b>🖨️ Cetak / Simpan PDF</b>, kemudian pilih <b>Simpan sebagai PDF</b>.'] },
};
const roleOf = t => canAdmin(t) ? 'penganjur' : canEdit(t) ? 'pengesah' : ls.get('pingpong:scorer:' + t.id) ? 'pengadil' : (ls.get(meKey(t)) || ls.get('pingpong:regd:' + t.id)) ? 'peserta' : 'penonton';
function guideCard(t, page) {
  const g = GUIDE[page]; if (!g) return;
  const open = ls.get('pingpong:guide') === '1';
  let role = ls.get('pingpong:guideRole:' + t.id) || roleOf(t); if (!ROLES[role]) role = 'penonton';
  const items = g[role] || g.penonton || [];
  const html = `<details class="card fold guide noprint" ${open ? 'open' : ''}><summary>📖 Panduan · ${ROLES[role]}</summary>
    <div class="g-roles">${Object.entries(ROLES).map(([k, v]) => `<button type="button" class="chip ${k === role ? 'on' : ''}" data-grole="${k}">${v}</button>`).join('')}</div>
    <ul class="g-list">${items.map(x => `<li>${x}</li>`).join('')}</ul>
    ${!g[role] && role !== 'penonton' ? '<p class="muted small" style="margin:4px 0 0">Tiada tindakan khas untuk peranan ini di halaman ini.</p>' : ''}</details>`;
  const old = $app.querySelector('details.guide'); if (old) old.remove();
  const h = $app.querySelector('.h-big');
  h ? h.insertAdjacentHTML('afterend', html) : $app.insertAdjacentHTML('afterbegin', html);
  const d = $app.querySelector('details.guide');
  d.ontoggle = () => ls.set('pingpong:guide', d.open ? '1' : '0');
  d.querySelectorAll('[data-grole]').forEach(b => (b.onclick = e => { e.preventDefault(); ls.set('pingpong:guideRole:' + t.id, b.dataset.grole); guideCard(t, page); }));
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

// ---------- Penaja (pilihan) & lampiran ----------
const sponsorsOf = t => (t.sponsorOn && (t.sponsors || []).length ? t.sponsors : []);
async function shrinkLogo(file) {
  const url = URL.createObjectURL(file), im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, 360 / im.width, 160 / im.height), cv = document.createElement('canvas');
  cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
  let d = cv.toDataURL('image/webp', .85); if (!d.startsWith('data:image/webp')) d = cv.toDataURL('image/png'); return d;
}
function extrasCard(t) {
  if (!canAdmin(t)) return '';
  const sp = t.sponsors || [], at = t.attachments || [];
  return `<details class="card fold" data-fold="extra" ${ls.get('pingpong:fold:' + t.id + ':extra') === '1' ? 'open' : ''}><summary>🤝 Penaja &amp; 📎 Lampiran <span class="muted small">(pilihan)</span></summary>
    <label class="test-chk" style="margin:8px 0"><input type="checkbox" id="spOn" ${t.sponsorOn ? 'checked' : ''}> <span><b>Paparkan penaja</b><br><small class="muted">Logo dipaparkan di bawah tajuk pertandingan, di Mod TV, dan di bawah poster serta kad keputusan.</small></span></label>
    ${sp.length ? `<div class="sp-list">${sp.map((x, i) => `<div class="sp-item">${x.logo ? `<img src="${x.logo}" alt="">` : ''}<span>${esc(x.name)}</span><button type="button" class="pill-btn light small" data-spdel="${i}">✕</button></div>`).join('')}</div>` : '<p class="muted small">Belum ada penaja.</p>'}
    <div class="grid2"><div><label>Nama penaja</label><input id="spName" maxlength="40" placeholder="cth. Klinik Pergigian ABC"></div>
      <div><label>Logo (pilihan)</label><input id="spLogo" type="file" accept="image/*"></div></div>
    <button type="button" class="pill-btn light small" id="spAdd" style="margin-top:8px">➕ Tambah penaja</button>
    <div class="rule" style="margin:16px 0 10px"></div>
    <div class="section-title" style="margin-top:0">📎 Lampiran</div>
    <p class="muted small" style="margin-top:0">Pautan kepada kertas kerja, peraturan, peta lokasi dan sebagainya (contoh pautan Google Drive yang dikongsi).</p>
    ${at.length ? `<div class="sp-list">${at.map((x, i) => `<div class="sp-item"><span>📎 ${esc(x.name)}</span><button type="button" class="pill-btn light small" data-atdel="${i}">✕</button></div>`).join('')}</div>` : ''}
    <div class="grid2"><div><label>Nama</label><input id="atName" maxlength="40" placeholder="cth. Kertas kerja"></div>
      <div><label>Pautan (https://…)</label><input id="atUrl" type="url" placeholder="https://drive.google.com/…"></div></div>
    <button type="button" class="pill-btn light small" id="atAdd" style="margin-top:8px">➕ Tambah lampiran</button>
  </details>`;
}
function wireExtras(t) {
  const g = id => document.getElementById(id);
  if (!g('spAdd')) return;
  g('spOn').onchange = e => { t.sponsorOn = e.target.checked; save(t); toast(t.sponsorOn ? 'Penaja dipaparkan' : 'Penaja disembunyikan'); };
  g('spAdd').onclick = async () => {
    const name = g('spName').value.trim(), f = g('spLogo').files[0];
    if (!name && !f) return toast('Isi nama atau pilih logo penaja');
    if ((t.sponsors || []).length >= 8) return toast('Maksimum 8 penaja');
    let logo = ''; try { if (f) logo = await shrinkLogo(f); } catch { return toast('Logo tidak dapat dibaca'); }
    t.sponsors = [...(t.sponsors || []), { name: name || 'Penaja', logo }]; if (t.sponsors.length === 1) t.sponsorOn = true;
    save(t); toast('Penaja ditambah'); render();
  };
  $app.querySelectorAll('[data-spdel]').forEach(b => (b.onclick = () => { t.sponsors.splice(+b.dataset.spdel, 1); save(t); render(); }));
  g('atAdd').onclick = () => {
    const name = g('atName').value.trim(), url = g('atUrl').value.trim();
    if (!name || !/^https:\/\/\S+$/i.test(url)) return toast('Isi nama dan pautan https:// yang sah');
    t.attachments = [...(t.attachments || []), { name, url }]; save(t); toast('Lampiran ditambah'); render();
  };
  $app.querySelectorAll('[data-atdel]').forEach(b => (b.onclick = () => { t.attachments.splice(+b.dataset.atdel, 1); save(t); render(); }));
}
const sponsorStrip = t => { const sp = sponsorsOf(t); return sp.length ? `<div class="sp-strip"><span>Ditaja oleh</span>${sp.map(x => x.logo ? `<img src="${x.logo}" alt="${esc(x.name)}" title="${esc(x.name)}">` : `<b>${esc(x.name)}</b>`).join('')}</div>` : ''; };
const attachLinks = t => (t.attachments || []).length ? `<div class="at-row">${t.attachments.map(x => `<a class="pill-btn light small" href="${esc(x.url)}" target="_blank" rel="noopener">📎 ${esc(x.name)}</a>`).join('')}</div>` : '';

// ---------- Kad skor bercetak (sandaran) ----------
function rubberNames(t, m, i) {
  if (!E.isTeam(t)) return [E.pname(t, m.a), E.pname(t, m.b)];
  const L = m.lineup || {}, types = E.rubberTypes(t);
  if (types[i] === 'D') return [[L.ad1, L.ad2].filter(Boolean).join(' & '), [L.bd1, L.bd2].filter(Boolean).join(' & ')];
  const n = types.slice(0, i + 1).filter(x => x === 'S').length, k = n === 1 ? 's' : 's' + n;
  return [L['a' + k] || '', L['b' + k] || ''];
}
let _kdSel = 'pending';
async function viewKadSkor(t) {
  const K = await import('./poster-kit.js');
  const ms = t.matches.filter(m => m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE' && m.status !== 'bye' && (_kdSel === 'all' || m.status !== 'done'));
  const c = clubOf(t), team = E.isTeam(t), base = `${location.origin}${location.pathname}#/t/${t.id}/m/`;
  const card = m => {
    const f = E.fmtFor(t, m.stage), cols = f.bo, h = !team ? E.handicapInfo(t, m.a, m.b) : null;
    const grid = (i) => { const [an, bn] = rubberNames(t, m, i); return `<table class="ks-grid"><tr><th></th>${Array.from({ length: cols }, (_, k) => `<th>Set ${k + 1}</th>`).join('')}</tr>
      <tr><td class="ks-n">${esc(team ? (an || E.pname(t, m.a) + ': ________________') : E.pname(t, m.a))}</td>${'<td></td>'.repeat(cols)}</tr>
      <tr><td class="ks-n">${esc(team ? (bn || E.pname(t, m.b) + ': ________________') : E.pname(t, m.b))}</td>${'<td></td>'.repeat(cols)}</tr></table>`; };
    return `<div class="ks-card">
      <div class="ks-top"><div><b>${esc(t.name)}</b><br><span>${esc(c.short || '')} · ${esc(E.matchCode(m) || '')} · ${esc(E.stageLabel(t, m))}</span></div><img src="${K.qrDataURL(base + m.id, 120)}" alt=""></div>
      <div class="ks-vs"><b>${esc(E.pname(t, m.a))}</b> <span>lwn</span> <b>${esc(E.pname(t, m.b))}</b></div>
      <div class="ks-meta">Meja: ______ &nbsp; Masa: ________ &nbsp; Format: ${esc(f.label.replace(/ \(.*\)/, ''))}${h && h.n && !h.pending && !h.missing ? ` &nbsp; Handicap: <b>${esc(E.pname(t, h.to))}</b> mula ${h.n}-0` : ''}</div>
      ${m.rubbers.map((_, i) => `${team ? `<div class="ks-rub">${esc(E.rubberLabel(t, i))}</div>` : ''}${grid(i)}`).join('')}
      <div class="ks-foot"><span>Pemenang: ______________________</span><span>Tandatangan pengadil: ______________</span></div>
    </div>`;
  };
  $app.innerHTML = `<div class="noprint"><a href="#/t/${t.id}/jadual" class="muted">← Kembali ke Jadual</a>
    <h2 class="h-big" style="font-size:22px">🖨️ Kad skor (sandaran)</h2>
    <p class="muted small">Untuk digunakan jika internet atau telefon bermasalah. Imbas kod QR pada kad untuk memasukkan skor kemudian.</p>
    <div class="row" style="gap:6px;margin-bottom:10px">${[['pending', 'Belum tamat'], ['all', 'Semua']].map(([k, v]) => `<button class="pill-btn small ${_kdSel === k ? 'brand' : 'light'}" data-kd="${k}">${v}</button>`).join('')}
      <button class="pill-btn orange small" id="kdPrint"><span class="dot"></span>Cetak (${ms.length} kad)</button></div></div>
    <div class="ks-sheet">${ms.map(card).join('') || '<p class="muted">Tiada perlawanan.</p>'}</div>`;
  $app.querySelectorAll('[data-kd]').forEach(b => (b.onclick = () => { _kdSel = b.dataset.kd; viewKadSkor(t); }));
  document.getElementById('kdPrint').onclick = () => window.print();
}

// ---------- Kad keputusan perlawanan (gambar untuk dikongsi) ----------
async function shareResultCard(t, m, treat) {
  const K = await import('./poster-kit.js'), RP = await import('./reg-poster.js'), r = E.evaluateMatch(t, m), team = E.isTeam(t), c = clubOf(t);
  const A = E.pobj(t, m.a) || {}, B = E.pobj(t, m.b) || {};
  const ssd = team && t.tieFormat === 'SSD';
  const data = {
    title: t.name, club: c.name || c.short, logos: c.logos, label: `${E.stageLabel(t, m)} · ${E.matchCode(m) || ''}`, date: fmtDate(t.date),
    A: { name: E.pname(t, m.a), sub: (A.members || []).length > 1 ? A.members.join(' · ') : '' }, B: { name: E.pname(t, m.b), sub: (B.members || []).length > 1 ? B.members.join(' · ') : '' },
    win: r.winner === m.a ? 'a' : r.winner === m.b ? 'b' : null, draw: r.draw,
    big: ssd ? [r.ma, r.mb] : team ? [r.ra, r.rb] : [r.sa, r.sb], bigLabel: ssd ? 'Markah' : team ? 'Perlawanan' : 'Set',
    rows: m.rubbers.map((rb, i) => { const [an, bn] = rubberNames(t, m, i), ev = r.rubbers[i] || {}; return { label: team ? E.rubberLabel(t, i) : 'Skor setiap set', a: team ? an : '', b: team ? bn : '', sets: rb.sets, w: team ? ev.winner : null }; }),
    url: `${location.origin}${location.pathname}#/t/${t.id}/m/${m.id}`,
  };
  const treats = 'ABCDEFGHIJ'; treat = treat || treats[Math.floor(Math.random() * 10)];
  const md = document.getElementById('modal');
  md.innerHTML = `<div class="sheet"><div class="row" style="justify-content:space-between"><h3 style="margin:0">📸 Kad keputusan</h3><button class="pill-btn light small" id="mx">✕</button></div>
    <div class="rp-styles"><button type="button" class="pill-btn small orange" id="rcRand">🎲 Gaya lain</button><span class="muted small" style="align-self:center">${esc(K.TREAT_NAMES[treat])}</span></div>
    <div class="rp-box" id="rcBox"><p class="muted">Menjana…</p></div></div>`;
  md.hidden = false; md.onclick = e => { if (e.target === md || e.target.id === 'mx') md.hidden = true; };
  document.getElementById('rcRand').onclick = () => { let n; do n = treats[Math.floor(Math.random() * 10)]; while (n === treat); shareResultCard(t, m, n); };
  const blob = await K.withSponsors(await K.makeResultCard(data, treat), sponsorsOf(t));
  document.getElementById('rcBox').innerHTML = `<img src="${URL.createObjectURL(blob)}" class="rp-img" alt="Kad keputusan"><div class="btn-stack" style="margin-top:10px"><button class="pill-btn orange" id="rcShare"><span class="dot"></span>📤 Kongsi kad</button></div>`;
  document.getElementById('rcShare').onclick = async () => { const res = await RP.shareBlob(blob, `Keputusan-${(E.matchCode(m) || m.id)}.png`, t.name); if (res === 'download') toast('Kad dimuat turun ke telefon'); };
}

// ---------- Skor langsung (setiap meja) ----------
// Penjaga skor (penganjur, pengesah, atau sesiapa dengan PIN acara) tekan separuh skrin untuk tambah mata.
// Skor disegerakkan ke awan; penonton nampak di tab Langsung dan Mod TV. Bila tamat → simpan / hantar untuk pengesahan.
const LS_STALE = 10 * 60e3, LS_FRESH = 12 * 3600e3, _lsHist = {};   // skor langsung kekal dipapar sehingga perlawanan tamat (had 12 jam)
let _lsTimer = null, _lsOnLive = null, _lsAuto = null; const _lsAutoOff = {};
function liveOf(t, m) {
  const x = ((cloud.state.live || {})[t.id] || {})[m.id];
  return x && m.status !== 'done' && Date.now() - x.at < LS_FRESH ? x : null;
}
const liveAgo = x => { const mi = Math.floor((Date.now() - x.at) / 60e3); return Date.now() - x.at > LS_STALE ? ` <span class="lv-ago">· ⏸️ ${mi < 60 ? mi + ' min' : Math.floor(mi / 60) + ' jam'} lalu</span>` : ''; };
function liveBadge(t, m, cls = 'lv-sc') {
  const x = liveOf(t, m); if (!x) return '';
  const g = x.rs[x.ri] || [], wa = g.filter(s => s[0] > s[1]).length, wb = g.filter(s => s[1] > s[0]).length;
  const who = '';
  return `<div class="${cls}"><span class="lv-dot"></span><span class="lv-l">LANGSUNG${E.isTeam(t) ? ' · ' + esc(E.rubberLabel(t, x.ri)) : ''}</span><span class="lv-g">Set ${wa}–${wb}</span><b>${x.cur[0]}–${x.cur[1]}</b>${who}</div>`;
}
// Nama di atas meja + skor langsung (jika ada) terus pada setiap sisi meja
function courtSide(t, m, k, x) {
  const id = k ? m.b : m.a;
  if (!x) return `<div>${esc(E.pname(t, id))}</div>`;
  const won = (x.rs[x.ri] || []).filter(s => (k ? s[1] > s[0] : s[0] > s[1])).length, fin = liveDone(t, m, x);
  if (fin) { // semua set tamat tetapi belum disimpan: papar jumlah set (atau markah pasukan) sebagai skor besar
    const r = E.evaluateMatch(t, { ...m, rubbers: x.rs.map(sets => ({ sets })) }), big = E.isTeam(t) ? (t.tieFormat === 'SSD' ? [r.ma, r.mb] : [r.ra, r.rb]) : [r.sa, r.sb];
    const win = r.winner === (k ? m.b : m.a);
    return `<div class="cs"><span class="cs-nm">${esc(E.pname(t, id))}</span><span class="cs-pt">${big[k]}</span><span class="cs-sets">${win ? '🏆 <small>MENANG</small>' : '&nbsp;'}</span></div>`;
  }
  return `<div class="cs"><span class="cs-nm">${esc(E.pname(t, id))}</span><span class="cs-pt">${x.cur[k]}</span><span class="cs-sets" title="Set dimenangi">${won ? '●'.repeat(won) + ` <small>${won} set</small>` : '&nbsp;'}</span></div>`;
}
// "SET 2 · 1–0": set yang sedang dimainkan + set dimenangi setiap pihak
// Semua perlawanan/set dalam pertemuan sudah tamat (skor langsung belum disimpan)
const liveDone = (t, m, x) => !!(m && m.rubbers.length && m.rubbers.every((_, i) => lsRubberDone(t, m, x.rs[i] || [])));
function setTag(t, x, m) {
  if (liveDone(t, m, x)) return `🏁 TAMAT · ${E.isTeam(t) ? 'markah' : 'set'} · menunggu disimpan`;
  const g = x.rs[x.ri] || [];
  return `${E.isTeam(t) ? esc(E.rubberLabel(t, x.ri)) + ' · ' : ''}SET ${g.length + 1}`;
}
const scoreMode = t => canEdit(t) || !!ls.get('pingpong:scorer:' + t.id) || ls.get('pingpong:scoremode:' + t.id) === '1';
// Maklum balas tekan: kilat pada sisi + bunyi "tik" pendek (Web Audio ikut volum media, bukan mod senyap)
let _ac = null;
function tick(kind) {
  if (ls.get('pingpong:lsSound') === '0') return;
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    const o = _ac.createOscillator(), g = _ac.createGain(), t0 = _ac.currentTime;
    o.type = 'square'; o.frequency.value = kind === 'down' ? 330 : kind === 'set' ? 990 : 660;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'set' ? 0.35 : 0.08));
    o.connect(g).connect(_ac.destination); o.start(t0); o.stop(t0 + 0.4);
  } catch {}
}
// Getaran: pelayar hanya boleh tetapkan tempoh (bukan kekuatan); tempoh pendek terasa lebih lembut
const VIB = { soft: ['🫧 Lembut', 30], strong: ['📳 Kuat', 90], off: ['📴 Tutup', 0] };
const vibMode = () => (VIB[ls.get('pingpong:lsVib')] ? ls.get('pingpong:lsVib') : 'soft');
function buzz(n = 1) {
  const ms = VIB[vibMode()][1]; if (!ms) return;
  try { navigator.vibrate && navigator.vibrate(n > 1 ? [ms, 70, ms] : ms); } catch {}
}
const gameOver = (a, b) => (a >= 11 || b >= 11) && Math.abs(a - b) >= 2;
function lsStart(t, m, ri) {
  const h = E.handicapInfo(t, m.a, m.b, ri, m.lineup || null);
  return h && h.n && !h.pending && !h.missing ? (h.to === m.a ? [h.n, 0] : [0, h.n]) : [0, 0];
}
function lsRubberDone(t, m, sets) {
  const f = E.fmtFor(t, m.stage), need = f.full ? f.bo : Math.ceil(f.bo / 2);
  if (f.full) return sets.length >= f.bo;
  return sets.filter(s => s[0] > s[1]).length >= need || sets.filter(s => s[1] > s[0]).length >= need;
}
function viewLiveScore(t, mid) {
  const m = t.matches.find(x => x.id === mid);
  if (!m || !m.a || !m.b || m.a === 'BYE' || m.b === 'BYE') { location.hash = `#/t/${t.id}/langsung`; return; }
  const key = 'pingpong:ls:' + m.id, cloudOn = store.isCloud(t.id), edit = canEdit(t);
  const authed = edit || !cloudOn || ls.get('pingpong:scorer:' + t.id) === ls.get('pingpong:pin:' + t.id) && !!ls.get('pingpong:pin:' + t.id);
  if (cloudOn) cloud.watchLive(t.id);
  const A = E.pname(t, m.a), B = E.pname(t, m.b), nR = m.rubbers.length;
  const back = `<a href="#/t/${t.id}/langsung" class="muted">← Kembali ke Langsung</a>`;
  const eyebrow = `<div class="eyebrow">${m.lt || m.table ? 'MEJA ' + esc(m.lt || m.table) + ' · ' : ''}${esc(E.matchCode(m) || '')} · ${esc(E.stageLabel(t, m))}</div>`;
  if (m.status === 'done') { $app.innerHTML = `${back}${eyebrow}<div class="card"><p>✅ Perlawanan ini sudah tamat dan disahkan.</p><a class="pill-btn light small" href="#/t/${t.id}/m/${m.id}">Lihat skor</a></div>`; return; }
  if (!authed) {
    $app.innerHTML = `${back}${eyebrow}<h2 class="h-big" style="font-size:22px">${esc(A)} <span class="muted">lwn</span> ${esc(B)}</h2>
      <div class="card"><div class="section-title" style="margin-top:0">🎯 Jadi penjaga skor</div>
      <p class="muted small">Masukkan PIN acara dari penganjur. Skor yang anda tekan akan dipaparkan secara langsung kepada semua.</p>
      <div class="grid2"><div><label>Nama anda</label><input id="lsBy" value="${esc(ls.get('pingpong:myname') || '')}" placeholder="cth. Hatta"></div>
      <div><label>PIN acara</label><input id="lsPin" inputmode="numeric" value="${esc(ls.get('pingpong:pin:' + t.id) || '')}" style="font-family:var(--mono)"></div></div>
      <div class="btn-stack" style="margin-top:12px"><button class="pill-btn orange" id="lsGo"><span class="dot"></span>Mula</button></div></div>`;
    document.getElementById('lsBy').oninput = e => ls.set('pingpong:myname', e.target.value.trim());
    document.getElementById('lsGo').onclick = async e => {
      const pin = document.getElementById('lsPin').value.trim(), by = document.getElementById('lsBy').value.trim();
      if (!pin) return toast('Masukkan PIN acara');
      e.target.disabled = true;
      try {
        await cloud.claimScorer(t.id, pin);
        ls.set('pingpong:pin:' + t.id, pin); ls.set('pingpong:scorer:' + t.id, pin); ls.set('pingpong:myname', by);
        viewLiveScore(t, mid);
      } catch (err) { e.target.disabled = false; toast(err.code === 'permission-denied' ? 'PIN salah. Semak dengan penganjur.' : 'Gagal: ' + (err.code || err.message), 4000); }
    };
    return;
  }
  _lsOnLive = null;
  const remote = cloudOn ? liveOf(t, m) : null, other = remote && remote.uid !== cloud.myUid();
  if (other && !edit) {
    // Dikunci oleh penjaga lain: telefon ini hanya menonton
    const sets = remote.rs[remote.ri] || [], wa = sets.filter(g => g[0] > g[1]).length, wb = sets.filter(g => g[1] > g[0]).length;
    $app.innerHTML = `${back}${eyebrow}
      <div class="notice">🔒 Perlawanan ini sedang dijaga oleh <b>${esc(remote.by || 'penjaga lain')}</b>. Anda boleh menonton sahaja.<br><small>Jika perlu ambil alih (contoh bateri habis), minta penganjur tekan 🔓 Lepaskan di tab Langsung. Kunci juga terlepas sendiri selepas 10 minit tiada kemas kini.</small></div>
      <div class="sb${remote.sw ? ' sw' : ''}">${[[A, 0, wa], [B, 1, wb]].map(([nm, k, g]) => `<div class="sb-side s${k}" style="min-height:30vh"><div class="sb-nm">${esc(nm)}</div><div class="sb-pt">${remote.cur[k]}</div><div class="sb-g">Set menang <b>${g}</b></div></div>`).join('')}</div>`;
    _lsOnLive = () => viewLiveScore(load(t.id) || t, mid);
    return;
  }
  // keadaan: dari telefon ini → dari awan (ambil alih) → dari skor sedia ada
  let S = null; try { S = JSON.parse(ls.get(key) || 'null'); } catch {}
  let takeNote = other && edit ? `<div class="notice">🎯 Sedang dijaga oleh <b>${esc(remote.by || 'penjaga lain')}</b>. Jika anda tekan mata di sini, anda mengambil alih.</div>` : '';
  if (other && edit) S = null;
  if (!S && remote) S = { ri: remote.ri, rs: remote.rs.map(r => r.map(g => [...g])), cur: [...remote.cur], swap: !!remote.sw };
  if (!S) { const rs = m.rubbers.map(r => r.sets.map(g => [...g])); let ri = rs.findIndex(s => !lsRubberDone(t, m, s)); if (ri < 0) ri = nR - 1; S = { ri, rs, cur: lsStart(t, m, ri), swap: false }; }
  while (S.rs.length < nR) S.rs.push([]);
  const H = (_lsHist[m.id] = _lsHist[m.id] || []);
  const allDone = () => S.rs.every(s => lsRubberDone(t, m, s));
  const push = () => {
    takeNote = '';
    ls.set(key, JSON.stringify(S));
    if (!cloudOn) return;
    clearTimeout(_lsTimer);
    _lsTimer = setTimeout(() => cloud.setLive(t.id, m.id, { rs: S.rs, cur: S.cur, ri: S.ri, sw: !!S.swap, by: ls.get('pingpong:myname') || (edit ? 'Penganjur' : ''), tb: m.lt || m.table || '' }).catch(err => {
      if (err.code === 'permission-denied') { ls.set(key, null); toast('🔒 Perlawanan ini kini dijaga oleh orang lain', 4000); viewLiveScore(load(t.id) || t, mid); }
      else toast('Skor langsung tidak dapat dihantar: ' + (err.code || err.message), 3500);
    }), 250);
  };
  const point = (k, d) => {
    if (d > 0 && allDone()) return;
    H.push(JSON.stringify(S)); if (H.length > 200) H.shift();
    S.cur[k] = Math.max(0, S.cur[k] + d);
    if (d > 0 && gameOver(...S.cur)) {
      S.rs[S.ri].push([...S.cur]);
      const g = S.rs[S.ri].length;
      if (lsRubberDone(t, m, S.rs[S.ri])) {
        const nxt = S.rs.findIndex(s => !lsRubberDone(t, m, s));
        if (nxt >= 0) { S.ri = nxt; toast(`${E.rubberLabel(t, S.ri - 1) || ''} tamat. Seterusnya: ${E.rubberLabel(t, S.ri)}`, 3000); }
        else toast('🏁 Perlawanan tamat', 2500);
      } else toast(`Set ${g} tamat · ${S.cur[0]}–${S.cur[1]}`, 1800);
      S.cur = allDone() ? [0, 0] : lsStart(t, m, S.ri);
    }
    buzz(d > 0 ? 1 : 2);
    const setEnd = d > 0 && JSON.parse(H[H.length - 1]).rs.flat().length !== S.rs.flat().length;
    tick(d < 0 ? 'down' : setEnd ? 'set' : 'up');
    push(); draw();
    const el = $app.querySelector(`.sb-side.s${k}`); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  };
  if ('wakeLock' in navigator && !window._lsWake) navigator.wakeLock.request('screen').then(w => { window._lsWake = w; w.addEventListener('release', () => (window._lsWake = null)); }).catch(() => {});
  const draw = () => {
    const sets = S.rs[S.ri] || [], wa = sets.filter(s => s[0] > s[1]).length, wb = sets.filter(s => s[1] > s[0]).length;
    const h = E.handicapInfo(t, m.a, m.b, S.ri, m.lineup || null), done = allDone();
    const r = done ? E.evaluateMatch(t, { ...m, rubbers: S.rs.map(sets => ({ sets })) }) : null;
    const side = (k, nm) => `<button type="button" class="sb-side s${k}" data-pt="${k}" ${done ? 'disabled' : ''}>
        <div class="sb-nm">${esc(nm)}</div><div class="sb-pt">${S.cur[k]}</div><div class="sb-g">Set menang <b>${k ? wb : wa}</b></div></button>`;
    $app.innerHTML = `${back}${eyebrow}${takeNote}
      ${E.isTeam(t) ? `<div class="sb-tabs">${m.rubbers.map((_, i) => `<button type="button" class="pill-btn small ${i === S.ri ? 'brand' : 'light'}" data-ri="${i}">${esc(E.rubberLabel(t, i))}${lsRubberDone(t, m, S.rs[i]) ? ' ✓' : ''}</button>`).join('')}</div>` : ''}
      ${done ? '' : `<div class="sb-set">SET ${sets.length + 1}</div>`}
      <div class="sb${S.swap ? ' sw' : ''}">${side(0, A)}${side(1, B)}</div>
      <div class="sb-ctl"><button type="button" class="pill-btn light small" data-mn="${S.swap ? 1 : 0}">−1</button>
        <button type="button" class="pill-btn light small" id="sbUndo" ${H.length ? '' : 'disabled'}>↶ Undur</button>
        <button type="button" class="pill-btn light small" id="sbSwap">⇄ Tukar sisi</button>
        <button type="button" class="pill-btn light small" data-mn="${S.swap ? 0 : 1}">−1</button></div>
      <div class="sb-games">${S.rs.map((sets, i) => sets.length ? `<div>${E.isTeam(t) ? `<small>${esc(E.rubberLabel(t, i))}</small> ` : ''}${sets.map((g, j) => `<span class="${g[0] > g[1] ? 'wa' : 'wb'}">Set ${j + 1}: ${g[0]}–${g[1]}</span>`).join('')}</div>` : '').join('') || '<span class="muted small">Set 1 sedang dimainkan.</span>'}</div>
      ${h && h.n && !h.pending && !h.missing ? `<p class="hc-r">Handicap: <b>${esc(E.pname(t, h.to))}</b> mula ${h.n}-0 setiap set</p>` : h && (h.pending || h.missing) ? '<p class="hc-r warn">Handicap belum dapat dikira (pemain/tahap belum ditetapkan). Mula dari 0-0.</p>' : ''}
      ${done ? `<div class="card sb-end"><div class="section-title" style="margin-top:0">🏁 Perlawanan tamat</div>
        <p>${r && r.winner ? `Pemenang: <b>${esc(E.pname(t, r.winner))}</b>` : r && r.draw ? '<b>Seri</b>' : 'Keputusan perlu ditentukan penganjur'}</p>
        <button class="pill-btn ${edit ? 'brand' : 'orange'}" id="sbFin"><span class="dot"></span>${edit ? '✅ Simpan keputusan' : '📤 Hantar kepada penganjur'}</button>
        ${t.liveAuto !== false && !_lsAutoOff[m.id] ? `<p class="small" id="sbAutoTx" style="margin:8px 0 0">⏳ ${edit ? 'Disimpan' : 'Dihantar'} automatik dalam <b id="sbCd">8</b> saat… <button type="button" class="pill-btn light small" id="sbAutoNo">Tunggu, saya semak dulu</button></p>` : ''}</div>` : ''}
      <div class="row" style="margin-top:12px;gap:8px"><button type="button" class="pill-btn light small" id="sbStop">⏹️ Henti skor langsung</button><button type="button" class="pill-btn light small" id="sbSnd">${ls.get('pingpong:lsSound') === '0' ? '🔇 Bunyi: tutup' : '🔊 Bunyi: buka'}</button><button type="button" class="pill-btn light small" id="sbVib">Getaran: ${VIB[vibMode()][0]}</button></div>
      <p class="muted small">Tekan nama pemain untuk tambah 1 mata. <b>−1</b> tolak satu mata pemain itu dalam set semasa. <b>↶ Undur</b> batalkan tindakan terakhir, termasuk set yang baru tamat. Set tamat sendiri pada 11 (beza 2). Skrin tidak akan padam semasa halaman ini dibuka. Penonton nampak skor ini di tab Langsung dan Mod TV.</p>`;
    $app.querySelectorAll('[data-pt]').forEach(b => (b.onclick = () => point(+b.dataset.pt, 1)));
    $app.querySelectorAll('[data-mn]').forEach(b => (b.onclick = () => point(+b.dataset.mn, -1)));
    $app.querySelectorAll('[data-ri]').forEach(b => (b.onclick = () => { H.push(JSON.stringify(S)); S.ri = +b.dataset.ri; S.cur = lsStart(t, m, S.ri); push(); draw(); }));
    document.getElementById('sbUndo').onclick = () => { if (!H.length) return; S = JSON.parse(H.pop()); push(); draw(); };
    document.getElementById('sbSnd').onclick = () => { ls.set('pingpong:lsSound', ls.get('pingpong:lsSound') === '0' ? null : '0'); tick('up'); draw(); };
    document.getElementById('sbVib').onclick = () => { const order = ['soft', 'strong', 'off']; ls.set('pingpong:lsVib', order[(order.indexOf(vibMode()) + 1) % 3]); buzz(); draw(); };
    document.getElementById('sbSwap').onclick = () => { S.swap = !S.swap; push(); draw(); };
    document.getElementById('sbStop').onclick = async () => {
      if (!confirm('Henti skor langsung untuk perlawanan ini? Skor di telefon ini akan dipadam.')) return;
      ls.set(key, null); delete _lsHist[m.id]; clearTimeout(_lsTimer);
      if (cloudOn) await cloud.clearLive(t.id, m.id).catch(() => {});
      location.hash = `#/t/${t.id}/langsung`;
    };
    const fin = document.getElementById('sbFin');
    clearInterval(_lsAuto);
    if (fin && document.getElementById('sbCd')) {
      let n = 8; _lsAuto = setInterval(() => { const cd = document.getElementById('sbCd'); if (!cd || !document.body.contains(fin)) return clearInterval(_lsAuto); n--; cd.textContent = n; if (n <= 0) { clearInterval(_lsAuto); fin.click(); } }, 1000);
      document.getElementById('sbAutoNo').onclick = () => { clearInterval(_lsAuto); _lsAutoOff[m.id] = 1; draw(); };
    }
    if (fin) fin.onclick = async () => {
      fin.disabled = true; clearTimeout(_lsTimer);
      const rs = S.rs.map(s => s.map(g => [...g]));
      try {
        if (edit) {
          E.recordScore(t, m.id, rs, { lineup: m.lineup || null });
          E.planSchedule(t); LV.afterScore(t); save(t);
          toast(m.status === 'done' ? 'Keputusan disimpan' : 'Disimpan (penganjur perlu tentukan pemenang)', 3000);
        } else {
          const pin = ls.get('pingpong:pin:' + t.id), by = ls.get('pingpong:myname') || '';
          await cloud.submitScore(t.id, { pin, matchId: m.id, a: m.a, b: m.b, rubbers: rs, lineup: m.lineup || null, by, role: 'pengadil' });
          PUSH.send(['adm:' + t.id], '🔔 Skor menunggu pengesahan', `${E.matchCode(m)} · ${A} lwn ${B} · oleh ${by || '-'}`, `#/t/${t.id}/keputusan`, 'pend-' + t.id);
          ls.set('pingpong:sent:' + m.id, '1');
          toast('📤 Dihantar. Menunggu pengesahan penganjur.', 3500);
        }
        ls.set(key, null); delete _lsHist[m.id];
        if (cloudOn) await cloud.clearLive(t.id, m.id).catch(() => {});
        location.hash = `#/t/${t.id}/langsung`;
      } catch (err) { fin.disabled = false; toast(err.code === 'permission-denied' ? 'PIN tidak sah. Semak dengan penganjur.' : 'Gagal: ' + (err.code || err.message), 4500); }
    };
  };
  draw();
}

function viewLive(t) {
  const head = section('Langsung', 'Sedang Berlangsung');
  if (store.isCloud(t.id)) cloud.watchLive(t.id);
  if (!t.matches.length) { $app.innerHTML = head + '<div class="card"><p class="muted">Belum ada perlawanan untuk dipaparkan. Kumpulan dan jadual perlu dijana dahulu.</p></div>'; return; }
  const { live, occ, cand } = LV.liveState(t), nx = LV.nextUp(t), U = LV.umpirePlan(t), edit = canEdit(t);
  const me = ls.get(meKey(t)) || '', st = LV.myStatus(t, me);
  const playable = t.matches.filter(m => m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE' && m.status !== 'bye');
  const allDone = playable.length && playable.every(m => m.status === 'done');
  const people = (E.isMixer(t) ? t.individuals : t.participants).slice().sort((a, b) => a.name.localeCompare(b.name, 'ms'));
  let stTxt = '';
  if (me && st && STAT[st.kind]) {
    const [bg, fg, ic, tx] = STAT[st.kind], m = st.m, opp = m.px ? (m.px.slice(0, 2).includes(me) ? m.b : m.a) : m.a === me ? m.b : m.a;
    stTxt = `<div class="me-card" style="background:${bg};color:${fg}"><div class="me-big">${ic} ${tx}</div><div class="me-tb">MEJA ${st.table}</div>
      <div class="small">${st.kind === 'ump' ? vsTxt(t, m) : 'Lawan: <b>' + esc(E.pname(t, opp)) + '</b>'} · ${esc(E.stageLabel(t, m))}</div></div>`;
  } else if (me && st && st.kind === 'wait') stTxt = `<div class="me-card wait"><div class="me-big">⏳ Menunggu</div><div class="small">${st.ahead ? `${st.ahead} perlawanan lagi sebelum giliran anda` : 'Anda dalam giliran seterusnya'} · lawan <b>${esc(E.pname(t, st.m.px ? (st.m.px.slice(0, 2).includes(me) ? st.m.b : st.m.a) : st.m.a === me ? st.m.b : st.m.a))}</b></div></div>`;
  else if (me && st && st.kind === 'none') stTxt = '<div class="me-card wait"><div class="small">Tiada perlawanan menunggu untuk anda buat masa ini.</div></div>';
  else if (me && !st) stTxt = '<div class="me-card wait"><div class="small">Perlawanan belum bermula. Status anda akan dipaparkan di sini.</div></div>';
  const T = LV.tableList(t), halls = [...new Set(T.map(x => x.hall))];
  const tableCard = ({ k }) => {
    const m = occ[k], mine = m && me && (m.a === me || m.b === me || m.ump === me), u = m ? LV.umpireOf(t, m, U) : '';
    const x = m ? liveOf(t, m) : null, iUmp = m && me && u === me;
    return `<div class="tt${mine ? ' me' : ''}${m ? '' : ' free'}${x ? ' on' : ''}"><div class="tt-h"><b>MEJA ${k}</b>${m ? `<small>${x ? `<span class="lv-dot"></span> <b class="lv-set">${setTag(t, x, m)}</b>${liveAgo(x)} · ` : ''}${esc(E.matchCode(m) || '')} · ${esc(E.stageLabel(t, m))}</small>` : ''}</div>
      ${m ? `<a class="tt-top${x ? ' live' : ''}" href="#/t/${t.id}/m/${m.id}">${x && x.sw ? courtSide(t, m, 1, x) : courtSide(t, m, 0, x)}<div class="tt-net"></div>${x && x.sw ? courtSide(t, m, 0, x) : courtSide(t, m, 1, x)}</a>
        ${x && edit ? `<div class="lv-by2">🎯 Dijaga oleh <b>${esc(x.by || 'tanpa nama')}</b><button type="button" class="pill-btn small light" data-rel="${m.id}">🔓 Lepaskan</button></div>` : ''}
        ${u ? `<div class="tt-u">🟣 Pengadil: <b>${esc(E.pname(t, u))}</b></div>` : ''}
        ${scoreMode(t) || iUmp ? `<div class="row tt-act"><a class="pill-btn small ${x ? 'light' : 'orange'}" href="#/t/${t.id}/ls/${m.id}">🎯 Jaga skor</a>${edit ? `<button class="pill-btn small light" data-tgh="${m.id}" title="Tangguh">⏸️ Tangguh</button>` : ''}</div>` : ''}`
      : '<div class="tt-top tt-empty"><div>Meja kosong</div></div>'}
      ${nx[k] ? `<div class="tt-n">⏭️ Bersedia: ${vsTxt(t, nx[k])}</div>` : ''}</div>`;
  };
  const queued = cand.filter(m => !Object.values(nx).includes(m));
  $app.innerHTML = `${head}
    <div class="card me-box"><label style="margin-top:0">👤 Saya</label>
      <select id="meSel"><option value="">— pilih nama anda —</option>${people.map(p => `<option value="${p.id}" ${p.id === me ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      ${stTxt}${me ? `<div style="margin-top:8px">${notifBtn('🔔 Beritahu saya bila tiba giliran')}</div>` : ''}</div>
    <div class="row" style="justify-content:flex-end;margin-top:8px"><a class="pill-btn light small" href="#/tv/${t.id}">📺 Mod TV</a></div>
    <div class="row" style="justify-content:space-between;margin-top:14px"><div class="section-title" style="margin:0">🟢 Sedang berlangsung <span class="muted small">(${live.length}/${T.length} meja)</span></div>
      ${edit && !allDone ? '<button class="pill-btn brand small" id="agih"><span class="dot"></span>▶️ Agih meja kosong</button>' : ''}</div>
    ${canAdmin(t) ? `<div class="row tb-set"><label>🏓 Meja digunakan</label><select id="ntSel">${opt({ 0: `Auto (${E.numTablesOf({ ...t, numTables: 0 })})`, 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8' }, t.numTables)}</select>
      <select id="vnSel">${opt({ B: 'Balai B (1–4) · C (5–8)', C: 'Balai C (5–8)', X: t.venueName || 'Lain-lain' }, t.venue)}</select></div>` : ''}
    ${allDone ? `<div class="notice">✅ Semua perlawanan telah tamat. Lihat keputusan dan ranking di tab ${t.format === 'rr' ? '📊 Liga' : '⚔️ Knockout'}.</div>`
      : !live.length ? `<p class="muted small">${cand.length ? 'Belum bermula. Penganjur tekan ▶️ Agih meja kosong untuk memulakan perlawanan.' : 'Tiada perlawanan sedia untuk dimainkan buat masa ini. Menunggu keputusan perlawanan lain.'}</p>` : ''}
    ${live.length ? halls.map(h => `${halls.length > 1 || h !== 'Balai B' ? `<div class="hall">${esc(h)}</div>` : ''}<div class="ttg">${T.filter(x => x.hall === h).map(tableCard).join('')}</div>`).join('') : ''}
    ${queued.length && !allDone ? `<div class="section-title">Giliran seterusnya</div><div class="card q-list">${queued.slice(0, 10).map((m, i) => `<a class="q-row" href="#/t/${t.id}/m/${m.id}"><span class="no">${i + 1}</span><span>${vsTxt(t, m)}<br><small class="muted">${esc(E.matchCode(m) || '')} · ${esc(E.stageLabel(t, m))}${m.tg ? ' · ⏸️ ditangguh' : ''}</small></span></a>`).join('')}
      ${queued.length > 10 ? `<p class="muted small">+ ${queued.length - 10} lagi</p>` : ''}</div>` : ''}
    ${live.length && !scoreMode(t) ? '<p class="small" style="text-align:center;margin:14px 0"><a href="#" id="scoreMode">🎯 Pengadil / penjaga skor? Tekan di sini</a></p>' : ''}
    <p class="muted small">📌 Meja tidak tetap. Bila satu perlawanan tamat dan skornya disahkan, meja itu terus diagih kepada perlawanan seterusnya yang pemainnya bebas (keutamaan kepada meja asal kumpulan). Pengadil peringkat kumpulan ialah rakan sekumpulan yang tidak bermain.</p>`;
  $app.querySelectorAll('[data-rel]').forEach(b => (b.onclick = async () => {
    if (!confirm('Lepaskan kunci penjaga skor perlawanan ini? Skor langsung dipadam; telefon lain boleh mula semula.')) return;
    await cloud.clearLive(t.id, b.dataset.rel).catch(err => toast('Gagal: ' + (err.code || err.message)));
    toast('🔓 Dilepaskan');
  }));
  const smode = document.getElementById('scoreMode');
  if (smode) smode.onclick = e => { e.preventDefault(); ls.set('pingpong:scoremode:' + t.id, '1'); toast('Butang 🎯 Jaga skor dipaparkan. PIN acara diperlukan.', 3500); viewLive(t); };
  document.getElementById('meSel').onchange = e => { ls.set(meKey(t), e.target.value || null); pushSync(); viewLive(t); };
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

// ---------- 📺 Mod TV / skrin besar: slaid bertukar sendiri ----------
const _tv = { i: 0, timer: null, id: null };
function stopTV() { clearInterval(_tv.timer); _tv.timer = null; _tv.id = null; }
function tvSlides(t) {
  const S = [];
  const { live, cand } = LV.liveState(t);
  if (live.length || cand.length) S.push({ k: 'live', sec: 20 });
  for (let i = 0; i < t.groups.length; i += 2) S.push({ k: 'groups', g: t.groups.slice(i, i + 2), sec: 15 });
  if (t.rounds.ko) S.push({ k: 'ko', sec: 18 });
  if (t.rounds.pool) S.push({ k: 'pool', sec: 15 });
  if (t.stage === 'done' && t.format !== 'rr') S.push({ k: 'champ', sec: 15 });
  if (!S.length) S.push({ k: 'wait', sec: 30 });
  return S;
}
function tvSlideHtml(t, sl) {
  if (sl.k === 'live') {
    const { occ } = LV.liveState(t), nx = LV.nextUp(t), U = LV.umpirePlan(t);
    return `<h2 class="tv-h">🟢 Sedang berlangsung</h2><div class="tv-tables">${LV.tableList(t).map(({ k }) => {
      const m = occ[k], u = m ? LV.umpireOf(t, m, U) : '', x = m ? liveOf(t, m) : null;
      return `<div class="tv-tt ${m ? '' : 'free'}"><div class="tv-tno">MEJA ${k}</div>
        ${m ? `<div class="tv-court${x ? ' live' : ''}">${x && x.sw ? courtSide(t, m, 1, x) : courtSide(t, m, 0, x)}<i></i>${x && x.sw ? courtSide(t, m, 0, x) : courtSide(t, m, 1, x)}</div>
          <div class="tv-sub">${x ? `<span class="lv-dot"></span> <b class="lv-set">${setTag(t, x, m)}</b> · ` : ''}${esc(E.stageLabel(t, m))}${u ? ` · 🟣 ${esc(E.pname(t, u))}` : ''}</div>` : '<div class="tv-court empty"><div>Kosong</div></div>'}
        ${nx[k] ? `<div class="tv-next">⏭️ ${esc(E.pname(t, nx[k].a))} lwn ${esc(E.pname(t, nx[k].b))}</div>` : ''}</div>`;
    }).join('')}</div>`;
  }
  if (sl.k === 'groups') return `<h2 class="tv-h">📊 ${t.format === 'rr' ? 'Kedudukan liga' : 'Kedudukan kumpulan'}</h2><div class="tv-cols">${sl.g.map(g => `<div class="tv-card"><h3>${t.format === 'rr' ? 'Liga' : 'Kumpulan ' + esc(g.name)}</h3>${standingsTable(t, g)}</div>`).join('')}</div>`;
  if (sl.k === 'ko') return `<h2 class="tv-h">⚔️ Kalah mati</h2><div class="tv-card tv-fit"><div class="tv-scale">${bracketHtml(t, 'ko')}</div></div>`;
  if (sl.k === 'pool') return `<h2 class="tv-h">🥉 Pool kalah</h2><div class="tv-card tv-fit"><div class="tv-scale">${bracketHtml(t, 'pool')}</div></div>`;
  if (sl.k === 'champ') {
    const R = E.finalRanking(t), get = p => (R.find(x => x.place === p) || { ids: [] }).ids;
    const col = (p, cls, ic, lab) => `<div class="tv-pod ${cls}"><div class="ic">${ic}</div><div class="nm">${get(p).map(id => esc(E.pname(t, id))).join('<br>') || '—'}</div><div class="lab">${lab}</div></div>`;
    return `<h2 class="tv-h">🏆 Keputusan akhir</h2><div class="tv-podium">${col(2, 'p2', '🥈', 'Naib johan')}${col(1, 'p1', '🥇', 'Johan')}${col(3, 'p3', '🥉', 'Tempat ketiga')}</div>`;
  }
  const cd = startAt(t) > Date.now();
  return `<div class="tv-wait"><div class="big">${cd ? `Bermula dalam <b id="cdown">${cdText(t)}</b>` : 'Pertandingan akan bermula sebentar lagi'}</div></div>`;
}
function tvLiveRefresh() {
  const t = _tv.id && load(_tv.id), body = document.getElementById('tvBody'); if (!t || !body) return;
  const S = tvSlides(t), sl = S[_tv.i % S.length];
  if (sl && sl.k === 'live') body.innerHTML = tvSlideHtml(t, sl);
}
function viewTV(t) {
  document.body.classList.add('tv');
  if (store.isCloud(t.id)) cloud.watchLive(t.id);
  const c = clubOf(t), S = tvSlides(t);
  if (_tv.id !== t.id) { stopTV(); _tv.id = t.id; _tv.i = 0; }
  const sl = S[_tv.i % S.length];
  const play = t.matches.filter(m => m.status !== 'bye' && m.a !== 'BYE' && m.b !== 'BYE'), done = play.filter(m => m.status === 'done').length;
  $app.innerHTML = `<div class="tv-wrap">
    <div class="tv-top">${c.logos.map(x => `<img src="${esc(x)}" alt="">`).join('')}<div class="tv-title"><b>${esc(t.name)}</b><span>${esc(c.short || '')}${t.date ? ' · ' + esc(fmtDate(t.date)) : ''}</span></div>
      <div class="tv-stat"><small>Perlawanan</small><b>${done}<em>/${play.length}</em></b></div><div class="tv-clock" id="tvClock"></div></div>
    <div class="tv-body" id="tvBody">${tvSlideHtml(t, sl)}</div>
    <div class="tv-foot">${sponsorStrip(t)}<span class="tv-dots">${S.map((_, i) => `<i class="${i === _tv.i % S.length ? 'on' : ''}"></i>`).join('')}</span>
      <span class="tv-ctl"><button id="tvPrev">◀</button><button id="tvNext">▶</button><button id="tvFs">⛶ Skrin penuh</button><a href="#/t/${t.id}/langsung">✕ Keluar</a></span></div></div>`;
  const fit = $app.querySelector('.tv-fit');
  if (fit) { const inner = fit.querySelector('.tv-scale'); if (inner) { const sc = Math.min(1.6, (fit.clientWidth - 30) / inner.scrollWidth, (fit.clientHeight - 30) / inner.scrollHeight); inner.style.transform = `scale(${sc})`; inner.style.transformOrigin = 'top center'; } }
  const clock = () => { const el = document.getElementById('tvClock'); if (el) el.textContent = new Date().toLocaleTimeString('ms-MY', { hour: 'numeric', minute: '2-digit' }); };
  clock();
  const go = d => { _tv.i = (_tv.i + d + S.length) % S.length; viewTV(load(t.id) || t); };
  document.getElementById('tvPrev').onclick = () => go(-1);
  document.getElementById('tvNext').onclick = () => go(1);
  document.getElementById('tvFs').onclick = () => { const el = document.documentElement; (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen && el.requestFullscreen()).catch?.(() => {}); };
  clearInterval(_tv.timer);
  let left = sl.sec;
  _tv.timer = setInterval(() => {
    clock(); const cd = document.getElementById('cdown'); if (cd) cd.innerHTML = cdText(t);
    if (--left <= 0) go(1);
  }, 1000);
}
document.addEventListener('keydown', e => { if (!document.body.classList.contains('tv')) return; if (e.key === 'ArrowRight') document.getElementById('tvNext')?.click(); if (e.key === 'ArrowLeft') document.getElementById('tvPrev')?.click(); });

// ---------- Jadual (ringkas, ikut portal) ----------
let jdSel = null, jdSes = '';
function viewJadual(t) {
  const head = section('Jadual', 'Jadual Perlawanan') + (canEdit(t) && t.matches.length ? `<div class="row noprint" style="margin:-4px 0 10px"><a class="pill-btn light small" href="#/t/${t.id}/kadskor">🖨️ Kad skor bercetak (sandaran)</a></div>` : '');
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
    <div class="card tw" style="padding:6px"><table class="jd"><thead><tr><th>Game</th><th>Sesi</th><th>Masa</th><th>Meja</th><th class="l">${UNIT(t)}</th><th class="l">Pengadil</th>${t.handicap && !E.isTeam(t) ? '<th>HC</th>' : ''}<th>Skor</th></tr></thead><tbody>
    ${rows.map(m => { const r = E.evaluateMatch(t, m), u = LV.umpireOf(t, m, U), h = t.handicap && m.a && m.b ? E.handicapInfo(t, m.a, m.b) : null;
      return `<tr class="${m.lt && m.status !== 'done' ? 'onlive' : ''}" data-go="${m.a && m.b ? m.id : ''}"><td>${esc(E.matchCode(m) || '')}</td><td>${m.session || '-'}</td><td>${m.session ? esc(E.sessionTime(t, m.session)) : '-'}</td><td>${tno(m) || '-'}${m.lt && m.status !== 'done' ? ' 🟢' : ''}</td>
        <td class="l">${m.a ? esc(E.pname(t, m.a)) : `<i class="muted">${esc(E.placeholderLabel(m.srcA) || 'Menunggu')}</i>`} <small class="muted">lwn</small> ${m.b ? esc(E.pname(t, m.b)) : `<i class="muted">${esc(E.placeholderLabel(m.srcB) || 'Menunggu')}</i>`}</td>
        <td class="l">${u ? esc(E.pname(t, u)) : '-'}</td>${t.handicap && !E.isTeam(t) ? `<td>${h && h.n ? esc(E.pname(t, h.to)).split(' ')[0] + ' +' + h.n : '-'}</td>` : ''}
        <td>${m.status === 'done' ? E.tieScore(t, r).join('-') + ' ✅' : '-'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="muted small">Sesi dan meja ialah anggaran. Semasa pertandingan, ikut tab 🟢 Langsung untuk meja sebenar.</p>`;
  document.getElementById('jdSel').onchange = e => { jdSel = e.target.value; viewJadual(t); };
  document.getElementById('jdSes').onchange = e => { jdSes = e.target.value; viewJadual(t); };
  $app.querySelectorAll('tr[data-go]').forEach(tr => tr.dataset.go && (tr.onclick = () => (location.hash = `#/t/${t.id}/m/${tr.dataset.go}`)));
}

// ---------- Knockout + ranking ----------
function posterOpts(t) {
  const c = clubOf(t), R = E.finalRanking(t), lab = { 1: 'Johan', 2: 'Naib johan', 3: 'Tempat ketiga' };
  const person = id => { const p = E.pobj(t, id) || {}; const mem = p.members || []; return { name: E.pname(t, id), sub: mem.length > 1 && E.usesDraw(t) ? mem.join(' · ') : '' }; };
  return { title: t.name, club: c.name || c.short, date: fmtDate(t.date), logos: c.logos,
    places: [1, 2, 3].map(pl => ({ place: pl, label: lab[pl], people: (R.find(x => x.place === pl) || { ids: [] }).ids.map(person) })).filter(p => p.people.length) };
}
function wirePoster(t) {
  const b = document.getElementById('posterBtn');
  if (b) b.onclick = async () => {
    b.disabled = true;
    try { const m = await import('./poster.js'); const r = await m.sharePoster(posterOpts(t)); if (r === 'download') toast('Poster dimuat turun ke telefon'); }
    catch (e) { toast('Gagal: ' + (e.message || e)); }
    b.disabled = false;
  };
}
function viewKnockout(t) {
  viewBrackets(t);
  if (t.stage === 'done') { $app.insertAdjacentHTML('beforeend', `<div class="row" style="margin:12px 0"><button class="pill-btn orange" id="posterBtn"><span class="dot"></span>🏆 Kongsi poster juara</button></div>` + rankingHtml(t)); wirePoster(t); }
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
const gamesTxt = (m, t) => m.rubbers.map((r, i) => (m.rubbers.length > 1 ? (t ? E.rubberLabel(t, i) : i ? 'R' : 'P') + ': ' : '') + r.sets.map(s => s.join('-')).join(', ')).join(' · ');
function viewReport(t) {
  const c = clubOf(t), f = E.SET_FORMATS;
  const played = t.matches.filter(m => m.status === 'done' && m.a !== 'BYE' && m.b !== 'BYE');
  const resRow = m => { const r = E.evaluateMatch(t, m), team = E.isTeam(t);
    return `<tr><td>${esc(E.matchCode(m) || '')}</td><td class="l">${m.winner === m.a ? '<b>' + esc(E.pname(t, m.a)) + '</b>' : esc(E.pname(t, m.a))}</td><td><b>${E.tieScore(t, r).join('-')}</b></td><td class="l">${m.winner === m.b ? '<b>' + esc(E.pname(t, m.b)) + '</b>' : esc(E.pname(t, m.b))}</td><td class="l small">${esc(gamesTxt(m, t))}</td></tr>`; };
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
// Bar ringkas alat ujian di atas tab Keputusan
function testBar(t) {
  const ready = t.matches.filter(m => m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE' && m.status !== 'done' && m.status !== 'bye').length;
  return `<div class="card test-card test-bar noprint"><b>🧪 Ujian</b>
    <button class="pill-btn orange small" id="tOne" ${ready ? '' : 'disabled'}><span class="dot"></span>🎲 Isi 1</button>
    <button class="pill-btn light small" id="tAll" ${ready ? '' : 'disabled'}>🎲 Isi semua (${ready})</button></div>`;
}
function testTools(t) {
  if (store.isCloud(t.id)) return `<div class="card soft"><div class="section-title" style="margin-top:0">🧪 Ujian</div>
    <p class="muted small">Salinan di telefon ini sahaja; pertandingan sebenar tidak terjejas.</p>
    <button class="pill-btn light small" id="tCopy">🧪 Salin sebagai ujian</button></div>`;
  const ready = t.matches.filter(m => m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE' && m.status !== 'done' && m.status !== 'bye').length;
  return `<div class="card test-card"><div class="section-title" style="margin-top:0">🧪 Alat ujian</div>
    <p class="muted small">${ready ? `${ready} perlawanan sedia untuk diisi skor rawak.` : t.matches.length ? 'Tiada perlawanan sedia. Jana kalah mati di tab ⚔️ Knockout.' : 'Jana jadual dahulu.'}</p>
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
    ${'Notification' in window ? `<div class="row" style="justify-content:space-between;margin:6px 0 10px"><span class="small">🔔 Notifikasi telefon: <b>${notifOn() ? 'Hidup' : 'Mati'}</b></span><button type="button" class="pill-btn light small" id="ntf">${notifOn() ? 'Matikan' : 'Hidupkan'}</button></div>` : ''}
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
  const ntf = document.getElementById('ntf');
  if (ntf) ntf.onclick = async () => { await askNotif(); showAccount(); };
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
// Kemas kini automatik: semak versi baharu setiap kali app dibuka/kembali ke skrin, dan muat semula sekali bila versi baharu aktif
if ('serviceWorker' in navigator) {
  const hadSW = !!navigator.serviceWorker.controller;
  let reloading = false, pendingReload = false;
  const doReload = () => { if (reloading) return; reloading = true; location.reload(); };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadSW) return;
    if (busy()) { pendingReload = true; toast('Versi baharu sedia, akan dimuat semula selepas ini'); } else doReload();
  });
  window.addEventListener('hashchange', () => { if (pendingReload) doReload(); });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {}));
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  const b = document.getElementById('install-btn'); b.hidden = false;
  b.onclick = async () => { b.hidden = true; deferredPrompt.prompt(); deferredPrompt = null; };
});
