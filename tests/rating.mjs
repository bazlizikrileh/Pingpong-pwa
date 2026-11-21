// Ujian statistik & rating kelab menggunakan data sebenar 6 Nov (Single Rimau Table Clash)
import * as E from '../engine.js';
import * as RT from '../rating.js';
import fs from 'fs';
const src = fs.readFileSync(new URL('./nov6.mjs', import.meta.url), 'utf8');
// jalankan nov6.mjs tanpa log untuk dapat pertandingan lengkap
const log = console.log; console.log = () => {};
const body = src.replace(/^import .*$/gm, '').replace(/const txt = .*$/m, '');
const txt = fs.readFileSync(new URL('./nov6.txt', import.meta.url), 'utf8');
const t = new Function('E', 'txt', body + '\nreturn t;')(E, txt);
console.log = log;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('  ✗', m); } else console.log('  ✓', m); };
t.clubId = 'ksas'; t.date = '2026-11-06'; t.id = 'nov6';
ok(RT.finished(t), 'pertandingan tamat');
const games = RT.gamesOf(t);
ok(games.length === t.matches.filter(m => m.status === 'done' && m.a !== 'BYE' && m.b !== 'BYE').length, `game = perlawanan selesai (${games.length})`);
const names = RT.namesOf(t);
ok(names.length === 29, `nama peserta 29 (${names.length})`);
// daftar pemain: semua kecuali 2 (tetamu), satu dengan ejaan lain
const players = names.filter(n => !['Foo', 'Markuz'].includes(n)).map((n, i) => ({ id: 'p' + i, name: n === 'Xin You' ? 'Xinyou' : n === 'Abg Rosli' ? 'Rosli' : n, aliases: n === 'Abg Rosli' ? ['Abg Rosli'] : [], group: n === 'Hatta' ? 'NE' : 'R' }));
const map = {}; const how = {};
for (const n of names) { const m = RT.autoMatch(n, players); map[RT.key(n)] = m ? m.pid : ''; how[n] = m ? m.how : '-'; }
ok(how['Xin You'] === 'hampir' && how['Abg Rosli'] === 'alias' && how['Foo'] === '-', `padanan auto: Xin You=${how['Xin You']}, Abg Rosli=${how['Abg Rosli']}, Foo=${how['Foo']}`);
const res = RT.compute({ org: 'ksasjb', tours: [t], links: { nov6: { ok: true, map } }, players });
const sp = res.spaces.ksas, B = RT.board(sp);
ok(sp.tids.length === 1, 'pertandingan dikira dalam ruang Rimau');
const champ = E.finalRanking(t)[0].ids.map(id => E.pname(t, id))[0];
const cp = B.find(x => x.n === champ);
ok(cp && cp.s.titles.some(x => x.l === 'Johan'), `gelaran Johan kepada ${champ}`);
ok(B.every(x => x.s.w + x.s.l + x.s.d === x.s.p), 'M+K+S = main');
const totW = B.reduce((a, x) => a + x.s.w, 0), gameWithReg = games.filter(g => [g.a[0], g.b[0]].some(n => map[RT.key(n)])).length;
ok(totW <= games.length && totW > 0, `jumlah menang (${totW}) ≤ game (${games.length})`);
const sum = Object.values(res.ratings).reduce((a, x) => a + x.r, 0);
log('  Rating teratas:', B.slice(0, 5).map(x => `${x.n} ${x.r} (${x.dr >= 0 ? '+' : ''}${x.dr}) ${x.s.w}-${x.s.l} cadang ${x.sug.ksas}`).join(' | '));
log('  Terbawah:', B.slice(-3).map(x => `${x.n} ${x.r}`).join(' | '));
ok(res.spaces.helang && Object.keys(res.spaces.helang.players).length === 0, 'ruang Helang kosong');
ok(Object.keys(res.spaces.nagaelit.players).length === 1, 'pemain berdaftar Naga Elit dipapar dalam ruangnya walaupun tiada game di situ');
ok(cp.r > 1400, 'juara naik rating');
// Regu bertukar ringkas: 8 pemain, rating pasangan
const m = E.newTournament({ entryMode: 'mixer', clubId: 'kroni', date: '2026-11-10', name: 'Mix' });
E.setIndividualsFromLines(m, ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4']); m.id = 'mix'; m.format = 'rr'; m.groupFormat = '3';
E.buildMixer(m);
for (const x of m.matches) { const strongA = x.px.slice(0, 2).filter(id => E.pname(m, id).startsWith('A')).length, strongB = x.px.slice(2).filter(id => E.pname(m, id).startsWith('A')).length; E.recordScore(m, x.id, [strongA >= strongB ? [[11, 5], [11, 6]] : [[5, 11], [6, 11]]]); }
ok(RT.finished(m), 'regu bertukar tamat');
const mp = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'].map(n => ({ id: n, name: n, aliases: [], group: 'R' }));
const mm = Object.fromEntries(mp.map(p => [RT.key(p.name), p.id]));
const r2 = RT.compute({ org: 'ksasjb', tours: [m], links: { mix: { ok: true, map: mm } }, players: mp });
const kb = RT.board(r2.spaces.kroni);
const av = c => kb.filter(x => x.n[0] === c).reduce((a, x) => a + x.r, 0) / 4;
ok(av('A') > av('B') + 40, 'regu bertukar: purata kumpulan kuat lebih tinggi — ' + kb.map(x => x.n + ' ' + x.r).join(', '));
ok(kb[0].s.D[0] > 0 && Object.keys(kb[0].s.mates).length > 0, 'prestasi ikut pasangan direkod');
ok(RT.suggestLevel(1720, 'ksas') === 'NE' && RT.suggestLevel(1460, 'ksas') === 'S' && RT.suggestLevel(1460, 'kroni', true) === 'LW' && RT.suggestLevel(1300, 'umum') === 'C', 'cadangan tahap');
ok(!RT.compute({ org: 'ksasjb', tours: [m], links: { mix: { ok: false, map: mm } }, players: mp }).spaces.kroni.tids.length, 'padanan belum disahkan → tidak dikira');
console.log(fail ? `GAGAL: ${fail}` : 'Semua lulus');
process.exit(fail ? 1 : 0);
