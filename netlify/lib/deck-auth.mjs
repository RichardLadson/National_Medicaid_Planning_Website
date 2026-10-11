// The admin login shared by the deck dashboards (sherene-gate) and the private Content Library
// (content-library): scrypt password hashes and signed session cookies in Netlify Blobs ("deck-auth").
import { getStore } from '@netlify/blobs';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'sherene_session';
export const SESSION_DAYS = 30;
export const SEED = { sherene: { password: 'password123', admin: false }, richard: { password: 'password123', admin: true } };
export const USER_RE = /^[a-z0-9._-]{1,40}$/;
export const store = () => getStore({ name: 'deck-auth', consistency: 'strong' });

// --- credentials -----------------------------------------------------------
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function checkPassword(password, rec) {
  const { hash } = hashPassword(password, rec.salt);
  return hash.length === rec.hash.length && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(rec.hash, 'hex'));
}
export async function getUser(name) {
  if (!USER_RE.test(name)) return null;
  const s = store();
  let rec = await s.get(`user/${name}`, { type: 'json' });
  if (!rec && SEED[name]) {
    rec = { ...hashPassword(SEED[name].password), admin: SEED[name].admin, email: '', mustChange: true, updatedAt: new Date().toISOString() };
    await s.setJSON(`user/${name}`, rec);
  }
  return rec;
}
export async function saveUser(name, rec) { await store().setJSON(`user/${name}`, rec); }
export async function secret() {
  const s = store();
  let v = await s.get('secret');
  if (!v) { v = randomBytes(32).toString('hex'); await s.set('secret', v); }
  return v;
}

// --- sessions ---------------------------------------------------------------
const b64 = (s) => Buffer.from(s).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString();
export async function sign(parts) { return createHmac('sha256', await secret()).update(parts.join('|')).digest('base64url'); }
export async function issue(user, rec) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const parts = [user, String(exp), rec.updatedAt];
  return `${b64(parts.join('|'))}.${await sign(parts)}`;
}
export async function session(req) {
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
export const setCookie = (token) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

