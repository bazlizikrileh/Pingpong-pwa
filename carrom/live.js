// Agihan papan dinamik, pengadil automatik & status peribadi (ikut portal Claude, spesifikasi §6)
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
  ? [m.tg ? 1 : 0, 0, m.px ? (m.session || 0) * 100 + (m.gi || 0) : m.gn || 0, 0, 0]
  : [m.tg ? 1 : 0, 1, m.round || 0, m.bracket === 'ko' ? 0 : 1, m.slot || 0];
const ocmp = (x, y) => { const a = okey(x), b = okey(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

// Trio/kuartet di peringkat kalah mati: perlawanan (Single/Double) dalam pertemuan yang sama boleh dimainkan
// serentak di papan lain yang kosong. m.xt = { indeks perlawanan: papan }.
let liveRiOf = () => null;   // indeks perlawanan yang sedang dijaga di papan utama (dari skor langsung), ditetapkan oleh app
export const setLiveRi = f => { liveRiOf = f; };
export const canSplit = (t, m) => E.isTeam(t) && m.stage !== 'group' && t.splitKO !== false && (m.rubbers || []).length > 1;
export const rubDone = (t, m, i) => !!(E.evaluateMatch(t, m).rubbers[i] || {}).complete;
const away = (m, i) => !!m.xt && m.xt[i] != null;
// Papan utama masih digunakan selagi ada perlawanan (bukan di papan lain) yang belum tamat
const primActive = (t, m) => !m.xt || m.rubbers.some((_, i) => !away(m, i) && !rubDone(t, m, i));
export const awayActive = (t, m) => Object.entries(m.xt || {}).filter(([i]) => !rubDone(t, m, +i)).map(([i, k]) => [+i, +k]);
export function liveState(t) {
  const ks = new Set(tableList(t).map(x => x.k)), onT = m => m.lt && ks.has(m.lt);
  const live = t.matches.filter(m => onT(m) && !isDone(m) && real(m.a) && real(m.b));
  const occ = {}, xr = {}, busy = new Set();
  live.forEach(m => {
    if (primActive(t, m)) occ[m.lt] = m;
    awayActive(t, m).forEach(([i, k]) => { if (ks.has(k) && !occ[k]) { occ[k] = m; xr[k] = i; } });
    pl2(m).forEach(p => busy.add(p));
  });
  const cand = t.matches.filter(m => !onT(m) && !isDone(m) && real(m.a) && real(m.b)).sort(ocmp);
  return { live, occ, xr, busy, cand };
}
// Semak kehadiran (pilihan penganjur): hanya perlawanan yang semua pemainnya sudah hadir diagih ke papan
const here = (t, m) => !t.checkin || pl2(m).every(p => (t.present || {})[p]);
function pick(t, k, cand, busy, used) {
  const fr = m => !used.has(m) && pl2(m).every(p => !busy.has(p)) && here(t, m);
  if (t.entryMode === 'mixer') {
    // Papan kosong diisi segera: utamakan pemain yang paling sedikit bermain (supaya ada rehat), kemudian susunan sesi
    const pc = {}; t.matches.forEach(m => { if (m.px && (m.status === 'done' || m.lt)) m.px.forEach(id => (pc[id] = (pc[id] || 0) + 1)); });
    const sc = m => m.px.reduce((a, id) => a + (pc[id] || 0), 0) * 10 + (m.session || 0);
    return cand.filter(fr).sort((x, y) => sc(x) - sc(y))[0];
  }
  return cand.find(m => fr(m) && m.stage === 'group' && homeTable(t, m) === k) || cand.find(fr);
}
// Regu bertukar, mod papan pantas: bila papan kosong, 4 pemain yang bebas & paling sedikit bermain diundi terus menjadi
// dua regu (elak pasangan berulang, kurangkan lawan berulang, imbang tahap) dan ditulis ke perlawanan seterusnya.
export const mixFast = t => t.entryMode === 'mixer' && t.mixFast === true;
function planMixFast(t) {
  const { occ, live } = liveState(t), busy = new Set(), as = [];
  live.forEach(m => { (m.px || []).forEach(id => busy.add(id)); if (m.ump) busy.add(m.ump); });
  const ids = (t.individuals || []).map(x => x.id), G = {}, played = {}, pc = {}, oc = {};
  const k2 = (a, b) => (a < b ? a + '|' + b : b + '|' + a), inc = (o, k) => (o[k] = (o[k] || 0) + 1);
  t.matches.forEach(m => { if (!m.px) return; if (!t.mixG) m.px.forEach(id => inc(G, id));
    if (isDone(m) || live.includes(m)) { m.px.forEach(id => inc(played, id)); inc(pc, k2(m.px[0], m.px[1])); inc(pc, k2(m.px[2], m.px[3])); [[0, 2], [0, 3], [1, 2], [1, 3]].forEach(([i, j]) => inc(oc, k2(m.px[i], m.px[j]))); } });
  if (t.mixG) Object.assign(G, t.mixG);
  const nm = id => (t.individuals.find(x => x.id === id) || {}).name || '';
  const bal = !!E.lvScheme(t), LV = Object.fromEntries(ids.map(id => [id, bal ? E.lvVal(t, nm(id), 'D') ?? 2.5 : 0]));
  const pending = t.matches.filter(m => m.px && !isDone(m) && !live.includes(m)).sort(ocmp);
  for (const { k } of tableList(t)) {
    if (occ[k] || !pending.length) continue;
    const F = ids.filter(id => !busy.has(id) && (played[id] || 0) < (G[id] || 0)).sort((x, y) => (played[x] || 0) - (played[y] || 0));
    if (F.length < 4) {
      // hujung pertandingan: jika tiada papan lain berjalan, lengkapkan dengan pemain bebas yang paling sedikit bermain
      if (busy.size || !F.length) break;
      ids.filter(id => !F.includes(id)).sort((x, y) => (played[x] || 0) - (played[y] || 0)).slice(0, 4 - F.length).forEach(id => F.push(id));
    }
    // jika perlawanan yang dirancang (ikut jadual) boleh dimainkan sekarang, guna terus — jadual & video undian kekal
    // (hanya untuk sesi pertama, supaya undian sesi 1 yang ditayang kekal; selepas itu diundi semasa)
    const ready = !t.matches.some(isDone) && pending.find(m => m.session === 1 && m.px.every(id => F.includes(id) && !(played[id] || 0)));
    if (ready) {
      pending.splice(pending.indexOf(ready), 1);
      ready.px.forEach(id => { busy.add(id); inc(played, id); }); inc(pc, k2(ready.px[0], ready.px[1])); inc(pc, k2(ready.px[2], ready.px[3]));
      [[0, 2], [0, 3], [1, 2], [1, 3]].forEach(([i, j]) => inc(oc, k2(ready.px[i], ready.px[j])));
      as.push([ready, k]); continue;
    }
    const C = F.slice(0, Math.min(8, F.length)); let best = null, bc = Infinity;
    for (let a = 0; a < C.length; a++) for (let b = a + 1; b < C.length; b++) for (let c = b + 1; c < C.length; c++) for (let d = c + 1; d < C.length; d++) {
      const q = [C[a], C[b], C[c], C[d]], base = q.reduce((x, id) => x + (played[id] || 0) * 100, 0);
      for (const [p1, p2, p3, p4] of [[q[0], q[1], q[2], q[3]], [q[0], q[2], q[1], q[3]], [q[0], q[3], q[1], q[2]]]) {
        const cost = base + 1000 * ((pc[k2(p1, p2)] || 0) + (pc[k2(p3, p4)] || 0)) + 10 * ((oc[k2(p1, p3)] || 0) + (oc[k2(p1, p4)] || 0) + (oc[k2(p2, p3)] || 0) + (oc[k2(p2, p4)] || 0)) + (bal ? 8 * Math.abs(LV[p1] + LV[p2] - LV[p3] - LV[p4]) : 0);
        if (cost < bc) { bc = cost; best = [p1, p2, p3, p4]; }
      }
    }
    const m = pending.shift();
    m.px = best;
    [[m.a, best[0], best[1]], [m.b, best[2], best[3]]].forEach(([pid, x, y]) => { const p = E.pobj(t, pid); if (p) { p.ids = [x, y]; p.members = [nm(x), nm(y)]; p.name = `${nm(x)} & ${nm(y)}`; } });
    best.forEach(id => { busy.add(id); inc(played, id); }); inc(pc, k2(best[0], best[1])); inc(pc, k2(best[2], best[3]));
    [[0, 2], [0, 3], [1, 2], [1, 3]].forEach(([i, j]) => inc(oc, k2(best[i], best[j])));
    as.push([m, k]);
  }
  return as;
}
export function plan(t) {
  if (mixFast(t)) return planMixFast(t);
  const { occ, busy, cand } = liveState(t), used = new Set(), b = new Set(busy), as = [];
  // Regu bertukar: pengadil yang sedang bertugas juga tidak diambil sebagai pemain
  if (t.entryMode === 'mixer') Object.values(occ).forEach(m => { if (m && m.ump) b.add(m.ump); });
  tableList(t).forEach(({ k }) => {
    if (occ[k]) return;
    const m = pick(t, k, cand, b, used);
    if (m) { used.add(m); pl2(m).forEach(p => b.add(p)); as.push([m, k]); }
  });
  // Papan yang masih kosong: pecahkan pertemuan trio/kuartet kalah mati (perlawanan lain dimainkan serentak)
  const taken = new Set([...Object.keys(occ).map(Number), ...as.map(x => x[1])]), xs = [], given = new Set();
  const ties = [...Object.values(occ), ...as.map(x => x[0])].filter((m, i, A) => A.indexOf(m) === i && canSplit(t, m));
  tableList(t).forEach(({ k }) => {
    if (taken.has(k)) return;
    // agih sama rata: pertemuan yang paling sedikit papan tambahan didahulukan
    const nAway = m => Object.keys(m.xt || {}).filter(i => !rubDone(t, m, +i)).length + [...given].filter(g => g.startsWith(m.id + ':')).length;
    for (const m of ties.slice().sort((x, y) => nAway(x) - nAway(y))) {
      // perlawanan yang sedang dijaga di papan utama (skor langsung) dan sebelumnya kekal di papan utama
      const cur = liveRiOf(t, m);
      let free = m.rubbers.map((_, i) => i).filter(i => !away(m, i) && !given.has(m.id + ':' + i) && !rubDone(t, m, i));
      if (cur != null) free = free.filter(i => i > cur); else if (free.length < 2) continue;   // papan utama kekal dengan sekurang-kurangnya satu perlawanan
      if (!free.length) continue;
      const i = free[free.length - 1]; given.add(m.id + ':' + i); taken.add(k); xs.push([m, i, k]); return;
    }
  });
  as.xs = xs;
  return as;
}
// Perlawanan seterusnya bagi setiap papan yang sedang digunakan
export function nextUp(t) {
  const { occ, xr, busy, cand } = liveState(t), used = new Set(), nx = {};
  tableList(t).forEach(({ k }) => {
    const cur = occ[k]; if (!cur || xr[k] != null) return;
    const b = new Set(busy); pl2(cur).forEach(p => b.delete(p));
    Object.values(nx).forEach(m => pl2(m).forEach(p => b.add(p)));
    const m = pick(t, k, cand, b, used);
    if (m) { used.add(m); nx[k] = m; }
  });
  return nx;
}

// ---------- Pengadil (peringkat kumpulan sahaja) ----------
// Regu bertukar: pemain yang tidak bermain dalam sesi itu menjadi pengadil (bergilir), selebihnya rehat
function mixUmpPlan(t) {
  const o = {}, du = {}, ids = (t.individuals || []).map(x => x.id);
  const byS = {}; t.matches.forEach(m => { if (m.px && m.session) (byS[m.session] = byS[m.session] || []).push(m); });
  Object.keys(byS).map(Number).sort((a, b) => a - b).forEach(s => {
    const ms = byS[s].sort((a, b) => (a.gi || 0) - (b.gi || 0)), pl = new Set(ms.flatMap(m => m.px)), nx = new Set((byS[s + 1] || []).flatMap(m => m.px));
    const free = ids.filter(id => !pl.has(id)), used = new Set();
    ms.forEach(m => {
      const c = free.filter(id => !used.has(id)).sort((x, y) => (du[x] || 0) - (du[y] || 0) || (nx.has(x) - nx.has(y)) || ids.indexOf(x) - ids.indexOf(y));
      if (c[0]) { o[m.id] = c[0]; used.add(c[0]); du[c[0]] = (du[c[0]] || 0) + 1; }
    });
  });
  return o;
}
// Pemain rehat (bukan bermain & bukan pengadil) bagi satu sesi regu bertukar
export function mixRestOf(t, s, U) {
  U = U || umpirePlan(t);
  const ms = t.matches.filter(m => m.px && m.session === s), busy = new Set(ms.flatMap(m => m.px));
  ms.forEach(m => { const u = umpireOf(t, m, U); if (u) busy.add(u); });
  return (t.individuals || []).map(x => x.id).filter(id => !busy.has(id));
}
export function umpirePlan(t) {
  if (t.entryMode === 'mixer') return mixUmpPlan(t);
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
  if (m.lt && m.ump) return m.ump;
  if (m.lt && m.ump !== undefined && t.entryMode !== 'mixer') return '';
  const u = (U || umpirePlan(t))[m.id] || '';
  if (u && m.lt && t.entryMode === 'mixer') {
    // pastikan pengadil dirancang tidak sedang bermain / mengadil di papan lain
    const other = t.matches.filter(x => x !== m && x.lt && x.status !== 'done');
    if (other.some(x => (x.px || []).includes(u) || x.ump === u)) return '';
  }
  return u;
}
function chooseUmp(t, m, busy, U) {
  if (m.stage !== 'group') return '';
  const pr = U[m.id], du = {};
  t.matches.forEach(x => { if (x.ump) du[x.ump] = (du[x.ump] || 0) + 1; });
  if (t.entryMode === 'mixer') {
    const c = (t.individuals || []).map(x => x.id).filter(p => !pl2(m).includes(p) && !busy.has(p));
    if (!mixFast(t)) return c.includes(pr) ? pr : c.sort((x, y) => (du[x] || 0) - (du[y] || 0))[0] || '';
    // mod papan pantas: pengadil diutamakan daripada pemain yang paling kurang baki perlawanan, kemudian tugas paling sedikit
    const pl = {}; t.matches.forEach(x => { if (x.px && (isDone(x) || x.lt)) x.px.forEach(id => (pl[id] = (pl[id] || 0) + 1)); });
    const need = id => ((t.mixG || {})[id] || 0) - (pl[id] || 0);
    return c.sort((x, y) => (need(x) - need(y)) || (du[x] || 0) - (du[y] || 0))[0] || '';
  }
  const g = t.groups.find(x => x.name === m.group);
  const c = (g ? g.members : []).filter(p => !pl2(m).includes(p) && !busy.has(p));
  if (c.includes(pr)) return pr;
  if (c.length) return c.sort((x, y) => (du[x] || 0) - (du[y] || 0))[0];
  const gDone = name => t.matches.every(x => x.stage !== 'group' || x.group !== name || isDone(x));
  const grpOf = id => (t.groups.find(x => x.members.includes(id)) || {}).name;
  const o = t.groups.filter(x => x.name !== m.group).flatMap(x => x.members).filter(p => !pl2(m).includes(p) && !busy.has(p));
  return o.sort((x, y) => (gDone(grpOf(y)) - gDone(grpOf(x))) || (du[x] || 0) - (du[y] || 0))[0] || '';
}

// Agih papan kosong (mengubah t). Pulangkan bilangan perlawanan yang diagih.
export function allocate(t) {
  const as = plan(t), xs = as.xs || [];
  xs.forEach(([m, i, k]) => { m.xt = { ...(m.xt || {}), [i]: k }; });
  if (!as.length) return xs.length;
  const U = umpirePlan(t), { live } = liveState(t), busy = new Set(), np = new Set();
  live.forEach(m => { pl2(m).forEach(p => busy.add(p)); if (m.ump) busy.add(m.ump); });
  as.forEach(([m]) => pl2(m).forEach(p => { busy.add(p); np.add(p); }));
  const up = new Map();
  as.forEach(([m]) => { const u = chooseUmp(t, m, busy, U); if (u) busy.add(u); up.set(m, u); });
  live.forEach(m => { if (m.ump && np.has(m.ump)) { const u = chooseUmp(t, m, busy, U); if (u) busy.add(u); m.ump = u; } });
  as.forEach(([m, k]) => { m.lt = k; m.tg = 0; m.ump = up.get(m) || ''; });
  return as.length + xs.length;
}
// Tangguh: keluarkan dari papan, letak di hujung giliran, kemudian agih semula
export function defer(t, mid) {
  const m = t.matches.find(x => x.id === mid); if (!m) return;
  const active = t.matches.some(x => x.lt && x.status !== 'done');
  m.lt = 0; m.tg = Date.now(); m.ump = ''; delete m.xt;
  if (active) allocate(t);
}
// Selepas skor disimpan: kosongkan papan perlawanan yang tamat dan agih semula jika sistem langsung sedang aktif
export function afterScore(t) {
  // m.lt dikekalkan pada perlawanan yang tamat (rekod papan); papan dikira kosong kerana perlawanan sudah tamat
  return t.matches.some(m => m.lt) ? allocate(t) : 0;
}

// ---------- Status peribadi ----------
export function myStatus(t, pid) {
  if (!pid) return null;
  const { live, cand } = liveState(t);
  if (!live.length) return null;
  const L = live.find(m => pl2(m).includes(pid));
  if (L) return { kind: 'play', table: L.lt, m: L };
  const Um = live.find(m => (m.ump || (t.entryMode === 'mixer' ? umpireOf(t, m) : '')) === pid);
  if (Um) return { kind: 'ump', table: Um.lt, m: Um };
  const nx = nextUp(t), N = Object.keys(nx).find(k => pl2(nx[k]).includes(pid));
  if (N) return { kind: 'ready', table: +N, m: nx[N] };
  const i = cand.findIndex(m => pl2(m).includes(pid));
  if (i >= 0) return { kind: 'wait', ahead: i, m: cand[i] };
  return { kind: 'none' };
}
