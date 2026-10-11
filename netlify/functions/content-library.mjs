// The Content Library and the draft lead-magnet pages it links to, open to anyone with the link
// (no login since 2026-10-11) but kept out of search engines (x-robots-tag noindex). The files are
// bundled with this function from netlify/gated/ (staged by scripts/stage-gated.mjs), not published in
// dist. A lead-magnet page that has been reviewed and published as a static file in dist is served by
// Netlify before this function runs (preferStatic). The view counts stay behind the admin login
// (care-metrics.mjs).
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8' };

// Included files keep their path relative to the site; where that lands depends on the runtime.
const ROOTS = [join(process.cwd(), 'netlify', 'gated'), join(dirname(fileURLToPath(import.meta.url)), '..', 'gated'), join(dirname(fileURLToPath(import.meta.url)), 'netlify', 'gated')];
let ROOT = null;
async function root() {
  if (ROOT) return ROOT;
  for (const r of ROOTS) { try { if ((await stat(r)).isDirectory()) return (ROOT = r); } catch {} }
  return null;
}

export default async (req) => {
  const url = new URL(req.url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('', { status: 405, headers: { allow: 'GET, HEAD' } });
  const base = await root();
  if (!base) return new Response('The library is not in this deploy.', { status: 500 });
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
  if (rel.split('/').includes('..')) return new Response('Not found', { status: 404 });
  if (rel === 'content-library') return new Response(null, { status: 301, headers: { location: '/content-library/' } });
  let file = join(base, rel);
  try {
    if ((await stat(file)).isDirectory()) {
      if (!url.pathname.endsWith('/')) return new Response(null, { status: 301, headers: { location: url.pathname + '/' + url.search } });
      file = join(file, 'index.html');
    }
    const body = await readFile(file);
    return new Response(body, { headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate', 'content-security-policy': CSP, 'x-frame-options': 'DENY', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-content-type-options': 'nosniff' } });
  } catch {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
};

// Netlify reads this statically, so the paths must be plain string literals.
export const config = {
  path: ['/content-library', '/content-library/*', '/care/guides/*', '/medicaid/guides/*'],
  preferStatic: true,
};
