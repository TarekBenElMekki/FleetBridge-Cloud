'use strict';
const crypto = require('node:crypto');

/** Local browser access gate. All database/API responses require an authorized cookie.
 * Never exposes the configured PIN to the browser. Not a substitute for OS encryption.
 */
function createAuthGate(pin = '1234') {
  const sessions = new Map();
  const failures = new Map();
  const ttl = 8 * 60 * 60 * 1000;
  const lockTime = 15 * 60 * 1000;
  const maxAttempts = 5;
  const salt = 'FleetBridge-V2.1-local-pin-gate';
  const reference = crypto.scryptSync(String(pin), salt, 32);
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const tokenFrom = req => {
    const raw = String(req.headers.cookie || '');
    const match = raw.match(/(?:^|;\s*)fbv21_session=([a-f0-9]{64})(?:;|$)/);
    return match?.[1] || '';
  };
  const authorized = req => {
    const token = tokenFrom(req);
    if (!token) return false;
    const key = hash(token), expiry = sessions.get(key);
    if (!expiry || Date.now() > expiry) { sessions.delete(key); return false; }
    return true;
  };
  const cookie = (token, maxAge) => `fbv21_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
  const login = (req, submitted) => {
    const id = req.socket.remoteAddress || 'local';
    const previous = failures.get(id);
    const now=Date.now();
    const current = previous && (!previous.until || previous.until>now) && now-(previous.first||now)<10*60*1000 ? previous : {count:0, until:0, first:now};
    if (current.until > Date.now()) return {ok:false, code:429, error:'Too many attempts. Try again in 15 minutes.'};
    const value = typeof submitted === 'string' && /^\d{4,16}$/.test(submitted) ? submitted : '';
    const tested = crypto.scryptSync(value, salt, 32);
    if (!crypto.timingSafeEqual(reference, tested)) {
      const count = current.count + 1;
      failures.set(id,{count, first:current.first, until:count>=maxAttempts ? Date.now()+lockTime : 0});
      return {ok:false,code:count>=maxAttempts?429:401,error:count>=maxAttempts?'Too many attempts. Try again in 15 minutes.':'Invalid PIN.',remaining:Math.max(0,maxAttempts-count)};
    }
    failures.delete(id);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(hash(token),Date.now()+ttl);
    return {ok:true, cookie:cookie(token, ttl/1000)};
  };
  const logout = req => {
    const token=tokenFrom(req);if(token)sessions.delete(hash(token));
    return cookie('',0);
  };
  return {authorized, login, logout};
}
module.exports={createAuthGate};
