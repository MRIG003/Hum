import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { hashToken } from './meeting.js';

export const SESSION_COOKIE = 'engage_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const derive = (password, salt) => scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex');

export const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

export const parseCookies = (header = '') =>
  Object.fromEntries(
    header.split(';').map((part) => part.trim().split(/=(.*)/s).slice(0, 2)).filter(([k]) => k),
  );

export const createAuth = ({ store, clock = Date.now }) => {
  const attempts = new Map(); // key -> timestamps

  const throttle = (key, limit = 10) => {
    const now = clock();
    const recent = (attempts.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
    if (recent.length >= limit) throw new AuthError('Too many attempts. Try again in a few minutes.', 429);
    attempts.set(key, [...recent, now]);
  };

  const startSession = (userId) => {
    const token = randomBytes(32).toString('hex');
    store.createSession(hashToken(token), userId, clock() + SESSION_TTL_MS);
    return token;
  };

  const register = (email, password, ip) => {
    throttle(`reg:${ip}`, 10);
    const address = normalizeEmail(email);
    if (!EMAIL_RE.test(address)) throw new AuthError('Enter a valid email address.');
    if (String(password ?? '').length < 8) throw new AuthError('Use a password of at least 8 characters.');
    if (String(password).length > 200) throw new AuthError('That password is too long.');
    const salt = randomBytes(16).toString('hex');
    const user = { id: randomBytes(8).toString('hex'), email: address, salt, hash: derive(password, salt), createdAt: clock() };
    if (!store.createUser(user)) throw new AuthError('An account with that email already exists.', 409);
    return { user, token: startSession(user.id) };
  };

  const login = (email, password, ip) => {
    const address = normalizeEmail(email);
    throttle(`login:${ip}`, 20);
    throttle(`login:${address}`, 8);
    const user = store.getUserByEmail(address);
    // Always run the derivation so timing does not reveal whether the email exists.
    const salt = user?.salt ?? '00'.repeat(16);
    const candidate = Buffer.from(derive(String(password ?? ''), salt), 'hex');
    const expected = Buffer.from(user?.hash ?? '00'.repeat(64), 'hex');
    if (!user || !timingSafeEqual(candidate, expected)) throw new AuthError('Email or password is not right.', 401);
    return { user, token: startSession(user.id) };
  };

  const userFromToken = (token) => {
    if (!token) return null;
    const hash = hashToken(token);
    const session = store.getSession(hash);
    if (!session) return null;
    if (session.expiresAt <= clock()) {
      store.deleteSession(hash);
      return null;
    }
    return store.getUser(session.userId);
  };

  const userFromRequest = (req) => userFromToken(parseCookies(req.headers.cookie)[SESSION_COOKIE]);

  const logout = (req) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) store.deleteSession(hashToken(token));
  };

  const cookie = (token, secure) =>
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure ? '; Secure' : ''}`;
  const clearCookie = (secure) =>
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;

  return { register, login, logout, userFromToken, userFromRequest, cookie, clearCookie };
};
