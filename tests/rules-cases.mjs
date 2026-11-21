// 4 kes peraturan ruang kelab, dijalankan terus melalui modul Firebase (mock dengan tiruan peraturan)
import { chromium } from 'playwright-core';
import fs from 'fs';
const mock = fs.readFileSync('/home/claude/tests/mock/firebase-mock.js', 'utf8'), rules = fs.readFileSync('/home/claude/tests/mock/rules.js', 'utf8');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };
const stats = { 'clubs/ksasjb/stats/ksas': { data: '{}' }, 'clubs/ksasjb/stats/kroni': { data: '{}' }, 'clubs/ksasjb/stats/_org': { data: '{}' } };
async function run(user, docs, fn) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.route('**/vendor/firebase.js', r => r.fulfill({ contentType: 'text/javascript', body: mock }));
  await ctx.route('**/vendor/rules.js', r => r.fulfill({ contentType: 'text/javascript', body: rules }));
  const page = await ctx.newPage();
  await page.addInitScript(c => { window.__MOCK = { rules: true, ...c }; }, { user, docs: { ...stats, ...docs } });
  await page.goto('http://localhost:8765/'); await page.waitForTimeout(800);
  const r = await page.evaluate(fn); await ctx.close(); return r;
}
// pembantu dalam pelayar: cuba baca/tulis, pulangkan 'ok' / 'denied'
const H = `const F = await import('/vendor/firebase.js'); const db = {};
  const rd = p => new Promise(res => { const u = F.onSnapshot(F.doc(db, ...p.split('/')), () => { u(); res('ok'); }, () => res('denied')); });
  const wr = (p, d) => F.setDoc(F.doc(db, ...p.split('/')), d, { merge: true }).then(() => 'ok', () => 'denied');`;
const fn = body => new Function(`return (async () => { ${H} ${body} })()`);

console.log('1. Ahli pending tidak boleh baca stats');
let r = await run({ uid: 'u1', email: 'a@gmail.com' }, { 'clubs/ksasjb/members/u1': { uid: 'u1', name: 'A', status: 'pending', space: 'ksas' } },
  fn(`return [await rd('clubs/ksasjb/stats/ksas'), await rd('clubs/ksasjb/members/u1')];`));
ok(r[0] === 'denied', 'pending → stats/ksas ditolak'); ok(r[1] === 'ok', 'pending boleh baca dokumen keahlian sendiri');

console.log("2. Ahli 'ok' spaces ['ksas']");
r = await run({ uid: 'u2', email: 'b@gmail.com' }, { 'clubs/ksasjb/members/u2': { uid: 'u2', name: 'B', status: 'ok', spaces: ['ksas'] } },
  fn(`return [await rd('clubs/ksasjb/stats/ksas'), await rd('clubs/ksasjb/stats/kroni'), await rd('clubs/ksasjb/stats/_org'), await wr('clubs/ksasjb/stats/ksas', { data: 'x' }), await rd('clubs/ksasjb/players/p1')];`));
ok(r[0] === 'ok', 'stats/ksas dibenarkan'); ok(r[1] === 'denied', 'stats/kroni ditolak'); ok(r[2] === 'denied', 'stats/_org ditolak');
ok(r[3] === 'denied', 'ahli tidak boleh tulis stats'); ok(r[4] === 'denied', 'ahli tidak boleh baca daftar pemain');

console.log("3. Admin clubs ['ksas']");
r = await run({ uid: 'u3', email: 'adm@ksas.my' }, { 'roles/adm@ksas.my': { role: 'admin', clubs: ['ksas'] } },
  fn(`return [await wr('clubs/ksasjb/players/p1', { name: 'X' }), await wr('clubs/ksasjb/links/t1', { ok: true }), await wr('clubs/ksasjb/stats/kroni', { data: '{}' }), await wr('clubs/ksasjb/stats/_org', { data: '{}' }),
    await wr('clubs/kskpkpjb/players/p1', { name: 'X' }), await wr('clubs/kskpkpjb/stats/kskpkpjb', { data: '{}' }), await wr('clubs/ksasjb/stats/lain', { data: '{}' }),
    await wr('tournaments/tA', { clubId: 'ksas', data: '{}' }), await wr('tournaments/tB', { clubId: 'kskpkpjb', data: '{}' })];`));
ok(r[0] === 'ok' && r[1] === 'ok', 'tulis clubs/ksasjb/players & links');
ok(r[2] === 'ok' && r[3] === 'ok', 'tulis stats ruang lain dalam organisasi (kroni) & _org');
ok(r[4] === 'denied' && r[5] === 'denied', 'clubs/kskpkpjb/* ditolak');
ok(r[6] === 'denied', 'stats ruang tidak sah ditolak');
ok(r[7] === 'ok' && r[8] === 'denied', 'cipta pertandingan: ksas dibenarkan, kskpkpjb ditolak');

console.log('4. Tetamu tanpa nama tidak boleh cipta members');
r = await run({ uid: 'anon1', isAnonymous: true }, {},
  fn(`const C = await import('/cloud.js'); await C.init(); await new Promise(r => setTimeout(r, 200));
    const raw = await F.setDoc(F.doc(db, 'clubs', 'ksasjb', 'members', 'anon1'), { uid: 'anon1', name: 'Z', email: '', space: 'ksas', note: '', status: 'pending', at: 1 }).then(() => 'ok', () => 'denied');
    const app = await C.requestMember('ksasjb', { name: 'Z', space: 'ksas' }).then(() => 'ok', e => e.code);
    return [raw, app];`));
ok(r[0] === 'denied', 'tulis terus oleh tanpa nama ditolak'); ok(r[1] === 'perlu-log-masuk', 'app menahan lebih awal: minta log masuk Google');

console.log('5. Medan & nilai pemohon');
r = await run({ uid: 'u5', email: 'c@gmail.com' }, {},
  fn(`return [await wr('clubs/ksasjb/members/u5', { uid: 'u5', name: 'C', email: 'c@gmail.com', space: 'ksas', note: '', status: 'ok', at: 1 }),
    await wr('clubs/ksasjb/members/u5', { uid: 'u5', name: 'C', space: 'kskpkpjb', status: 'pending' }),
    await wr('clubs/ksasjb/members/u5', { uid: 'u5', name: 'C', space: 'ksas', status: 'pending', spaces: ['kroni'] }),
    await wr('clubs/ksasjb/members/u5', { uid: 'u5', name: 'C', email: 'c@gmail.com', space: 'ksas', note: '', status: 'pending', at: 1 })];`));
ok(r[0] === 'denied', 'tidak boleh luluskan diri sendiri (status ok)'); ok(r[1] === 'denied', 'space luar organisasi ditolak');
ok(r[2] === 'denied', 'medan tambahan (spaces) ditolak'); ok(r[3] === 'ok', 'permohonan sah diterima');
await browser.close();
console.log(fail ? `GAGAL: ${fail}` : 'Semua lulus'); process.exit(fail ? 1 : 0);
