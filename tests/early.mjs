// Ujian bracket awal (cermin) + kedudukan pasti dengan data 6 Nov
import * as E from '../engine.js';
import fs from 'fs';
const txt = fs.readFileSync(new URL('./nov6.txt', import.meta.url),'utf8');
const groups = fs.readFileSync(new URL('./nov6.mjs', import.meta.url),'utf8').match(/const groups = `([^`]+)`/)[1];
const t = E.newTournament({ name: 'x', pool: '3', koMode: 'M', poolMode: 'M' });
E.importGroups(t, groups.split('\n'));
const names = t.participants.map(p => p.name).sort((a,b)=>b.length-a.length);
const lines = txt.split('\n').map(l => { const m = l.match(/^(G\d+)\s+(.*?)\s+(\d)-(\d)\s+((?:\d+-\d+(?:,\s*)?)+)/); if (!m) return null;
  return { gn: +m[1].slice(1), sets: m[5].split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.split('-').map(Number)) }; }).filter(x => x && x.gn <= 39);
console.log('KO awal dijana:', t.rounds.ko, 'pool:', t.rounds.pool, 'stage', t.stage);
const r1 = () => t.matches.filter(m => m.bracket === 'ko' && m.round === 1).sort((a,b)=>a.slot-b.slot);
console.log('Pemegang tempat:', r1().map(m => E.placeholderLabel(m.srcA) + ' lwn ' + E.placeholderLabel(m.srcB)).join(' | '));
const snaps = [];
let firstKO = null;
lines.forEach((L, i) => {
  const m = t.matches.find(x => x.stage === 'group' && x.gn === L.gn);
  E.recordScore(t, m.id, [L.sets]);
  const fx = {}; t.groups.forEach(g => fx[g.name] = { ...E.groupFixed(t, g.name) });
  snaps.push(fx);
  const ready = r1().filter(m => m.a && m.b).length;
  if (ready && firstKO === null) firstKO = i + 1;
});
// semak: setiap kedudukan pasti mesti sama dengan kedudukan akhir
let bad = 0;
const fin = {}; t.groups.forEach(g => fin[g.name] = E.groupStandings(t, g.name).map(r => r.id));
snaps.forEach(fx => Object.entries(fx).forEach(([g, o]) => Object.entries(o).forEach(([k, id]) => { if (fin[g][k-1] !== id) bad++; })));
console.log('Perlawanan KO pertama sedia selepas', firstKO, 'daripada', lines.length, 'perlawanan kumpulan');
console.log('Kedudukan pasti yang salah:', bad);
console.log('Akhir:', r1().map(m => `${E.seedLabel(t,m.a)} ${E.pname(t,m.a)} lwn ${E.seedLabel(t,m.b)} ${E.pname(t,m.b)}`).join(' | '));
const G = t.groups, exp = G.map((g,i)=>[fin[g.name][0], fin[G[G.length-1-i].name][1]]);
console.log('Cermin betul:', JSON.stringify(exp) === JSON.stringify(r1().map(m=>[m.a,m.b])), 'stage', t.stage);
