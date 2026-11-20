// Lapisan awan (Firebase). Dimuat secara malas supaya app tetap laju dan berfungsi tanpa internet.
// Data satu pertandingan = satu dokumen tournaments/{id} dengan medan `data` (teks JSON),
// kerana Firestore tidak menyokong senarai bersarang (skor [[11,8],[9,11]]).
import { firebaseConfig } from './firebase-config.js';

// Pemilik dikenal pasti melalui cap jari SHA-256 e-mel (e-mel sebenar tidak disimpan dalam kod awam).
const OWNER_HASH = '775ee7a41c79e60559c753e4dd4a0f3db5737d1972d9d93934d4bc33ab5e13cb';
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
export const ownerEmail = () => (state.role === 'owner' && auth && auth.currentUser ? auth.currentUser.email : 'pemilik');

let F = null, app, auth, db;
const listeners = new Set();
export const state = {
  ready: false,        // sambungan awan berjaya dimulakan
  failed: false,       // tidak dapat dimuat (luar talian / disekat)
  user: null,          // { uid, email, name, anon }
  role: '',            // owner | admin | verifier | ''
  tournaments: null,   // Map id → objek pertandingan (dari awan)
  offline: false,      // data dari cache peranti (belum disahkan pelayan)
  pending: {},         // tid → [penghantaran menunggu]
  regs: {},            // tid → [pendaftaran peserta]
  live: {},            // tid → { mid: skor langsung }
  posters: {},         // tid → dataURL poster sendiri ('' = tiada)
};
const emit = what => listeners.forEach(f => { try { f(what); } catch (e) { console.error(e); } });
export const onChange = f => { listeners.add(f); return () => listeners.delete(f); };

export const isAdmin = () => state.role === 'owner' || state.role === 'admin';
// Siapa urus pertandingan: pemilik (semua), atau admin yang mencipta / diserahkan pertandingan itu (koleksi 'owners', tidak dibaca umum)
state.owners = {};
const myEmail = () => (auth && auth.currentUser && auth.currentUser.email ? auth.currentUser.email.toLowerCase() : '');
// Pengurus: pemilik; admin yang mencipta / diserahkan; atau admin bersama (co) yang dijemput untuk pertandingan ini
export const manages = tid => state.role === 'owner' || (state.role === 'admin' && (state.owners[tid] || {}).email === myEmail())
  || (!!myEmail() && ((state.owners[tid] || {}).co || []).includes(myEmail()));
export const isMainManager = tid => state.role === 'owner' || (state.role === 'admin' && (state.owners[tid] || {}).email === myEmail());
// Bukan admin umum: semak sama ada saya admin bersama untuk pertandingan ini (dokumen boleh dibaca jika e-mel saya tersenarai)
const _ownTried = {};
export async function loadOwner(tid) {
  if (!myEmail() || isAdmin() || _ownTried[tid]) return; _ownTried[tid] = 1;
  try { const d = await F.getDoc(F.doc(db, 'owners', tid)); if (d.exists()) { state.owners[tid] = d.data(); emit('role'); } } catch {}
}
export async function setCoAdmins(tid, co, coNames) { await init(); await F.setDoc(F.doc(db, 'owners', tid), { co, coNames }, { merge: true }); state.owners[tid] = { ...(state.owners[tid] || {}), co, coNames }; emit('role'); }
export const managerOf = tid => state.owners[tid] || null;
let unsubOwners = null;
function watchOwners() {
  if (unsubOwners) { unsubOwners(); unsubOwners = null; }
  state.owners = {}; for (const k in _ownTried) delete _ownTried[k];
  if (!isAdmin()) return;
  unsubOwners = F.onSnapshot(F.collection(db, 'owners'), snap => { const o = {}; snap.forEach(d => (o[d.id] = d.data())); state.owners = o; emit('role'); }, () => {});
}
export async function setManager(tid, email, name = '') { await init(); await F.setDoc(F.doc(db, 'owners', tid), { email: String(email).toLowerCase(), name: String(name || '').slice(0, 60) }); }
export const isVerifier = () => isAdmin() || state.role === 'verifier';

let unsubT = null, unsubRole = null;
const unsubSub = {};

export async function init() {
  if (F || state.failed) return;
  try {
    F = await import('./vendor/firebase.js');
    app = F.initializeApp(firebaseConfig);
    auth = F.getAuth(app);
    try { await F.setPersistence(auth, F.browserLocalPersistence); } catch {}
    try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch { db = F.initializeFirestore(app, {}); }
    try { await F.getRedirectResult(auth); } catch (e) { console.warn('redirect', e); }
    F.onAuthStateChanged(auth, u => {
      state.user = u ? { uid: u.uid, email: u.email || '', name: u.displayName || '', anon: u.isAnonymous, verified: !!u.emailVerified, pass: (u.providerData || []).some(p => p.providerId === 'password') } : null;
      watchRole();
      emit('auth');
    });
    unsubT = F.onSnapshot(F.collection(db, 'tournaments'), { includeMetadataChanges: true }, snap => {
      state.offline = !!snap.metadata?.fromCache;
      const m = new Map();
      snap.forEach(d => { try { const x = JSON.parse(d.data().data); if (x && x.sport !== 'carrom') m.set(d.id, x); } catch {} });   // pertandingan carrom dipapar dalam Portal Carrom
      state.tournaments = m;
      emit('tournaments');
    }, err => { console.warn('tournaments', err); state.failed = !state.tournaments; emit('error'); });
    state.ready = true;
    emit('ready');
  } catch (e) {
    console.warn('Firebase tidak dapat dimuat', e);
    state.failed = true;
    emit('error');
  }
}

async function watchRole() {
  if (unsubRole) { unsubRole(); unsubRole = null; }
  Object.values(unsubSub).forEach(u => u()); for (const k in unsubSub) delete unsubSub[k];
  state.pending = {};
  const u = auth.currentUser;
  // e-mel mesti disahkan (akaun e-mel/kata laluan perlu klik pautan pengesahan dahulu)
  if (!u || u.isAnonymous || !u.email || !u.emailVerified) { state.role = ''; watchOwners(); emit('role'); return; }
  if (await sha256(u.email.toLowerCase()) === OWNER_HASH) { state.role = 'owner'; watchOwners(); emit('role'); return; }
  unsubRole = F.onSnapshot(F.doc(db, 'roles', u.email.toLowerCase()), d => {
    state.role = d.exists() ? (d.data().role || '') : '';
    watchOwners();
    emit('role');
  }, () => { state.role = ''; emit('role'); });
}

// ---------- Log masuk ----------
export async function signInGoogle() {
  await init();
  const p = new F.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try { await F.signInWithPopup(auth, p); }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) return F.signInWithRedirect(auth, p);
    throw e;
  }
}
// Log masuk dengan e-mel lain (Yahoo, Outlook, e-mel pejabat…): kata laluan + pautan pengesahan e-mel
export async function signInEmail(email, pass) { await init(); const c = await F.signInWithEmailAndPassword(auth, email.trim(), pass); return c.user; }
export async function signUpEmail(email, pass, name) {
  await init();
  const c = await F.createUserWithEmailAndPassword(auth, email.trim(), pass);
  if (name) try { await F.updateProfile(c.user, { displayName: name }); } catch {}
  await F.sendEmailVerification(c.user, { url: location.origin + location.pathname });
  return c.user;
}
export async function resendVerify() { await init(); if (auth.currentUser) await F.sendEmailVerification(auth.currentUser, { url: location.origin + location.pathname }); }
export async function resetPass(email) { await init(); await F.sendPasswordResetEmail(auth, email.trim(), { url: location.origin + location.pathname }); }
// selepas klik pautan pengesahan: muat semula status akaun
export async function refreshUser() {
  await init(); const u = auth.currentUser; if (!u) return false;
  await F.reload(u); await u.getIdToken(true);
  state.user = { ...state.user, verified: !!u.emailVerified, name: u.displayName || state.user?.name || '' };
  await watchRole(); emit('auth'); return !!u.emailVerified;
}
export async function ensureAnon() {
  await init();
  if (!auth.currentUser) await F.signInAnonymously(auth);
  return auth.currentUser;
}
export async function signOutAll() { await init(); await F.signOut(auth); }

// ---------- Pertandingan ----------
export async function saveTournament(t, opts = {}) {
  await init();
  // Siapa cipta / kemas kini (nama sahaja; e-mel tidak disimpan kerana data pertandingan boleh dibaca umum)
  const who = state.user && !state.user.anon ? (state.user.name || (state.user.email || '').split('@')[0] || 'Admin') : '';
  if (who) { if (opts.created && !t.createdBy) t.createdBy = { name: who, at: Date.now() }; t.lastEdit = { name: who, at: Date.now() }; }
  // pertandingan baharu: rekod pengurus (e-mel disimpan dalam koleksi peribadi 'owners', bukan dalam data awam)
  if (opts.created && myEmail() && !state.owners[t.id]) {
    try { await F.setDoc(F.doc(db, 'owners', t.id), { email: myEmail(), name: who }); state.owners[t.id] = { email: myEmail(), name: who }; } catch (e) { /* peraturan lama: abaikan */ }
  }
  const meta = { name: t.name || '', clubId: t.clubId || '', stage: t.stage || '', date: t.date || '', regOpen: !!t.regOpen && t.stage === 'setup' && !(t.matches || []).length, updatedAt: F.serverTimestamp(), updatedBy: who };
  await F.setDoc(F.doc(db, 'tournaments', t.id), { ...meta, data: JSON.stringify(t) });
}
export async function deleteTournament(id) { await init(); await F.deleteDoc(F.doc(db, 'tournaments', id)); }

// ---------- PIN acara (hanya admin boleh baca/tulis) ----------
export async function getPin(tid) { await init(); const d = await F.getDoc(F.doc(db, 'pins', tid)); return d.exists() ? d.data().pin : ''; }
export async function setPin(tid, pin) { await init(); await F.setDoc(F.doc(db, 'pins', tid), { pin: String(pin) }); }

// ---------- Peranan (hanya pemilik) ----------
export function watchRoles(cb) {
  return F.onSnapshot(F.collection(db, 'roles'), snap => { const out = []; snap.forEach(d => out.push({ email: d.id, ...d.data() })); cb(out); }, () => cb([]));
}
export async function setRole(email, role, name = '') { await init(); await F.setDoc(F.doc(db, 'roles', email.trim().toLowerCase()), { role, name }); }
export async function removeRole(email) { await init(); await F.deleteDoc(F.doc(db, 'roles', email.trim().toLowerCase())); }

// ---------- Penghantaran skor ----------
// rubbers disimpan sebagai teks "11-8,9-11|11-5,..." (format portal)
export const encodeRubbers = rs => rs.map(sets => sets.map(s => `${s[0]}-${s[1]}`).join(',')).join('|');
export const decodeRubbers = s => String(s || '').split('|').map(r => r.split(',').filter(Boolean).map(g => g.split('-').map(Number)));

export async function submitScore(tid, { pin, matchId, a, b, rubbers, lineup, by, role, note }) {
  const u = await ensureAnon();
  await F.addDoc(F.collection(db, 'tournaments', tid, 'submissions'), {
    uid: u.uid, pin: String(pin), matchId, a: a || '', b: b || '', rubbers: encodeRubbers(rubbers),
    lineup: lineup ? JSON.stringify(lineup) : '', by: by || '', role: role || 'pengadil', note: note || '', at: F.serverTimestamp(),
  });
}
// Pengesah: dengar penghantaran menunggu bagi satu pertandingan
export function watchSubmissions(tid) {
  if (!isVerifier() || unsubSub[tid]) return;
  unsubSub[tid] = F.onSnapshot(F.collection(db, 'tournaments', tid, 'submissions'), snap => {
    const list = [];
    snap.forEach(d => { const x = d.data(); list.push({ id: d.id, ...x, rubbers: decodeRubbers(x.rubbers), lineup: x.lineup ? JSON.parse(x.lineup) : null, at: x.at?.toMillis?.() || Date.now() }); });
    list.sort((a, b) => a.at - b.at);
    state.pending[tid] = list;
    emit('pending');
  }, err => console.warn('submissions', err));
}
export async function deleteSubmission(tid, sid) { await init(); await F.deleteDoc(F.doc(db, 'tournaments', tid, 'submissions', sid)); }

// ---------- Pendaftaran sendiri (peserta log masuk Google) ----------
// tournaments/{tid}/registrations/{uid}: { uid, name, unit, level, partner, note, status: pending|ok|no, at }
const unsubReg = {};
export function watchRegistrations(tid) {
  if (unsubReg[tid] || !F) return;
  unsubReg[tid] = F.onSnapshot(F.collection(db, 'tournaments', tid, 'registrations'), snap => {
    const list = [];
    snap.forEach(d => { const x = d.data(); list.push({ id: d.id, ...x, at: x.at?.toMillis?.() || Date.now() }); });
    list.sort((a, b) => a.at - b.at);
    state.regs[tid] = list;
    emit('regs');
  }, err => { console.warn('registrations', err); state.regs[tid] = state.regs[tid] || []; emit('regs'); });
}
// Satu telefon boleh mendaftar beberapa orang: id dokumen = uid (pertama) atau uid_1 … uid_9
export async function register(tid, { name, full, unit, level, partner, note }, docId = '') {
  const u = await ensureAnon();   // tanpa log masuk: akaun tanpa nama peranti ini (boleh ubah/batal dari telefon yang sama)
  if (!docId) { const used = new Set((state.regs[tid] || []).map(r => r.id)); docId = used.has(u.uid) ? (Array.from({ length: 9 }, (_, i) => `${u.uid}_${i + 1}`).find(x => !used.has(x)) || '') : u.uid; }
  if (!docId) throw Object.assign(new Error('Had pendaftaran dari telefon ini dicapai'), { code: 'had-telefon' });
  const ref = F.doc(db, 'tournaments', tid, 'registrations', docId);
  const old = await F.getDoc(ref);
  const doc = { uid: u.uid, name: String(name).slice(0, 50), unit: String(unit || '').slice(0, 50), level: String(level || '').slice(0, 10),
    partner: String(partner || '').slice(0, 50), note: String(note || '').slice(0, 150), status: old.exists() ? old.data().status : 'pending', at: old.exists() ? old.data().at : F.serverTimestamp() };
  if (full) doc.full = String(full).slice(0, 80);
  try { await F.setDoc(ref, doc); }
  catch (e) { if (!doc.full) throw e; delete doc.full; await F.setDoc(ref, doc); } // peraturan lama belum benarkan 'full'
}
// Penganjur ubah nama pada dokumen pendaftaran (status & masa kekal)
export async function adminEditReg(tid, rid, data) { await init(); await F.setDoc(F.doc(db, 'tournaments', tid, 'registrations', rid), data, { merge: true }); }
export async function unregister(tid, uid) { await init(); await F.deleteDoc(F.doc(db, 'tournaments', tid, 'registrations', uid || auth.currentUser.uid)); }
export async function setRegStatus(tid, uid, status) { await init(); await F.setDoc(F.doc(db, 'tournaments', tid, 'registrations', uid), { status }, { merge: true }); }
export const myUid = () => (auth && auth.currentUser ? auth.currentUser.uid : '');

// ---------- Skor langsung (setiap meja) ----------
// tournaments/{tid}/live/{mid}: { uid, rs:"11-8,9-11|...", cur:"7-5", ri, by, tb, at } — semua boleh baca.
// Penjaga skor bukan penganjur mendaftar sekali dengan PIN: tournaments/{tid}/scorers/{uid} { pin, at } (tidak boleh dibaca umum).
// ---------- Skor langsung ----------
// Utama: Firebase Realtime Database (rtdb) — skor sampai serta-merta, tidak dikira setiap bacaan (hanya data dimuat turun).
//   live/{tid}/{id perlawanan}/{uid penjaga} = { rs, cur, ri, by, tb, sw, at }   · live/{tid}/{id}/_clr = masa dilepaskan
//   Sambungan dibuka hanya semasa halaman Langsung / Keputusan / Jaga skor / TV dipaparkan (had percuma 100 serentak).
// Sandaran: dokumen ringkasan Firestore livesum/{tid} dibaca setiap 10 saat jika rtdb tidak dapat disambung.
let rdb = null, rdbOff = false;
const _poll = {}, _rt = {};
const LIVE_PAGE = tid => new RegExp(`^#/(t/${tid}/(langsung|keputusan|ls|m)(/|$)|tv/${tid})`);
const liveEntry = x => ({ ...x, rs: decodeRubbers(x.rs), cur: String(x.cur || '0-0').split('-').map(Number), at: typeof x.at === 'number' ? x.at : x.at?.toMillis?.() || Date.now() });
function parseSum(d) {
  const o = {}, m = (d && d.m) || {};
  for (const [k, x] of Object.entries(m)) if (x && typeof x === 'object') o[k] = liveEntry(x);
  return o;
}
function parseRt(v) {
  const o = {};
  for (const [lid, node] of Object.entries(v || {})) {
    if (!node || typeof node !== 'object') continue;
    const clr = Number(node._clr) || 0;
    let best = null;
    for (const [uid, x] of Object.entries(node)) if (uid !== '_clr' && x && typeof x === 'object' && (Number(x.at) || 0) > clr && (!best || x.at > best.at)) best = { ...x, uid };
    if (best) o[lid] = liveEntry(best);
  }
  return o;
}
function rtdb() {
  if (rdb || rdbOff || !F || !F.getDatabase || !firebaseConfig.databaseURL) return rdb;
  try { rdb = F.getDatabase(app, firebaseConfig.databaseURL); } catch (e) { console.warn('rtdb', e); rdbOff = true; }
  return rdb;
}
function stopLive(tid) {
  const p = _poll[tid]; if (p) { clearInterval(p.timer); delete _poll[tid]; }
  const r = _rt[tid]; if (r) { r.unsub && r.unsub(); clearTimeout(r.fb); delete _rt[tid]; }
  if (rdb && !Object.keys(_rt).length && !_scoring) try { F.dbOffline(rdb); } catch {}
}
async function pollLive(tid, force) {
  const p = _poll[tid]; if (!p) return;
  if (!LIVE_PAGE(tid).test(location.hash)) return stopLive(tid);
  if (!force && document.visibilityState !== 'visible') return;
  try {
    const d = await F.getDoc(F.doc(db, 'livesum', tid)), o = parseSum(d.exists() ? d.data() : null);
    setLiveState(tid, o, p);
  } catch (e) { console.warn('live', e); state.live[tid] = state.live[tid] || {}; }
}
function setLiveState(tid, o, holder) {
  const sig = JSON.stringify(Object.entries(o).map(([k, x]) => [k, x.rs, x.cur, x.ri, x.uid, x.sw]));
  if (sig !== holder.sig || !state.live[tid]) { holder.sig = sig; state.live[tid] = o; emit('live'); }
}
function startPoll(tid, ms) {
  const p = _poll[tid];
  if (p && p.ms <= ms) return;
  if (p) clearInterval(p.timer);
  _poll[tid] = { ms, sig: p ? p.sig : '', timer: setInterval(() => pollLive(tid), ms) };
  pollLive(tid, true);
}
export function watchLive(tid, ms = 10000) {
  if (!F) return;
  const r = rtdb();
  if (!r) return startPoll(tid, ms);
  if (_rt[tid]) return;
  const h = (_rt[tid] = { sig: '' });
  try { F.dbOnline(r); } catch {}
  // jika tiada data dalam 10 saat (contoh had sambungan penuh), guna tinjauan Firestore sebagai sandaran
  h.fb = setTimeout(() => { if (!h.got) startPoll(tid, ms); }, 10000);
  h.unsub = F.dbOnValue(F.dbRef(r, 'live/' + tid), snap => {
    h.got = true; clearTimeout(h.fb); if (_poll[tid]) { clearInterval(_poll[tid].timer); delete _poll[tid]; }
    if (!LIVE_PAGE(tid).test(location.hash)) return stopLive(tid);
    setLiveState(tid, parseRt(snap.val()), h);
  }, err => { console.warn('rtdb live', err); clearTimeout(h.fb); startPoll(tid, ms); });
}
export const refreshLive = tid => pollLive(tid, true);
if (typeof window !== 'undefined') {
  // tinggalkan halaman skor langsung → tutup sambungan (jimat had 100 sambungan serentak)
  window.addEventListener('hashchange', () => { for (const tid of new Set([...Object.keys(_rt), ...Object.keys(_poll)])) if (!LIVE_PAGE(tid).test(location.hash)) stopLive(tid); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { if (rdb && Object.keys(_rt).length) try { F.dbOnline(rdb); } catch {} Object.keys(_poll).forEach(tid => pollLive(tid)); }
    else if (rdb && !_scoring) setTimeout(() => { if (document.visibilityState !== 'visible') try { F.dbOffline(rdb); } catch {} }, 60000);
  });
}
export async function claimScorer(tid, pin) {
  const u = await ensureAnon();
  await F.setDoc(F.doc(db, 'tournaments', tid, 'scorers', u.uid), { pin: String(pin), at: F.serverTimestamp() });
}
// Penjaga skor: kunci perlawanan (Firestore live/{mid}; seorang penjaga sahaja) ditulis bila mula dan setiap 60 saat.
// Setiap mata ditulis ke rtdb (penonton nampak serta-merta); ringkasan Firestore (sandaran) paling kerap setiap 15 saat.
const _lockAt = {}, _sumAt = {}, _sumT = {};
let _scoring = 0;
export async function setLive(tid, mid, { rs, cur, ri, by, tb, sw }) {
  const u = await ensureAnon();
  const e = { uid: u.uid, rs: encodeRubbers(rs), cur: `${cur[0]}-${cur[1]}${cur[2] === 0 || cur[2] === 1 ? '-' + cur[2] : ''}`, ri: ri | 0, by: String(by || '').slice(0, 50), tb: String(tb || '').slice(0, 15), sw: !!sw };
  const k = tid + '/' + mid;
  if (!_lockAt[k] || Date.now() - _lockAt[k] > 60e3) {
    await F.setDoc(F.doc(db, 'tournaments', tid, 'live', mid), { ...e, at: F.serverTimestamp() });
    _lockAt[k] = Date.now();
  }
  _scoring = Date.now();
  const r = rtdb();
  if (r) { try { F.dbOnline(r); } catch {} F.dbSet(F.dbRef(r, `live/${tid}/${mid}/${u.uid}`), { rs: e.rs, cur: e.cur, ri: e.ri, by: e.by, tb: e.tb, sw: e.sw, at: F.dbNow() }).catch(err => console.warn('rtdb set', err)); }
  // ringkasan Firestore (sandaran) — paling kerap setiap 15 saat; tulisan terakhir sentiasa dihantar
  const writeSum = () => { _sumAt[k] = Date.now(); return F.setDoc(F.doc(db, 'livesum', tid), { m: { [mid]: { ...e, at: F.serverTimestamp() } }, at: F.serverTimestamp() }, { merge: true }).catch(err => console.warn('livesum', err)); };
  clearTimeout(_sumT[k]);
  const wait = 15e3 - (Date.now() - (_sumAt[k] || 0));
  if (wait <= 0) await writeSum(); else _sumT[k] = setTimeout(writeSum, wait);
  state.live[tid] = { ...(state.live[tid] || {}), [mid]: { ...e, rs, cur, at: Date.now() } };
}
export async function clearLive(tid, mid) {
  await init(); const k = tid + '/' + mid; delete _lockAt[k]; clearTimeout(_sumT[k]); _scoring = 0;
  await F.deleteDoc(F.doc(db, 'tournaments', tid, 'live', mid)).catch(() => {});
  await F.setDoc(F.doc(db, 'livesum', tid), { m: { [mid]: F.deleteField() }, at: F.serverTimestamp() }, { merge: true }).catch(() => {});
  const r = rtdb();
  if (r) {
    const uid = myUid();
    // buang entri sendiri; tanda "dilepaskan" supaya entri penjaga lain tidak dipaparkan lagi
    if (uid) await F.dbRemove(F.dbRef(r, `live/${tid}/${mid}/${uid}`)).catch(() => {});
    await F.dbSet(F.dbRef(r, `live/${tid}/${mid}/_clr`), F.dbNow()).catch(() => {});
  }
  if (state.live[tid]) delete state.live[tid][mid];
}

// ---------- Poster sendiri (gambar dimuat naik penganjur) ----------
// posters/{tid}: { img: dataURL webp/jpeg ≤ ~900KB, at } — semua boleh baca, hanya admin tulis
const unsubPoster = {};
export function watchPoster(tid) {
  if (unsubPoster[tid] || !F) return;
  unsubPoster[tid] = F.onSnapshot(F.doc(db, 'posters', tid), d => { state.posters[tid] = d.exists() ? d.data().img || '' : ''; emit('poster'); },
    () => { state.posters[tid] = ''; });
}
export async function setPoster(tid, img) { await init(); await F.setDoc(F.doc(db, 'posters', tid), { img, at: F.serverTimestamp() }); }
export async function delPoster(tid) { await init(); await F.deleteDoc(F.doc(db, 'posters', tid)); }
