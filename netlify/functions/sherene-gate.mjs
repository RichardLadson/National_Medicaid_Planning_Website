// Login gate for the /sherene deck. The deck's files live outside the public
// folder (private/sherene, bundled with this function) and are served only to
// a browser holding a valid session cookie. Credentials live in Netlify Blobs
// (store "deck-auth"): the password is stored as a scrypt hash, and a seeded
// login must change its password before the deck opens.
//
// Routes under /sherene:
//   /login, /logout, /password           sign in, sign out, change password
//   /reset, /reset/<token>               forgot-password request and the emailed link
//   /admin                               for a login with the admin flag: set an
//                                        email address, make a reset link, send it
//   anything else                        the deck (needs a session)
// auth.css and the fonts are public so the sign-in page can render.
//
// Reset emails go through GoHighLevel when GHL_API_KEY, GHL_LOCATION_ID and
// (optionally) GHL_EMAIL_FROM are set in the site's environment. Without them
// the admin page still produces a reset link that can be sent by hand.
import { getStore } from '@netlify/blobs';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DECK = 'sherene';
const BASE = `/${DECK}`;
const COOKIE = `${DECK}_session`;
const SESSION_DAYS = 30;
const SEED = { sherene: { password: 'password123', admin: false }, richard: { password: 'password123', admin: true } };
const MIN_PASSWORD = 10;
const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;
const RESET_MINUTES = 60;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const USER_RE = /^[a-z0-9._-]{1,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const store = () => getStore({ name: 'deck-auth', consistency: 'strong' });
const env = (k) => (globalThis.Netlify?.env?.get(k)) || process.env[k] || '';

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
  if (!USER_RE.test(name)) return null;
  const s = store();
  let rec = await s.get(`user/${name}`, { type: 'json' });
  if (!rec && SEED[name]) {
    rec = { ...hashPassword(SEED[name].password), admin: SEED[name].admin, email: '', mustChange: true, updatedAt: new Date().toISOString() };
    await s.setJSON(`user/${name}`, rec);
  }
  return rec;
}
async function saveUser(name, rec) { await store().setJSON(`user/${name}`, rec); }
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
async function locked(key) {
  const f = await store().get(`fail/${key}`, { type: 'json' });
  return f && f.n >= MAX_FAILURES && Date.now() < f.until;
}
async function noteFailure(key) {
  const s = store();
  const f = (await s.get(`fail/${key}`, { type: 'json' })) || { n: 0, until: 0 };
  const n = Date.now() < f.until ? f.n + 1 : 1;
  await s.setJSON(`fail/${key}`, { n, until: Date.now() + LOCK_MINUTES * 60000 });
}
async function clearFailures(key) { await store().delete(`fail/${key}`).catch(() => {}); }

// --- password reset --------------------------------------------------------------
const sha = (s) => createHash('sha256').update(s).digest('hex');
async function makeResetLink(user, origin) {
  const token = randomBytes(24).toString('base64url');
  await store().setJSON(`reset/${user}`, { hash: sha(token), until: Date.now() + RESET_MINUTES * 60000 });
  return `${origin}${BASE}/reset/${token}`;
}
async function userForResetToken(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token || '')) return null;
  const s = store();
  const { blobs } = await s.list({ prefix: 'reset/' });
  for (const b of blobs) {
    const r = await s.get(b.key, { type: 'json' });
    if (r && r.hash === sha(token) && Date.now() < r.until) return b.key.slice('reset/'.length);
  }
  return null;
}
const emailConfigured = () => Boolean(env('GHL_API_KEY') && env('GHL_LOCATION_ID'));
async function ghl(pathname, payload) {
  const res = await fetch(`${env('GHL_BASE_URL') || 'https://services.leadconnectorhq.com'}${pathname}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${env('GHL_API_KEY')}`, Version: '2021-07-28' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`GoHighLevel ${pathname} returned ${res.status}`);
  return res.json();
}
async function sendResetEmail(email, link) {
  const contact = await ghl('/contacts/upsert', { locationId: env('GHL_LOCATION_ID'), email });
  const contactId = contact?.contact?.id;
  if (!contactId) throw new Error('GoHighLevel returned no contact id');
  const payload = {
    type: 'Email', contactId,
    subject: 'Reset your password for the Family Care Roadmap',
    html: `<p>Hi,</p><p>Someone asked to reset the password for your login to the Family Care Roadmap. If that was you, open this link within the next hour and choose a new password:</p><p><a href="${link}">${link}</a></p><p>If it wasn't you, ignore this message and nothing changes.</p><p>Richard</p>`,
  };
  if (env('GHL_EMAIL_FROM')) payload.emailFrom = env('GHL_EMAIL_FROM');
  await ghl('/conversations/messages', payload);
}

// --- pages ------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title><link rel="stylesheet" href="${BASE}/auth.css"></head>
<body class="auth"><main class="auth-card">${body}</main></body></html>`;
}
const notice = (msg) => (msg ? `<p class="notice">${esc(msg)}</p>` : '');
const loginPage = (msg = '', user = '') => page('Sign in', `
<p class="eyebrow">Family Care Roadmap</p>
<h1>Sign in</h1>
<p class="lede">This page is private. Sign in with the login Richard gave you.</p>
${notice(msg)}
<form method="post" action="${BASE}/login">
  <label>Login<input name="user" value="${esc(user)}" autocomplete="username" required autofocus></label>
  <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Sign in</button>
</form>
<p class="small"><a href="${BASE}/reset">Forgot your password?</a></p>`);
const passwordPage = (first, msg = '') => page('Choose a password', `
<p class="eyebrow">Family Care Roadmap</p>
<h1>${first ? 'Choose your own password' : 'Change your password'}</h1>
<p class="lede">${first ? 'Before the deck opens, please replace the password Richard gave you with one only you know.' : 'Enter your current password and the new one.'} At least ${MIN_PASSWORD} characters.</p>
${notice(msg)}
<form method="post" action="${BASE}/password">
  <label>Current password<input name="current" type="password" autocomplete="current-password" required autofocus></label>
  <label>New password<input name="next" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
  <label>New password again<input name="again" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
  <button type="submit">Save password</button>
</form>
${first ? '' : `<p class="small"><a href="${BASE}/">Back to the deck</a></p>`}`);
const resetRequestPage = (msg = '', done = false) => page('Reset your password', `
<p class="eyebrow">Family Care Roadmap</p>
<h1>Reset your password</h1>
${done ? `<p class="lede">${esc(msg)}</p>` : `<p class="lede">Enter your login and we'll email you a link to choose a new password.</p>${notice(msg)}
<form method="post" action="${BASE}/reset">
  <label>Login<input name="user" autocomplete="username" required autofocus></label>
  <button type="submit">Email me a reset link</button>
</form>`}
<p class="small"><a href="${BASE}/login">Back to sign in</a></p>`);
const resetFormPage = (token, msg = '') => page('Choose a new password', `
<p class="eyebrow">Family Care Roadmap</p>
<h1>Choose a new password</h1>
<p class="lede">At least ${MIN_PASSWORD} characters. You'll be signed in as soon as it's saved.</p>
${notice(msg)}
<form method="post" action="${BASE}/reset/${esc(token)}">
  <label>New password<input name="next" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required autofocus></label>
  <label>New password again<input name="again" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
  <button type="submit">Save password</button>
</form>`);
const resetExpiredPage = () => page('Link expired', `
<p class="eyebrow">Family Care Roadmap</p>
<h1>That link has expired</h1>
<p class="lede">Reset links work for ${RESET_MINUTES} minutes. Ask for a new one and use it straight away.</p>
<p class="small"><a href="${BASE}/reset">Request a new link</a> · <a href="${BASE}/login">Back to sign in</a></p>`);
async function adminPage(msg = '', link = '') {
  const s = store();
  const { blobs } = await s.list({ prefix: 'user/' });
  const names = new Set([...Object.keys(SEED), ...blobs.map((b) => b.key.slice(5))]);
  const rows = [];
  for (const name of [...names].sort()) {
    const rec = await getUser(name);
    if (!rec) continue;
    rows.push(`<tr><td>${esc(name)}${rec.admin ? ' <span class="tag">admin</span>' : ''}</td><td>${esc(rec.email || '')}</td><td>${rec.mustChange ? 'must change password' : 'set'}</td></tr>`);
  }
  return page('Logins', `
<p class="eyebrow">Family Care Roadmap</p>
<h1>Logins</h1>
<p class="lede">Reset emails ${emailConfigured() ? 'are sent through GoHighLevel.' : 'are not set up yet: make a link here and send it yourself.'}</p>
${notice(msg)}
${link ? `<p class="notice">Reset link (works for ${RESET_MINUTES} minutes):<br><code class="link">${esc(link)}</code></p>` : ''}
<table class="users"><tr><th>Login</th><th>Email</th><th>Password</th></tr>${rows.join('')}</table>
<h2>Set an email address</h2>
<form method="post" action="${BASE}/admin">
  <input type="hidden" name="action" value="email">
  <label>Login<input name="user" required></label>
  <label>Email (leave empty to clear)<input name="email" type="email"></label>
  <button type="submit">Save email</button>
</form>
<h2>Make a reset link</h2>
<form method="post" action="${BASE}/admin">
  <input type="hidden" name="action" value="link">
  <label>Login<input name="user" required></label>
  <button type="submit">Make a link</button>
</form>
<h2>Give a temporary password</h2>
<p class="small">They'll have to choose their own at the next sign-in.</p>
<form method="post" action="${BASE}/admin">
  <input type="hidden" name="action" value="temp">
  <label>Login<input name="user" required></label>
  <label>Temporary password<input name="temp" type="text" autocomplete="off" required></label>
  <button type="submit">Set temporary password</button>
</form>
${emailConfigured() ? `<h2>Email a reset link</h2>
<form method="post" action="${BASE}/admin">
  <input type="hidden" name="action" value="send">
  <label>Login<input name="user" required></label>
  <button type="submit">Send the email</button>
</form>` : ''}
<p class="small"><a href="${BASE}/">Back to the deck</a> · <a href="${BASE}/password">Change my password</a> · <a href="${BASE}/logout">Log out</a></p>`);
}

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
      .replace('<span class="keys">', `<span class="deck-account">Signed in as ${esc(inject.user)} · ${inject.admin ? `<a href="${BASE}/admin">Logins</a> · ` : ''}<a href="${BASE}/password">Change password</a> · <a href="${BASE}/logout">Log out</a></span><span class="keys">`);
  }
  const isFont = ext === '.woff2';
  return new Response(data, { headers: { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': isFont ? 'public, max-age=86400' : 'private, no-store', ...(ext === '.html' ? { 'content-security-policy': CSP, 'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin' } : {}), 'x-content-type-options': 'nosniff' } });
}

function validNew(next, again) {
  if (next.length < MIN_PASSWORD) return `The new password needs at least ${MIN_PASSWORD} characters.`;
  if (next !== again) return 'The two new passwords did not match.';
  return '';
}

export default async (req) => {
  const url = new URL(req.url);
  const origin = env('SHERENE_BASE_URL') || url.origin;
  const p = url.pathname.replace(/\/+$/, '') || BASE;
  const root = await deckRoot();
  const form = async () => { try { return await req.formData(); } catch { return new FormData(); } };

  // Public: stylesheet and fonts for the auth pages.
  if (p === `${BASE}/auth.css` || p.startsWith(`${BASE}/fonts/`)) {
    return (await serveFile(root, p.slice(BASE.length + 1), null)) || new Response('Not found', { status: 404 });
  }

  if (p === `${BASE}/login`) {
    if (req.method !== 'POST') return html(loginPage());
    const f = await form();
    const user = String(f.get('user') || '').trim().toLowerCase();
    const password = String(f.get('password') || '');
    if (!USER_RE.test(user)) return html(loginPage('That login was not recognized.', user), 401);
    if (await locked(user)) return html(loginPage(`Too many attempts. Please wait ${LOCK_MINUTES} minutes and try again.`, user), 429);
    const rec = await getUser(user);
    if (!rec || !checkPassword(password, rec)) { await noteFailure(user); return html(loginPage('That login and password did not match.', user), 401); }
    await clearFailures(user);
    return redirect(rec.mustChange ? `${BASE}/password` : `${BASE}/`, { 'set-cookie': setCookie(await issue(user, rec)) });
  }

  if (p === `${BASE}/logout`) return redirect(`${BASE}/login`, { 'set-cookie': clearCookie() });

  if (p === `${BASE}/reset`) {
    if (req.method !== 'POST') return html(resetRequestPage());
    const f = await form();
    const user = String(f.get('user') || '').trim().toLowerCase();
    const rec = await getUser(user);
    if (!rec) return html(resetRequestPage('That login was not recognized.'), 404);
    if (await locked(`reset:${user}`)) return html(resetRequestPage(`Too many requests. Please wait ${LOCK_MINUTES} minutes and try again.`), 429);
    await noteFailure(`reset:${user}`);
    if (!emailConfigured()) return html(resetRequestPage("Reset emails aren't switched on yet. Ask Richard and he'll send you a reset link.", true));
    if (!rec.email) return html(resetRequestPage("There's no email on file for that login yet, so a link can't be sent automatically. Ask Richard and he'll send you a reset link.", true));
    try { await sendResetEmail(rec.email, await makeResetLink(user, origin)); }
    catch { return html(resetRequestPage("The email couldn't be sent just now. Ask Richard and he'll send you a reset link."), 502); }
    const masked = rec.email.replace(/^(.).*(@.*)$/, '$1…$2');
    return html(resetRequestPage(`A reset link is on its way to ${masked}. It works for ${RESET_MINUTES} minutes.`, true));
  }

  if (p.startsWith(`${BASE}/reset/`)) {
    const token = p.slice(`${BASE}/reset/`.length);
    const user = await userForResetToken(token);
    if (!user) return html(resetExpiredPage(), 410);
    if (req.method !== 'POST') return html(resetFormPage(token));
    const f = await form();
    const next = String(f.get('next') || ''), again = String(f.get('again') || '');
    const problem = validNew(next, again);
    if (problem) return html(resetFormPage(token, problem), 400);
    const old = await getUser(user);
    const rec = { ...old, ...hashPassword(next), mustChange: false, updatedAt: new Date().toISOString() };
    await saveUser(user, rec);
    await store().delete(`reset/${user}`).catch(() => {});
    await clearFailures(user);
    return redirect(`${BASE}/`, { 'set-cookie': setCookie(await issue(user, rec)) });
  }

  const s = await session(req);
  if (!s) return redirect(`${BASE}/login`);

  if (p === `${BASE}/password`) {
    if (req.method !== 'POST') return html(passwordPage(s.rec.mustChange));
    const f = await form();
    const current = String(f.get('current') || ''), next = String(f.get('next') || ''), again = String(f.get('again') || '');
    if (!checkPassword(current, s.rec)) return html(passwordPage(s.rec.mustChange, 'The current password was not right.'), 400);
    const problem = validNew(next, again) || (next === current ? 'The new password has to be different from the current one.' : '');
    if (problem) return html(passwordPage(s.rec.mustChange, problem), 400);
    const rec = { ...s.rec, ...hashPassword(next), mustChange: false, updatedAt: new Date().toISOString() };
    await saveUser(s.user, rec);
    return redirect(`${BASE}/`, { 'set-cookie': setCookie(await issue(s.user, rec)) });
  }

  if (s.rec.mustChange) return redirect(`${BASE}/password`);

  if (p === `${BASE}/admin`) {
    if (!s.rec.admin) return redirect(`${BASE}/`);
    if (req.method !== 'POST') return html(await adminPage());
    const f = await form();
    const action = String(f.get('action') || '');
    const user = String(f.get('user') || '').trim().toLowerCase();
    const rec = await getUser(user);
    if (!rec) return html(await adminPage('That login does not exist.'), 404);
    if (action === 'email') {
      const email = String(f.get('email') || '').trim();
      if (email && !EMAIL_RE.test(email)) return html(await adminPage('That email address does not look right.'), 400);
      await saveUser(user, { ...rec, email });
      return html(await adminPage(email ? `Saved ${email} for ${user}.` : `Cleared the email address for ${user}.`));
    }
    if (action === 'link') return html(await adminPage(`Reset link made for ${user}.`, await makeResetLink(user, origin)));
    if (action === 'temp') {
      const temp = String(f.get('temp') || '');
      if (temp.length < 8) return html(await adminPage('A temporary password needs at least 8 characters.'), 400);
      await saveUser(user, { ...rec, ...hashPassword(temp), mustChange: true, updatedAt: new Date().toISOString() });
      await clearFailures(user);
      return html(await adminPage(`${user} can now sign in with the temporary password and will be asked to choose a new one.`));
    }
    if (action === 'send') {
      if (!emailConfigured()) return html(await adminPage('Email is not set up.'), 400);
      if (!rec.email) return html(await adminPage(`${user} has no email address on file.`), 400);
      try { await sendResetEmail(rec.email, await makeResetLink(user, origin)); }
      catch (e) { return html(await adminPage(`The email could not be sent: ${e.message}`), 502); }
      return html(await adminPage(`Reset email sent to ${rec.email}.`));
    }
    return html(await adminPage('Unknown action.'), 400);
  }

  const rel = p === BASE ? 'index.html' : p.slice(BASE.length + 1);
  return (await serveFile(root, rel, { user: s.user, admin: s.rec.admin })) || new Response('Not found', { status: 404 });
};

export const config = { path: ['/sherene', '/sherene/*'] };
