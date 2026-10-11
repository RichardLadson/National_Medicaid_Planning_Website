// Counts for the care lead magnets: /care/hit records one anonymous event (viewed, downloaded,
// used, clicked through); /care/stats-data returns the totals for the Content Library and
// requires the CARE_STATS_KEY environment variable in the x-stats-key header (DELETE with the
// same key clears every record), or an admin signed in to the Content Library (deck-auth login).
// The logic is in ../lib/care-metrics.mjs.
import { getStore } from '@netlify/blobs';
import { handle } from '../lib/care-metrics.mjs';
import { session } from '../lib/deck-auth.mjs';
import { randomBytes } from 'node:crypto';

const secret = () => (globalThis.Netlify?.env?.get('CARE_STATS_KEY')) || process.env.CARE_STATS_KEY || '';

export default async (req) => {
  let key = secret();
  // A signed-in admin reads the counts as if they held the key (a one-off key when none is set);
  // the key itself never reaches the browser.
  if (new URL(req.url).pathname.startsWith('/care/stats-data') && !req.headers.get('x-stats-key')) {
    const s = await session(req);
    if (s && s.rec.admin && !s.rec.mustChange) {
      key = key || randomBytes(24).toString('hex');
      const headers = new Headers(req.headers); headers.set('x-stats-key', key);
      req = new Request(req.url, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer() });
    }
  }
  return handle(req, getStore({ name: 'care-metrics', consistency: 'strong' }), key);
};

// Netlify reads this statically, so the paths must be plain string literals.
export const config = { path: ['/care/hit', '/care/stats-data'] };
