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
      state.user = u ? { uid: u.uid, email: u.email || '', name: u.displayName || '', anon: u.isAnonymous } : null;
      watchRole();
      emit('auth');
    });
    unsubT = F.onSnapshot(F.collection(db, 'tournaments'), { includeMetadataChanges: true }, snap => {
      state.offline = !!snap.metadata?.fromCache;
      const m = new Map();
      snap.forEach(d => { try { m.set(d.id, JSON.parse(d.data().data)); } catch {} });
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
  if (!u || u.isAnonymous || !u.email) { state.role = ''; emit('role'); return; }
  if (await sha256(u.email.toLowerCase()) === OWNER_HASH) { state.role = 'owner'; emit('role'); return; }
  unsubRole = F.onSnapshot(F.doc(db, 'roles', u.email.toLowerCase()), d => {
    state.role = d.exists() ? (d.data().role || '') : '';
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
const unsubLive = {};
export function watchLive(tid) {
  if (unsubLive[tid] || !F) return;
  unsubLive[tid] = F.onSnapshot(F.collection(db, 'tournaments', tid, 'live'), snap => {
    const o = {};
    snap.forEach(d => { const x = d.data(); o[d.id] = { ...x, rs: decodeRubbers(x.rs), cur: String(x.cur || '0-0').split('-').map(Number), at: x.at?.toMillis?.() || Date.now() }; });
    state.live[tid] = o; emit('live');
  }, err => { console.warn('live', err); state.live[tid] = state.live[tid] || {}; emit('live'); });
}
export async function claimScorer(tid, pin) {
  const u = await ensureAnon();
  await F.setDoc(F.doc(db, 'tournaments', tid, 'scorers', u.uid), { pin: String(pin), at: F.serverTimestamp() });
}
export async function setLive(tid, mid, { rs, cur, ri, by, tb, sw }) {
  const u = await ensureAnon();
  await F.setDoc(F.doc(db, 'tournaments', tid, 'live', mid), { uid: u.uid, rs: encodeRubbers(rs), cur: `${cur[0]}-${cur[1]}`, ri: ri | 0, by: String(by || '').slice(0, 50), tb: String(tb || '').slice(0, 15), sw: !!sw, at: F.serverTimestamp() });
}
export async function clearLive(tid, mid) { await init(); await F.deleteDoc(F.doc(db, 'tournaments', tid, 'live', mid)); }

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
