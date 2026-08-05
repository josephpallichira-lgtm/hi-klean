import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q, audit } from './db.js';

const SECRET = process.env.JWT_SECRET;
const COOKIE = 'hk_session';
const MAXAGE = Number(process.env.SESSION_HOURS || 12) * 3600 * 1000;

export const hash = (pw) => bcrypt.hash(pw, 12);
export const verify = (pw, h) => bcrypt.compare(pw, h);

export function issue(res, user) {
  const token = jwt.sign(
    { id: user.id, u: user.username, role: user.role, e: Number(user.token_epoch || 0) },
    SECRET, { algorithm: 'HS256', expiresIn: Math.floor(MAXAGE / 1000) });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAXAGE,
    path: '/'
  });
}
export const clear = (res) => res.clearCookie(COOKIE, { path: '/' });
/** verify-and-read a token; used to know whose epoch to bump on logout */
export const jwtDecode = (t) => { try { return jwt.verify(t, SECRET, { algorithms: ['HS256'] }); } catch { return null; } };

export async function auth(req, res, next) {
  const t = req.cookies?.[COOKIE];
  if (!t) return res.status(401).json({ error: 'Not signed in' });
  let p;
  try { p = jwt.verify(t, SECRET, { algorithms: ['HS256'] }); }
  catch { clear(res); return res.status(401).json({ error: 'Session expired' }); }
  const { rows } = await q('SELECT id, username, role, active, full_name, token_epoch FROM users WHERE id=$1', [p.id]);
  if (!rows[0] || !rows[0].active) { clear(res); return res.status(401).json({ error: 'Account disabled' }); }
  // a password change or admin reset bumps token_epoch, which instantly kills older sessions
  if (Number(rows[0].token_epoch || 0) !== Number(p.e || 0)) {
    clear(res); return res.status(401).json({ error: 'Session ended — the password was changed' });
  }
  req.user = rows[0];
  next();
}
export function admin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
  next();
}
/** cheap CSRF defence: browsers cannot set this header cross-origin without CORS approval */
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'hk') return res.status(403).json({ error: 'Bad request origin' });
  next();
}

export async function logLogin(user, ok, ip) {
  await audit(null, ok ? user : { id: null, username: user?.username || '?' },
    ok ? 'login' : 'login_failed', 'user', user?.id || '', { ip });
}
