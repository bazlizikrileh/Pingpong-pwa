// Pingpong Portal · pelayan notifikasi (Cloudflare Worker + KV)
// Tampal keseluruhan fail ini dalam editor Worker di Cloudflare, dan ikat (bind) satu KV namespace dengan nama PUSH.
// Tiada rahsia perlu ditetapkan: kunci VAPID dijana sendiri pada permintaan pertama dan disimpan dalam KV.
//
// Laluan:
//   GET  /vapid           → { key }  kunci awam VAPID untuk pushManager.subscribe
//   POST /sub             → { sub, topics }  daftar / kemas kini topik bagi satu peranti
//   POST /notify          → { topics, title, body, url, tag }  hantar notifikasi kepada semua peranti dalam topik
//   POST /schedule        → { key, at, topics, title, body, url, tag }  jadualkan notifikasi (cth. peringatan sehari sebelum)
//   cron (scheduled)      → hantar notifikasi berjadual yang sudah tiba masanya (tetapkan Cron Trigger: */30 * * * *)
//
// Topik: adm:<tid> (penganjur), me:<tid>:<pid> (peserta pilih nama), reg:<tid>:<uid> (pendaftar)

const ORIGINS = ['https://bazlizikrileh.github.io', 'http://localhost:8765'];
const TOPIC_RE = /^(adm|me|reg|club|t):[A-Za-z0-9_:-]{1,90}$/;
const MAX_SUBS_PER_TOPIC = 60;

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const concat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function sha(s) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s))).slice(0, 24); }
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// ---------- Kunci VAPID (dijana sekali, disimpan dalam KV) ----------
async function vapidKeys(env) {
  let v = await env.PUSH.get('vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) };
    await env.PUSH.put('vapid', JSON.stringify(v));
  }
  return v;
}
async function vapidHeader(env, endpoint) {
  const v = await vapidKeys(env);
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://bazlizikrileh.github.io/Pingpong-pwa/' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}

// ---------- Penyulitan muatan (RFC 8291, aes128gcm) ----------
export async function encryptPayload(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(auth, ecdh);
  const ikm = (await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])))).slice(0, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);   // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
async function sendPush(env, sub, payload) {
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(env, sub.endpoint), TTL: '3600', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' },
    body,
  });
  return res.status;
}

// ---------- Topik ----------
async function topicList(env, t) { return (await env.PUSH.get('T:' + t, 'json')) || []; }
async function setTopic(env, t, list) { list.length ? await env.PUSH.put('T:' + t, JSON.stringify(list.slice(-MAX_SUBS_PER_TOPIC))) : await env.PUSH.delete('T:' + t); }

function json(data, cors, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } }); }

// Hanya pautan dalaman app (#/… atau laluan relatif), teks dipendekkan — elak notifikasi palsu berpautan luar
const safeLink = l => { l = String(l || ''); return /^(#\/|\.?\/?[A-Za-z0-9#?=&_\/-]*$)/.test(l) && !/^\/\//.test(l) && !/:/.test(l) ? l.slice(0, 200) : ''; };
async function deliver(env, { topics = [], title, body = '', url: link = '', tag = '' }) {
  title = String(title || '').slice(0, 80); body = String(body || '').slice(0, 240); link = safeLink(link); tag = String(tag || '').slice(0, 64);
  const payload = { title: String(title).slice(0, 80), body: String(body).slice(0, 220), url: String(link).slice(0, 200), tag: String(tag).slice(0, 60) };
  const ids = new Set();
  for (const t of topics.filter(t => TOPIC_RE.test(t)).slice(0, 10)) (await topicList(env, t)).forEach(x => ids.add(x));
  let sent = 0, gone = 0;
  for (const id of ids) {
    const rec = await env.PUSH.get('S:' + id, 'json');
    if (!rec) continue;
    const st = await sendPush(env, rec.sub, payload).catch(() => 0);
    if (st === 404 || st === 410) {   // langganan tamat: buang
      gone++; await env.PUSH.delete('S:' + id);
      for (const t of rec.topics) await setTopic(env, t, (await topicList(env, t)).filter(x => x !== id));
    } else if (st >= 200 && st < 300) sent++;
  }
  return { sent, gone };
}

export default {
  // Cron Trigger: hantar notifikasi berjadual yang sudah tiba masanya
  async scheduled(event, env) {
    if (!env.PUSH) return;
    let cursor;
    do {
      const page = await env.PUSH.list({ prefix: 'Q:', cursor }); cursor = page.list_complete ? null : page.cursor;
      for (const k of page.keys) {
        const job = await env.PUSH.get(k.name, 'json');
        if (job && job.at <= Date.now()) { await env.PUSH.delete(k.name); await deliver(env, job).catch(() => {}); }
      }
    } while (cursor);
  },
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!env.PUSH) return json({ error: 'KV PUSH belum diikat pada Worker ini' }, cors, 500);
    try {
      if (url.pathname === '/vapid') return json({ key: (await vapidKeys(env)).pub }, cors);

      if (url.pathname === '/sub' && req.method === 'POST') {
        const { sub, topics = [] } = await req.json();
        if (!sub || !sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys) return json({ error: 'langganan tidak sah' }, cors, 400);
        const id = await sha(sub.endpoint), want = [...new Set(topics.filter(t => TOPIC_RE.test(t)))].slice(0, 30);
        const old = (await env.PUSH.get('S:' + id, 'json')) || { topics: [] };
        for (const t of old.topics.filter(t => !want.includes(t))) await setTopic(env, t, (await topicList(env, t)).filter(x => x !== id));
        for (const t of want.filter(t => !old.topics.includes(t))) { const l = await topicList(env, t); if (!l.includes(id)) l.push(id); await setTopic(env, t, l); }
        await env.PUSH.put('S:' + id, JSON.stringify({ sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, topics: want }), { expirationTtl: 60 * 60 * 24 * 120 });
        return json({ ok: true, id, topics: want }, cors);
      }

      if (url.pathname === '/notify' && req.method === 'POST') {
        const msg = await req.json();
        if (!msg.title) return json({ error: 'tiada tajuk' }, cors, 400);
        // had untuk topik kelab (ramai pelanggan): maksimum 6 notifikasi sejam setiap kelab
        for (const t of (msg.topics || []).filter(t => /^club:/.test(t))) {
          const k = 'RL:' + t + ':' + Math.floor(Date.now() / 3600e3), n = Number(await env.PUSH.get(k) || 0);
          if (n >= 6) return json({ error: 'had notifikasi kelab dicapai, cuba sejam lagi' }, cors, 429);
          await env.PUSH.put(k, String(n + 1), { expirationTtl: 7200 });
        }
        return json({ ok: true, ...(await deliver(env, msg)) }, cors);
      }

      if (url.pathname === '/schedule' && req.method === 'POST') {
        const { key, at, topics = [], title, body = '', url: link = '', tag = '' } = await req.json();
        if (!/^[A-Za-z0-9_:-]{1,80}$/.test(String(key || ''))) return json({ error: 'kunci tidak sah' }, cors, 400);
        const when = Number(at), now = Date.now();
        if (!title || !(when > now - 6e4) || when > now + 60 * 864e5) { await env.PUSH.delete('Q:' + key); return json({ ok: true, cancelled: true }, cors); }
        await env.PUSH.put('Q:' + key, JSON.stringify({ at: when, topics: topics.filter(t => TOPIC_RE.test(t)).slice(0, 10), title, body, url: link, tag }), { expirationTtl: Math.ceil((when - now) / 1000) + 2 * 86400 });
        return json({ ok: true, key, at: when }, cors);
      }
      return json({ ok: true, service: 'pingpong-push' }, cors);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, cors, 500);
    }
  },
};
