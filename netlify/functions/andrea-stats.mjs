// Returns the recorded views of the /andrea briefing for the dashboard at
// /andrea/stats.html. Requires an admin signed in with the deck login (../lib/deck-auth.mjs), or
// the ANDREA_STATS_KEY environment variable in the x-stats-key header. DELETE clears every record.
import { getStore } from '@netlify/blobs';
import { session } from '../lib/deck-auth.mjs';

const secret = () => (globalThis.Netlify?.env?.get('ANDREA_STATS_KEY')) || process.env.ANDREA_STATS_KEY || '';

export default async (req) => {
  const key = secret();
  const given = req.headers.get('x-stats-key') || '';
  const s = given ? null : await session(req);
  const admin = !!(s && s.rec.admin && !s.rec.mustChange);
  if (!admin && (!key || given !== key)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (req.method !== 'GET' && req.method !== 'DELETE') return new Response('', { status: 405 });

  const store = getStore({ name: 'andrea-views', consistency: 'strong' });
  const { blobs } = await store.list({ prefix: 'ev/' });

  if (req.method === 'DELETE') {
    await Promise.all(blobs.map((b) => store.delete(b.key)));
    return Response.json({ deleted: blobs.length });
  }

  const events = blobs
    .map((b) => { const [t, p, v, s] = b.key.slice(3).split('_'); return { t, p, v, s }; })
    .filter((e) => e.t && e.p && e.v && e.s)
    .sort((a, b) => (a.t < b.t ? -1 : 1));
  return Response.json({ events }, { headers: { 'cache-control': 'no-store' } });
};

export const config = { path: '/andrea/stats-data' };
