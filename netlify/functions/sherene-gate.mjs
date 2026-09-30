// Login gate for the /sherene deck. The deck's files live outside the public
// folder (private/sherene, bundled with this function) and are served only to
// a browser holding a valid session cookie. Credentials live in Netlify Blobs
// (store "deck-auth"): the password is stored as a scrypt hash, and the first
// login must change the seeded password before the deck opens.
//
// Routes: /sherene/login, /sherene/password, /sherene/logout, and every other
// path under /sherene, which serves the deck. auth.css and the fonts are public
// so the login page can render.
import { getStore } from '@netlify/blobs';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DECK = 'sherene';
const BASE = `/${DECK}`;
const COOKIE = `${DECK}_session`;
const SESSION_DAYS = 30;
const SEED_USER = 'sherene';
const SEED_PASSWORD = 'password123';
const MIN_PASSWORD = 10;
const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };

const store = () => getStore({ name: 'deck-auth', consistency: 'strong' });

async function deckRoot() {
  const candidates = [
    path.resolve(process.cwd(), 'private', DECK),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'private', DECK),
  ];
  for (const c of candidates) { try { if ((await stat(c)).isDirectory()) return c; } catch {} }
  throw new Error('deck files not found');
}

// --- credentials -----------------------------------------------------------
function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
function checkPassword(password, rec) {
  const { hash } = hashPassword(password, rec.salt);
  return hash.length === rec.hash.length && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(rec.hash, 'hex'));
}
async function getUser(name) {
  const s = store();
  let rec = await s.get(`user/${name}`, { type: 'json' });
  if (!rec && name === SEED_USER) {
    rec = { ...hashPassword(SEED_PASSWORD), mustChange: true, updatedAt: new Date().toISOString() };
    await s.setJSON(`user/${name}`, rec);
  }
  return rec;
}
async function secret() {
  const s = store();
  let v = await s.get('secret');
  if (!v) { v = randomBytes(32).toString('hex'); await s.set('secret', v); }
  return v;
}

// --- sessions ---------------------------------------------------------------
const b64 = (s) => Buffer.from(s).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString();
async function sign(parts) { return createHmac('sha256', await secret()).update(parts.join('|')).digest('base64url'); }
async function issue(user, rec) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const parts = [user, String(exp), rec.updatedAt];
  return `${b64(parts.join('|'))}.${await sign(parts)}`;
}
async function session(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig) return null;
  const parts = unb64(body).split('|');
  const [user, exp] = parts;
  const expected = await sign(parts);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  if (Number(exp) < Date.now()) return null;
  const rec = await getUser(user);
  if (!rec || rec.updatedAt !== parts[2]) return null;
  return { user, rec };
}
const setCookie = (token) => `${COOKIE}=${token}; Path=${BASE}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
const clearCookie = () => `${COOKIE}=; Path=${BASE}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// --- rate limiting ------------------------------------------------------------
async function locked(user) {
  const f = await store().get(`fail/${user}`, { type: 'json' });
  return f && f.n >= MAX_FAILURES && Date.now() < f.until;
}
async function noteFailure(user) {
  const s = store();
  const f = (await s.get(`fail/${user}`, { type: 'json' })) || { n: 0, until: 0 };
  const n = Date.now() < f.until ? f.n + 1 : 1;
  await s.setJSON(`fail/${user}`, { n, until: Date.now() + LOCK_MINUTES * 60000 });
}
async function clearFailures(user) { await store().delete(`fail/${user}`).catch(() => {}); }

// --- pages ------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title><link rel="stylesheet" href="${BASE}/auth.css"></head>
<body class="auth"><main class="auth-card">${body}</main></body></html>`;
}
const loginPage = (msg = '', user = '') => page('Sign in', `
<p class="eyebrow">Family Care Roadmap</p>
<h1>Sign in</h1>
<p class="lede">This page is private. Sign in with the login Richard gave you.</p>
${msg ? `<p class="notice">${esc(msg)}</p>` : ''}
<form method="post" action="${BASE}/login">
  <label>Login<input name="user" value="${esc(user)}" autocomplete="username" required autofocus></label>
  <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Sign in</button>
</form>`);
const passwordPage = (first, msg = '') => page('Choose a password', `
<p class="eyebrow">Family Care Roadmap</p>
<h1>${first ? 'Choose your own password' : 'Change your password'}</h1>
<p class="lede">${first ? 'Before the deck opens, please replace the password Richard gave you with one only you know.' : 'Enter your current password and the new one.'} At least ${MIN_PASSWORD} characters.</p>
${msg ? `<p class="notice">${esc(msg)}</p>` : ''}
<form method="post" action="${BASE}/password">
  <label>Current password<input name="current" type="password" autocomplete="current-password" required autofocus></label>
  <label>New password<input name="next" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
  <label>New password again<input name="again" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
  <button type="submit">Save password</button>
</form>
${first ? '' : `<p class="small"><a href="${BASE}/">Back to the deck</a></p>`}`);

const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { 'content-type': TYPES['.html'], 'cache-control': 'no-store', 'content-security-policy': CSP, 'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin', ...extra } });
const redirect = (to, extra = {}) => new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store', ...extra } });

async function serveFile(root, rel, inject) {
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) && file !== root) return null;
  let data;
  try { if (!(await stat(file)).isFile()) return null; data = await readFile(file); } catch { return null; }
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html' && inject) {
    data = data.toString()
      .replace('<link rel="stylesheet" href="inline.css">', `<link rel="stylesheet" href="inline.css"><link rel="stylesheet" href="${BASE}/auth.css">`)
      .replace('</body>', `<p class="deck-account"><a href="${BASE}/password">Change password</a> · <a href="${BASE}/logout">Log out</a></p></body>`);
  }
  const isFont = ext === '.woff2';
  return new Response(data, { headers: { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': isFont ? 'public, max-age=86400' : 'private, no-store', ...(ext === '.html' ? { 'content-security-policy': CSP, 'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin' } : {}), 'x-content-type-options': 'nosniff' } });
}

export default async (req) => {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || BASE;
  const root = await deckRoot();

  // Public: stylesheet and fonts for the auth pages.
  if (p === `${BASE}/auth.css` || p.startsWith(`${BASE}/fonts/`)) {
    return (await serveFile(root, p.slice(BASE.length + 1), false)) || new Response('Not found', { status: 404 });
  }

  if (p === `${BASE}/login`) {
    if (req.method === 'POST') {
      const form = await req.formData();
      const user = String(form.get('user') || '').trim().toLowerCase();
      const password = String(form.get('password') || '');
      if (!/^[a-z0-9._-]{1,40}$/.test(user)) return html(loginPage('That login was not recognized.', user), 401);
      if (await locked(user)) return html(loginPage(`Too many attempts. Please wait ${LOCK_MINUTES} minutes and try again.`, user), 429);
      const rec = await getUser(user);
      if (!rec || !checkPassword(password, rec)) { await noteFailure(user); return html(loginPage('That login and password did not match.', user), 401); }
      await clearFailures(user);
      const token = await issue(user, rec);
      return redirect(rec.mustChange ? `${BASE}/password` : `${BASE}/`, { 'set-cookie': setCookie(token) });
    }
    return html(loginPage());
  }

  if (p === `${BASE}/logout`) return redirect(`${BASE}/login`, { 'set-cookie': clearCookie() });

  const s = await session(req);
  if (!s) return redirect(`${BASE}/login`);

  if (p === `${BASE}/password`) {
    if (req.method === 'POST') {
      const form = await req.formData();
      const current = String(form.get('current') || ''), next = String(form.get('next') || ''), again = String(form.get('again') || '');
      if (!checkPassword(current, s.rec)) return html(passwordPage(s.rec.mustChange, 'The current password was not right.'), 400);
      if (next.length < MIN_PASSWORD) return html(passwordPage(s.rec.mustChange, `The new password needs at least ${MIN_PASSWORD} characters.`), 400);
      if (next !== again) return html(passwordPage(s.rec.mustChange, 'The two new passwords did not match.'), 400);
      if (next === current) return html(passwordPage(s.rec.mustChange, 'The new password has to be different from the current one.'), 400);
      const rec = { ...hashPassword(next), mustChange: false, updatedAt: new Date().toISOString() };
      await store().setJSON(`user/${s.user}`, rec);
      return redirect(`${BASE}/`, { 'set-cookie': setCookie(await issue(s.user, rec)) });
    }
    return html(passwordPage(s.rec.mustChange));
  }

  if (s.rec.mustChange) return redirect(`${BASE}/password`);

  const rel = p === BASE ? 'index.html' : p.slice(BASE.length + 1);
  return (await serveFile(root, rel, true)) || new Response('Not found', { status: 404 });
};

export const config = { path: ['/sherene', '/sherene/*'] };
