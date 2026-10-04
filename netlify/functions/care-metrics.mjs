// Counts for the care lead magnets: /care/hit records one anonymous event (viewed, downloaded,
// used, clicked through); /care/stats-data returns the totals for the Content Library and
// requires the CARE_STATS_KEY environment variable in the x-stats-key header (DELETE with the
// same key clears every record). The logic is in ../lib/care-metrics.mjs.
import { getStore } from '@netlify/blobs';
import { handle } from '../lib/care-metrics.mjs';

const secret = () => (globalThis.Netlify?.env?.get('CARE_STATS_KEY')) || process.env.CARE_STATS_KEY || '';

export default async (req) => handle(req, getStore({ name: 'care-metrics', consistency: 'strong' }), secret());

// Netlify reads this statically, so the paths must be plain string literals.
export const config = { path: ['/care/hit', '/care/stats-data'] };
