import * as E from '../engine.js';
import fs from 'fs';
const txt = fs.readFileSync(new URL('./nov6.txt', import.meta.url),'utf8');
// Kumpulan ikut turutan cabutan (dari susunan perlawanan dalam PDF)
const groups = `A | Muhaimi | Hatta | Fbi | Asyraf
B | Anep | Xin You | Amirul | Syamrul
C | Cherng bin | Markuz | Abg Rosli | Noran
D | Tad Mad | C.A | Sam50 | Jurima
E | Bazli | Mendan | Wan Alif | Eddy Gordo
F | Foo | AIL | Andi
G | Ril | Ikram | Fsl
H | Lymi | Wanthul | Pawi`;
const t = E.newTournament({ name: 'Single Rimau Table Clash', startTime: '21:00', pool: '34', koMode: 'U', poolMode: 'U' });
E.importGroups(t, groups.split('\n'));
const id = n => t.participants.find(p => p.name === n).id;
// Baca baris keputusan: "G12 Sam50 Jurima 3-2 11-6, ..."
const names = t.participants.map(p => p.name).sort((a,b)=>b.length-a.length);
function parseLine(l) {
  const m = l.match(/^([GP]\d+)\s+(.*?)\s+(\d)-(\d)\s+((?:\d+-\d+(?:,\s*)?)+)/);
  if (!m) return null;
  const rest = m[2]; let A=null,B=null;
  for (const n of names) if (rest.startsWith(n+' ')) { A=n; B=rest.slice(n.length+1).trim(); break; }
  if (!names.includes(B)) { for (const n of names) if (rest.endsWith(' '+n)) { B=n; A=rest.slice(0,-n.length-1).trim(); break; } }
  const sets = m[5].split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.split('-').map(Number));
  return { code: m[1], A, B, sets };
}
const lines = txt.split('\n').map(parseLine).filter(Boolean);
let gOk = 0, mism = [];
for (const L of lines.filter(l => l.code.startsWith('G') && +l.code.slice(1) <= 39)) {
  const m = t.matches.find(x => x.stage==='group' && x.gn === +L.code.slice(1));
  if (E.pname(t,m.a)!==L.A || E.pname(t,m.b)!==L.B) mism.push(`${L.code}: kita ${E.pname(t,m.a)} lwn ${E.pname(t,m.b)} / PDF ${L.A} lwn ${L.B}`);
  E.recordScore(t, m.id, [L.sets]); gOk++;
}
console.log('Perlawanan kumpulan dimasukkan:', gOk, 'pasangan/turutan berbeza:', mism.length, mism.slice(0,5));
// Semak kedudukan kumpulan
const pdfGroups = {}; let cur=null;
for (const l of txt.split('\n')) { const g=l.match(/^Kumpulan ([A-H])$/); if (g) { cur=g[1]; pdfGroups[cur]=pdfGroups[cur]||[]; continue; }
  const r=l.match(/^(\d) (.+?) (\d) (\d) (\d) (\d+) /); if (cur && r && pdfGroups[cur].length<5 && !txt.slice(0,txt.indexOf('CARTA KALAH')).includes('xx')) pdfGroups[cur].push(r[2]); }
let stOk=true;
for (const g of t.groups) { const ours=E.groupStandings(t,g.name).map(r=>E.pname(t,r.id)); const pdf=pdfGroups[g.name].slice(0,ours.length);
  const same=JSON.stringify(ours)===JSON.stringify(pdf); if(!same) stOk=false; console.log(`Kump ${g.name}`, same?'✓':'✗', ours.join(', '), same?'':' | PDF: '+pdf.join(', ')); }
// Jadual sesi kumpulan
const sched = [...txt.matchAll(/^(G\d+) (\d+) \d+:\d+ [AP]M (\d) Kump\. ([A-H]) /gm)].map(x=>({gn:+x[1].slice(1),s:+x[2],tbl:+x[3]}));
let sOk=0, sBad=[];
for (const x of sched) { const m=t.matches.find(y=>y.stage==='group'&&y.gn===x.gn); const tb=+m.table.match(/Meja (\d)/)[1];
  if (m.session===x.s && tb===x.tbl) sOk++; else sBad.push(`G${x.gn}: kita S${m.session}/M${tb}, PDF S${x.s}/M${x.tbl}`); }
console.log('Jadual kumpulan sepadan:', sOk+'/'+sched.length, sBad.slice(0,5));
// BYE pool (undian): penerima BYE mesti C.A, Fbi, Anep
console.log('Penerima BYE pool (kita):', E.byeReceivers(t, E.poolEntrants(t)).map(i=>E.pname(t,i)), '| PDF: C.A, Fbi, Anep');
console.log('Peserta pool:', E.poolEntrants(t).length, '| PDF: 13');
// Bina bracket ikut PDF
const ko = ['Jurima','Wan Alif','Hatta','Lymi','Cherng bin','Xin You','AIL','Fsl','Mendan','Foo','Ril','Asyraf','Pawi','Sam50','Syamrul','Abg Rosli'].map(id);
const pool = ['Anep','BYE','Ikram','Tad Mad','Eddy Gordo','Muhaimi','Wanthul','Markuz','Fbi','BYE','Noran','Bazli','C.A','BYE','Andi','Amirul'].map(n=>n==='BYE'?'BYE':id(n));
E.buildKOFromSlots(t, ko, pool);
for (const L of lines.filter(l => (l.code.startsWith('G') && +l.code.slice(1) >= 40) || l.code.startsWith('P'))) {
  const b = L.code.startsWith('P') ? 'pool' : 'ko';
  const m = t.matches.find(x => x.bracket===b && x.status!=='done' && ((E.pname(t,x.a)===L.A && E.pname(t,x.b)===L.B)));
  if (!m) { console.log('Tidak jumpa', L.code, L.A, L.B); continue; }
  if (E.matchCode(m)!==L.code) console.log('Kod berbeza', E.matchCode(m), L.code);
  E.recordScore(t, m.id, [L.sets]);
}
console.log('Peringkat:', t.stage);
// Jadual KO
const ks = [...txt.matchAll(/^([GP]\d+) (\d+) \d+:\d+ [AP]M (\d) (?:16 Besar|Suku Akhir|Separuh Akhir|Akhir|Pool:)/gm)].map(x=>({c:x[1],s:+x[2],tbl:+x[3]}));
let kOk=0,kBad=[];
for (const x of ks) { const m=t.matches.find(y=>y.stage!=='group'&&E.matchCode(y)===x.c); const tb=+m.table.match(/Meja (\d)/)[1];
  if (m.session===x.s&&tb===x.tbl) kOk++; else kBad.push(`${x.c}: kita S${m.session}/M${tb}, PDF S${x.s}/M${x.tbl}`); }
console.log('Jadual kalah mati/pool sepadan:', kOk+'/'+ks.length, kBad.slice(0,6));
// Ranking
const pdfRank = [...txt.slice(txt.indexOf('RANKING PESERTA'), txt.indexOf('* Cara')).matchAll(/^(\d+) (\d+(?:–\d+)?) (.+?) (?:Juara|Naib juara|Separuh Akhir|Suku Akhir|16 Besar|Pool: \S+(?: \S+)?) ([A-H]\d)( †)? (\d) (\d+-\d+) ([+-]?\d\.\d\d)/gm)]
  .map(x=>({no:+x[1],tempat:x[2],name:x[3],kump:x[4],dag:!!x[5],main:+x[6],set:x[7],a:x[8]}));
const ours=[]; for (const tr of E.finalRanking(t)) tr.rows.forEach((r,i)=>ours.push({tempat: tr.ids.length>1?`${tr.place}–${tr.place+tr.ids.length-1}`:String(tr.place), name:E.pname(t,r.id), dag:r.bumped, main:r.st.p, set:`${r.st.sf}-${r.st.sa}`, a:(r.st.a>0?'+':'')+r.st.a.toFixed(2)}));
let rOk=0; const rBad=[];
pdfRank.forEach((p,i)=>{ const o=ours[i]; const ok=o&&o.name===p.name&&o.tempat===p.tempat&&o.dag===p.dag&&o.main===p.main&&o.set===p.set&&o.a.replace('+0.00','0.00')===p.a;
  if(ok) rOk++; else rBad.push(`#${p.no} PDF ${p.tempat} ${p.name}${p.dag?' †':''} ${p.main} ${p.set} ${p.a} | kita ${o?`${o.tempat} ${o.name}${o.dag?' †':''} ${o.main} ${o.set} ${o.a}`:'-'}`); });
console.log('Ranking sepadan:', rOk+'/'+pdfRank.length); rBad.forEach(x=>console.log('  ✗',x));
