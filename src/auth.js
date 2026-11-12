import crypto from 'node:crypto';

/* ---------- 密码：scrypt 加盐哈希，数据库里不存明文 ---------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function randomPassword() {
  // 去掉容易看混的字符
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(14), (b) => chars[b % chars.length]).join('');
}

/* ---------- 登录状态：签名 Cookie，不需要在服务器上存会话 ---------- */

const SESSION_DAYS = 14;

export function createSession(secret) {
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  return `${expires}.${sign(String(expires), secret)}`;
}

export function isValidSession(token, secret) {
  const [expires, mac] = String(token || '').split('.');
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  const expected = sign(expires, secret);
  return mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

export const SESSION_MAX_AGE = SESSION_DAYS * 86400;

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

/* ---------- 登录限次：同一 IP 连续输错 5 次，锁定 15 分钟 ---------- */

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
const attempts = new Map();

export function loginLockRemaining(ip) {
  const a = attempts.get(ip);
  if (!a || a.fails < MAX_FAILS) return 0;
  const left = a.lockedUntil - Date.now();
  if (left <= 0) {
    attempts.delete(ip);
    return 0;
  }
  return Math.ceil(left / 60_000);
}

export function recordLoginFailure(ip) {
  const a = attempts.get(ip) || { fails: 0, lockedUntil: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) a.lockedUntil = Date.now() + LOCK_MS;
  attempts.set(ip, a);
  if (attempts.size > 5000) attempts.clear(); // 防止被大量不同 IP 撑爆内存
  return Math.max(0, MAX_FAILS - a.fails);
}

export function clearLoginFailures(ip) {
  attempts.delete(ip);
}
