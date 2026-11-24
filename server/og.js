// Pratonton pautan (WhatsApp, Telegram, Facebook): Cloudflare Pages Functions untuk /t/<id>… dan /daftar/<id>.
// Pelayar biasa: index.html yang sama + skrip kecil yang tukar alamat kepada /#/t/<id>… (app biasa).
// Pembaca pautan: <title>, og:title, og:description & og:image ikut pertandingan.
import { firebaseConfig } from '../firebase-config.js';
import * as E from '../engine.js';

const FS = env => (env && env.FS_BASE) || `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const KEY = `key=${encodeURIComponent(firebaseConfig.apiKey)}`;
const CLUB = { ksas: 'KSAS Kumpulan Rimau', ksasall: 'KSAS', kroni: 'Kroni Shell KSAS', kskpkpjb: 'KSKPKPJB', sendiri: 'Persendirian' };
const ENTRY = { single: 'Perseorangan', double: 'Regu', double_draw: 'Regu diundi', mixer: 'Regu bertukar', team: 'Berpasukan' };
const BLN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const okId = id => /^[\w-]{1,60}$/.test(id || '');

async function getDoc(env, path, mask) {
  const q = (mask || []).map(f => `&mask.fieldPaths=${f}`).join('');
  const r = await fetch(`${FS(env)}/${path}?${KEY}${q}`, { cf: { cacheTtl: 60 } });
  return r.ok ? r.json() : null;
}
const val = f => (f == null ? undefined : 'stringValue' in f ? f.stringValue : 'integerValue' in f ? +f.integerValue : 'booleanValue' in f ? f.booleanValue : undefined);

function fmtDate(d) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${BLN[+m[2] - 1]} ${m[1]}` : ''; }
function fmtTime(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); if (!m) return ''; const h = +m[1], ap = h < 12 ? 'pagi' : h < 14 ? 'tengah hari' : h < 19 ? 'petang' : 'malam'; return `${h % 12 || 12}.${m[2]} ${ap}`; }

function champion(t) {
  try {
    if (!t.matches || !t.matches.length || !t.matches.every(m => m.status === 'done' || m.status === 'bye')) return '';
    if (E.isMixer(t)) { const S = E.mixStandings(t).filter(r => r.p); return S[0] ? E.pname(t, S[0].id) : ''; }
    const R = E.finalRanking(t).find(x => x.place === 1);
    return R ? R.ids.map(id => E.pname(t, id)).join(', ') : '';
  } catch { return ''; }
}

export function describe(t, name, clubId) {
  const title = name || t.name || 'Pertandingan pingpong';
  const n = (t.participants || []).length || (t.individuals || []).length;
  const when = [fmtDate(t.date), fmtTime(t.startTime)].filter(Boolean).join(' · ');
  const play = (t.matches || []).filter(m => m.status !== 'bye' && m.a !== 'BYE' && m.b !== 'BYE');
  const done = play.filter(m => m.status === 'done').length;
  let status;
  const ch = t.stage === 'done' || (play.length && done === play.length) ? champion(t) : '';
  if (ch) status = `🏆 Johan: ${ch}. Lihat keputusan penuh, ranking dan laporan.`;
  else if (t.stage === 'group' || t.stage === 'ko') status = `🟢 Sedang berlangsung: ${done}/${play.length} perlawanan selesai. Ikuti skor langsung.`;
  else if (t.regOpen) status = '📝 Pendaftaran dibuka. Daftar terus dari pautan ini.';
  else status = 'Lihat peserta, jadual dan skor langsung.';
  const bits = [when, CLUB[clubId || t.clubId] || '', ENTRY[t.entryMode] || '', n ? `${n} ${t.entryMode === 'single' || t.entryMode === 'mixer' ? 'pemain' : 'pasukan'}` : ''].filter(Boolean);
  return { title, desc: `${bits.join(' · ')}${bits.length ? '. ' : ''}${status}` };
}

// GET /t/<id>… atau /daftar/<id>
export async function ogPage(ctx, kind) {
  const { request, env, params } = ctx, url = new URL(request.url);
  // hanya segmen selamat (id & nama halaman) — selebihnya dibuang
  const parts = [].concat(params.path || []).map(String).filter(x => /^[\w-]{1,60}$/.test(x)).slice(0, 4), id = parts[0];
  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers }));
  let title = 'Pingpong Portal', desc = 'Portal pertandingan pingpong: cabutan, jadual, skor dan kedudukan.', img = `${url.origin}/icons/pp-512.png`;
  if (okId(id)) {
    try {
      const d = await getDoc(env, `tournaments/${id}`);
      if (d && d.fields) {
        const t = JSON.parse(val(d.fields.data) || '{}');
        ({ title, desc } = describe(t, val(d.fields.name), val(d.fields.clubId)));
        if (kind === 'daftar' && !/Pendaftaran dibuka/.test(desc)) desc = `📝 Borang pendaftaran. ${desc}`;
        img = `${url.origin}/og/${id}.jpg?v=${t.stage || ''}${(t.matches || []).filter(m => m.status === 'done').length}`;
      }
    } catch (e) { console.log('og', e && e.message); }
  }
  const hash = '/#/' + [kind, ...parts].join('/');
  // <base href="/">: fail relatif (style.css, app.js) dimuat dari / walaupun pelayar memuat awal sebelum skrip berjalan
  const head = `<base href="/"><script>history.replaceState(null,'',${JSON.stringify(hash)})</script>`;   // mesti paling awal: fail relatif (style.css, app.js) kemudian dimuat dari /
  const og = `<meta property="og:type" content="website"><meta property="og:site_name" content="Pingpong Portal">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url.origin + url.pathname)}"><meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">`;
  const res = new HTMLRewriter()
    .on('head', { element(el) { el.prepend(head, { html: true }); el.append(og, { html: true }); } })
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute('content', desc); } })
    .transform(shell);
  const h = new Headers(res.headers); h.set('content-type', 'text/html; charset=utf-8'); h.set('cache-control', 'public, max-age=60');
  return new Response(res.body, { status: 200, headers: h });
}

// GET /og/<id>.jpg — gambar pratonton: gambar 🥇 Johan (jika tamat) → poster sendiri → gambar pertama → ikon app
export async function ogImage(ctx) {
  const { env, params, request } = ctx, id = String(params.id || '').replace(/\.(jpe?g|png|webp)$/i, '');
  const icon = () => env.ASSETS.fetch(new Request(new URL('/icons/pp-512.png', request.url)));
  if (!okId(id)) return icon();
  const send = dataUrl => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || ''); if (!m) return null;
    const bin = atob(m[2]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Response(u, { headers: { 'content-type': m[1], 'cache-control': 'public, max-age=600' } });
  };
  try {
    const t = await getDoc(env, `tournaments/${id}`, ['stage']);
    const done = t && t.fields && val(t.fields.stage) === 'done';
    const list = await getDoc(env, `tournaments/${id}/photos`, ['tag', 'ord']);
    const P = ((list && list.documents) || []).map(d => ({ name: d.name.split('/').pop(), tag: val((d.fields || {}).tag) || '', ord: val((d.fields || {}).ord) || 0 })).sort((a, b) => a.ord - b.ord);
    const pick = async p => { if (!p) return null; const d = await getDoc(env, `tournaments/${id}/photos/${p.name}`); return d && d.fields ? send(val(d.fields.img)) : null; };
    let r = done ? await pick(P.find(p => p.tag === 'johan')) : null;
    if (!r) { const ps = await getDoc(env, `posters/${id}`); r = ps && ps.fields ? send(val(ps.fields.img)) : null; }
    if (!r) r = await pick(P[0]);
    return r || icon();
  } catch (e) { console.log('ogimg', e && e.message); return icon(); }
}
