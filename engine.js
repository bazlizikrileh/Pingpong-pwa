// Logik pertandingan (tiada UI). Mengikut "Spesifikasi Portal Pingpong (KSAS & KSKPKPJB) untuk PWA".

export const uid = () => Math.random().toString(36).slice(2, 10);

// Fisher–Yates
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const GN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const pow2 = n => n > 0 && (n & (n - 1)) === 0;
const nextPow2 = n => { let s = 2; while (s < n) s *= 2; return s; };

// ---------- Format set ----------
export const SET_FORMATS = {
  '3': { bo: 3, full: false, label: 'Terbaik 3 set (2-0 / 2-1)' },
  '5': { bo: 5, full: false, label: 'Terbaik 5 set (3-0 / 3-1 / 3-2)' },
  'F3': { bo: 3, full: true, label: '3 set, semua dimainkan (3-0 / 2-1)' },
  'F2': { bo: 2, full: true, label: '2 set, kedua-dua dimainkan (2-0 / 1-1)' },
};
export const fmtFor = (t, stage) => (t.entryMode === 'mixer' ? SET_FORMATS[['5', 'F3'].includes(t.groupFormat) ? t.groupFormat : '3'] : SET_FORMATS[stage === 'group' ? t.groupFormat : t.koFormat] || SET_FORMATS['5']);

// ---------- Jenis acara ----------
// single · double (regu pilihan) · double_draw (regu diundi) · team (trio/kuartet diundi: 1 perseorangan + 1 regu)
export const isTeam = t => t.entryMode === 'team';
export const usesDraw = t => t.entryMode === 'double_draw' || t.entryMode === 'team' || t.entryMode === 'mixer';
export const isMixer = t => t.entryMode === 'mixer';
export const teamWord = t => (Number(t.teamSize) === 4 ? 'Kuartet' : 'Trio');

// ---------- Meja ----------
export const VENUES = { B: 'Balai B (Meja 1–4) · Balai C (Meja 5–8)', C: 'Balai C (Meja 5–8)', X: 'Lain-lain' };
export const numTablesOf = t => Number(t.numTables) || (isMixer(t) ? Math.max(1, Math.min(8, Math.floor((t.individuals || []).length / 4))) : t.participants.length <= 16 ? 4 : 8);
export function tablesOf(t) {
  const n = numTablesOf(t);
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    if (t.venue === 'X') return `Meja ${k}${t.venueName ? ` (${t.venueName})` : ''}`;
    if (t.venue === 'C' && n <= 4) return `Meja ${k + 4} (Balai C)`;
    return k <= 4 ? `Meja ${k} (Balai B)` : `Meja ${k} (Balai C)`;
  });
}

export function newTournament(opts = {}) {
  return migrate({
    id: uid(), name: 'Pertandingan Baharu', clubId: '', club: '', date: '', startTime: '21:00', sessionMin: 30,
    entryMode: 'single', teamSize: 3,
    format: 'group_ko',          // group_ko | rr (liga) | ko (kalah mati sahaja)
    numGroups: 0, groupSize: 4, qualifyPerGroup: 2, bestThirds: 0,
    groupFormat: '5', koFormat: '5',
    koMode: 'M',                 // M cermin (jika genap) | U undian
    pool: '0', poolMode: 'M',
    handicap: false,
    venue: 'B', venueName: '', numTables: 0,
    waMode: 'G', waGroup: '', waNumber: '',
    individuals: [], participants: [], groups: [], matches: [], rounds: {},
    stage: 'setup', createdAt: Date.now(),
    ...opts,
  });
}

export function migrate(t) {
  if (t.gameType && !t.entryMode) t.entryMode = t.gameType === 'regu' ? 'team' : t.gameType;
  if (t.bestOf && !t.groupFormat) { t.groupFormat = String(t.bestOf === 3 ? 3 : 5); t.koFormat = t.groupFormat; }
  t.groupFormat ||= '5'; t.koFormat ||= t.groupFormat;
  t.rounds ||= {}; t.individuals ||= []; t.groups ||= []; t.matches ||= [];
  t.pool ||= '0'; t.poolMode ||= 'M'; t.koMode ||= (t.mirror === false ? 'U' : 'M');
  t.bestThirds ??= 0; t.qualifyPerGroup ||= 2;
  if (!['B', 'C', 'X'].includes(t.venue)) t.venue = 'B';
  t.startTime ??= '21:00'; t.sessionMin ??= 30;
  t.waMode ||= 'G';
  t.hcMode ||= t.handicap ? 'manual' : 'off';
  t.handicap = t.hcMode !== 'off';
  t.levels ||= {};
  t.tieFormat ||= 'SD';
  t.tieRule ||= 'draw';
  if (t.groupSize > 5) t.groupSize = 5;
  if (t.groupSize < 4) t.groupSize = 4;
  for (const m of t.matches) {
    if (!m.rubbers) m.rubbers = [{ type: 'S', sets: m.sets || [] }];
    if (m.stage === 'ko' && !m.bracket) m.bracket = 'ko';
  }
  if (t.entryMode === 'mixer') {
    // Regu bertukar: terbaik 3 / 5 set atau 3 set semua dimainkan (tiada seri). Betulkan data lama yang guna format lain.
    if (!['3', '5', 'F3'].includes(t.groupFormat)) {
      t.groupFormat = '3';
      t.matches.forEach(m => { if (m.status !== 'done') return; const r = evaluateMatch(t, m);
        if (!r.complete || !r.winner) { m.winner = null; m.status = m.rubbers.some(x => x.sets.length) ? 'live' : 'pending'; } else m.winner = r.winner; });
    }
    mixCompact(t);
  }
  return t;
}

export const pobj = (t, id) => t.participants.find(p => p.id === id);
export const pname = (t, id) => (pobj(t, id) || {}).name || (id === 'BYE' ? 'BYE' : ((t.individuals || []).find(x => x.id === id) || {}).name || '—');

// "Nama, Unit (2)" → { name, unit, hc }
// Buang nombor penyertaan / bullet di depan (cth. "1. Ali", "02) Abu", "#3 - Ah Chong", "• Siti") dan tanda ✅ di belakang
export const cleanLine = line => String(line || '').trim()
  .replace(/^(?:[-•*·▪●◦]\s*)+/, '')
  .replace(/^(?:no\.?\s*)?#?\d{1,3}\s*(?:[.)\]:\-–—]+\s*|\s+(?=\D))/i, '')
  .replace(/^(?:[-•*·▪●◦]\s*)+/, '')
  .replace(/\s*(?:✅|☑️?|✔️?|✓)+\s*$/u, '').trim();
export function parseEntry(line) {
  let s = cleanLine(line), hc = 0, lv = '';
  const m = s.match(/\((\d+)\)\s*$/);
  if (m) { hc = Math.min(5, Number(m[1])); s = s.replace(/\s*\(\d+\)\s*$/, ''); }
  const L = s.match(/\(([^()]*[A-Za-z][^()]*)\)\s*$/);
  if (L) { lv = L[1].trim(); s = s.replace(/\s*\([^()]*\)\s*$/, ''); }
  const k = s.indexOf(',');
  const name = (k >= 0 ? s.slice(0, k) : s).trim().replace(/\s*(\/|&)\s*/g, ' & ');
  const unit = k >= 0 ? s.slice(k + 1).trim() : '';
  return { name, unit, hc, lv };
}

export function setParticipantsFromLines(t, lines) {
  const old = Object.fromEntries(t.participants.map(p => [p.name, p.id]));
  const es = lines.map(s => s.trim()).filter(Boolean).map(parseEntry).filter(e => e.name);
  t.participants = es.map(e => ({ id: old[e.name] || uid(), name: e.name, unit: e.unit, hc: e.hc, members: e.name.split(' & ') }));
  es.forEach(e => takeLevel(t, e));
}
export const setParticipants = setParticipantsFromLines;

export function setIndividualsFromLines(t, lines) {
  const es = lines.map(s => s.trim()).filter(Boolean).map(parseEntry).filter(e => e.name);
  const old = Object.fromEntries((t.individuals || []).map(x => [x.name, x.id]));
  t.individuals = es.map(e => ({ id: old[e.name] || uid(), name: e.name, unit: e.unit, ...(e.lv ? { lv: e.lv } : {}) }));
  es.forEach(e => takeLevel(t, e));
}

// Undian regu/trio: kocok, potong ikut turutan (kad 1–3 = Trio 1 …)
export function drawUnits(t) {
  const size = isTeam(t) ? (Number(t.teamSize) || 3) : 2;
  const ind = t.individuals;
  if (ind.length < size * 2) throw new Error(`Perlu sekurang-kurangnya ${size * 2} peserta`);
  if (ind.length % size) throw new Error(`Bilangan peserta (${ind.length}) mesti gandaan ${size}. Tambah ${size - ind.length % size} atau buang ${ind.length % size} peserta.`);
  // Kad dicabut satu persatu; setiap pusingan, satu nama ke setiap regu dalam susunan rawak
  // (semua regu dapat orang pertama dahulu, barulah orang kedua, dan seterusnya)
  const s = shuffle(ind), n = s.length / size, units = Array.from({ length: n }, () => []), order = [];
  for (let r = 0; r < size; r++) {
    const perm = shuffle([...Array(n).keys()]);
    perm.forEach((u, j) => units[u].push(s[r * n + j]));
    order.push(perm);
  }
  t.drawOrder = { ...(t.drawOrder || {}), units: order };
  t.participants = units.map((u, i) => ({
    id: uid(),
    name: isTeam(t) ? `${teamWord(t)} ${i + 1}` : u.map(x => x.name).join(' & '),
    members: u.map(x => x.name),
    unit: [...new Set(u.map(x => x.unit).filter(Boolean))].join(' / '),
    hc: 0,
  }));
  return 0;
}

// ---------- Handicap ----------
export function handicapInfo(t, a, b, rubber = 0, lineup = null) {
  if (!t.handicap || !a || !b || a === 'BYE' || b === 'BYE') return null;
  if (t.hcMode && t.hcMode !== 'manual') return levelHandicap(t, a, b, rubber, lineup);
  const ha = (pobj(t, a) || {}).hc || 0, hb = (pobj(t, b) || {}).hc || 0;
  const n = Math.min(5, Math.abs(ha - hb));
  return n ? { to: ha < hb ? a : b, n } : { to: null, n: 0 };
}

// ---------- Perlawanan & skor ----------
export function blankMatch(t, m) {
  return {
    id: uid(), winner: null, status: 'pending', table: '', session: 0,
    rubbers: rubberTypes(t).map(type => ({ type, sets: [] })),
    lineup: null, override: null, ...m,
  };
}

function evalRubber(f, sets) {
  const valid = sets.filter(([x, y]) => x !== '' && y !== '' && x != null && y != null && Number(x) !== Number(y));
  let wa = 0, wb = 0, pa = 0, pb = 0;
  for (const [x, y] of valid) { if (+x > +y) wa++; else wb++; pa += +x; pb += +y; }
  const need = Math.floor(f.bo / 2) + 1;
  const complete = f.full ? valid.length >= f.bo : (wa >= need || wb >= need);
  return { wa, wb, pa, pb, complete, winner: complete && wa !== wb ? (wa > wb ? 'a' : 'b') : null };
}

export function evaluateMatch(t, m) {
  const f = fmtFor(t, m.stage);
  const R = m.rubbers.map(r => evalRubber(f, r.sets));
  const o = { ra: 0, rb: 0, sa: 0, sb: 0, pa: 0, pb: 0, complete: false, winner: null, draw: false, rubbers: R };
  o.ma = 0; o.mb = 0;   // markah pertemuan S+S+D: setiap perlawanan menang 3, seri 1
  for (const r of R) {
    o.sa += r.wa; o.sb += r.wb; o.pa += r.pa; o.pb += r.pb;
    if (r.winner === 'a') { o.ra++; o.ma += 3; } else if (r.winner === 'b') { o.rb++; o.mb += 3; }
    else if (r.complete) { o.ma += 1; o.mb += 1; }
  }
  o.complete = R.length > 0 && R.every(r => r.complete);
  if (!o.complete) return o;
  let side = null;
  const drawOk = m.stage === 'group' && t.tieRule !== 'next' && !isMixer(t);
  if (isTeam(t) && t.tieFormat === 'SSD') {
    // S+S+D: semua 3 perlawanan dimainkan; setiap perlawanan menang 3 markah, seri (1-1) 1 markah.
    // Pemenang = jumlah markah. Markah sama → peringkat kumpulan: seri (tieRule 'draw', lalai)
    // atau penentu beza set, kemudian jumlah mata (tieRule 'next'; juga untuk kalah mati).
    if (o.ma !== o.mb) side = o.ma > o.mb ? 'a' : 'b';
    else if (drawOk) o.draw = true;
    else if (o.sa !== o.sb) side = o.sa > o.sb ? 'a' : 'b';
    else if (o.pa !== o.pb) side = o.pa > o.pb ? 'a' : 'b';
    else if (m.override === m.a || m.override === m.b) o.winner = m.override;
    else o.needsDecision = true;
  } else if (o.ra !== o.rb) side = o.ra > o.rb ? 'a' : 'b';
  else if (m.stage === 'group' && (isTeam(t) || drawOk)) o.draw = true;
  else if (o.sa !== o.sb) side = o.sa > o.sb ? 'a' : 'b';
  else if (o.pa !== o.pb) side = o.pa > o.pb ? 'a' : 'b';
  else if (m.override === m.a || m.override === m.b) o.winner = m.override;
  else o.needsDecision = true;
  if (side) o.winner = side === 'a' ? m.a : m.b;
  return o;
}

export function recordScore(t, matchId, rubberSets, extra = {}) {
  const m = t.matches.find(x => x.id === matchId);
  if (!m) throw new Error('Perlawanan tidak dijumpai');
  rubberSets.forEach((sets, i) => {
    if (!m.rubbers[i]) return;
    m.rubbers[i].sets = sets.filter(s => s[0] !== '' && s[1] !== '' && s[0] != null && s[1] != null).map(([x, y]) => [Number(x) || 0, Number(y) || 0]);
  });
  if ('lineup' in extra) m.lineup = extra.lineup;
  if ('override' in extra) m.override = extra.override;
  const r = evaluateMatch(t, m);
  m.winner = r.winner;
  const any = m.rubbers.some(x => x.sets.length);
  m.status = (r.complete && (r.winner || r.draw)) ? 'done' : any ? 'live' : 'pending';
  if (m.stage !== 'group') propagate(t, m.bracket);
  else resolvePlaceholders(t);
  updateStage(t);
  return m;
}

// ---------- Kumpulan ----------
// Turutan round robin (sama seperti portal): 3 → 12,13,23 · 4 → 12,34,13,24,14,23
export function rrOrder(n) {
  if (n === 2) return [[0, 1]];
  if (n === 3) return [[0, 1], [0, 2], [1, 2]];
  if (n === 4) return [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
  const list = Array.from({ length: n }, (_, i) => i);
  if (n % 2) list.push(null);
  const L = list.length, out = [];
  for (let r = 0; r < L - 1; r++) {
    for (let i = 0; i < L / 2; i++) {
      const a = list[i], b = list[L - 1 - i];
      if (a != null && b != null) out.push(a < b ? [a, b] : [b, a]);
    }
    list.splice(1, 0, list.pop());
  }
  return out;
}

export function groupCount(t) {
  if (t.format === 'rr') return 1;
  const n = t.participants.length;
  if (t.numGroups) return Math.max(1, Math.min(t.numGroups, Math.floor(n / 2)));
  return Math.max(1, Math.ceil(n / (t.groupSize || 4)));
}

// Cabutan: kocok, agih seperti membahagi kad A, B, C … kembali ke A
export function drawGroups(t) {
  const ids = shuffle(t.participants.map(p => p.id));
  const G = groupCount(t);
  const groups = Array.from({ length: G }, (_, i) => ({ name: GN[i], members: [] })), order = [];
  // Setiap pusingan: satu nama ke setiap kumpulan, susunan kumpulan rawak.
  // Pusingan terakhir yang tidak penuh kekal ke kumpulan awal (A, B…) supaya saiz kumpulan ikut peraturan, tetapi susunannya rawak.
  for (let r = 0; r * G < ids.length; r++) {
    const left = Math.min(G, ids.length - r * G), perm = shuffle([...Array(left).keys()]);
    perm.forEach((gi, j) => groups[gi].members.push(ids[r * G + j]));
    order.push(perm);
  }
  t.drawOrder = { ...(t.drawOrder || {}), groups: order };
  setGroups(t, groups);
}

// Import kumpulan yang telah diundi: "A | Nama1 / Nama2 (2) | Nama3 | …"
export function importGroups(t, lines) {
  const groups = [], parts = [];
  for (const l of lines.map(x => x.trim()).filter(Boolean)) {
    const cols = l.split('|').map(x => x.trim()).filter(Boolean);
    if (cols.length < 2) throw new Error(`Baris tidak sah: "${l.slice(0, 40)}". Format: A | Nama | Nama …`);
    const g = cols[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
    if (!g) throw new Error(`Huruf kumpulan tiada: "${l.slice(0, 40)}"`);
    let grp = groups.find(x => x.name === g);
    if (!grp) { grp = { name: g, members: [] }; groups.push(grp); }
    for (const c of cols.slice(1)) {
      const e = parseEntry(c);
      const p = { id: uid(), name: e.name, unit: e.unit, hc: e.hc, members: e.name.split(' & ') };
      parts.push(p); grp.members.push(p.id);
    }
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  t.participants = parts;
  if (t.format === 'ko') t.format = 'group_ko';
  setGroups(t, groups);
}

function setGroups(t, groups) {
  t.groups = groups;
  const lists = groups.map(g => rrOrder(g.members.length).map(([i, j]) => [g.members[i], g.members[j]]));
  const max = Math.max(...lists.map(l => l.length));
  const matches = [];
  let gn = 1;
  for (let k = 0; k < max; k++) groups.forEach((g, gi) => {
    const p = lists[gi][k];
    if (p) matches.push(blankMatch(t, { stage: 'group', group: g.name, gi, round: k + 1, gn: gn++, a: p[0], b: p[1] }));
  });
  t.matches = matches; t.rounds = {};
  t.stage = 'group';
  earlyBracket(t);
  planSchedule(t);
}

// ---------- Kedudukan kumpulan ----------
function emptyRow(id) { return { id, p: 0, w: 0, d: 0, l: 0, pts: 0, sf: 0, sa: 0, pf: 0, pa: 0 }; }
function addResult(row, r, side, m, marks) {
  const me = side === 'a';
  row.p++;
  row.sf += me ? r.sa : r.sb; row.sa += me ? r.sb : r.sa;
  row.pf += me ? r.pa : r.pb; row.pa += me ? r.pb : r.pa;
  if (r.draw) { row.d++; row.pts += marks ? (me ? r.ma : r.mb) : 1; }
  else if (m.winner === (me ? m.a : m.b)) { row.w++; row.pts += marks ? (me ? r.ma : r.mb) : 3; }
  else { row.l++; if (marks) row.pts += me ? r.ma : r.mb; }
}
// Kuartet S+S+D: mata kedudukan = jumlah markah perlawanan (3 menang, 1 seri)
export const usesMarks = t => isTeam(t) && t.tieFormat === 'SSD';
const gMatches = (t, g) => t.matches.filter(m => m.stage === 'group' && m.group === g && m.status === 'done');

// Pisah senarai kepada blok ikut nilai (menurun)
function splitBy(list, f) {
  const s = list.slice().sort((x, y) => f(y) - f(x)), out = [];
  for (const r of s) {
    if (out.length && f(out[out.length - 1][0]) === f(r)) out[out.length - 1].push(r); else out.push([r]);
  }
  return out;
}

const _stCache = new WeakMap();
export function groupStandings(t, groupName) {
  const g = t.groups.find(x => x.name === groupName);
  if (!g) return [];
  const rows = Object.fromEntries(g.members.map(id => [id, emptyRow(id)]));
  const done = gMatches(t, groupName);
  const MK = usesMarks(t);
  for (const m of done) { const r = evaluateMatch(t, m); addResult(rows[m.a], r, 'a', m, MK); addResult(rows[m.b], r, 'b', m, MK); }
  // 1 mata, 2 beza perlawanan, 3 beza set  (S+S+D: 1 markah, 2 beza set)
  const key = r => MK ? [r.pts, r.sf - r.sa, 0] : [r.pts, r.w - r.l, r.sf - r.sa];
  const cmpKey = (x, y) => { const a = key(x), b = key(y); return (b[0] - a[0]) || (b[1] - a[1]) || (b[2] - a[2]); };
  // 4 bersemuka sesama yang masih seri, 5 beza mata; diulang bagi blok yang lebih kecil
  const resolve = S => {
    if (S.length < 2) return S;
    const ids = new Set(S.map(r => r.id)), h = Object.fromEntries(S.map(r => [r.id, 0]));
    for (const m of done) if (ids.has(m.a) && ids.has(m.b)) {
      const r = evaluateMatch(t, m);
      if (MK) { h[m.a] += r.ma; h[m.b] += r.mb; }
      else if (r.draw) { h[m.a] += 1; h[m.b] += 1; } else h[m.winner] += 3;
    }
    const out = [];
    for (const part of splitBy(S, r => h[r.id])) {
      if (part.length > 1 && part.length < S.length) { out.push(...resolve(part)); continue; }
      for (const q of splitBy(part, r => r.pf - r.pa)) {
        if (q.length > 1 && q.length < S.length) out.push(...resolve(q));
        else out.push(...q.sort((x, y) => pname(t, x.id).localeCompare(pname(t, y.id))));
      }
    }
    return out;
  };
  const sorted = Object.values(rows).sort(cmpKey);
  const out = [];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && cmpKey(sorted[i], sorted[j]) === 0) j++;
    out.push(...resolve(sorted.slice(i, j)));
    i = j;
  }
  return out;
}

export const groupStageComplete = t => {
  const gm = t.matches.filter(m => m.stage === 'group');
  return gm.length > 0 && gm.every(m => m.status === 'done');
};

// Perbandingan merentas kumpulan: jika saiz kumpulan tidak sama, keputusan menentang
// pemain tempat terakhir kumpulan yang lebih besar tidak dikira.
export function crossStats(t, id) {
  const g = t.groups.find(x => x.members.includes(id));
  if (!g) return emptyRow(id);
  const minSize = Math.min(...t.groups.map(x => x.members.length));
  const st = groupStandings(t, g.name);
  const last = g.members.length > minSize ? st[st.length - 1].id : null;
  const row = emptyRow(id);
  for (const m of gMatches(t, g.name)) {
    if (m.a !== id && m.b !== id) continue;
    if (last && last !== id && (m.a === last || m.b === last)) continue;
    addResult(row, evaluateMatch(t, m), m.a === id ? 'a' : 'b', m);
  }
  return row;
}
const cmpCross = t => (x, y) => {
  const A = crossStats(t, x), B = crossStats(t, y);
  return (B.pts - A.pts) || ((B.w - B.l) - (A.w - A.l)) || ((B.sf - B.sa) - (A.sf - A.sa)) || ((B.pf - B.pa) - (A.pf - A.pa));
};
const placeOf = (t, g, k) => (groupStandings(t, g.name)[k - 1] || {}).id || null;

// ---------- Kalah mati & pool ----------
export function bracketOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2 + 1;
    order = order.flatMap(s => [s, n - s]);
  }
  return order;
}

export const canMirror = t => t.format === 'group_ko' && !Number(t.bestThirds) && t.qualifyPerGroup === 2 && t.groups.length >= 2 && pow2(t.groups.length);

// Senarai layak: [{id, g, tier}] tier 0 = johan, 1 = naib johan, 2 = tempat ketiga terbaik
export function koQualifiers(t) {
  const out = [];
  for (let k = 1; k <= t.qualifyPerGroup; k++)
    for (const g of t.groups) { const id = placeOf(t, g, k); if (id) out.push({ id, g: g.name, tier: k - 1 }); }
  const bt = Number(t.bestThirds) || 0;
  if (bt) {
    t.groups.map(g => ({ id: placeOf(t, g, t.qualifyPerGroup + 1), g: g.name })).filter(x => x.id)
      .sort((a, b) => cmpCross(t)(a.id, b.id)).slice(0, bt)
      .forEach(x => out.push({ ...x, tier: t.qualifyPerGroup }));
  }
  return out;
}

export function poolEntrants(t) {
  if (t.pool === '0' || t.format !== 'group_ko') return [];
  const inKO = new Set(koQualifiers(t).map(x => x.id));
  const places = t.pool === '34' ? [3, 4] : [3];
  const out = [];
  places.forEach((k, i) => t.groups.forEach(g => {
    const id = placeOf(t, g, k);
    if (id && !inKO.has(id)) out.push({ id, g: g.name, tier: i });
  }));
  return out;
}

// Undian: tahap (penerima BYE, johan, naib johan, ketiga) dikocok; cuba banyak susunan dan
// pilih yang menjauhkan rakan sekumpulan (bertemu selewat mungkin).
export function drawBracket(t, entrants, tries = 1500) {
  const n = entrants.length, size = nextPow2(n), byes = size - n, R = Math.log2(size);
  const cmp = cmpCross(t);
  const tiers = [...new Set(entrants.map(e => e.tier))].sort((a, b) => a - b)
    .map(k => entrants.filter(e => e.tier === k).sort((a, b) => cmp(a.id, b.id)));
  const byeRecv = tiers.flat().slice(0, byes);
  const restTiers = tiers.map(tr => tr.filter(e => !byeRecv.includes(e)));
  const order = bracketOrder(size);
  const meetRound = (i, j) => { let r = 0; while (i !== j) { i >>= 1; j >>= 1; r++; } return r; };
  let best = null, bestCost = Infinity;
  for (let k = 0; k < tries && bestCost > 0; k++) {
    const seq = [...shuffle(byeRecv), ...restTiers.flatMap(tr => shuffle(tr))];
    const slots = order.map(s => seq[s - 1] || null);
    let cost = 0;
    for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++)
      if (slots[i] && slots[j] && slots[i].g === slots[j].g) cost += 2 ** (R - meetRound(i, j));
    if (cost < bestCost) { bestCost = cost; best = slots; }
  }
  return best.map(e => (e ? e.id : 'BYE'));
}
export const byeReceivers = (t, entrants) => {
  const n = entrants.length, byes = nextPow2(n) - n, cmp = cmpCross(t);
  const tiers = [...new Set(entrants.map(e => e.tier))].sort((a, b) => a - b)
    .map(k => entrants.filter(e => e.tier === k).sort((a, b) => cmp(a.id, b.id)));
  return tiers.flat().slice(0, byes).map(e => e.id);
};

// Susunan cermin berselang-seli: kumpulan ganjil (A, C, E…) di separuh atas, genap (B, D, F…) di separuh bawah,
// supaya johan kumpulan bersebelahan (A1 & B1) hanya bertemu di final.
const altOrder = n => [...Array.from({ length: n }, (_, i) => i).filter(i => i % 2 === 0), ...Array.from({ length: n }, (_, i) => i).filter(i => i % 2 === 1)];
export function mainSlots(t) {
  if (t.format === 'ko') {
    const ids = shuffle(t.participants.map(p => p.id));
    return bracketOrder(nextPow2(ids.length)).map(s => ids[s - 1] || 'BYE');
  }
  const G = t.groups;
  if (t.koMode !== 'U' && canMirror(t)) return altOrder(G.length).flatMap(i => [`P:${G[i].name}:1`, `P:${G[G.length - 1 - i].name}:2`]);
  return drawBracket(t, koQualifiers(t));
}

export const poolMirror = t => {
  const G = t.groups, full = k => G.every(g => g.members.length >= k);
  return t.format === 'group_ko' && t.pool !== '0' && t.poolMode !== 'U' && canMirror(t) && (t.pool === '3' ? full(3) : full(4));
};
export function poolSlots(t) {
  const G = t.groups, full = k => G.every(g => g.members.length >= k);
  const ent = poolMirror(t) ? [1, 2] : poolEntrants(t);
  if (ent.length < 2) return null;
  if (t.poolMode !== 'U' && canMirror(t)) {
    if (t.pool === '3' && full(3)) return altOrder(G.length / 2).flatMap(i => [`P:${G[i].name}:3`, `P:${G[G.length - 1 - i].name}:3`]);
    if (t.pool === '34' && full(4)) return altOrder(G.length).flatMap(i => [`P:${G[i].name}:3`, `P:${G[G.length - 1 - i].name}:4`]);
  }
  return drawBracket(t, ent);
}

export function buildBracket(t, bracket, slots) {
  const size = nextPow2(slots.length);
  slots = slots.slice(); while (slots.length < size) slots.push('BYE');
  const rounds = Math.log2(size), list = [];
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) {
      const m = blankMatch(t, { stage: bracket, bracket, round: r, slot: i, a: null, b: null });
      if (r === 1) {
        const isP = x => typeof x === 'string' && x.startsWith('P:');
        [['a', slots[2 * i]], ['b', slots[2 * i + 1]]].forEach(([s, v]) => { if (isP(v)) { m['src' + s.toUpperCase()] = v; m[s] = null; } else m[s] = v; });
      }
      list.push(m);
    }
  }
  t.matches = t.matches.filter(m => m.bracket !== bracket).concat(list);
  t.rounds[bracket] = rounds;
  resolvePlaceholders(t);
  propagate(t, bracket);
}

export function buildKO(t) {
  if (t.format === 'rr') throw new Error('Format liga tiada kalah mati');
  const slots = mainSlots(t);
  if (slots.filter(x => x !== 'BYE').length < 2) throw new Error('Perlu sekurang-kurangnya 2 peserta untuk kalah mati');
  buildBracket(t, 'ko', slots);
  const ps = t.format === 'group_ko' ? poolSlots(t) : null;
  if (ps) buildBracket(t, 'pool', ps); else { t.matches = t.matches.filter(m => m.bracket !== 'pool'); delete t.rounds.pool; }
  numberKO(t); planSchedule(t); updateStage(t);
}

// Bina bracket daripada slot yang diberi (cth. data sejarah / ujian)
export function buildKOFromSlots(t, koSlots, poolSlotsArr) {
  buildBracket(t, 'ko', koSlots);
  if (poolSlotsArr) buildBracket(t, 'pool', poolSlotsArr);
  numberKO(t); planSchedule(t); updateStage(t);
}

function numberKO(t) {
  let g = Math.max(0, ...t.matches.filter(m => m.stage === 'group').map(m => m.gn || 0)), p = 0;
  for (const b of ['ko', 'pool']) for (let r = 1; r <= (t.rounds[b] || 0); r++)
    t.matches.filter(m => m.bracket === b && m.round === r).sort((x, y) => x.slot - y.slot).forEach(m => {
      if (m.status === 'bye') { m.gn = null; return; }
      m.gn = b === 'ko' ? ++g : ++p;
    });
}
export const matchCode = m => (m.gn == null ? '' : (m.bracket === 'pool' ? 'P' : 'G') + m.gn);

export function propagate(t, bracket) {
  const list = t.matches.filter(m => m.bracket === bracket);
  const R = t.rounds[bracket];
  if (!list.length || !R) return;
  const find = (r, s) => list.find(m => m.round === r && m.slot === s);
  for (let r = 1; r <= R; r++) for (const m of list.filter(x => x.round === r)) {
    if (r > 1) {
      const pa = find(r - 1, 2 * m.slot), pb = find(r - 1, 2 * m.slot + 1);
      const na = pa ? pa.winner : null, nb = pb ? pb.winner : null;
      if (m.a !== na || m.b !== nb) {
        m.a = na; m.b = nb; m.winner = null; m.status = 'pending'; m.override = null; m.lineup = null;
        m.rubbers.forEach(x => (x.sets = []));
      }
    }
    if (m.a === 'BYE' && m.b === 'BYE') { m.winner = 'BYE'; m.status = 'bye'; }
    else if (m.a === 'BYE' && m.b) { m.winner = m.b; m.status = 'bye'; }
    else if (m.b === 'BYE' && m.a) { m.winner = m.a; m.status = 'bye'; }
  }
}

const bracketDone = (t, b) => {
  const R = t.rounds[b]; if (!R) return true;
  const f = t.matches.find(m => m.bracket === b && m.round === R);
  return !!(f && f.winner && (f.status === 'done' || f.status === 'bye'));
};
function updateStage(t) {
  if (t.format === 'rr') { t.stage = groupStageComplete(t) ? 'done' : 'group'; return; }
  if (!t.rounds.ko || (t.groups.length && !groupStageComplete(t))) { if (t.stage !== 'setup') t.stage = 'group'; return; }
  t.stage = bracketDone(t, 'ko') && bracketDone(t, 'pool') ? 'done' : 'ko';
}

export function roundName(t, bracket, r) {
  const left = t.rounds[bracket] - r;
  const base = left === 0 ? 'Akhir' : left === 1 ? 'Separuh Akhir' : left === 2 ? 'Suku Akhir' : `${2 ** (left + 1)} Besar`;
  return bracket === 'pool' ? `Pool: ${base}` : base;
}

// Label asal kumpulan (A1, H2, C3)
export function seedLabel(t, id) {
  if (!id || id === 'BYE') return '';
  const g = t.groups.find(x => x.members.includes(id));
  if (!g) return '';
  const fx = groupFixed(t, g.name), k = Object.keys(fx).find(k => fx[k] === id);
  return k ? `${g.name}${k}` : '';
}

// ---------- Jadual sesi & meja ----------
// Simulasi dengan bilangan meja sebenar. Kumpulan: laluan 1 meja asal (kumpulan ke-i → meja i),
// laluan 2 meja kosong ambil perlawanan tertunggak kumpulan lain. Tiada unit bermain dua kali
// dalam sesi sama. Kalah mati selepas semua kumpulan; pusingan seterusnya selepas pusingan sebelumnya;
// kalah mati utama didahulukan berbanding pool.
export function planSchedule(t) {
  if (isMixer(t)) return; // jadual regu bertukar ditetapkan semasa jana pusingan
  const T = tablesOf(t), N = T.length;
  const real = id => id && id !== 'BYE';
  let s = 0;
  let pending = t.matches.filter(m => m.stage === 'group').sort((a, b) => a.gn - b.gn);
  while (pending.length) {
    s++;
    const busy = new Set(), used = new Array(N).fill(null);
    const free = m => !busy.has(m.a) && !busy.has(m.b);
    const take = (m, k) => { used[k] = m; busy.add(m.a); busy.add(m.b); m.session = s; m.table = T[k]; pending = pending.filter(x => x !== m); };
    for (let k = 0; k < N; k++) { const m = pending.find(x => (x.gi ?? 0) % N === k && free(x)); if (m) take(m, k); }
    for (let k = 0; k < N; k++) if (!used[k]) { const m = pending.find(free); if (m) take(m, k); }
    if (!used.some(Boolean)) break;
  }
  const brk = ['ko', 'pool'].filter(b => t.rounds[b]);
  const playable = m => m.status !== 'bye' && m.a !== 'BYE' && m.b !== 'BYE';
  let left = brk.flatMap(b => t.matches.filter(m => m.bracket === b && playable(m)))
    .sort((x, y) => (brk.indexOf(x.bracket) - brk.indexOf(y.bracket)) || (x.round - y.round) || (x.slot - y.slot));
  let guard = 0;
  while (left.length && guard++ < 300) {
    s++;
    const busy = new Set(); let k = 0;
    const ready = m => m.round === 1 || t.matches
      .filter(x => x.bracket === m.bracket && x.round === m.round - 1 && playable(x))
      .every(x => x.session && x.session < s);
    for (const m of left.slice()) {
      if (k >= N) break;
      if (!ready(m)) continue;
      if ((real(m.a) && busy.has(m.a)) || (real(m.b) && busy.has(m.b))) continue;
      m.session = s; m.table = T[k++]; busy.add(m.a); busy.add(m.b);
      left = left.filter(x => x !== m);
    }
  }
}

export function sessionTime(t, s) {
  if (!t.startTime || !s) return '';
  const [h, mi] = t.startTime.split(':').map(Number);
  const tot = h * 60 + mi + (s - 1) * (Number(t.sessionMin) || 30);
  const H = Math.floor(tot / 60) % 24, M = tot % 60;
  return `${H % 12 || 12}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`;
}
export const lastSession = t => Math.max(0, ...t.matches.map(m => m.session || 0));

// ---------- Statistik pemain (semua perlawanan, BYE tidak dikira) ----------
export function playerStats(t, id) {
  const s = { id, p: 0, w: 0, l: 0, d: 0, sf: 0, sa: 0, pf: 0, pa: 0 };
  for (const m of t.matches) {
    if (m.status !== 'done' || (m.a !== id && m.b !== id)) continue;
    const r = evaluateMatch(t, m), me = m.a === id;
    s.p++; s.sf += me ? r.sa : r.sb; s.sa += me ? r.sb : r.sa; s.pf += me ? r.pa : r.pb; s.pa += me ? r.pb : r.pa;
    if (r.draw) s.d++; else if (m.winner === id) s.w++; else s.l++;
  }
  s.a = s.p ? (s.sf - s.sa) / s.p : 0;   // (a) Set ±/main
  s.b = s.p ? s.sf / s.p : 0;           // (b) Set menang/main
  s.c = s.p ? (s.pf - s.pa) / s.p : 0;  // purata beza mata permainan
  return s;
}

// ---------- Ranking akhir ----------
// Tempat = pusingan terakhir dicapai (kalah mati, kemudian pool, kemudian peringkat kumpulan).
// Dalam Tempat sama: (a), (b), purata beza mata; kemudian naik bersemuka kumpulan (†).
export function finalRanking(t) {
  if (isMixer(t)) return mixStandings(t).map((r, i) => ({ place: i + 1, ids: [r.id], label: 'Individu', rows: [{ id: r.id, label: i === 0 ? 'Juara individu' : `#${i + 1}`, bumped: false, st: { ...r, a: 0, b: 0, c: 0 } }] }));
  if (t.format === 'rr') {
    const s = t.groups[0] ? groupStandings(t, t.groups[0].name) : [];
    return s.map((r, i) => ({ place: i + 1, ids: [r.id], label: 'Liga', rows: [{ id: r.id, label: i === 0 ? 'Juara liga' : `Liga #${i + 1}`, bumped: false, st: playerStats(t, r.id) }] }));
  }
  const gpos = {};
  for (const g of t.groups) groupStandings(t, g.name).forEach((r, i) => (gpos[r.id] = { g: g.name, i }));
  const tiers = [], placed = new Set();
  const addTier = (ids, label) => {
    ids = ids.filter(id => id && id !== 'BYE' && !placed.has(id));
    if (!ids.length) return;
    ids.forEach(id => placed.add(id));
    tiers.push({ ids, label });
  };
  const fromBracket = (b, pre) => {
    const R = t.rounds[b]; if (!R) return;
    const list = t.matches.filter(m => m.bracket === b);
    const f = list.find(m => m.round === R);
    if (f && f.winner && f.status === 'done') { addTier([f.winner], pre + 'Juara'); addTier([f.winner === f.a ? f.b : f.a], pre + 'Naib juara'); }
    for (let r = R - 1; r >= 1; r--) {
      const ids = list.filter(m => m.round === r && m.status === 'done' && m.winner).map(m => (m.winner === m.a ? m.b : m.a));
      addTier(ids, pre + roundName(t, b, r).replace('Pool: ', ''));
    }
  };
  fromBracket('ko', '');
  fromBracket('pool', 'Pool: ');
  addTier(t.participants.map(p => p.id), 'Peringkat kumpulan');
  const out = [];
  let n = 1;
  for (const tr of tiers) {
    const rows = tr.ids.map(id => ({ id, st: playerStats(t, id), bumped: false, label: tr.label }));
    rows.sort((x, y) => (y.st.a - x.st.a) || (y.st.b - x.st.b) || (y.st.c - x.st.c));
    for (let guard = 0; guard < 100; guard++) {
      let moved = false;
      for (let i = 0; i < rows.length && !moved; i++) for (let j = i + 1; j < rows.length && !moved; j++) {
        const A = gpos[rows[i].id], B = gpos[rows[j].id];
        if (A && B && A.g === B.g && B.i < A.i) { const [x] = rows.splice(j, 1); x.bumped = true; rows.splice(i, 0, x); moved = true; }
      }
      if (!moved) break;
    }
    out.push({ place: n, ids: rows.map(r => r.id), rows, label: tr.label });
    n += rows.length;
  }
  return out;
}

// ---------- Matriks keputusan ----------
export function matrix(t, groupName) {
  const ids = groupStandings(t, groupName).map(r => r.id);
  const cell = (a, b) => {
    const m = t.matches.find(x => x.stage === 'group' && x.status === 'done' && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
    if (!m) return null;
    const r = evaluateMatch(t, m), me = m.a === a;
    const [x, y] = tieScore(t, r), v = me ? [x, y] : [y, x];
    return { v, win: m.winner === a, draw: r.draw };
  };
  return { ids, rows: ids.map(a => ids.map(b => (a === b ? 'self' : cell(a, b)))) };
}

// ---------- Laporan WhatsApp ----------
export function stageLabel(t, m) {
  if (m.px) return `Sesi ${m.session || '-'}`;
  if (m.stage === 'group') return t.format === 'rr' ? 'Liga' : `Kumpulan ${m.group}`;
  return roundName(t, m.bracket, m.round);
}
export function reportText(t, m, rubberSets, umpire) {
  const r = evaluateMatch(t, { ...m, rubbers: rubberSets.map(s => ({ sets: s })) });
  const games = rubberSets.map((sets, i) => (rubberSets.length > 1 ? rubberLabel(t, i) + ': ' : '') +
    sets.map((s, k) => `G${k + 1}: ${s[0]}-${s[1]}`).join(', ')).join('\n');
  const team = isTeam(t);
  const res = r.complete && r.winner
    ? `${pname(t, r.winner)} menang ${Math.max(...tieScore(t, r))}-${Math.min(...tieScore(t, r))}${team && t.tieFormat === 'SSD' ? ' set' : ''}`
    : r.complete && r.draw ? `Seri ${r.ra}-${r.rb}` : `Belum tamat: game ${r.sa}-${r.sb}`;
  return ['*LAPOR KEPUTUSAN*', t.name,
    `${matchCode(m)} · ${stageLabel(t, m)}${m.table ? ' · ' + m.table.replace(/ \(.*\)/, '') : ''}`,
    `${pname(t, m.a)} lwn ${pname(t, m.b)}`, games, res, umpire ? `Pengadil: ${umpire}` : null, `(Kod: ${m.id})`]
    .filter(Boolean).join('\n');
}

export function parseReports(t, text) {
  const out = [];
  const blocks = text.split(/(?=\*?LAPOR KEPUTUSAN\*?)/i).filter(b => /\(Kod:/.test(b));
  for (const b of blocks) {
    const code = ((b.match(/\(Kod:\s*([^)]+)\)/) || [])[1] || '').trim();
    const m = t.matches.find(x => x.id === code);
    if (!m) { out.push({ ok: false, msg: `Kod ${code || '?'} tidak wujud` }); continue; }
    if (!m.a || !m.b || m.a === 'BYE' || m.b === 'BYE') { out.push({ ok: false, msg: `${matchCode(m)}: pemain belum ditentukan` }); continue; }
    if (!b.includes(pname(t, m.a)) || !b.includes(pname(t, m.b))) { out.push({ ok: false, msg: `${matchCode(m)}: nama pemain tidak sepadan` }); continue; }
    const rub = isTeam(t) ? [[], []] : [[]];
    let ri = 0;
    for (const l of b.split('\n')) {
      if (/^\s*Regu:/i.test(l)) ri = 1;
      for (const g of l.matchAll(/G\d+:\s*(\d+)\s*-\s*(\d+)/g)) rub[Math.min(ri, rub.length - 1)].push([+g[1], +g[2]]);
    }
    if (!rub.some(x => x.length)) { out.push({ ok: false, msg: `${matchCode(m)}: tiada skor` }); continue; }
    out.push({ ok: true, m, rub });
  }
  return out;
}

export function applyReports(t, text) {
  const msgs = []; let saved = 0;
  const fmt = rs => rs.map(x => x.map(s => s.join('-')).join(', ')).join(' | ');
  for (const r of parseReports(t, text)) {
    if (!r.ok) { msgs.push('⚠️ ' + r.msg); continue; }
    if (r.m.status === 'done') {
      if (JSON.stringify(r.m.rubbers.map(x => x.sets)) === JSON.stringify(r.rub)) { msgs.push(`${matchCode(r.m)}: sudah disimpan (sama), diabaikan`); continue; }
      msgs.push(`⚠️ ${matchCode(r.m)}: sudah disahkan dengan skor ${fmt(r.m.rubbers.map(x => x.sets))}. Laporan (${fmt(r.rub)}) TIDAK disimpan — betulkan melalui kad perlawanan.`);
      continue;
    }
    recordScore(t, r.m.id, r.rub); saved++;
    msgs.push(`✅ ${matchCode(r.m)}: ${pname(t, r.m.a)} lwn ${pname(t, r.m.b)} disimpan`);
  }
  return { saved, msgs };
}

// ---------- Tukar acara, reset & data ujian ----------
const isDrawMode = m => m === 'double_draw' || m === 'team' || m === 'mixer';
const unitWord = t => t.entryMode === 'team' ? teamWord(t).toLowerCase() : 'regu';
const drawHint = t => isMixer(t) ? 'Tekan Jana pusingan & jadual di Tetapan.' : `Tekan Undi untuk membentuk ${unitWord(t)}.`;
// Selaraskan senarai peserta selepas jenis acara ditukar (sebelum jadual dijana). Pulangkan notis.
export function switchEntry(t, from, fromSize) {
  const to = t.entryMode;
  if (from === to && (to !== 'team' || !fromSize || fromSize === t.teamSize)) return '';
  if (t.stage !== 'setup' || t.matches.length) return '';
  const flat = t.participants.flatMap(p => ((p.members || []).length > 1 ? p.members : [p.name]).map(n => ({ name: n, unit: p.unit || '' })));
  t.drawOrder = {};
  if (isDrawMode(to)) {
    let msg;
    if (!t.individuals.length && flat.length) {
      t.individuals = flat.map(x => ({ id: uid(), name: x.name, unit: x.unit }));
      msg = `Senarai ${t.individuals.length} pemain dipindah ke senarai individu. ${drawHint(t)}`;
    } else if (t.participants.length) msg = `Undian lama dikosongkan. Senarai ${t.individuals.length} individu dikekalkan; ${drawHint(t)}`;
    else msg = t.individuals.length ? `${t.individuals.length} individu sedia. ${drawHint(t)}` : '';
    t.participants = [];
    return msg;
  }
  const src = isDrawMode(from) && t.individuals.length ? t.individuals.map(x => ({ name: x.name, unit: x.unit || '' })) : flat;
  if (!src.length) return '';
  if (to === 'single') t.participants = src.map(x => ({ id: uid(), name: x.name, unit: x.unit, hc: 0, members: [x.name] }));
  else {
    const pairs = [];
    for (let i = 0; i + 1 < src.length; i += 2) pairs.push([src[i], src[i + 1]]);
    t.participants = pairs.map(([a, b]) => ({ id: uid(), name: `${a.name} & ${b.name}`, unit: [...new Set([a.unit, b.unit].filter(Boolean))].join(' / '), hc: 0, members: [a.name, b.name] }));
  }
  const left = to === 'double' && src.length % 2 ? ` (${src[src.length - 1].name} tiada pasangan, sila tambah)` : '';
  return `Senarai peserta disesuaikan untuk acara baharu: ${t.participants.length} ${to === 'single' ? 'pemain' : 'pasangan, nama dipasang ikut turutan'}${left}.`;
}
// Reset: all=false → padam jadual & kumpulan, kekalkan peserta; all=true → padam semua peserta juga
export function resetSchedule(t, all) {
  t.groups = []; t.matches = []; t.rounds = {}; t.stage = 'setup';
  t.drawOrder = isDrawMode(t.entryMode) && !all ? {} : { ...(t.drawOrder || {}), groups: undefined };
  if (all) { t.participants = []; t.individuals = []; t.drawOrder = {}; return 'Reset selesai. Semua peserta dan perlawanan dipadam.'; }
  if (isDrawMode(t.entryMode)) { t.participants = []; return `Jadual dipadam. Senarai individu dikekalkan; ${drawHint(t)}`; }
  return 'Jadual dipadam. Senarai peserta dikekalkan.';
}
export const TEST24 = ['Anep', 'Xin You', 'Ikram', 'Bazli', 'Andi', 'Wanthul', 'Asyraf', 'Pawi', 'Abg Rosli', 'Noran', 'Cherng bin', 'Fbi', 'AIL', 'Sam50', 'Tad Mad', 'Wan Alif', 'Lymi', 'Jurima', 'Ril', 'Muhaimi', 'Fsl', 'C.A', 'Syamrul', 'Amirul'];
export function seedTest24(t) {
  const N = TEST24;
  t.drawOrder = {};
  if (isDrawMode(t.entryMode)) {
    t.individuals = N.map(n => ({ id: uid(), name: n, unit: '' })); t.participants = [];
    return `24 individu ujian diisi. ${drawHint(t)}`;
  }
  if (t.entryMode === 'single') { t.participants = N.map(n => ({ id: uid(), name: n, unit: '', hc: 0, members: [n] })); t.individuals = []; return '24 pemain ujian diisi.'; }
  t.participants = Array.from({ length: 12 }, (_, i) => ({ id: uid(), name: `${N[2 * i]} & ${N[2 * i + 1]}`, unit: '', hc: 0, members: [N[2 * i], N[2 * i + 1]] }));
  t.individuals = [];
  return '12 pasangan ujian diisi (24 pemain).';
}

// ---------- Kedudukan pasti (clinched) & pemegang tempat P:<kump>:<tempat> ----------
// Kedudukan pemain dianggap pasti bila dia sudah tamat semua perlawanan kumpulan dan, walau apa pun
// keputusan baki, setiap pemain lain pasti di atas atau pasti di bawahnya (had mata, beza perlawanan,
// beza set, beza mata). Kumpulan yang tamat: semua kedudukan pasti.
const _fxCache = new WeakMap();
export function groupFixed(t, gName) {
  let c = _fxCache.get(t);
  const sig = t.matches.reduce((s, m) => s + (m.stage === 'group' ? (m.status === 'done' ? 1 : 0) + m.rubbers.map(r => r.sets.join()).join('|') : ''), '');
  if (!c || c.sig !== sig) { c = { sig, m: {} }; _fxCache.set(t, c); }
  if (c.m[gName]) return c.m[gName];
  const ms = t.matches.filter(m => m.stage === 'group' && m.group === gName && m.status !== 'bye');
  const o = {};
  c.m[gName] = o;
  if (!ms.length) return o;
  const st = groupStandings(t, gName);
  if (ms.every(m => m.status === 'done')) { st.forEach((r, i) => (o[i + 1] = r.id)); return o; }
  if (isTeam(t)) return o;
  const rem = ms.filter(m => m.status !== 'done'), f = fmtFor(t, 'group'), nd = f.full ? f.bo : Math.ceil(f.bo / 2);
  const B = st.map(r => {
    const k = rem.filter(m => m.a === r.id || m.b === r.id).length, md = r.w - r.l, sd = r.sf - r.sa, pd = r.pf - r.pa;
    return { id: r.id, k, lo: [r.pts, md - k, sd - nd * k, pd - 11 * nd * k], hi: [r.pts + 3 * k, md + k, sd + nd * k, pd + 11 * nd * k] };
  });
  const gt = (a, b) => { for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
  B.forEach(p => {
    if (p.k) return;
    let A = 0, L = 0;
    B.forEach(q => { if (q === p) return; if (gt(q.lo, p.hi)) A++; else if (gt(p.lo, q.hi)) L++; });
    if (A + L === B.length - 1) o[A + 1] = p.id;
  });
  return o;
}
export const placeholderLabel = src => {
  if (!src) return '';
  const [, g, k] = src.split(':');
  return (['', 'Johan ', 'Naib ', 'Ke-3 ', 'Ke-4 '][+k] || `Ke-${k} `) + g;
};
export function resolvePlaceholders(t) {
  let changed = false;
  for (const m of t.matches) {
    for (const s of ['a', 'b']) {
      const src = m['src' + s.toUpperCase()];
      if (!src) continue;
      const [, g, k] = src.split(':'), id = groupFixed(t, g)[+k] || null;
      if (m[s] !== id) {
        m[s] = id; m.winner = null; m.status = 'pending'; m.override = null; m.lineup = null; m.lt = 0;
        m.rubbers.forEach(x => (x.sets = []));
        changed = true;
      }
    }
  }
  if (changed) for (const b of ['ko', 'pool']) if (t.rounds[b]) propagate(t, b);
  return changed;
}
// Bracket cermin dijana bersama jadual kumpulan (pemegang tempat), supaya kalah mati boleh bermula
// sebaik kedudukan pasti diketahui.
export function earlyBracket(t) {
  if (t.format !== 'group_ko' || t.koMode === 'U' || !canMirror(t)) return false;
  buildBracket(t, 'ko', mainSlots(t));
  if (poolMirror(t)) buildBracket(t, 'pool', poolSlots(t));
  numberKO(t);
  return true;
}
// Pool kalah (undian) boleh dijana awal bila semua peserta pool sudah pasti kedudukannya
export function poolReady(t) {
  if (t.format !== 'group_ko' || t.pool === '0') return false;
  if (groupStageComplete(t)) return true;
  if (Number(t.bestThirds)) return false;
  const need = t.pool === '34' ? [3, 4] : [3];
  return t.groups.every(g => { const fx = groupFixed(t, g.name); return need.filter(k => k <= g.members.length).every(k => fx[k]); });
}
export function buildPool(t) {
  const ps = poolSlots(t);
  if (!ps) throw new Error('Tiada peserta pool kalah');
  buildBracket(t, 'pool', ps);
  numberKO(t); planSchedule(t); updateStage(t);
}

// ---------- Handicap ikut tahap (KSAS dalaman / Kroni Shell) ----------
export const HC_SCHEMES = {
  ksas: { name: 'KSAS dalaman', capS: 99, capD: 5, levels: [
    ['NE', 'Naga Elit', 7, 5], ['N', 'Naga', 5, 3], ['S', 'Singa', 2, 2], ['R', 'Rimau', 1, 1], ['H', 'Helang', 0, 0]] },
  umum: { name: 'Umum (Kuat / Sederhana / Baru)', capS: 99, capD: 5, levels: [
    ['A', 'Kuat', 4, 2], ['B', 'Sederhana', 2, 1], ['C', 'Baru', 0, 0]] },
  kroni: { name: 'Kroni Shell', capS: 99, capD: 5, levels: [
    ['N', 'Naga', 6, 5], ['L', 'Lion', 4, 4], ['LW', 'Lion (W)', 3, 3], ['T', 'Tiger', 2, 2], ['TW', 'Tiger (W)', 1, 1], ['H', 'Helang', 1, 1], ['HW', 'Helang (W)', 0, 0]] },
};
export const rubberTypes = t => !isTeam(t) ? ['S'] : t.tieFormat === 'SSD' ? ['S', 'S', 'D'] : ['S', 'D'];
const lvKey = n => String(n || '').trim().toLowerCase();
// Teks tahap → kod (cth. "Naga Elit", "ne", "singa", "lion w", "wanita tiger", "Helang (W)")
export const lvScheme = t => HC_SCHEMES[t.hcMode] ? t.hcMode : HC_SCHEMES[t.mixLv] ? t.mixLv : '';
export function parseLevel(t, txt) {
  const S = HC_SCHEMES[lvScheme(t)]; if (!S || !txt) return '';
  let s = lvKey(txt).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const w = /\b(w|wanita|perempuan|p|f)\b/.test(s); s = s.replace(/\b(w|wanita|perempuan|lelaki|l|m|p|f)\b/g, '').trim();
  if (lvScheme(t) === 'umum') { const u = { kuat: 'A', a: 'A', sederhana: 'B', b: 'B', baru: 'C', lemah: 'C', c: 'C' }[s]; return u || (S.levels.some(l => l[0] === txt) ? txt : ''); }
  const alias = { 'naga elit': 'NE', 'naga elite': 'NE', 'elit': 'NE', 'elite': 'NE', 'ne': 'NE', naga: 'N', n: 'N', singa: 'S', lion: 'S', s: 'S', rimau: 'R', tiger: 'R', harimau: 'R', r: 'R', helang: 'H', eagle: 'H', h: 'H' };
  let c = alias[s] || '';
  if (lvScheme(t) === 'kroni') c = ({ N: 'N', S: 'L', R: 'T', H: 'H' })[c] || '';
  if (!c) return S.levels.some(l => l[0] === txt) ? txt : '';
  if (lvScheme(t) === 'kroni' && w && c !== 'N') c += 'W';
  return S.levels.some(l => l[0] === c) ? c : '';
}
function takeLevel(t, e) {
  if (!e.lv) return;
  const c = parseLevel(t, e.lv);
  if (c) e.name.split(' & ').forEach(n => { if (!e.name.includes(' & ') || true) t.levels[lvKey(n)] = c; });
}
export const levelOf = (t, name) => (t.levels || {})[lvKey(name)] || '';
export function levelInfo(t, code) { const S = HC_SCHEMES[lvScheme(t)]; return S && S.levels.find(l => l[0] === code) || null; }
export function setLevel(t, name, code) { t.levels ||= {}; if (code) t.levels[lvKey(name)] = code; else delete t.levels[lvKey(name)]; }
// Nilai: S = single, D = double
export const lvVal = (t, name, kind) => { const L = levelInfo(t, levelOf(t, name)); return L ? (kind === 'S' ? L[2] : L[3]) : null; };
// Pemain yang terlibat bagi satu pihak dalam perlawanan/rubber
function sideNames(t, id, rubber, lineup, side) {
  const p = pobj(t, id) || { name: '', members: [] };
  if (!isTeam(t)) return p.members && p.members.length ? p.members : [p.name];
  const L = lineup || {}, k = side;
  const types = rubberTypes(t), ty = types[rubber];
  if (ty === 'D') return [L[k + 'd1'], L[k + 'd2']].filter(Boolean);
  const nthS = types.slice(0, rubber + 1).filter(x => x === 'S').length;
  return [L[k + (nthS === 1 ? 's' : 's' + nthS)]].filter(Boolean);
}
export function levelHandicap(t, a, b, rubber = 0, lineup = null) {
  const S = HC_SCHEMES[t.hcMode]; if (!S) return null;
  const kind = isTeam(t) ? rubberTypes(t)[rubber] : (t.entryMode === 'single' ? 'S' : 'D');
  const na = sideNames(t, a, rubber, lineup, 'a'), nb = sideNames(t, b, rubber, lineup, 'b');
  const need = kind === 'D' ? 2 : 1;
  if (na.length < need || nb.length < need) return { to: null, n: 0, pending: true, kind };
  const va = na.map(n => lvVal(t, n, kind)), vb = nb.map(n => lvVal(t, n, kind));
  if (va.concat(vb).some(v => v == null)) return { to: null, n: 0, missing: true, kind };
  const sa = va.reduce((x, y) => x + y, 0), sb = vb.reduce((x, y) => x + y, 0);
  const n = Math.min(kind === 'D' ? S.capD : S.capS, Math.abs(sa - sb));
  return { to: n ? (sa < sb ? a : b) : null, n, kind, sa, sb };
}

// Skor utama pertemuan: SD = perlawanan dimenangi; SSD & bukan pasukan = set
export const tieScore = (t, r) => !isTeam(t) ? [r.sa, r.sb] : t.tieFormat === 'SSD' ? [r.ma, r.mb] : [r.ra, r.rb];
export function rubberLabel(t, i) {
  const ty = rubberTypes(t);
  if (t.tieFormat === 'SSD') return ty[i] === 'D' ? 'Double' : `Single ${ty.slice(0, i + 1).filter(x => x === 'S').length}`;
  return i === 0 ? 'Perseorangan' : 'Regu';
}


// ---------- Regu bertukar (pasangan diundi setiap pusingan) ----------
// Setiap pusingan: pemain diundi menjadi regu baharu. Elak pasangan berulang, kurangkan lawan berulang,
// dan (jika tahap ditetapkan) imbangkan jumlah tahap dua pihak. Pemain lebihan rehat secara bergilir.
export const mixRoundsAuto = n => (n % 2 ? n : n - 1);
// Bilangan pemain yang bermain setiap pusingan (dihadkan oleh bilangan meja) dan pusingan auto supaya semua main sama banyak
export const mixActive = (n, nt) => Math.min(n - (n % 4), 4 * Math.max(1, nt));
export function mixPlan(t, n = (t.individuals || []).length) {
  const nt = numTablesOf(t);
  let R = Number(t.mixRounds) || 0, auto = !R;
  // Auto = penuh: setiap pemain berpasangan dengan semua pemain lain sekali (semua bermain setiap pusingan;
  // jika meja tidak cukup, perlawanan disusun ke sesi berikutnya). Manual = pusingan dihadkan oleh bilangan meja.
  const act = auto ? n - (n % 4) : mixActive(n, nt);
  if (auto) { R = mixRoundsAuto(n); if (act && act < n) while ((R * act) % n) R++; }
  const per = act / 4, slots = R * act, matches = R * per;
  return { n, nt, act, rest: n - act, per, R, auto, matches, sessions: Math.ceil(matches / nt), min: Math.floor(slots / n), max: Math.ceil(slots / n) };
}
export function relevel(t) { (t.individuals || []).forEach(x => { if (x.lv && !levelOf(t, x.name)) takeLevel(t, { name: x.name, lv: x.lv }); }); }
// Jadual Whist kitaran: setiap pemain berpasangan dengan setiap pemain lain TEPAT sekali dan menentang setiap
// pemain lain TEPAT dua kali. Wujud untuk n % 4 == 0 (Z_(n-1) ∪ {∞}) dan n % 4 == 1 (Z_n, seorang rehat setiap pusingan).
function whistRounds(n, budgetMs = 1500) {
  if (n < 4 || (n % 4 !== 0 && n % 4 !== 1)) return null;
  const inf = n % 4 === 0, m = inf ? n - 1 : n, INF = m, G = Math.floor(n / 4);
  const d = (a, b) => { if (a === INF || b === INF) return 'i'; const x = ((a - b) % m + m) % m; return Math.min(x, m - x); };
  const pts = Array.from({ length: m }, (_, i) => i); if (inf) pts.push(INF);
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    for (let it = 0; it < 2000; it++) {
      const p = shuffle(pts).slice(0, 4 * G), pc = {}, oc = {}; let ok = true;
      for (let g = 0; g < G && ok; g++) { const [a1, a2, b1, b2] = p.slice(g * 4, g * 4 + 4);
        for (const [x, y] of [[a1, a2], [b1, b2]]) { const k = d(x, y); if ((pc[k] = (pc[k] || 0) + 1) > 1) ok = false; } }
      for (let g = 0; g < G && ok; g++) { const [a1, a2, b1, b2] = p.slice(g * 4, g * 4 + 4);
        for (const [x, y] of [[a1, b1], [a1, b2], [a2, b1], [a2, b2]]) { const k = d(x, y); if ((oc[k] = (oc[k] || 0) + 1) > 2) ok = false; } }
      if (ok) return Array.from({ length: m }, (_, r) => p.map(x => (x === INF ? INF : (x + r) % m)));
    }
  }
  return null;
}
export function buildMixer(t, tries = 80) {
  relevel(t);
  const P = (t.individuals || []).map(x => x.id), n = P.length;
  if (n < 4) throw new Error('Perlu sekurang-kurangnya 4 pemain');
  const PL = mixPlan(t, n), R = Math.max(1, PL.R);
  const nm = id => t.individuals.find(x => x.id === id).name;
  const bal = !!lvScheme(t);
  const known = P.map(id => lvVal(t, nm(id), 'D')).filter(v => v != null);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  const LV = Object.fromEntries(P.map(id => { const v = lvVal(t, nm(id), 'D'); return [id, v == null ? avg : v]; }));
  const k2 = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const pc = {}, oc = {}, rest = Object.fromEntries(P.map(id => [id, 0])), lastRest = new Set();
  const cost = pos => {
    let c = 0;
    for (let j = 0; j < pos.length; j += 4) {
      const [a1, a2, b1, b2] = pos.slice(j, j + 4);
      c += 100 * ((pc[k2(a1, a2)] || 0) + (pc[k2(b1, b2)] || 0));
      { const q = x => { const v = oc[x] || 0; return v * v; }; c += 10 * (q(k2(a1, b1)) + q(k2(a1, b2)) + q(k2(a2, b1)) + q(k2(a2, b2))); } // kuasa dua: sebar pertemuan lawan sama rata
      if (bal) c += 8 * Math.abs(LV[a1] + LV[a2] - LV[b1] - LV[b2]);
    }
    return c;
  };
  const T = tablesOf(t), NT = T.length;
  t.participants = []; t.matches = []; t.groups = []; t.rounds = {}; t.mixRest = {}; t.format = 'rr';
  let gn = 0, sess = 0;
  // Mod penuh: cuba jadual Whist sempurna (pasangan sekali, lawan tepat dua kali); label pemain diimbangkan ikut tahap
  let WH = PL.auto && !t.mixGreedy ? whistRounds(n) : null;
  if (WH && WH.length !== R) WH = null;
  let lab = shuffle(P);
  if (WH && bal) {
    const imb = L => WH.reduce((a, rd) => { for (let j = 0; j < rd.length; j += 4) a += Math.abs(LV[L[rd[j]]] + LV[L[rd[j + 1]]] - LV[L[rd[j + 2]]] - LV[L[rd[j + 3]]]); return a; }, 0);
    let cur = imb(lab);
    for (let it = 0; it < 4000; it++) { const i = Math.floor(Math.random() * n), j = Math.floor(Math.random() * n); if (i === j) continue;
      [lab[i], lab[j]] = [lab[j], lab[i]]; const c2 = imb(lab); if (c2 <= cur) cur = c2; else [lab[i], lab[j]] = [lab[j], lab[i]]; }
  }
  for (let r = 1; r <= R; r++) {
    if (WH) {
      const best = WH[r - 1].map(x => lab[x]), rs = P.filter(id => !best.includes(id));
      t.mixRest[r] = rs;
      for (let j = 0; j < best.length / 4; j++) {
        const [a1, a2, b1, b2] = best.slice(j * 4, j * 4 + 4);
        const mk = (x, y) => { const p = { id: uid(), name: `${nm(x)} & ${nm(y)}`, members: [nm(x), nm(y)], ids: [x, y], unit: '', hc: 0, rd: r }; t.participants.push(p); return p.id; };
        t.matches.push(blankMatch(t, { stage: 'group', group: 'M', gn: ++gn, gi: j, a: mk(a1, a2), b: mk(b1, b2), mr: r, px: [a1, a2, b1, b2] }));
      }
      continue;
    }
    const restN = PL.rest;
    const order = shuffle(P).sort((a, b) => (rest[a] - rest[b]) || (lastRest.has(a) - lastRest.has(b)));
    const rs = order.slice(0, restN), act = P.filter(id => !rs.includes(id));
    let best = null, bc = Infinity;
    for (let k = 0; k < tries; k++) {
      const pos = shuffle(act); let c = cost(pos), imp = true;
      while (imp) {
        imp = false;
        for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
          if ((i >> 2) === (j >> 2) && ((i & 3) >> 1) === ((j & 3) >> 1)) continue;
          [pos[i], pos[j]] = [pos[j], pos[i]];
          const c2 = cost(pos);
          if (c2 < c) { c = c2; imp = true; } else [pos[i], pos[j]] = [pos[j], pos[i]];
        }
      }
      if (c < bc) { bc = c; best = pos.slice(); if (c === 0) break; }
    }
    rs.forEach(id => rest[id]++); lastRest.clear(); rs.forEach(id => lastRest.add(id));
    t.mixRest[r] = rs;
    const per = best.length / 4;
    for (let j = 0; j < per; j++) {
      const [a1, a2, b1, b2] = best.slice(j * 4, j * 4 + 4);
      pc[k2(a1, a2)] = (pc[k2(a1, a2)] || 0) + 1; pc[k2(b1, b2)] = (pc[k2(b1, b2)] || 0) + 1;
      [[a1, b1], [a1, b2], [a2, b1], [a2, b2]].forEach(([x, y]) => (oc[k2(x, y)] = (oc[k2(x, y)] || 0) + 1));
      const mk = (x, y) => { const p = { id: uid(), name: `${nm(x)} & ${nm(y)}`, members: [nm(x), nm(y)], ids: [x, y], unit: '', hc: 0, rd: r }; t.participants.push(p); return p.id; };
      t.matches.push(blankMatch(t, { stage: 'group', group: 'M', gn: ++gn, gi: j % NT, a: mk(a1, a2), b: mk(b1, b2), mr: r, px: [a1, a2, b1, b2] }));
    }
  }
  // Susun ke sesi: isi semua meja; perlawanan pusingan seterusnya boleh bermula awal jika pemainnya tidak sedang bermain
  // Susun ke sesi: isi semua meja; perlawanan boleh bermula awal jika pemainnya tidak sedang bermain. Cuba beberapa kali, ambil yang paling pendek.
  let bestPlan = null;
  for (let k = 0; k < 40; k++) {
    const left = t.matches.slice(), played = {}, jit = Object.fromEntries(left.map(m => [m.id, k ? Math.random() : 0])), plan = [];
    while (left.length) {
      const busy = new Set(), take = [];
      const score = m => m.mr * 2 + m.px.reduce((a, id) => a + (played[id] || 0), 0) * 0.3 + jit[m.id];
      for (const m of left.slice().sort((x, y) => score(x) - score(y))) {
        if (take.length >= NT) break;
        if (m.px.every(id => !busy.has(id))) { take.push(m); m.px.forEach(id => busy.add(id)); }
      }
      take.forEach(m => { m.px.forEach(id => (played[id] = (played[id] || 0) + 1)); left.splice(left.indexOf(m), 1); });
      plan.push(take);
    }
    if (!bestPlan || plan.length < bestPlan.length) bestPlan = plan;
    if (plan.length === Math.ceil(t.matches.length / NT)) break;
  }
  bestPlan.forEach((take, si) => take.forEach((m, i) => { m.session = si + 1; m.table = T[i]; m.gi = i; }));
  t.mixG = {}; t.matches.forEach(m => m.px.forEach(id => (t.mixG[id] = (t.mixG[id] || 0) + 1))); // sasaran bilangan main setiap pemain (tetap)
  mixCompact(t);
  t.stage = 'group';
}
export const mixRoundOf = m => m.mr || 0;
// Sesi yang tidak penuh (meja tidak digunakan semua) dipindah ke hujung, supaya meja kosong hanya berlaku di sesi akhir.
// Hanya sesi yang belum bermula (tiada perlawanan tamat / di meja) diubah.
export function mixCompact(t) {
  if (!isMixer(t) || !t.matches.length) return false;
  const NT = numTablesOf(t), by = {};
  t.matches.forEach(m => { if (m.px && m.session) (by[m.session] = by[m.session] || []).push(m); });
  const S = Object.keys(by).map(Number).sort((a, b) => a - b);
  const started = s => by[s].some(m => m.status === 'done' || m.lt);
  const firstFree = S.findIndex(s => !S.slice(S.indexOf(s)).some(started));
  if (firstFree < 0) return false;
  const tail = S.slice(firstFree), full = tail.filter(s => by[s].length >= NT), part = tail.filter(s => by[s].length < NT);
  const order = [...full, ...part];
  let ch = false;
  if (!order.every((s, i) => s === tail[i])) {
    const map = {}; order.forEach((s, i) => (map[s] = tail[i]));
    t.matches.forEach(m => { if (m.px && map[m.session]) m.session = map[m.session]; });
    ch = true;
  }
  // nombor game (G1, G2 …) ikut susunan sesi & meja, selagi pertandingan belum bermula
  if (!t.matches.some(m => m.status === 'done' || m.lt)) {
    const srt = t.matches.slice().sort((x, y) => (x.session - y.session) || (x.gi || 0) - (y.gi || 0));
    srt.forEach((m, i) => { if (m.gn !== i + 1) { m.gn = i + 1; ch = true; } });
  }
  return ch;
}
// Kedudukan individu: menang, beza set, beza mata; serta rekod dengan setiap pasangan
export function mixStandings(t) {
  const rows = Object.fromEntries((t.individuals || []).map(x => [x.id, { id: x.id, p: 0, w: 0, l: 0, d: 0, sf: 0, sa: 0, pf: 0, pa: 0, with: [] }]));
  for (const m of t.matches) {
    if (m.status !== 'done' || !m.px) continue;
    const r = evaluateMatch(t, m);
    m.px.forEach((id, i) => {
      const R = rows[id]; if (!R) return;
      const A = i < 2, mate = m.px[A ? 1 - i : 5 - i], win = !r.draw && m.winner === (A ? m.a : m.b);
      R.p++; R.sf += A ? r.sa : r.sb; R.sa += A ? r.sb : r.sa; R.pf += A ? r.pa : r.pb; R.pa += A ? r.pb : r.pa;
      if (r.draw) R.d++; else if (win) R.w++; else R.l++;
      R.with.push({ mate, win, draw: !!r.draw, mr: m.mr, s: A ? `${r.sa}-${r.sb}` : `${r.sb}-${r.sa}` });
    });
  }
  Object.values(rows).forEach(r => (r.pts = 3 * r.w + r.d));
  return Object.values(rows).sort((x, y) => (y.pts - x.pts) || ((y.sf - y.sa) - (x.sf - x.sa)) || ((y.pf - y.pa) - (x.pf - x.pa)) || (x.l - y.l) || pname(t, x.id).localeCompare(pname(t, y.id)));
}
