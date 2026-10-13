const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { COOKIE, parseCookies } = require('../lib/session');
const { secLog } = require('../lib/security');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    // browser session cookie: state-changing requests must also carry our custom header, which other websites cannot send
    // without a CORS preflight that this API refuses (CSRF protection on top of SameSite=Lax)
    token = parseCookies(req)[COOKIE] || null;
    if (token && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-cleanstay-csrf'] !== '1')
    { secLog('csrf_blocked', req, `${req.method} ${req.baseUrl}`); return res.status(403).json({ message: 'Blocked a request that did not come from the CleanStay app.' }); }
  }
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(401).json({ message: 'User not found' });
    if (!decoded.mcp && (decoded.v ?? 0) !== (user.tokenVersion ?? 0)) return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    req.user = user;
    req.viaMcp = !!decoded.mcp;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
