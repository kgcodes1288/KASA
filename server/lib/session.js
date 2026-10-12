// Browser sign-in lives in an HttpOnly cookie (JavaScript on the page can never read it, so a script-injection bug cannot steal it).
// API clients (tests, the AI connector's internal calls) keep using `Authorization: Bearer`.
const COOKIE = 'cs_session';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const secure = () => process.env.COOKIE_SECURE !== 'false';

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* ignore */ } }
  });
  return out;
}

const opts = () => ({ httpOnly: true, secure: secure(), sameSite: 'lax', path: '/' });
const setSession = (res, token) => res.cookie(COOKIE, token, { ...opts(), maxAge: MAX_AGE_MS });
const clearSession = (res) => res.clearCookie(COOKIE, opts());

module.exports = { COOKIE, parseCookies, setSession, clearSession, cookieOpts: opts };
