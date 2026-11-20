// Lapisan simpanan data (hibrid).
// - Pertandingan di awan (Firebase) dikongsi semua orang; hanya admin/pengesah boleh ubah.
// - Pertandingan "tempatan" disimpan dalam peranti ini sahaja (cth. ujian, atau semasa luar talian).
import * as cloud from './cloud.js';

const KEY = 'carrom-pwa:v1';
const clone = o => JSON.parse(JSON.stringify(o));

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { tournaments: [] }; }
  catch { return { tournaments: [] }; }
}
function writeLocal(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error(e); }
}
// ---------- Sandaran automatik (dalam peranti ini) ----------
// Sebelum setiap simpanan, versi lama disalin (sekurang-kurangnya 3 minit antara salinan, atau serta-merta jika
// keputusan / perlawanan berkurang, cth. tersalah reset). Maksimum 10 versi setiap pertandingan.
const BAK = id => 'carrom:bak:' + id;
const doneN = t => (t.matches || []).filter(m => m.status === 'done').length;
export function backups(id) { try { return JSON.parse(localStorage.getItem(BAK(id)) || '[]'); } catch { return []; } }
export function snapshot(old, next, force = false) {
  if (!old || !old.id) return;
  const list = backups(old.id), last = list[0];
  const shrink = next && (doneN(next) < doneN(old) || (next.matches || []).length < (old.matches || []).length || (next.participants || []).length < (old.participants || []).length);
  if (!force && !shrink && last && Date.now() - last.at < 3 * 60e3) return;
  const data = JSON.stringify(old);
  if (last && last.data === data) return;
  list.unshift({ at: Date.now(), data, n: doneN(old), m: (old.matches || []).length, p: (old.participants || []).length, stage: old.stage });
  let out = list.slice(0, 10);
  while (out.length > 1 && JSON.stringify(out).length > 700e3) out = out.slice(0, -1);   // had ~700 KB setiap pertandingan
  for (let k = out.length; k >= 1; k--) {
    try { localStorage.setItem(BAK(old.id), JSON.stringify(out.slice(0, k))); break; } catch {}   // ruang penuh → simpan lebih sedikit
  }
  // Jumlah semua sandaran ≤ ~1.5 MB: buang sandaran pertandingan yang paling lama tidak disentuh
  try {
    const ks = Object.keys(localStorage).filter(k => k.startsWith('carrom:bak:'));
    const info = ks.map(k => { const v = localStorage.getItem(k) || ''; let at = 0; try { at = JSON.parse(v)[0].at; } catch {} return { k, n: v.length, at }; }).sort((a, b) => a.at - b.at);
    let tot = info.reduce((a, x) => a + x.n, 0);
    while (tot > 1.5e6 && info.length > 1) { const x = info.shift(); localStorage.removeItem(x.k); tot -= x.n; }
  } catch {}
}
const inCloud = id => !!(cloud.state.tournaments && cloud.state.tournaments.has(id));

export const store = {
  isLocal: id => !inCloud(id) && readLocal().tournaments.some(t => t.id === id),
  isCloud: inCloud,
  canEdit(id) { return store.isLocal(id) || (inCloud(id) && (cloud.manages(id) || cloud.state.role === 'verifier')); },
  canAdmin(id) { return store.isLocal(id) || (inCloud(id) && cloud.manages(id)); },
  list() {
    const local = readLocal().tournaments;
    const c = cloud.state.tournaments ? [...cloud.state.tournaments.values()] : [];
    const ids = new Set(c.map(t => t.id));
    return [...c, ...local.filter(t => !ids.has(t.id))].map(clone).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
  get(id) {
    if (inCloud(id)) return clone(cloud.state.tournaments.get(id));
    const t = readLocal().tournaments.find(x => x.id === id);
    return t ? clone(t) : null;
  },
  // Simpan: ke awan jika pertandingan itu di awan (atau baharu dan pengguna ialah admin), jika tidak ke peranti
  save(t, { forceCloud = false } = {}) {
    if (inCloud(t.id) || (forceCloud && cloud.isAdmin())) {
      const created = !inCloud(t.id);
      if (!created && !store.canEdit(t.id)) throw new Error('Hanya pengurus pertandingan ini boleh membuat perubahan');
      if (!created) snapshot(cloud.state.tournaments.get(t.id), t);
      cloud.state.tournaments.set(t.id, clone(t));       // kemas kini serta-merta di skrin
      return cloud.saveTournament(t, { created }).catch(e => { console.error(e); alert('Gagal simpan ke awan: ' + (e.code || e.message)); });
    }
    const db = readLocal();
    const i = db.tournaments.findIndex(x => x.id === t.id);
    if (i >= 0) snapshot(db.tournaments[i], t);
    if (i >= 0) db.tournaments[i] = t; else db.tournaments.push(t);
    writeLocal(db);
    return Promise.resolve();
  },
  async remove(id) {
    if (inCloud(id)) { if (!cloud.isAdmin()) throw new Error('Hanya admin boleh memadam'); cloud.state.tournaments.delete(id); await cloud.deleteTournament(id); }
    const db = readLocal(); db.tournaments = db.tournaments.filter(t => t.id !== id); writeLocal(db);
  },
  // Pindah pertandingan tempatan ke awan
  async upload(id) {
    const t = readLocal().tournaments.find(x => x.id === id);
    if (!t) return;
    if (!cloud.isAdmin()) throw new Error('Log masuk sebagai admin dahulu');
    await cloud.saveTournament(t, { created: true });
    const db = readLocal(); db.tournaments = db.tournaments.filter(x => x.id !== id); writeLocal(db);
  },
  exportJSON() { return JSON.stringify({ tournaments: store.list() }, null, 2); },
  importJSON(text) {
    const incoming = JSON.parse(text);
    const list = Array.isArray(incoming) ? incoming : incoming.tournaments ? incoming.tournaments : [incoming];
    const db = readLocal();
    for (const t of list) {
      if (!t || !t.id || !Array.isArray(t.participants)) continue;
      const i = db.tournaments.findIndex(x => x.id === t.id);
      if (i >= 0) db.tournaments[i] = t; else db.tournaments.push(t);
    }
    writeLocal(db);
    return list.length;
  },
};
