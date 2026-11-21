// Mock Firebase (Firestore + Auth + RTDB) dalam memori untuk ujian Playwright.
// Konfigurasi: window.__MOCK = { user: {uid,email,displayName,isAnonymous,emailVerified}, docs: { 'path/to/doc': {...} }, deny: [regex teks laluan] }
const M = (window.__MOCK ||= {});
const D = (M.docs ||= {});
const subs = new Set();
const deny = p => (M.deny || []).some(r => new RegExp(r).test(p));
const later = f => setTimeout(f, 5);
const ts = () => { const n = Date.now(); return { toMillis: () => n, _ts: n }; };
const DEL = { _del: 1 };
export const serverTimestamp = () => ts();
export const deleteField = () => DEL;
export const initializeApp = c => ({ c });
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({}); export const persistentMultipleTabManager = () => ({});
export const doc = (db, ...p) => ({ path: p.join('/'), id: p[p.length - 1] });
export const collection = (db, ...p) => ({ path: p.join('/'), col: true });
export const query = r => r; export const orderBy = () => ({});
const kids = path => Object.keys(D).filter(k => k.startsWith(path + '/') && k.slice(path.length + 1).split('/').length === 1);
const dsnap = (path) => ({ id: path.split('/').pop(), exists: () => path in D, data: () => (D[path] ? JSON.parse(JSON.stringify(D[path])) : undefined) });
const csnap = path => ({ metadata: { fromCache: false }, size: kids(path).length, forEach: f => kids(path).forEach(k => f(dsnap(k))) });
function fire(ref, cb, err) {
  if (deny(ref.path)) { err && err({ code: 'permission-denied' }); return; }
  cb(ref.col ? csnap(ref.path) : dsnap(ref.path));
}
export function onSnapshot(ref, a, b, c) {
  const [cb, err] = typeof a === 'function' ? [a, b] : [b, c];
  const s = { ref, cb, err }; subs.add(s); later(() => subs.has(s) && fire(ref, cb, err));
  return () => subs.delete(s);
}
function changed(path) { M.writes = (M.writes || 0) + 1; for (const s of subs) if (path === s.ref.path || (s.ref.col && path.startsWith(s.ref.path + '/') && path.slice(s.ref.path.length + 1).split('/').length === 1)) later(() => subs.has(s) && fire(s.ref, s.cb, s.err)); }
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (v && v._ts ? v._ts : v)));
export async function setDoc(ref, data, opt = {}) {
  if (deny(ref.path)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
  const cur = opt.merge && D[ref.path] ? D[ref.path] : {};
  const out = { ...cur };
  for (const [k, v] of Object.entries(data)) { if (v === DEL) delete out[k]; else out[k] = clean(v); }
  D[ref.path] = out; changed(ref.path);
}
export async function getDoc(ref) { if (deny(ref.path)) throw Object.assign(new Error('denied'), { code: 'permission-denied' }); return dsnap(ref.path); }
export async function addDoc(ref, data) { const id = Math.random().toString(36).slice(2, 10); await setDoc({ path: ref.path + '/' + id }, data); return { id }; }
export async function deleteDoc(ref) { if (deny(ref.path)) throw Object.assign(new Error('denied'), { code: 'permission-denied' }); delete D[ref.path]; changed(ref.path); }
// ---- Auth ----
const authL = new Set();
const mkUser = u => u && { uid: u.uid, email: u.email || null, displayName: u.displayName || '', isAnonymous: !!u.isAnonymous, emailVerified: u.emailVerified !== false && !!u.email, providerData: u.isAnonymous ? [] : [{ providerId: 'google.com', email: u.email, displayName: u.displayName }], getIdToken: async () => 'x' };
const auth = { currentUser: mkUser(M.user) };
export const getAuth = () => auth;
export const setPersistence = async () => {}; export const browserLocalPersistence = {};
export const getRedirectResult = async () => null;
export function onAuthStateChanged(a, f) { authL.add(f); later(() => f(auth.currentUser)); return () => authL.delete(f); }
const setUser = u => { auth.currentUser = mkUser(u); authL.forEach(f => later(() => f(auth.currentUser))); };
window.__mockLogin = u => setUser(u);
export class GoogleAuthProvider { setCustomParameters() {} static credentialFromError() { return null; } }
const G = () => M.google || { uid: 'g-' + Math.random().toString(36).slice(2, 6), email: 'ahli@gmail.com', displayName: 'Ahli Ujian' };
export async function signInWithPopup() { setUser(G()); }
export async function linkWithPopup(u) { const g = G(); auth.currentUser = mkUser({ ...g, uid: u.uid }); }
export const signInWithRedirect = signInWithPopup, linkWithRedirect = linkWithPopup;
export async function signInAnonymously() { setUser({ uid: 'anon-' + Math.random().toString(36).slice(2, 6), isAnonymous: true }); }
export async function signOut() { setUser(null); }
export const signInWithCredential = signInWithPopup;
export async function reload() {} export async function updateProfile() {} export async function sendEmailVerification() {} export async function sendPasswordResetEmail() {}
export async function signInWithEmailAndPassword() { throw new Error('x'); } export async function createUserWithEmailAndPassword() { throw new Error('x'); }
// ---- RTDB (minimum) ----
export const getDatabase = () => ({}); export const dbRef = (d, p) => ({ p }); export const dbOnValue = (r, cb) => { later(() => cb({ val: () => null })); return () => {}; };
export const dbSet = async () => {}; export const dbRemove = async () => {}; export const dbNow = () => Date.now(); export const dbOnline = () => {}; export const dbOffline = () => {};
