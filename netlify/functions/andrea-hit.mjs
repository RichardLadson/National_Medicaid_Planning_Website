// Records one page view of the /andrea briefing. The page posts
// { p: page id, v: browser id, s: session id }; ids are random strings the
// page keeps in its own storage. Nothing else is stored: no name, email,
// IP address or user agent. Each view is one small blob whose key carries
// the whole record, so reading the stats needs only a key listing.
import { getStore } from '@netlify/blobs';

const PAGE = /^[A-Za-z0-9]{1,8}$/;
const ID = /^[a-z0-9]{4,16}$/;

export default async (req) => {
  if (req.method !== 'POST') return new Response('', { status: 405 });
  let body;
  try { body = await req.json(); } catch { return new Response('', { status: 400 }); }
  const { p, v, s } = body || {};
  if (!PAGE.test(p || '') || !ID.test(v || '') || !ID.test(s || '')) return new Response('', { status: 400 });
  const t = new Date().toISOString();
  await getStore({ name: 'andrea-views', consistency: 'strong' }).set(`ev/${t}_${p}_${v}_${s}`, '1');
  return new Response(null, { status: 204 });
};

export const config = { path: '/andrea/hit' };
