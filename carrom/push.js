// Push notification sebenar (sampai walaupun app ditutup) melalui Cloudflare Worker.
import { PUSH_URL } from './push-config.js';
const URL_ = PUSH_URL.replace(/\/+$/, '');
export const pushAvailable = () => !!URL_ && 'PushManager' in window && 'serviceWorker' in navigator && 'Notification' in window;
const toKey = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function reg() { return navigator.serviceWorker.ready; }
export async function currentSub() { if (!pushAvailable()) return null; try { return await (await reg()).pushManager.getSubscription(); } catch { return null; } }
export async function subscribe() {
  if (!pushAvailable()) return null;
  const r = await reg();
  let s = await r.pushManager.getSubscription();
  if (!s) {
    const { key } = await (await fetch(URL_ + '/vapid')).json();
    s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
  }
  return s;
}
export async function unsubscribe() { const s = await currentSub(); if (s) { await syncTopics([], true); await s.unsubscribe(); } }
let _last = null;
export async function syncTopics(topics, force = false) {
  const s = await currentSub(); if (!s) return;
  const key = JSON.stringify([...topics].sort()) + s.endpoint;
  if (!force && key === (_last || localStorage.getItem('carrom:pushTopics'))) return;
  const r = await fetch(URL_ + '/sub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: s.toJSON(), topics }) });
  if (r.ok) { _last = key; try { localStorage.setItem('carrom:pushTopics', key); } catch {} }
}
export function send(topics, title, body, url, tag) {
  if (!URL_ || !topics.length) return;
  fetch(URL_ + '/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topics, title, body, url, tag }), keepalive: true }).catch(() => {});
}
// Jadualkan notifikasi (dihantar oleh Cron Worker). at = 0 / tiada tajuk → batal.
export function schedule(key, at, topics, title, body, url, tag) {
  if (!URL_) return;
  fetch(URL_ + '/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, at, topics, title, body, url, tag }), keepalive: true }).catch(() => {});
}
