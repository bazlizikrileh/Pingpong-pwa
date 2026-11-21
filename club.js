// Ruang kelab: #/kelab/{ruang}[/kedudukan | /pemain/{pid} | /urus | /padan/{tid}]
// Pertandingan kelab boleh dilihat semua; kedudukan & profil pemain untuk ahli yang disahkan admin kelab.
import * as E from './engine.js';
import * as RT from './rating.js';
import * as cloud from './cloud.js';

let X = null;   // pembantu daripada app.js (esc, toast, section, …)
export const initClub = ctx => (X = ctx);

// ---------- Cache data (langganan kekal selagi berada dalam organisasi yang sama) ----------
const C = { org: '', stats: {}, statsErr: {}, players: null, members: null, links: null, sub: [] };
function useOrg(org) {
  if (C.org === org) return;
  stopAll(); C.org = org;
}
function stopAll() { C.sub.forEach(u => { try { u(); } catch {} }); C.sub = []; C.stats = {}; C.statsErr = {}; C.players = null; C.members = null; C.links = null; C.org = ''; C._st = {}; C._adm = false; }
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { if (!/^#\/kelab\//.test(location.hash) && C.org) stopAll(); });
C._st = {};
function wantStats(space) {
  if (C._st[space]) return; C._st[space] = 1;
  C.sub.push(cloud.watchStats(C.org, space, (x, err) => { C.stats[space] = x; C.statsErr[space] = err ? (err.code || 'ralat') : ''; X.rerender(); }));
}
function wantAdminData() {
  if (C._adm) return; C._adm = true;
  C.sub.push(cloud.watchCol(C.org, 'players', l => { C.players = (l || []).sort((a, b) => a.name.localeCompare(b.name)); X.rerender(); }));
  C.sub.push(cloud.watchCol(C.org, 'members', l => { C.members = l || []; X.rerender(); }));
  cloud.loadLinks(C.org).then(o => { C.links = o; X.rerender(); }).catch(() => { C.links = {}; X.rerender(); });
}

export const orgAdmin = org => cloud.state.role === 'owner' || (cloud.state.role === 'admin' && (cloud.state.clubs || []).some(s => RT.orgOf(s) === org));
const lvName = (scheme, c) => { const L = (E.HC_SCHEMES[scheme] || { levels: [] }).levels.find(l => l[0] === c); return L ? L[1] : ''; };
const GROUP_OPTS = { '': '— kumpulan —', H: 'Helang', R: 'Rimau', S: 'Singa', N: 'Naga', NE: 'Naga Elit' };
const KRONI_OPTS = { '': '— tahap Kroni —', ...Object.fromEntries(E.HC_SCHEMES.kroni.levels.map(l => [l[0], l[1]])) };
const UMUM_OPTS = { '': '— tahap —', A: 'Kuat', B: 'Sederhana', C: 'Baru' };

// Pertandingan dalam organisasi yang layak dikira (awan, tamat, bukan ujian)
function orgTours(org) {
  const sp = (RT.ORGS[org] || { spaces: [] }).spaces;
  return X.store.list().map(E.migrate).filter(t => X.store.isCloud(t.id) && sp.includes(t.clubId) && !X.isTestT(t));
}

// ---------- Paparan utama ----------
export function viewClub(parts) {
  const space = parts[1], c = X.CLUBS[space], org = RT.orgOf(space);
  const { $app, esc, section } = X;
  if (!c || !org) { $app.innerHTML = `${section('Ruang kelab', 'Tidak dijumpai')}<div class="card"><p class="muted">Ruang kelab ini tidak wujud. Pertandingan persendirian hanya dibuka melalui pautan pertandingan.</p><a class="pill-btn light small" href="#/">← Utama</a></div>`; return; }
  useOrg(org);
  X.applyTheme({ clubId: space });
  document.getElementById('brand-title').textContent = c.short;
  const tab = parts[2] || 'pertandingan', admin = orgAdmin(org);
  if (cloud.state.ready && cloud.state.user && !cloud.state.user.anon) cloud.watchMember(org);
  if (admin) wantAdminData();
  const tabs = [['pertandingan', '🏓 Pertandingan'], ['kedudukan', '📊 Kedudukan'], ...(admin ? [['urus', '⚙️ Urus']] : [])];
  const cur = tab === 'pemain' ? 'kedudukan' : tab === 'padan' ? 'urus' : tab;
  const siblings = RT.ORGS[org].spaces.filter(s => s !== space && X.CLUBS[s]);
  const head = `<div class="club-hero">
      <div class="row" style="flex-wrap:nowrap">${c.logos.map(src => `<span class="logo-badge"><img src="${esc(src)}" alt=""></span>`).join('')}
      <div><div class="eyebrow">Ruang kelab · ${esc(RT.ORGS[org].name)}</div><h2 class="h-big" style="margin:2px 0 0">${esc(c.short)}</h2></div></div>
      <div class="hc-chips" style="margin-top:12px">${tabs.map(([k, n]) => `<a class="chip ${cur === k ? 'on' : ''}" href="#/kelab/${space}/${k}">${n}</a>`).join('')}</div>
    </div>`;
  const foot = siblings.length ? `<details class="card fold noprint"><summary>Ruang lain dalam ${esc(RT.ORGS[org].name)}</summary><div class="hc-chips" style="margin-top:8px">${siblings.map(s => `<a class="chip" href="#/kelab/${s}/${cur}">${esc(X.CLUBS[s].short)}</a>`).join('')}</div></details>` : '';
  let body = '';
  if (tab === 'pertandingan') body = toursHtml(space);
  else if (tab === 'kedudukan' || tab === 'pemain') body = gate(org, space, admin) || (tab === 'pemain' ? profileHtml(space, parts[3]) : boardHtml(space));
  else if (tab === 'urus' && admin) body = urusHtml(org, space);
  else if (tab === 'padan' && admin) body = padanHtml(org, space, parts[3]);
  else { location.hash = `#/kelab/${space}`; return; }
  $app.innerHTML = head + body + foot;
  wire(org, space, tab, parts);
}

// ---------- Pertandingan kelab (umum) ----------
function toursHtml(space) {
  const { esc, fmtDate } = X;
  const L = X.store.list().map(E.migrate).filter(t => t.clubId === space && (X.store.canAdmin(t.id) || (!X.isHidden(t) && !X.isTestT(t))))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  if (!L.length) return `<div class="card empty">${cloud.state.tournaments ? 'Belum ada pertandingan dalam ruang ini.' : 'Memuatkan…'}</div>`;
  const st = t => t.stage === 'done' || RT.finished(t) ? '<span class="tg">Tamat</span>' : t.stage === 'setup' ? '<span class="tg ok">Persediaan</span>' : '<span class="tg live">● Berlangsung</span>';
  return `<div class="card"><div class="mlist">${L.map(t => `<a class="list-item" href="#/t/${t.id}" style="text-decoration:none;color:inherit"><span><b>${esc(t.name)}</b><br><span class="muted small">${esc(fmtDate(t.date) || 'Tarikh belum ditetapkan')}</span></span>${st(t)}</a>`).join('')}</div></div>`;
}

// ---------- Akses ahli ----------
function gate(org, space, admin) {
  if (admin) { wantStats(space); return ''; }
  const { esc } = X, u = cloud.state.user, c = X.CLUBS[space];
  const card = inner => `<div class="card"><h3 style="margin-top:0">🔒 Untuk ahli kelab</h3><p class="muted">Kedudukan, rating dan profil pemain hanya boleh dilihat oleh ahli ${esc(RT.ORGS[org].name)} yang telah disahkan admin kelab.</p>${inner}</div>`;
  if (!cloud.state.ready) return card('<p class="muted small">Menyambung ke awan…</p>');
  if (!u || u.anon) return card('<button class="pill-btn brand" id="cmLogin"><span class="dot"></span>Log masuk dengan Google</button>');
  const m = cloud.state.member[org];
  if (m === undefined) return card('<p class="muted small">Menyemak keahlian…</p>');
  if (!m) return card(`<div class="grid2"><div><label>Nama panggilan (seperti dalam senarai pertandingan)</label><input id="cmName" maxlength="50" value="${esc(u.name ? u.name.split(' ')[0] : '')}"></div>
      <div><label>Nota kepada admin (pilihan)</label><input id="cmNote" maxlength="150" placeholder="cth. ahli ${esc(c.short)} sejak 2024"></div></div>
      <button class="pill-btn orange" id="cmReq" style="margin-top:10px"><span class="dot"></span>Mohon jadi ahli</button>`);
  if (m.status === 'pending') return card(`<p>⏳ Permohonan anda sebagai <b>${esc(m.name)}</b> sedang menunggu kelulusan admin.</p><button class="pill-btn light small" id="cmCancel">Batal permohonan</button>`);
  if (m.status === 'no') return card('<p>Permohonan anda tidak diluluskan. Hubungi admin kelab jika ini satu kesilapan.</p><button class="pill-btn light small" id="cmCancel">Padam &amp; mohon semula</button>');
  if (!(m.spaces || []).includes(space)) return card(`<p>Anda ahli yang disahkan, tetapi belum diberi akses ke ruang <b>${esc(c.short)}</b>.</p>${(m.spaces || []).length ? `<div class="hc-chips">${m.spaces.filter(s => X.CLUBS[s]).map(s => `<a class="chip" href="#/kelab/${s}/kedudukan">${esc(X.CLUBS[s].short)}</a>`).join('')}</div>` : ''}`);
  wantStats(space); return '';
}

// ---------- Papan kedudukan ----------
let _sort = 'r';
const schemeOf = space => (space === 'kroni' ? 'kroni' : (RT.ORGS[RT.orgOf(space)] || {}).scheme || 'umum');
function sugText(row, space) {
  const sc = schemeOf(space), c = row.sug[sc];
  return c ? lvName(sc, c) : '';
}
const grpChip = (row, space) => {
  if (RT.orgOf(space) !== 'ksasjb') return row.lv ? `<span class="lv lv-${row.lv}">${X.esc(lvName('umum', row.lv))}</span>` : '';
  if (space === 'kroni') return row.k ? `<span class="lv lv-${row.k}">${X.esc(lvName('kroni', row.k))}</span>` : '';
  return row.g ? `<span class="lv lv-${row.g}">${X.esc(lvName('ksas', row.g))}</span>` : '';
};
function boardHtml(space) {
  const { esc, fmtDate } = X, doc = C.stats[space];
  if (C.statsErr[space]) return `<div class="card"><p class="muted">Tidak dapat membaca statistik (${esc(C.statsErr[space])}). Pastikan peraturan Firestore terkini telah dipasang.</p></div>`;
  if (doc === undefined) return '<div class="card empty">Memuatkan statistik…</div>';
  if (!doc) return `<div class="card empty">Statistik belum dikira untuk ruang ini.${orgAdmin(C.org) ? ' Buka <b>⚙️ Urus</b> untuk padankan pemain bagi pertandingan yang telah tamat.' : ''}</div>`;
  const B = RT.board(doc, _sort), played = B.filter(x => x.s.p);
  const sorts = { r: 'Rating', w: 'Menang', pct: '% menang', p: 'Main' };
  const row = (x, i) => `<tr data-pl="${x.id}" class="${x.s.p ? '' : 'muted'}"><td>${x.s.p ? i + 1 : '–'}</td>
      <td class="l"><b>${esc(x.n)}</b> ${grpChip(x, space)}${x.s.titles.length ? ` <span title="Gelaran">🏆${x.s.titles.length > 1 ? x.s.titles.length : ''}</span>` : ''}</td>
      <td><b>${x.r}</b>${x.rn < RT.PROVISIONAL ? '<sup title="Rating sementara (kurang 8 perlawanan)">*</sup>' : ''}${x.dr ? ` <span class="small ${x.dr > 0 ? 'up' : 'down'}">${x.dr > 0 ? '▲' : '▼'}${Math.abs(x.dr)}</span>` : ''}</td>
      <td>${x.s.w}-${x.s.l}${x.s.d ? '-' + x.s.d : ''}</td><td>${x.s.p ? Math.round(x.s.w / x.s.p * 100) + '%' : '–'}</td><td class="small">${esc(sugText(x, space))}</td></tr>`;
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><span class="muted small">${played.length} pemain · ${doc.tids.length} pertandingan dikira · dikemas kini ${esc(new Date(doc.at).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
    <div class="hc-chips" style="margin:8px 0">${Object.entries(sorts).map(([k, n]) => `<button class="chip ${_sort === k ? 'on' : ''}" data-sort="${k}">${n}</button>`).join('')}</div>
    <div style="overflow-x:auto"><table class="club-board"><thead><tr><th>#</th><th class="l">Pemain</th><th>Rating</th><th>M-K</th><th>%</th><th>Cadangan</th></tr></thead>
    <tbody>${B.map(row).join('')}</tbody></table></div>
    <p class="muted small">Rating jenis Elo: menang lawan yang lebih kuat beri lebih mata. Regu dikira ikut purata rating pasangan. Perlawanan handicap dikira separuh. * = rating sementara. Cadangan = tahap ${esc(schemeOf(space) === 'kroni' ? 'Kroni Shell' : schemeOf(space) === 'ksas' ? 'KSAS' : 'umum')} yang sepadan dengan rating. Pertandingan persendirian tidak dikira.</p></div>`;
}

// ---------- Profil pemain ----------
function spark(h) {
  if (!h || h.length < 2) return '';
  const W = 300, H = 70, v = h.map(x => x[1]), lo = Math.min(...v) - 10, hi = Math.max(...v) + 10;
  const pt = (y, i) => `${(i / (v.length - 1) * (W - 8) + 4).toFixed(1)},${(H - 4 - (y - lo) / (hi - lo) * (H - 8)).toFixed(1)}`;
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" preserveAspectRatio="none"><polyline points="${v.map(pt).join(' ')}" fill="none" stroke="var(--or)" stroke-width="2.5" stroke-linejoin="round"/>${v.map((y, i) => `<circle cx="${pt(y, i).split(',')[0]}" cy="${pt(y, i).split(',')[1]}" r="2.6" fill="var(--tb)"/>`).join('')}</svg>
    <div class="row muted small" style="justify-content:space-between"><span>${X.esc(X.fmtDate(h[0][0]))} · ${v[0]}</span><span>${X.esc(X.fmtDate(h[h.length - 1][0]))} · ${v[v.length - 1]}</span></div>`;
}
function profileHtml(space, pid) {
  const { esc, fmtDate, av } = X, doc = C.stats[space];
  if (doc === undefined) return '<div class="card empty">Memuatkan…</div>';
  const x = doc && doc.players[pid];
  if (!x) return `<div class="card empty">Pemain tidak dijumpai dalam ruang ini. <a href="#/kelab/${space}/kedudukan">← Kedudukan</a></div>`;
  const s = x.s, nm = id => (doc.names && doc.names[id]) || (doc.players[id] || {}).n || '?';
  const pc = (w, p) => (p ? Math.round(w / p * 100) + '%' : '–');
  const ks = RT.orgOf(space) === 'ksasjb';
  const sug = ks ? `Kumpulan KSAS: <b>${esc(lvName('ksas', x.sug.ksas))}</b> · Kroni Shell: <b>${esc(lvName('kroni', x.sug.kroni))}</b>` : `Tahap: <b>${esc(lvName('umum', x.sug.umum))}</b>`;
  const mates = Object.entries(s.mates).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]);
  const opp = Object.entries(s.opp).sort((a, b) => b[1][0] - a[1][0]).slice(0, 10);
  const pl = n => (n === 1 ? '🥇 Johan' : n === 2 ? '🥈 Naib' : n && n <= 4 ? `🥉 ${n}` : n ? `#${n}` : '');
  return `<a class="pill-btn light small" href="#/kelab/${space}/kedudukan" style="margin-bottom:10px">← Kedudukan</a>
    <div class="card">
      <div class="row" style="flex-wrap:nowrap">${av(x.n)}<div style="flex:1"><h2 style="margin:0">${esc(x.n)}</h2><span class="muted small">${[ks && x.g ? 'Kumpulan ' + lvName('ksas', x.g) : '', ks && x.k ? 'Kroni ' + lvName('kroni', x.k) : '', !ks && x.lv ? lvName('umum', x.lv) : ''].filter(Boolean).map(esc).join(' · ')}</span></div>
      <div style="text-align:right"><div class="rating-big">${x.r}</div><span class="muted small">rating${x.rn < RT.PROVISIONAL ? ' (sementara)' : ''}</span></div></div>
      ${spark(x.h)}
      <p class="small" style="margin:8px 0 0">📈 Cadangan ikut rating — ${sug}</p>
    </div>
    <div class="card"><div class="section-title" style="margin-top:0">Statistik dalam ${esc(X.CLUBS[space].short)}</div>
      <div class="stat-grid">
        <div class="stat"><b>${s.t}</b><span>Pertandingan</span></div><div class="stat"><b>${s.p}</b><span>Perlawanan</span></div><div class="stat"><b>${s.w}-${s.l}${s.d ? '-' + s.d : ''}</b><span>M-K${s.d ? '-S' : ''}</span></div>
        <div class="stat"><b>${pc(s.w, s.p)}</b><span>% menang</span></div><div class="stat"><b>${s.sf}-${s.sa}</b><span>Set</span></div><div class="stat"><b>${(s.pf - s.pa > 0 ? '+' : '') + (s.pf - s.pa)}</b><span>Beza mata</span></div>
        <div class="stat"><b>${s.S[1]}/${s.S[0]}</b><span>Single menang</span></div><div class="stat"><b>${s.D[1]}/${s.D[0]}</b><span>Regu menang</span></div><div class="stat"><b>${s.titles.length}</b><span>Gelaran</span></div>
      </div>
      ${s.titles.length ? `<div class="section-title">🏆 Gelaran</div>${s.titles.slice().reverse().map(g => `<div class="list-item"><a href="#/t/${g.id}">${esc(g.n)}</a><span class="muted small">${esc(g.l)} · ${esc(fmtDate(g.d))}</span></div>`).join('')}` : ''}
    </div>
    ${mates.length ? `<div class="card"><div class="section-title" style="margin-top:0">🤝 Prestasi ikut pasangan</div><table class="club-board"><thead><tr><th class="l">Pasangan</th><th>Main</th><th>Menang</th><th>%</th></tr></thead><tbody>
      ${mates.map(([id, [p, w]]) => `<tr><td class="l">${esc(nm(id))}</td><td>${p}</td><td>${w}</td><td>${pc(w, p)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${opp.length ? `<div class="card"><div class="section-title" style="margin-top:0">⚔️ Rekod bersemuka</div><table class="club-board"><thead><tr><th class="l">Lawan</th><th>Main</th><th>Menang</th><th>%</th></tr></thead><tbody>
      ${opp.map(([id, [p, w]]) => `<tr><td class="l">${esc(nm(id))}</td><td>${p}</td><td>${w}</td><td>${pc(w, p)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="card"><div class="section-title" style="margin-top:0">🗓️ Pertandingan</div>
      ${s.tours.length ? s.tours.map(g => `<div class="list-item"><span><a href="#/t/${g.id}"><b>${esc(g.n)}</b></a><br><span class="muted small">${esc(fmtDate(g.d))}${g.sp !== space && X.CLUBS[g.sp] ? ' · ' + esc(X.CLUBS[g.sp].short) : ''}${g.pl ? ' · ' + pl(g.pl) : ''}</span></span>
        <span class="small ${g.r1 >= g.r0 ? 'up' : 'down'}">${g.r0} → <b>${g.r1}</b></span></div>`).join('') : '<p class="muted">Belum bermain dalam ruang ini.</p>'}</div>`;
}

// ---------- Urus (admin kelab) ----------
function urusHtml(org, space) {
  const { esc, fmtDate, opt } = X;
  const tours = orgTours(org).filter(RT.finished).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const L = C.links || {};
  const stat = t => { const l = L[t.id]; return !l ? '<span class="tg">⏳ Belum dipadankan</span>' : l.skip ? '<span class="tg mute">🚫 Tidak dikira</span>' : l.ok ? '<span class="tg ok">✅ Disahkan</span>' : '<span class="tg">✏️ Draf</span>'; };
  const pend = tours.filter(t => !L[t.id]).length;
  const M = C.members || [], P = C.players || [];
  const mPend = M.filter(m => m.status === 'pending'), mOk = M.filter(m => m.status === 'ok');
  const sp = RT.ORGS[org].spaces.filter(s => X.CLUBS[s]);
  const spBoxes = (uid, cur) => `<div class="hc-chips">${sp.map(s => `<label class="chip"><input type="checkbox" data-msp="${esc(uid)}" value="${s}" ${cur.includes(s) ? 'checked' : ''}> ${esc(X.CLUBS[s].short)}</label>`).join('')}</div>`;
  const ks = org === 'ksasjb';
  const pRow = p => `<div class="list-item" ${p.off ? 'style="opacity:.55"' : ''}><span><b>${esc(p.name)}</b>${(p.aliases || []).length ? ` <span class="muted small">(${esc(p.aliases.join(', '))})</span>` : ''}<br>
      <span class="muted small">${[ks ? lvName('ksas', p.group) : lvName('umum', p.lv), ks && p.kroni ? 'Kroni ' + lvName('kroni', p.kroni) : '', p.w ? 'Wanita' : '', p.off ? 'Tidak aktif' : ''].filter(Boolean).map(esc).join(' · ') || '—'}</span></span>
      <button class="pill-btn light small" data-pedit="${esc(p.id)}">Ubah</button></div>`;
  return `
    <div class="card"><div class="section-title" style="margin-top:0">📥 Pertandingan tamat ${pend ? `<span class="role-chip">${pend} belum</span>` : ''}</div>
      <p class="muted small">Padankan nama peserta dengan daftar pemain, kemudian sahkan. Hanya pertandingan yang disahkan dikira dalam statistik dan rating. Pertandingan ujian dan persendirian tidak disenaraikan.</p>
      ${C.links === null ? '<p class="muted">Memuatkan…</p>' : tours.length ? tours.map(t => `<a class="list-item" href="#/kelab/${space}/padan/${t.id}" style="text-decoration:none;color:inherit"><span><b>${esc(t.name)}</b><br><span class="muted small">${esc(fmtDate(t.date))} · ${esc((X.CLUBS[t.clubId] || {}).short || '')}</span></span>${stat(t)}</a>`).join('') : '<p class="muted">Tiada pertandingan tamat.</p>'}
      <div class="row" style="margin-top:10px"><button class="pill-btn brand small" id="cRecalc"><span class="dot"></span>Kira semula statistik</button><span class="muted small" id="cRecalcMsg"></span></div></div>

    <div class="card"><div class="section-title" style="margin-top:0">👥 Ahli ${mPend.length ? `<span class="role-chip">${mPend.length} menunggu</span>` : ''}</div>
      <p class="muted small">Ahli yang disahkan boleh melihat kedudukan dan profil pemain dalam ruang yang ditanda. Pautan untuk mohon: <code>${esc(location.origin + location.pathname)}#/kelab/${space}/kedudukan</code> <button class="pill-btn light small" id="cCopy">Salin</button></p>
      ${C.members === null ? '<p class="muted">Memuatkan…</p>' : ''}
      ${mPend.map(m => `<div class="card inner"><b>${esc(m.name)}</b> <span class="muted small">${esc(m.email)}${m.note ? ' · ' + esc(m.note) : ''}</span>
        <p class="small" style="margin:6px 0 2px">Beri akses ke:</p>${spBoxes(m.uid, [...new Set([m.space, ks && m.space !== 'ksasall' ? 'ksasall' : ''].filter(Boolean))])}
        <div class="row" style="margin-top:6px"><button class="pill-btn ok small" data-mok="${esc(m.uid)}">✓ Luluskan</button><button class="pill-btn no small" data-mno="${esc(m.uid)}">Tolak</button></div></div>`).join('')}
      ${mOk.length ? `<details class="fold"><summary>Ahli disahkan (${mOk.length})</summary>${mOk.map(m => `<div class="list-item" style="flex-wrap:wrap"><span><b>${esc(m.name)}</b><br><span class="muted small">${esc(m.email)}</span></span>
        ${spBoxes(m.uid, m.spaces || [])}<span class="row"><button class="pill-btn light small" data-msave="${esc(m.uid)}">Simpan akses</button><button class="pill-btn no small" data-mdel="${esc(m.uid)}">Buang</button></span></div>`).join('')}</details>` : ''}
    </div>

    <div class="card"><div class="section-title" style="margin-top:0">🏓 Daftar pemain (${P.filter(p => !p.off).length})</div>
      <p class="muted small">Satu ID tetap bagi setiap pemain dalam ${esc(RT.ORGS[org].name)}, dikongsi semua ruang${ks ? ' (Rimau, Helang, Singa, Naga, Naga Elit, KSAS, Kroni Shell)' : ''}. Nama lain / ejaan lain dimasukkan sebagai alias supaya padanan automatik lebih tepat.</p>
      <div id="pForm"></div>
      <div class="row" style="margin:8px 0"><button class="pill-btn orange small" id="pAdd"><span class="dot"></span>Tambah pemain</button><button class="pill-btn light small" id="pBulk">Tampal senarai</button></div>
      ${C.players === null ? '<p class="muted">Memuatkan…</p>' : P.map(pRow).join('') || '<p class="muted">Belum ada pemain. Pemain juga boleh didaftar terus semasa memadankan pertandingan.</p>'}
    </div>`;
}
function playerForm(org, p) {
  const { esc, opt } = X, ks = org === 'ksasjb';
  return `<div class="card inner" id="pf"><div class="grid2">
    <div><label>Nama</label><input id="pfName" maxlength="50" value="${esc(p.name || '')}"></div>
    <div><label>Nama lain / alias <small class="muted">(pisah dengan koma)</small></label><input id="pfAl" value="${esc((p.aliases || []).join(', '))}"></div>
    ${ks ? `<div><label>Kumpulan KSAS</label><select id="pfGrp">${opt(GROUP_OPTS, p.group || '')}</select></div>
    <div><label>Tahap Kroni Shell</label><select id="pfKr">${opt(KRONI_OPTS, p.kroni || '')}</select></div>` : `<div><label>Tahap</label><select id="pfLv">${opt(UMUM_OPTS, p.lv || '')}</select></div>`}
    </div>
    <label class="row small" style="margin-top:8px"><input type="checkbox" id="pfW" ${p.w ? 'checked' : ''}> Wanita</label>
    <label class="row small"><input type="checkbox" id="pfOff" ${p.off ? 'checked' : ''}> Tidak aktif (sembunyi daripada senarai kumpulan)</label>
    <div class="row" style="margin-top:8px"><button class="pill-btn brand small" id="pfSave" data-id="${esc(p.id || '')}">Simpan</button><button class="pill-btn light small" id="pfX">Batal</button>
    ${p.id ? '<button class="pill-btn no small" id="pfDel">Padam</button>' : ''}</div></div>`;
}

// ---------- Padanan pertandingan → pemain ----------
let _draft = {};
function padanHtml(org, space, tid) {
  const { esc, fmtDate } = X, t = X.load(tid);
  if (!t) return '<div class="card empty">Pertandingan tidak dijumpai.</div>';
  if (C.players === null || C.links === null) return '<div class="card empty">Memuatkan daftar pemain…</div>';
  const names = RT.namesOf(t).sort((a, b) => a.localeCompare(b)), link = C.links[tid];
  const d = (_draft[tid] ||= {});
  const P = C.players.filter(p => !p.off || Object.values((link || {}).map || {}).includes(p.id));
  const sel = n => {
    const k = RT.key(n);
    let v = d[k], how = '';
    if (v === undefined) { if (link && link.map && k in link.map) v = link.map[k]; else { const m = RT.autoMatch(n, P); v = m ? m.pid : '__new'; how = m ? m.how : 'baharu'; } }
    return `<div class="lv-row"><span>${esc(n)}${how ? ` <span class="tg ${how === 'tepat' || how === 'alias' ? 'ok' : how === 'baharu' ? '' : 'mute'}">${how === 'hampir' ? 'semak' : how}</span>` : ''}</span>
      <select data-pk="${esc(k)}">${[`<option value="__new" ${v === '__new' ? 'selected' : ''}>➕ Daftar pemain baharu</option>`, `<option value="" ${v === '' ? 'selected' : ''}>👤 Tetamu (tidak dikira)</option>`,
        ...P.map(p => `<option value="${esc(p.id)}" ${v === p.id ? 'selected' : ''}>${esc(p.name)}${p.group ? ' · ' + esc(lvName('ksas', p.group)) : ''}</option>`)].join('')}</select></div>`;
  };
  const ks = org === 'ksasjb', g = RT.KSAS_GROUP[t.clubId] || '';
  return `<a class="pill-btn light small" href="#/kelab/${space}/urus" style="margin-bottom:10px">← Urus</a>
    <div class="card"><h3 style="margin-top:0">${esc(t.name)}</h3><p class="muted small">${esc(fmtDate(t.date))} · ${esc((X.CLUBS[t.clubId] || {}).short || '')} · ${names.length} nama · ${RT.gamesOf(t).length} perlawanan${link ? ` · ${link.skip ? 'ditanda tidak dikira' : link.ok ? 'disahkan' : 'draf'}${link.by ? ' oleh ' + esc(link.by) : ''}` : ''}</p>
      <p class="muted small"><span class="tg ok">tepat</span>/<span class="tg ok">alias</span> = padanan automatik ikut nama; <span class="tg mute">semak</span> = ejaan hampir sama, sila semak; <span class="tg">baharu</span> = tiada dalam daftar.</p>
      ${ks ? `<div class="row small" style="margin:6px 0"><span>Kumpulan untuk pemain baharu:</span><select id="newGrp" style="width:auto">${X.opt(GROUP_OPTS, g)}</select></div>` : ''}
      <div class="lv-list">${names.map(sel).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="pill-btn ok" id="pdOk"><span class="dot"></span>Sahkan &amp; kira statistik</button>
      <button class="pill-btn light small" id="pdSkip">Jangan kira pertandingan ini</button></div>
      <p class="muted small">Alias ditambah secara automatik apabila nama dalam pertandingan berbeza daripada nama dalam daftar.</p></div>`;
}

// ---------- Kira semula ----------
export async function recompute(org) {
  const [players, links] = await Promise.all([C.org === org && C.players ? C.players : onceCol(org, 'players'), cloud.loadLinks(org)]);
  if (C.org === org) C.links = links;
  const res = RT.compute({ org, tours: orgTours(org).filter(RT.finished), links, players });
  const names = Object.fromEntries(players.map(p => [p.id, p.name]));
  const docs = { _org: { ...res.org, names } };
  for (const [sp, d] of Object.entries(res.spaces)) docs[sp] = { ...d, names };
  await cloud.writeStats(org, docs);
  return res;
}
const onceCol = (org, col) => new Promise(ok => { let u = null; u = cloud.watchCol(org, col, l => { ok(l || []); setTimeout(() => u && u(), 0); }); });
const onceStats = (org, sp) => new Promise(ok => { let u = null; u = cloud.watchStats(org, sp, x => { ok(x); setTimeout(() => u && u(), 0); }); });

// ---------- Isi tahap pertandingan ikut rating kelab ----------
// → [{ name, code, from: 'rating' | 'daftar' }], tiada = nama yang tidak dijumpai
export async function levelsFromRating(t, persons) {
  const org = RT.orgOf(t.clubId), sc = E.lvScheme(t);
  if (!org || !sc) throw new Error('Pertandingan ini bukan dalam ruang kelab yang mempunyai daftar pemain');
  await cloud.init();
  const [players, doc] = await Promise.all([onceCol(org, 'players'), onceStats(org, '_org')]);
  const rows = (doc && doc.players) || {}, out = [], miss = [];
  for (const n of persons) {
    const m = RT.autoMatch(n, players.filter(p => !p.off)); if (!m || m.how === 'hampir') { miss.push(n); continue; }
    const p = players.find(x => x.id === m.pid), r = rows[m.pid];
    const reg = sc === 'kroni' ? p.kroni : sc === 'umum' ? p.lv : p.group;
    let code = '', from = 'rating';
    if ((!r || r.rn < RT.PROVISIONAL) && reg) { code = reg; from = 'daftar'; }
    else code = RT.suggestLevel(r ? r.r : RT.seedOf(p, RT.ORGS[org].scheme), sc, !!p.w);
    if (code && E.HC_SCHEMES[sc].levels.some(l => l[0] === code)) out.push({ name: n, code, from }); else miss.push(n);
  }
  return { out, miss };
}

// ---------- Pendawaian ----------
function wire(org, space, tab, parts) {
  const { $app, toast } = X, q = s => $app.querySelector(s), qa = s => $app.querySelectorAll(s);
  const err = e => toast('Gagal: ' + (e.code === 'permission-denied' ? 'tiada kebenaran (semak peraturan Firestore)' : e.code || e.message), 4500);
  // ahli
  if (q('#cmLogin')) q('#cmLogin').onclick = () => cloud.linkGoogle().then(() => cloud.watchMember(org)).catch(err);
  if (q('#cmReq')) q('#cmReq').onclick = async () => {
    const name = q('#cmName').value.trim(); if (!name) return toast('Masukkan nama');
    try { await cloud.requestMember(org, { name, space, note: q('#cmNote').value.trim() }); toast('Permohonan dihantar'); } catch (e) { err(e); }
  };
  if (q('#cmCancel')) q('#cmCancel').onclick = () => cloud.cancelMember(org).catch(err);
  // kedudukan
  qa('[data-sort]').forEach(b => (b.onclick = () => { _sort = b.dataset.sort; X.rerender(true); }));
  qa('[data-pl]').forEach(r => (r.onclick = () => (location.hash = `#/kelab/${space}/pemain/${r.dataset.pl}`)));
  // urus: ahli
  const spOf = uid => [...qa(`[data-msp="${CSS.escape(uid)}"]`)].filter(x => x.checked).map(x => x.value);
  qa('[data-mok]').forEach(b => (b.onclick = () => { const s = spOf(b.dataset.mok); if (!s.length) return toast('Pilih sekurang-kurangnya satu ruang'); cloud.setMember(org, b.dataset.mok, { status: 'ok', spaces: s }).then(() => toast('Diluluskan')).catch(err); }));
  qa('[data-mno]').forEach(b => (b.onclick = () => cloud.setMember(org, b.dataset.mno, { status: 'no', spaces: [] }).then(() => toast('Ditolak')).catch(err)));
  qa('[data-msave]').forEach(b => (b.onclick = () => cloud.setMember(org, b.dataset.msave, { spaces: spOf(b.dataset.msave) }).then(() => toast('Akses disimpan')).catch(err)));
  qa('[data-mdel]').forEach(b => (b.onclick = () => confirm('Buang ahli ini?') && cloud.delMember(org, b.dataset.mdel).catch(err)));
  if (q('#cCopy')) q('#cCopy').onclick = () => navigator.clipboard.writeText(`${location.origin}${location.pathname}#/kelab/${space}/kedudukan`).then(() => toast('Pautan disalin'));
  // urus: pemain
  const openForm = p => { q('#pForm').innerHTML = playerForm(org, p); wirePF(p); q('#pf').scrollIntoView({ block: 'center' }); };
  const wirePF = p => {
    q('#pfX').onclick = () => (q('#pForm').innerHTML = '');
    q('#pfSave').onclick = async () => {
      const name = q('#pfName').value.trim(); if (!name) return toast('Masukkan nama');
      const dup = (C.players || []).find(x => x.id !== p.id && RT.key(x.name) === RT.key(name)); if (dup) return toast('Nama ini sudah ada dalam daftar');
      const d = { id: p.id || 'p' + E.uid(), name, aliases: q('#pfAl').value.split(',').map(s => s.trim()).filter(Boolean), group: q('#pfGrp') ? q('#pfGrp').value : '', kroni: q('#pfKr') ? q('#pfKr').value : '', lv: q('#pfLv') ? q('#pfLv').value : '', w: q('#pfW').checked, off: q('#pfOff').checked };
      try { await cloud.savePlayer(org, d); toast('Disimpan'); q('#pForm').innerHTML = ''; } catch (e) { err(e); }
    };
    if (q('#pfDel')) q('#pfDel').onclick = () => confirm(`Padam ${p.name}? Statistik akan dikira semula tanpa pemain ini (lebih baik tanda "Tidak aktif").`) && cloud.delPlayer(org, p.id).then(() => (q('#pForm').innerHTML = '')).catch(err);
  };
  if (q('#pAdd')) q('#pAdd').onclick = () => openForm({ group: RT.KSAS_GROUP[space] || '' });
  qa('[data-pedit]').forEach(b => (b.onclick = () => openForm((C.players || []).find(p => p.id === b.dataset.pedit))));
  if (q('#pBulk')) q('#pBulk').onclick = () => {
    q('#pForm').innerHTML = `<div class="card inner"><label>Satu nama setiap baris${org === 'ksasjb' ? ' — semua dimasukkan ke kumpulan dipilih' : ''}</label><textarea id="pbT" rows="6" placeholder="Ali\nAbu\nAh Chong"></textarea>
      ${org === 'ksasjb' ? `<select id="pbG">${X.opt(GROUP_OPTS, RT.KSAS_GROUP[space] || '')}</select>` : ''}
      <div class="row" style="margin-top:8px"><button class="pill-btn brand small" id="pbS">Tambah</button><button class="pill-btn light small" id="pbX">Batal</button></div></div>`;
    q('#pbX').onclick = () => (q('#pForm').innerHTML = '');
    q('#pbS').onclick = async () => {
      const have = new Set((C.players || []).map(p => RT.key(p.name)));
      const L = [...new Set(q('#pbT').value.split('\n').map(s => E.parseEntry(s).name).filter(Boolean))].filter(n => !have.has(RT.key(n)));
      if (!L.length) return toast('Tiada nama baharu');
      try { await Promise.all(L.map(name => cloud.savePlayer(org, { id: 'p' + E.uid(), name, group: q('#pbG') ? q('#pbG').value : '' }))); toast(`${L.length} pemain ditambah`); q('#pForm').innerHTML = ''; } catch (e) { err(e); }
    };
  };
  if (q('#cRecalc')) q('#cRecalc').onclick = async () => {
    const b = q('#cRecalc'); b.disabled = true; q('#cRecalcMsg').textContent = 'Mengira…';
    try { const r = await recompute(org); toast(`Statistik dikemas kini: ${r.org.tids.length} pertandingan`); } catch (e) { err(e); }
    if (q('#cRecalcMsg')) q('#cRecalcMsg').textContent = ''; if (q('#cRecalc')) q('#cRecalc').disabled = false;
  };
  // padanan
  if (tab === 'padan') {
    const tid = parts[3], t = X.load(tid), d = (_draft[tid] ||= {});
    qa('[data-pk]').forEach(s => (s.onchange = () => (d[s.dataset.pk] = s.value)));
    if (q('#pdSkip')) q('#pdSkip').onclick = async () => {
      if (!confirm('Tanda pertandingan ini tidak dikira dalam statistik?')) return;
      try { await cloud.saveLink(org, tid, {}, false, true); C.links[tid] = { map: {}, ok: false, skip: true }; await recompute(org); toast('Tidak dikira'); location.hash = `#/kelab/${space}/urus`; } catch (e) { err(e); }
    };
    if (q('#pdOk')) q('#pdOk').onclick = async () => {
      const b = q('#pdOk'); b.disabled = true;
      try {
        const map = {}, grp = q('#newGrp') ? q('#newGrp').value : '';
        const names = RT.namesOf(t), P = C.players || [];
        for (const n of names) {
          const k = RT.key(n), s = $app.querySelector(`[data-pk="${CSS.escape(k)}"]`); let v = s ? s.value : '';
          if (v === '__new') {
            const ex = P.find(p => RT.key(p.name) === k);
            if (ex) v = ex.id; else { v = 'p' + E.uid(); await cloud.savePlayer(org, { id: v, name: n, group: grp }); P.push({ id: v, name: n, aliases: [], group: grp }); }
          } else if (v) {
            const p = P.find(x => x.id === v);
            if (p && RT.key(p.name) !== k && !(p.aliases || []).some(a => RT.key(a) === k)) await cloud.savePlayer(org, { ...p, aliases: [...(p.aliases || []), n] });
          }
          map[k] = v;
        }
        await cloud.saveLink(org, tid, map, true);
        delete _draft[tid];
        const r = await recompute(org);
        toast(`✅ Disahkan. Statistik dikemas kini (${r.org.tids.length} pertandingan)`, 3500);
        location.hash = `#/kelab/${space}/urus`;
      } catch (e) { err(e); b.disabled = false; }
    };
  }
}
