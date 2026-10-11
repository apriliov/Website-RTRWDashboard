'use strict';
const crypto = require('node:crypto');
const store = require('./store');
const { cookies } = require('./http');

const COOKIE = 'rt_admin';
const TTL_MS = 8 * 60 * 60 * 1000;
const WEAK = ['', 'admin123', 'ganti-password-ini'];
const onVercel = () => !!process.env.VERCEL;

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Serverless has no writable disk: derive the secret from the admin password instead.
  if (onVercel()) return crypto.createHash('sha256').update(`rtrw-session:${process.env.ADMIN_PASSWORD || ''}`).digest('hex');
  let rec = store.readLocal('secret', null);
  if (!rec || !rec.value) {
    rec = { value: crypto.randomBytes(32).toString('hex') };
    store.writeLocal('secret', rec);
  }
  return rec.value;
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(a, b);

// On Vercel the password only comes from the ADMIN_PASSWORD environment variable.
const fileAuth = () => (onVercel() ? null : store.readLocal('auth', null));
const configured = () => !onVercel() || !!process.env.ADMIN_PASSWORD;
const canChangePassword = () => !onVercel();

function usingDefaultPassword() {
  if (fileAuth()) return false;
  return WEAK.includes(process.env.ADMIN_PASSWORD || (onVercel() ? '' : 'admin123'));
}

function checkPassword(password) {
  const rec = fileAuth();
  if (rec) return safeEqual(Buffer.from(rec.hash, 'hex'), crypto.scryptSync(String(password), rec.salt, 32));
  const expected = process.env.ADMIN_PASSWORD || (onVercel() ? null : 'admin123');
  if (expected === null) return false;
  return safeEqual(sha(password), sha(expected));
}

function setPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  store.writeLocal('auth', { salt, hash: crypto.scryptSync(String(password), salt, 32).toString('hex') });
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function sessionCookie(req) {
  const token = sign({ exp: Date.now() + TTL_MS });
  const secure = onVercel() || process.env.COOKIE_SECURE === '1' || (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-proto'] === 'https');
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL_MS / 1000}${secure ? '; Secure' : ''}`;
}

const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

function isAdmin(req) {
  if (!configured()) return false;
  const token = cookies(req)[COOKIE];
  if (!token) return false;
  const [body, mac] = token.split('.');
  if (!body || !mac) return false;
  const expect = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (mac.length !== expect.length || !safeEqual(Buffer.from(mac), Buffer.from(expect))) return false;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')).exp > Date.now();
  } catch {
    return false;
  }
}

module.exports = { checkPassword, setPassword, usingDefaultPassword, canChangePassword, configured, sessionCookie, clearCookie, isAdmin };
