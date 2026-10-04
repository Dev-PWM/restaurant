'use strict';
const crypto = require('node:crypto');
const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'masaflow_staff';
function reject(message, statusCode, code) { throw Object.assign(new Error(message), { statusCode, code }); }
function createStaffAccess({ password = '', publicOrigin = '', now = Date.now } = {}) {
  let origin = '';
  if (publicOrigin) {
    const url = new URL(publicOrigin);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('MASAFLOW_PUBLIC_ORIGIN must be an HTTPS origin, such as https://orders.example.com.');
    origin = url.origin;
    if (!password) throw new Error('Set MASAFLOW_STAFF_PASSWORD before enabling a public website.');
  }
  if (password && (password.length < 12 || password.length > 256)) throw new Error('MASAFLOW_STAFF_PASSWORD must contain 12 to 256 characters.');
  const salt = crypto.randomBytes(32);
  const digest = value => crypto.createHmac('sha256', salt).update(value).digest();
  const expected = digest(password);
  const sessions = new Map(), attempts = new Map(), submissions = new Map();
  function token(req) { return String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || ''; }
  function authorized(req) {
    if (!password) return true;
    const key = token(req), expiry = sessions.get(key);
    if (!expiry || expiry <= now()) { sessions.delete(key); return false; }
    return true;
  }
  function limit(map, key, count, duration) {
    const time = now();
    for (const [key, bucket] of map) if (bucket.until <= time) map.delete(key);
    const bucket = map.get(key) || { count: 0, until: time + duration };
    if (map.size >= 2000 && !map.has(key)) reject('Too many requests. Please try again later.', 429, 'RATE_LIMITED');
    if (++bucket.count > count) reject('Too many requests. Please try again later.', 429, 'RATE_LIMITED');
    map.set(key, bucket);
  }
  function cookie(value, age) { return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${origin ? '; Secure' : ''}`; }
  return {
    enabled: Boolean(password), origin, authorized,
    require(req) { if (!authorized(req)) reject('Staff sign-in required.', 401, 'STAFF_SIGN_IN_REQUIRED'); },
    checkOrigin(req) {
      const expectedOrigin = origin || `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== expectedOrigin)) reject('Cross-origin actions are not allowed.', 403, 'CROSS_ORIGIN');
    },
    login(req, res, value) {
      const key = req.socket.remoteAddress || 'unknown';
      limit(attempts, key, 10, 15 * 60 * 1000);
      if (typeof value !== 'string' || value.length > 256 || !crypto.timingSafeEqual(digest(value), expected)) reject('Incorrect staff password.', 401, 'INVALID_PASSWORD');
      attempts.delete(key);
      for (const [key, expiry] of sessions) if (expiry <= now()) sessions.delete(key);
      if (sessions.size >= 1000) reject('Too many active staff sessions.', 429, 'RATE_LIMITED');
      const keyToken = crypto.randomBytes(32).toString('base64url');
      sessions.delete(token(req)); sessions.set(keyToken, now() + SESSION_MS);
      res.setHeader('Set-Cookie', cookie(keyToken, SESSION_MS / 1000));
    },
    logout(req, res) { sessions.delete(token(req)); res.setHeader('Set-Cookie', cookie('', 0)); },
    limitSubmission(req) { limit(submissions, req.socket.remoteAddress || 'unknown', 60, 60 * 1000); }
  };
}
module.exports = { createStaffAccess };
