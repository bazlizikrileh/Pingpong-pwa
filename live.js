// Agihan meja dinamik, pengadil automatik & status peribadi (ikut portal Claude, spesifikasi §6)
import * as E from './engine.js';

const real = id => !!id && id !== 'BYE';
const isDone = m => m.status === 'done' || m.status === 'bye';
const pl2 = m => m.px || [m.a, m.b];

export function tableList(t) {
  const n = E.numTablesOf(t), off = t.venue === 'C' && n <= 4 ? 4 : 0;
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1 + off;
    return { k, hall: t.venue === 'X' ? (t.venueName || 'Dewan') : k <= 4 ? 'Balai B' : 'Balai C' };
  });
}
const homeTable = (t, m) => {
  const T = tableList(t);
  return T[(m.gi ?? 0) % T.length].k;
};
const okey = m => m.stage === 'group'
  ? [m.tg ? 1 : 0, 0, m.gn || 0, 0, 0]
  : [m.tg ? 1 : 0, 1, m.round || 0, m.bracket === 'ko' ? 0 : 1, m.slot || 0];
const ocmp = (x, y) => { const a = okey(x), b = okey(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

export function liveState(t) {
  const ks = new Set(tableList(t).map(x => x.k)), onT = m => m.lt && ks.has(m.lt);
  const live = t.matches.filter(m => onT(m) && !isDone(m) && real(m.a) && real(m.b));
  const occ = {}, busy = new Set();
  live.forEach(m => { occ[m.lt] = m; pl2(m).forEach(p => busy.add(p)); });
  const cand = t.matches.filter(m => !onT(m) && !isDone(m) && real(m.a) && real(m.b)).sort(ocmp);
  return { live, occ, busy, cand };
}
function pick(t, k, cand, busy, used) {
  const fr = m => !used.has(m) && pl2(m).every(p => !busy.has(p));
  return cand.find(m => fr(m) && m.stage === 'group' && homeTable(t, m) === k) || cand.find(fr);
}
export function plan(t) {
  const { occ, busy, cand } = liveState(t), used = new Set(), b = new Set(busy), as = [];
  tableList(t).forEach(({ k }) => {
    if (occ[k]) return;
    const m = pick(t, k, cand, b, used);
    if (m) { used.add(m); pl2(m).forEach(p => b.add(p)); as.push([m, k]); }
  });
  return as;
}
// Perlawanan seterusnya bagi setiap meja yang sedang digunakan
export function nextUp(t) {
  const { occ, busy, cand } = liveState(t), used = new Set(), nx = {};
  tableList(t).forEach(({ k }) => {
    const cur = occ[k]; if (!cur) return;
    const b = new Set(busy); pl2(cur).forEach(p => b.delete(p));
    Object.values(nx).forEach(m => pl2(m).forEach(p => b.add(p)));
    const m = pick(t, k, cand, b, used);
    if (m) { used.add(m); nx[k] = m; }
  });
  return nx;
}

// ---------- Pengadil (peringkat kumpulan sahaja) ----------
export function umpirePlan(t) {
  const o = {};
  t.groups.forEach(g => {
    const mem = g.members, du = {};
    const ks = t.matches.filter(m => m.stage === 'group' && m.group === g.name && m.status !== 'bye').sort((a, b) => (a.gn || 0) - (b.gn || 0));
    ks.forEach((m, i) => {
      const pl = pl2(m), nx = ks[i + 1] ? pl2(ks[i + 1]) : [], pv = i ? pl2(ks[i - 1]) : [];
      const c = mem.filter(p => !pl.includes(p)).sort((x, y) => (du[x] || 0) - (du[y] || 0) || (nx.includes(x) - nx.includes(y)) || (pv.includes(y) - pv.includes(x)) || mem.indexOf(x) - mem.indexOf(y));
      if (c[0]) { o[m.id] = c[0]; du[c[0]] = (du[c[0]] || 0) + 1; }
    });
  });
  return o;
}
export function umpireOf(t, m, U) {
  if (!m || m.stage !== 'group') return '';
  if (m.lt && m.ump !== undefined) return m.ump || '';
  return (U || umpirePlan(t))[m.id] || '';
}
function chooseUmp(t, m, busy, U) {
  if (m.stage !== 'group') return '';
  const pr = U[m.id], du = {};
  t.matches.forEach(x => { if (x.ump) du[x.ump] = (du[x.ump] || 0) + 1; });
  const g = t.groups.find(x => x.name === m.group);
  const c = (g ? g.members : []).filter(p => !pl2(m).includes(p) && !busy.has(p));
  if (c.includes(pr)) return pr;
  if (c.length) return c.sort((x, y) => (du[x] || 0) - (du[y] || 0))[0];
  const gDone = name => t.matches.every(x => x.stage !== 'group' || x.group !== name || isDone(x));
  const grpOf = id => (t.groups.find(x => x.members.includes(id)) || {}).name;
  const o = t.groups.filter(x => x.name !== m.group).flatMap(x => x.members).filter(p => !pl2(m).includes(p) && !busy.has(p));
  return o.sort((x, y) => (gDone(grpOf(y)) - gDone(grpOf(x))) || (du[x] || 0) - (du[y] || 0))[0] || '';
}

// Agih meja kosong (mengubah t). Pulangkan bilangan perlawanan yang diagih.
export function allocate(t) {
  const as = plan(t);
  if (!as.length) return 0;
  const U = umpirePlan(t), { live } = liveState(t), busy = new Set(), np = new Set();
  live.forEach(m => { pl2(m).forEach(p => busy.add(p)); if (m.ump) busy.add(m.ump); });
  as.forEach(([m]) => pl2(m).forEach(p => { busy.add(p); np.add(p); }));
  const up = new Map();
  as.forEach(([m]) => { const u = chooseUmp(t, m, busy, U); if (u) busy.add(u); up.set(m, u); });
  live.forEach(m => { if (m.ump && np.has(m.ump)) { const u = chooseUmp(t, m, busy, U); if (u) busy.add(u); m.ump = u; } });
  as.forEach(([m, k]) => { m.lt = k; m.tg = 0; m.ump = up.get(m) || ''; });
  return as.length;
}
// Tangguh: keluarkan dari meja, letak di hujung giliran, kemudian agih semula
export function defer(t, mid) {
  const m = t.matches.find(x => x.id === mid); if (!m) return;
  const active = t.matches.some(x => x.lt && x.status !== 'done');
  m.lt = 0; m.tg = Date.now(); m.ump = '';
  if (active) allocate(t);
}
// Selepas skor disimpan: kosongkan meja perlawanan yang tamat dan agih semula jika sistem langsung sedang aktif
export function afterScore(t) {
  // m.lt dikekalkan pada perlawanan yang tamat (rekod meja); meja dikira kosong kerana perlawanan sudah tamat
  return t.matches.some(m => m.lt) ? allocate(t) : 0;
}

// ---------- Status peribadi ----------
export function myStatus(t, pid) {
  if (!pid) return null;
  const { live, cand } = liveState(t);
  if (!live.length) return null;
  const L = live.find(m => pl2(m).includes(pid));
  if (L) return { kind: 'play', table: L.lt, m: L };
  const Um = live.find(m => m.ump === pid);
  if (Um) return { kind: 'ump', table: Um.lt, m: Um };
  const nx = nextUp(t), N = Object.keys(nx).find(k => pl2(nx[k]).includes(pid));
  if (N) return { kind: 'ready', table: +N, m: nx[N] };
  const i = cand.findIndex(m => pl2(m).includes(pid));
  if (i >= 0) return { kind: 'wait', ahead: i, m: cand[i] };
  return { kind: 'none' };
}
