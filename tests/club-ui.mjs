// Ujian UI ruang kelab (mock Firebase). Jalankan: node club-ui.mjs
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = 'http://localhost:8765/';
const seed = JSON.parse(fs.readFileSync('/home/claude/tests/seed.json', 'utf8'));
const mock = fs.readFileSync('/home/claude/tests/mock/firebase-mock.js', 'utf8');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fail = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };
const shots = '/home/claude/tests/shots'; fs.mkdirSync(shots, { recursive: true });
async function open(cfg, w = 420) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, serviceWorkers: 'block' });
  await ctx.route('**/vendor/firebase.js', r => r.fulfill({ contentType: 'text/javascript', body: mock }));
  await ctx.route('**/vendor/rules.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync('/home/claude/tests/mock/rules.js', 'utf8') }));
  await ctx.route(/workers\.dev|googleapis|gstatic/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('  ‼ pageerror', e.message); fail++; });
  await page.addInitScript(c => { window.__MOCK = { rules: true, ...c }; localStorage.setItem('pingpong:movedSnooze', String(Date.now() + 1e9)); }, cfg);
  page.on('dialog', d => d.accept());
  return { ctx, page };
}
const docsOf = page => page.evaluate(() => window.__MOCK.docs);
const go = async (page, h) => { await page.evaluate(x => (location.hash = x), h); await page.waitForTimeout(350); };

// ---------- 1. Admin kelab Rimau ----------
console.log('Admin kelab (Rimau)');
{
  const docs = { ...seed, 'roles/admin@ksas.my': { role: 'admin', name: 'Ahmad', clubs: ['ksas'] } };
  const { ctx, page } = await open({ user: { uid: 'u-admin', email: 'admin@ksas.my', displayName: 'Ahmad' }, docs });
  await page.goto(BASE); await page.waitForTimeout(900);
  let html = await page.content();
  ok(!html.includes('Main Santai Rumah Ahmad'), 'Persendirian tidak tersenarai di utama');
  ok(html.includes('Ruang kelab'), 'bahagian Ruang kelab di utama');
  await go(page, '#/kelab/ksas');
  html = await page.locator('#app').innerHTML();
  ok(html.includes('Single Rimau Table Clash') && html.includes('Rimau Disember'), 'tab pertandingan senarai pertandingan Rimau');
  ok(!html.includes('Kroni Regu Bertukar'), 'pertandingan Kroni tidak dalam ruang Rimau');
  ok(html.includes('⚙️ Urus'), 'tab Urus untuk admin kelab');
  await page.screenshot({ path: shots + '/1-ruang.png', fullPage: true });
  await go(page, '#/kelab/ksas/urus'); await page.waitForTimeout(300);
  html = await page.locator('#app').innerHTML();
  ok(html.includes('Single Rimau Table Clash') && html.includes('Kroni Regu Bertukar'), 'urus: senarai pertandingan tamat seluruh KSAS');
  ok(!html.includes('Rimau Disember'), 'urus: pertandingan belum tamat tidak disenarai');
  // tambah pemain secara pukal
  await page.click('#pBulk'); await page.fill('#pbT', 'Hatta\nAsyraf\nXinyou'); await page.selectOption('#pbG', 'R'); await page.click('#pbS'); await page.waitForTimeout(300);
  let d = await docsOf(page);
  ok(Object.keys(d).filter(k => k.startsWith('clubs/ksasjb/players/')).length === 3, 'tampal senarai: 3 pemain');
  // ubah Hatta → Naga Elit
  const hid = Object.keys(d).find(k => k.startsWith('clubs/ksasjb/players/') && d[k].name === 'Hatta').split('/').pop();
  await page.click(`[data-pedit="${hid}"]`); await page.selectOption('#pfGrp', 'NE'); await page.click('#pfSave'); await page.waitForTimeout(300);
  d = await docsOf(page); ok(d['clubs/ksasjb/players/' + hid].group === 'NE', 'ubah kumpulan pemain');
  // padanan
  await go(page, '#/kelab/ksas/padan/nov6'); await page.waitForTimeout(400);
  html = await page.locator('#app').innerHTML();
  ok((await page.locator('[data-pk]').count()) === 29, '29 nama untuk dipadankan');
  ok(await page.locator('[data-pk="xin you"]').inputValue() !== '__new', 'Xin You dipadankan automatik ke Xinyou (hampir)');
  ok(await page.locator('[data-pk="foo"]').inputValue() === '__new', 'Foo = pemain baharu');
  await page.selectOption('[data-pk="foo"]', ''); // tetamu
  await page.screenshot({ path: shots + '/2-padan.png', fullPage: true });
  await page.click('#pdOk'); await page.waitForTimeout(1200);
  d = await docsOf(page);
  ok(d['clubs/ksasjb/links/nov6'] && d['clubs/ksasjb/links/nov6'].ok && d['clubs/ksasjb/links/nov6'].map.foo === '', 'pautan disahkan, Foo tetamu');
  ok(Object.keys(d).filter(k => k.startsWith('clubs/ksasjb/players/')).length === 28, 'pemain baharu didaftar (28 = 29 − tetamu)');
  const xin = Object.values(d).find(x => x.name === 'Xinyou'); ok(xin && xin.aliases.includes('Xin You'), 'alias "Xin You" ditambah kepada Xinyou');
  ok(d['clubs/ksasjb/stats/ksas'] && d['clubs/ksasjb/stats/_org'] && d['clubs/ksasjb/stats/kroni'], 'statistik ditulis (ksas, kroni, _org)');
  const st = JSON.parse(d['clubs/ksasjb/stats/ksas'].data);
  ok(st.tids.includes('nov6') && !JSON.stringify(st).includes('"Foo"'), 'stat Rimau: nov6 dikira, tetamu tiada');
  ok(page.url().includes('#/kelab/ksas/urus'), 'kembali ke Urus');
  // kedudukan & profil
  await go(page, '#/kelab/ksas/kedudukan'); await page.waitForTimeout(500);
  html = await page.locator('#app').innerHTML();
  ok(html.includes('club-board') && html.includes('Asyraf') && html.includes('🏆') && !html.includes('Rating'), 'papan kedudukan dengan gelaran, tanpa rating');
  await page.screenshot({ path: shots + '/3-kedudukan.png', fullPage: true });
  await page.click('button[data-sort="pct"]'); await page.waitForTimeout(200);
  ok((await page.locator('button[data-sort="pct"].on').count()) === 1, 'susun ikut % menang');
  await page.locator('tr[data-pl]').first().click(); await page.waitForTimeout(400);
  html = await page.locator('#app').innerHTML();
  ok(page.url().includes('/pemain/') && html.includes('% menang') && !html.includes('Cadangan ikut rating') && html.includes('Rekod bersemuka'), 'profil pemain tanpa rating');
  await page.screenshot({ path: shots + '/4-profil.png', fullPage: true });
  // kad statistik pada pertandingan tamat
  await go(page, '#/t/nov6/kalahmati'); await page.waitForTimeout(400);
  ok((await page.locator('a[href="#/kelab/ksas/padan/nov6"]').count()) === 1, 'kad "Kemas kini statistik kelab" pada pertandingan tamat');
  // isi tahap ikut rating dalam pertandingan akan datang (handicap KSAS)
  await go(page, '#/t/up1/pemain'); await page.waitForTimeout(500);
  ok((await page.locator('#lvRate').count()) === 0, 'butang isi tahap ikut rating disembunyi');
  d = await docsOf(page);
  const stj = d['clubs/ksasjb/stats/ksas'].data; ok(!/"r":|"sug":|"r0":/.test(stj), 'dokumen statistik tidak mengandungi rating');
  // borang cipta: pilihan kelab terhad
  await go(page, '#/baru'); await page.waitForTimeout(300);
  const opts = await page.locator('select[name=clubId] option').allTextContents();
  ok(opts.length === 1 && opts[0].includes('Rimau'), 'admin kelab hanya boleh pilih Rimau: ' + opts.join(' | '));
  // cipta pertandingan baharu sebagai admin kelab (peraturan: clubId mesti dalam clubs)
  await page.fill('input[name=name]', 'Rimau Disember Kedua'); await page.click('#f button.orange'); await page.waitForTimeout(600);
  d = await docsOf(page);
  const nt = Object.entries(d).find(([k, v]) => k.startsWith('tournaments/') && v.name === 'Rimau Disember Kedua');
  ok(nt && nt[1].clubId === 'ksas', 'admin kelab cipta pertandingan: meta clubId = ksas');
  // urus ahli: permohonan menunggu
  await page.evaluate(() => { window.__MOCK.docs['clubs/ksasjb/members/u-m1'] = { uid: 'u-m1', name: 'Bazli', email: 'bazli@gmail.com', space: 'ksas', status: 'pending', at: 1 }; });
  await go(page, '#/kelab/ksas'); await go(page, '#/kelab/ksas/urus'); await page.waitForTimeout(400);
  ok((await page.locator('[data-mok="u-m1"]').count()) === 1, 'permohonan ahli dipapar');
  await page.click('[data-mok="u-m1"]'); await page.waitForTimeout(300);
  d = await docsOf(page);
  ok(d['clubs/ksasjb/members/u-m1'].status === 'ok' && d['clubs/ksasjb/members/u-m1'].spaces.join() === 'ksas,ksasall', 'diluluskan dengan akses Rimau + KSAS');
  const rej = await page.evaluate(() => window.__MOCK.log);
  ok(!rej.length, 'tiada "insufficient permissions" dalam aliran admin' + (rej.length ? ': ' + rej.join(', ') : ''));
  await ctx.close();
  fs.writeFileSync('/home/claude/tests/after-admin.json', JSON.stringify(d));
}

// ---------- 2. Ahli / bukan ahli ----------
console.log('Ahli & orang awam');
{
  const after = JSON.parse(fs.readFileSync('/home/claude/tests/after-admin.json', 'utf8'));
  // pengunjung tanpa log masuk
  let { ctx, page } = await open({ user: null, docs: { ...after }, deny: ['^clubs/[^/]+/(stats|players|links)'] });
  await page.goto(BASE + '#/kelab/ksas/kedudukan'); await page.waitForTimeout(900);
  let html = await page.locator('#app').innerHTML();
  ok(html.includes('Untuk ahli kelab') && html.includes('cmLogin'), 'awam: perlu log masuk');
  ok(!html.includes('⚙️ Urus'), 'awam: tiada tab Urus');
  // log masuk & mohon
  await page.click('#cmLogin'); await page.waitForTimeout(600);
  await page.fill('#cmName', 'Lymi'); await page.click('#cmReq'); await page.waitForTimeout(500);
  let d = await docsOf(page);
  const mine = Object.entries(d).find(([k, v]) => k.startsWith('clubs/ksasjb/members/') && v.name === 'Lymi');
  ok(mine && mine[1].status === 'pending' && mine[1].email === 'ahli@gmail.com', 'permohonan dihantar (pending)');
  html = await page.locator('#app').innerHTML();
  ok(html.includes('menunggu kelulusan'), 'papar menunggu kelulusan');
  ok(!(await page.evaluate(() => window.__MOCK.log)).some(x => !/^READ clubs\/ksasjb\/members\//.test(x)), 'mohon ahli (tanpa nama → Google): tiada penolakan tulis');
  await page.screenshot({ path: shots + '/5-mohon.png', fullPage: true });
  // Persendirian: buka pautan → muncul di utama peranti ini
  await go(page, '#/t/priv1'); await go(page, '#/');
  ok((await page.content()).includes('Main Santai Rumah Ahmad'), 'Persendirian muncul selepas dibuka melalui pautan');
  await go(page, '#/kelab/sendiri'); ok((await page.locator('#app').innerHTML()).includes('Tidak dijumpai'), 'tiada ruang kelab untuk Persendirian');
  await ctx.close();
  // ahli disahkan Bazli (u-m1): ksas + ksasall sahaja
  ({ ctx, page } = await open({ user: { uid: 'u-m1', email: 'bazli@gmail.com', displayName: 'Bazli' }, docs: { ...after }, deny: ['^clubs/[^/]+/(players|links)', '^clubs/ksasjb/stats/(kroni|_org|helang|singa|naga|nagaelit)$'] }));
  await page.goto(BASE + '#/kelab/ksas/kedudukan'); await page.waitForTimeout(900);
  html = await page.locator('#app').innerHTML();
  ok(html.includes('club-board') && !html.includes('⚙️ Urus'), 'ahli: nampak kedudukan, tiada Urus');
  await go(page, '#/kelab/kroni/kedudukan'); await page.waitForTimeout(400);
  html = await page.locator('#app').innerHTML();
  ok(html.includes('belum diberi akses'), 'ahli: tiada akses ruang Kroni');
  await page.screenshot({ path: shots + '/6-tiada-akses.png', fullPage: true });
  await ctx.close();
}

// ---------- 3. Pemilik: peranan admin kelab ----------
console.log('Pentadbir');
{
  // pemilik dikenal pasti dengan hash; simulasi dengan tukar role selepas log masuk tidak mungkin → semak paparan admin kelab sahaja
  const { ctx, page } = await open({ user: { uid: 'u-admin', email: 'admin@ksas.my' }, docs: { ...seed, 'roles/admin@ksas.my': { role: 'admin', clubs: ['ksas'] } } }, 1100);
  await page.goto(BASE + '#/kelab/kskpkpjb/kedudukan'); await page.waitForTimeout(900);
  ok(!(await page.locator('#app').innerHTML()).includes('⚙️ Urus'), 'admin Rimau bukan admin KSKPKPJB');
  await page.goto(BASE + '#/kelab/kroni/urus'); await page.waitForTimeout(900);
  ok((await page.locator('#app').innerHTML()).includes('Daftar pemain'), 'admin Rimau boleh urus daftar KSAS dari ruang Kroni (organisasi sama)');
  await page.screenshot({ path: shots + '/7-desktop-urus.png', fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(fail ? `GAGAL: ${fail}` : 'Semua lulus');
process.exit(fail ? 1 : 0);
