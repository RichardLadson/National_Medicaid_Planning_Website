// Counting for the care lead magnets under /care/guides: who viewed a page, who downloaded
// it, who used it, and who clicked through to the care interview, split by where they came from.
//
// The page posts { a: asset, e: event, v: browser id, s: session id, ch: channel, src: source }.
// The ids are random strings the page keeps in its own storage. Nothing else is stored: no name,
// email, IP address or user agent. Each event is one small blob whose key carries the whole
// record, so reading the stats needs only a key listing (the same shape as the /andrea counter).
//
// This file holds the logic and takes the store as an argument, so the Netlify function and the
// local review server run the same code against different stores.

export const EVENTS = ['view', 'download', 'print', 'tick', 'copy', 'done', 'read', 'cta'];
// "Used" is only what can be seen happening on the page. What someone does with a saved or
// printed copy afterwards is not measurable and is not counted.
export const USED = ['print', 'tick', 'copy', 'done'];
export const CHANNELS = ['paid', 'content', 'other'];

const ASSET = /^\d\.\d-(crisis|advance)\/[a-z][a-z-]{1,23}$/;
const BRIEF = /^\d\.\d-(crisis|advance)$/;
const ID = /^[a-z0-9]{4,16}$/;
const SRC = /^[a-z0-9._-]{1,40}$/;
const BOT = /bot|crawl|spider|slurp|preview|headless|facebookexternalhit|lighthouse|monitor/i;
const hex = (o) => Buffer.from(JSON.stringify(o)).toString('hex');
const unhex = (s) => { try { return JSON.parse(Buffer.from(s, 'hex').toString()); } catch { return null; } };

export async function recordHit(body, store, userAgent = '') {
  const { a, e, v, s } = body || {};
  if (!ASSET.test(a || '') || !EVENTS.includes(e) || !ID.test(v || '') || !ID.test(s || '')) return 400;
  if (BOT.test(userAgent)) return 204; // accepted, not counted
  const ch = CHANNELS.includes(body.ch) ? body.ch : 'other';
  const src = SRC.test(body.src || '') ? body.src : 'direct';
  const t = new Date().toISOString();
  await store.set(`ev/${t}_${hex({ a, e, v, s, ch, src })}`, '1');
  return 204;
}

// Counts are people (browsers), not page loads: one browser that views a page five times is one viewer.
export async function readStats(store, { days = 0 } = {}) {
  const { blobs } = await store.list({ prefix: 'ev/' });
  const since = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : '';
  const sets = {}; const sources = {}; let events = 0, first = '', last = '';
  const add = (asset, ch, metric, v) => {
    const A = sets[asset] || (sets[asset] = {});
    for (const c of ['all', ch]) { const C = A[c] || (A[c] = {}); (C[metric] || (C[metric] = new Set())).add(v); }
  };
  for (const b of blobs) {
    const cut = b.key.indexOf('_', 3); if (cut < 0) continue;
    const t = b.key.slice(3, cut); const r = unhex(b.key.slice(cut + 1));
    if (!r || !ASSET.test(r.a || '') || (since && t < since)) continue;
    events += 1; if (!first || t < first) first = t; if (t > last) last = t;
    const ch = CHANNELS.includes(r.ch) ? r.ch : 'other';
    const metric = { view: 'viewed', download: 'downloaded', cta: 'clicked', read: 'read' }[r.e];
    if (metric) add(r.a, ch, metric, r.v);
    if (USED.includes(r.e)) { add(r.a, ch, 'used', r.v); add(r.a, ch, `used_${r.e}`, r.v); }
    if (r.e === 'view') { const S = sources[r.a] || (sources[r.a] = {}); const k = `${ch}:${r.src}`; (S[k] || (S[k] = new Set())).add(r.v); }
  }
  const count = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, x instanceof Set ? x.size : count(x)]));
  return { assets: count(sets), sources: count(sources), events, first, last, days, generated: new Date().toISOString() };
}

// Clears every record, or only one campaign's when a brief such as "2.1-crisis" is given.
export async function clearStats(store, { brief = '' } = {}) {
  const { blobs } = await store.list({ prefix: 'ev/' });
  const mine = brief ? blobs.filter((b) => { const r = unhex(b.key.slice(b.key.indexOf('_', 3) + 1)); return r && String(r.a || '').startsWith(`${brief}/`); }) : blobs;
  await Promise.all(mine.map((b) => store.delete(b.key)));
  return mine.length;
}

// /care/hit (POST, public) and /care/stats-data (GET, or DELETE to reset, optionally ?brief=<campaign>; needs the stats key in x-stats-key).
export async function handle(req, store, statsKey) {
  const url = new URL(req.url); const p = url.pathname.replace(/\/+$/, '');
  if (p === '/care/hit') {
    if (req.method !== 'POST') return new Response('', { status: 405 });
    let body; try { body = await req.json(); } catch { return new Response('', { status: 400 }); }
    const status = await recordHit(body, store, req.headers.get('user-agent') || '');
    return new Response(null, { status });
  }
  if (p === '/care/stats-data') {
    if (!statsKey || (req.headers.get('x-stats-key') || '') !== statsKey) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (req.method === 'DELETE') {
      const brief = url.searchParams.get('brief') || '';
      if (brief && !BRIEF.test(brief)) return Response.json({ error: 'unknown campaign' }, { status: 400 });
      return Response.json({ deleted: await clearStats(store, { brief }) });
    }
    if (req.method !== 'GET') return new Response('', { status: 405 });
    const days = Math.max(0, Math.min(3650, Number(url.searchParams.get('days')) || 0));
    return Response.json(await readStats(store, { days }), { headers: { 'cache-control': 'no-store' } });
  }
  return new Response('Not found', { status: 404 });
}
