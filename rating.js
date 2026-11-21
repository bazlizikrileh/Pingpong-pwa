// Statistik & rating kelab (tiada UI, tiada Firebase — boleh diuji dalam node).
//
// Aliran: pertandingan tamat → "game" (satu perlawanan perseorangan/regu, atau satu rubber dalam pertandingan berpasukan)
// → nama pemain dipadankan dengan daftar pemain kelab (links) → Elo + statistik ikut ruang kelab.
import * as E from './engine.js';

// ---------- Organisasi & ruang kelab ----------
// Satu organisasi = satu daftar pemain dan satu rating. Ruang = tempat pertandingan dianjurkan (kumpulan).
export const ORGS = {
  ksasjb: { name: 'KSAS Johor Bahru', scheme: 'ksas', spaces: ['ksas', 'helang', 'singa', 'naga', 'nagaelit', 'ksasall', 'kroni'] },
  kskpkpjb: { name: 'KSKPKPJB', scheme: 'umum', spaces: ['kskpkpjb'] },
};
export const orgOf = space => Object.keys(ORGS).find(k => ORGS[k].spaces.includes(space)) || '';
// Kumpulan rasmi KSAS ↔ kod tahap KSAS (HC_SCHEMES.ksas)
export const KSAS_GROUP = { helang: 'H', ksas: 'R', singa: 'S', naga: 'N', nagaelit: 'NE' };
export const GROUP_SPACE = Object.fromEntries(Object.entries(KSAS_GROUP).map(([k, v]) => [v, k]));

export const key = n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
const loose = n => key(n).normalize('NFKD').replace(/[^a-z0-9]/g, '');

// ---------- Tahap ↔ rating ----------
// Rating permulaan ikut tahap / kumpulan yang diketahui; ambang cadangan = titik tengah antara tahap.
export const SEED = {
  ksas: { NE: 1700, N: 1600, S: 1500, R: 1400, H: 1300 },
  umum: { A: 1600, B: 1450, C: 1300 },
};
const KRONI_FROM_KSAS = { NE: 'N', N: 'N', S: 'L', R: 'T', H: 'H' };
const KSAS_FROM_KRONI = { N: 'N', L: 'S', LW: 'S', T: 'R', TW: 'R', H: 'H', HW: 'H' };
// Rating Elo ditangguhkan (KIV): statistik sahaja dipapar dan disimpan. Tukar ke true untuk hidupkan.
export const RATING_ON = false;
export const BASE = 1500;
export const PROVISIONAL = 8;   // bilangan game sebelum rating dianggap stabil

function band(r, seeds) {
  const L = Object.entries(seeds).sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < L.length - 1; i++) if (r >= (L[i][1] + L[i + 1][1]) / 2) return L[i][0];
  return L[L.length - 1][0];
}
// Cadangan tahap untuk skim handicap / imbang regu ('ksas' | 'umum' | 'kroni'); w = pemain wanita (Kroni)
export function suggestLevel(rating, scheme, w = false) {
  if (rating == null) return '';
  if (scheme === 'umum') return band(rating, SEED.umum);
  const k = band(rating, SEED.ksas);
  if (scheme === 'kroni') { const c = KRONI_FROM_KSAS[k]; return w && c !== 'N' ? c + 'W' : c; }
  return scheme === 'ksas' ? k : '';
}
// Rating permulaan pemain daripada maklumat daftar
export function seedOf(p, scheme) {
  if (!p) return BASE;
  if (scheme === 'umum' && SEED.umum[p.lv]) return SEED.umum[p.lv];
  if (SEED.ksas[p.group]) return SEED.ksas[p.group];
  if (p.kroni && SEED.ksas[KSAS_FROM_KRONI[p.kroni]]) return SEED.ksas[KSAS_FROM_KRONI[p.kroni]];
  if (SEED.umum[p.lv]) return SEED.umum[p.lv];
  return BASE;
}

// ---------- Pertandingan tamat? ----------
export function finished(t) {
  const ms = (t.matches || []).filter(m => m.a !== 'BYE' && m.b !== 'BYE');
  if (!ms.length) return false;
  if (E.isMixer(t)) return ms.every(m => m.status === 'done');
  return t.stage === 'done';
}

// ---------- Nama pemain dalam pertandingan ----------
export function namesOf(t) {
  const out = new Set();
  const add = n => { n = String(n || '').trim(); if (n && n !== 'BYE') out.add(n); };
  if (E.isMixer(t) || E.usesDraw(t)) (t.individuals || []).forEach(x => add(x.name));
  (t.participants || []).forEach(p => (E.isTeam(t) ? p.members || [] : p.members && p.members.length ? p.members : [p.name]).forEach(add));
  if (E.isTeam(t)) (t.matches || []).forEach(m => Object.values(m.lineup || {}).forEach(add));
  return [...out];
}

// ---------- Game daripada satu pertandingan ----------
// { mid, ri, kind: 'S'|'D', a: [nama], b: [nama], sa, sb, pa, pb, win: 'a'|'b'|'' (seri), hc }
function sideOf(t, m, side, ri) {
  if (E.isMixer(t)) { const px = m.px || []; return (side === 'a' ? px.slice(0, 2) : px.slice(2, 4)).map(id => E.pname(t, id)); }
  if (E.isTeam(t)) {
    const L = m.lineup || {}, types = E.rubberTypes(t), ty = types[ri];
    if (ty === 'D') return [L[side + 'd1'], L[side + 'd2']].filter(Boolean);
    const n = types.slice(0, ri + 1).filter(x => x === 'S').length;
    return [L[side + (n === 1 ? 's' : 's' + n)]].filter(Boolean);
  }
  const p = E.pobj(t, side === 'a' ? m.a : m.b) || {};
  return p.members && p.members.length ? p.members.slice() : [p.name].filter(Boolean);
}
export function gamesOf(t) {
  const out = [], hc = !!t.hcMode && t.hcMode !== 'off';
  for (const m of t.matches || []) {
    if (m.status !== 'done' || !m.a || !m.b || m.a === 'BYE' || m.b === 'BYE') continue;
    const r = E.evaluateMatch(t, m);
    if (E.isTeam(t)) {
      r.rubbers.forEach((x, ri) => {
        if (!x.complete || !(x.wa + x.wb)) return;
        const a = sideOf(t, m, 'a', ri), b = sideOf(t, m, 'b', ri), kind = E.rubberTypes(t)[ri];
        if (a.length !== (kind === 'D' ? 2 : 1) || b.length !== a.length) return;
        out.push({ mid: m.id, ri, kind, a, b, sa: x.wa, sb: x.wb, pa: x.pa, pb: x.pb, win: x.winner || '', hc });
      });
      continue;
    }
    const a = sideOf(t, m, 'a'), b = sideOf(t, m, 'b');
    if (!a.length || !b.length || !(r.sa + r.sb)) continue;
    const win = r.draw ? '' : m.winner === m.a ? 'a' : m.winner === m.b ? 'b' : '';
    if (!win && !r.draw) continue;
    out.push({ mid: m.id, ri: 0, kind: a.length > 1 ? 'D' : 'S', a, b, sa: r.sa, sb: r.sb, pa: r.pa, pb: r.pb, win, hc });
  }
  return out;
}
// Gelaran: tempat 1–3 (nama ahli bagi setiap penyertaan)
export function placesOf(t) {
  const out = {};
  let R = [];
  try { R = E.finalRanking(t); } catch { return out; }
  const lab = E.isMixer(t) ? { 1: 'Juara individu', 2: 'Naib juara individu', 3: 'Ketiga individu' } : t.format === 'rr' ? { 1: 'Juara liga', 2: 'Naib juara liga', 3: 'Ketiga liga' } : { 1: 'Johan', 2: 'Naib johan', 3: 'Separuh akhir' };
  for (const tr of R) tr.rows.forEach((row, i) => {
    const place = tr.ids.length > 1 && !E.isMixer(t) && t.format !== 'rr' ? tr.place : tr.place + i;
    const p = E.pobj(t, row.id);
    const names = E.isMixer(t) ? [E.pname(t, row.id)] : p ? (p.members && p.members.length ? p.members : [p.name]) : [];
    names.forEach(n => { out[key(n)] = { place, label: lab[place] || '' }; });
  });
  return out;
}

// ---------- Padanan nama → pemain ----------
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const q = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = q; } }
  return d[b.length];
}
// → { pid, how: 'tepat' | 'alias' | 'hampir' } atau null
export function autoMatch(name, players) {
  const k = key(name), l = loose(name);
  for (const p of players) if (key(p.name) === k) return { pid: p.id, how: 'tepat' };
  for (const p of players) if ((p.aliases || []).some(a => key(a) === k)) return { pid: p.id, how: 'alias' };
  for (const p of players) if ([p.name, ...(p.aliases || [])].some(a => loose(a) === l && l)) return { pid: p.id, how: 'hampir' };
  let best = null;
  if (l.length >= 4) for (const p of players) for (const a of [p.name, ...(p.aliases || [])]) {
    const d = lev(loose(a), l); if (d <= (l.length >= 7 ? 2 : 1) && (!best || d < best.d)) best = { pid: p.id, how: 'hampir', d };
  }
  return best ? { pid: best.pid, how: 'hampir' } : null;
}

// ---------- Pengiraan penuh ----------
// tours: pertandingan (sudah ditapis: tamat, bukan ujian, bukan Persendirian, dalam organisasi)
// links: { tid: { map: { kunciNama: pid | '' (tetamu) }, ok: true } } — hanya pertandingan disahkan dikira
// players: [{ id, name, aliases, group, kroni, lv, w }]
const blank = () => ({ t: 0, p: 0, w: 0, l: 0, d: 0, sf: 0, sa: 0, pf: 0, pa: 0, S: [0, 0], D: [0, 0], titles: [], mates: {}, opp: {}, tours: [] });
const sortKey = t => `${t.date || '0000-00-00'}|${t.startTime || '00:00'}|${String(t.createdAt || 0).padStart(15, '0')}`;
export function compute({ org, tours, links, players }) {
  const O = ORGS[org] || { scheme: 'ksas', spaces: [] }, scheme = O.scheme;
  const P = Object.fromEntries(players.map(p => [p.id, p]));
  const R = {}, n = {}, hist = {}, last = {};
  const rating = id => (R[id] ??= id.startsWith('g:') ? BASE : seedOf(P[id], scheme));
  const all = {}, by = {};       // statistik keseluruhan organisasi, dan ikut ruang
  const S = (space, id) => ((by[space] ||= {})[id] ||= blank());
  const counted = [];
  const list = tours.filter(t => links[t.id] && links[t.id].ok).sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  for (const t of list) {
    const map = links[t.id].map || {}, space = t.clubId;
    const pidOf = nm => { const k = key(nm); const v = map[k]; return v && P[v] ? v : 'g:' + k; };   // tetamu: rating sementara, tidak dipapar
    const before = {}, inT = new Set(), wl = {};
    const gs = gamesOf(t);
    for (const g of gs) {
      const A = g.a.map(pidOf), B = g.b.map(pidOf);
      [...A, ...B].forEach(id => { if (!(id in before)) before[id] = rating(id); inT.add(id); });
      const ra = A.reduce((s, id) => s + rating(id), 0) / A.length, rb = B.reduce((s, id) => s + rating(id), 0) / B.length;
      const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
      const sA = g.win === 'a' ? 1 : g.win === 'b' ? 0 : 0.5;
      const diff = Math.abs(g.sa - g.sb), mult = g.win ? Math.min(1.5, 1 + 0.25 * Math.max(0, diff - 1)) : 1;
      const kOf = id => (n[id] || 0) < PROVISIONAL ? 48 : 32;
      const f = (g.hc ? 0.5 : 1) * (g.kind === 'D' ? 0.75 : 1) * mult;
      A.forEach(id => (R[id] = rating(id) + kOf(id) * f * (sA - ea)));
      B.forEach(id => (R[id] = rating(id) + kOf(id) * f * ((1 - sA) - (1 - ea))));
      [...A, ...B].forEach(id => (n[id] = (n[id] || 0) + 1));
      // statistik
      const rec = (id, mine, other, side) => {
        if (id.startsWith('g:')) return;
        const won = g.win === side, drew = !g.win;
        const e = (wl[id] ||= [0, 0]); if (won) e[0]++; else if (!drew) e[1]++;
        for (const s of [all[id] ||= blank(), S(space, id)]) {
          s.p++; if (drew) s.d++; else if (won) s.w++; else s.l++;
          s.sf += side === 'a' ? g.sa : g.sb; s.sa += side === 'a' ? g.sb : g.sa;
          s.pf += side === 'a' ? g.pa : g.pb; s.pa += side === 'a' ? g.pb : g.pa;
          s[g.kind][0]++; if (won) s[g.kind][1]++;
          mine.filter(x => x !== id).forEach(m => { const k = m.startsWith('g:') ? '' : m; if (!k) return; const e = (s.mates[k] ||= [0, 0]); e[0]++; if (won) e[1]++; });
          other.forEach(o => { if (o.startsWith('g:')) return; const e = (s.opp[o] ||= [0, 0]); e[0]++; if (won) e[1]++; });
        }
      };
      A.forEach(id => rec(id, A, B, 'a')); B.forEach(id => rec(id, B, A, 'b'));
    }
    if (!gs.length) continue;
    counted.push(t.id);
    const pl = placesOf(t);
    for (const id of inT) {
      if (id.startsWith('g:')) continue;
      const name = Object.keys(map).find(k => map[k] === id) || '';
      const place = pl[name] || null;
      const entry = { id: t.id, n: t.name || '', d: t.date || '', sp: space, r0: Math.round(before[id]), r1: Math.round(R[id]), pl: place ? place.place : 0, w: (wl[id] || [0, 0])[0], l: (wl[id] || [0, 0])[1] };
      for (const s of [all[id], S(space, id)]) {
        s.t++; s.tours.push(entry);
        if (place && place.place <= 2 && place.label) s.titles.push({ id: t.id, n: t.name || '', d: t.date || '', l: place.label });
      }
      (hist[id] ||= []).push([t.date || '', Math.round(R[id])]);
      last[id] = Math.round(R[id]) - Math.round(before[id]);
    }
  }
  const row = (id, s) => {
    const p = P[id] || {};
    const r = id in R ? Math.round(R[id]) : Math.round(seedOf(p, scheme));
    return { id, n: p.name || '?', g: p.group || '', k: p.kroni || '', lv: p.lv || '', w: !!p.w, r, rn: n[id] || 0, dr: last[id] || 0,
      sug: { ksas: suggestLevel(r, 'ksas'), kroni: suggestLevel(r, 'kroni', !!p.w), umum: suggestLevel(r, 'umum') },
      h: (hist[id] || []).slice(-40), s: { ...s, tours: s.tours.slice(-30).reverse() } };
  };
  const at = Date.now();
  const spaces = {};
  for (const sp of O.spaces) {
    const ids = Object.keys(by[sp] || {});
    // ruang kumpulan KSAS: pemain berdaftar dalam kumpulan itu juga dipapar walaupun belum bermain
    const g = KSAS_GROUP[sp]; if (org === 'ksasjb' && g) players.forEach(p => { if (p.group === g && !ids.includes(p.id) && !p.off) ids.push(p.id); });
    spaces[sp] = { v: 1, at, org, space: sp, tids: list.filter(t => t.clubId === sp && counted.includes(t.id)).map(t => t.id),
      players: Object.fromEntries(ids.map(id => [id, row(id, (by[sp] || {})[id] || blank())])) };
  }
  const orgDoc = { v: 1, at, org, space: '_org', tids: counted, players: Object.fromEntries(players.map(p => [p.id, row(p.id, all[p.id] || blank())])) };
  return { spaces, org: orgDoc, ratings: Object.fromEntries(players.map(p => [p.id, { r: id2r(R, p, scheme), n: n[p.id] || 0 }])) };
}
const id2r = (R, p, scheme) => Math.round(p.id in R ? R[p.id] : seedOf(p, scheme));

// Papan kedudukan
export function board(doc, by = 'r') {
  const L = Object.values((doc && doc.players) || {});
  const pct = x => (x.s.p ? x.s.w / x.s.p : 0);
  const cmp = { r: (a, b) => b.r - a.r, w: (a, b) => b.s.w - a.s.w || pct(b) - pct(a), pct: (a, b) => pct(b) - pct(a) || b.s.p - a.s.p, p: (a, b) => b.s.p - a.s.p }[by] || ((a, b) => b.r - a.r);
  return L.sort((a, b) => (b.s.p > 0) - (a.s.p > 0) || cmp(a, b) || a.n.localeCompare(b.n));
}
