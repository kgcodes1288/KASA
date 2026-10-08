const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { InvalidGrantError, InvalidTokenError } = require('@modelcontextprotocol/sdk/server/auth/errors.js');
const { renderLoginPage } = require('./loginPage');

const SCOPES = ['read', 'write'];
const ACCESS_TTL_S = 60 * 60;                 // 1 hour
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
const CODE_TTL_MS = 5 * 60 * 1000;

const secret = () => process.env.JWT_SECRET || 'dev_secret';
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const rand = (n = 32) => crypto.randomBytes(n).toString('base64url');

// ── client registry (Dynamic Client Registration) ────────────────────────────
const clientsStore = {
  async getClient(clientId) {
    const row = await prisma.oAuthClient.findUnique({ where: { clientId } });
    return row ? row.metadata : undefined;
  },
  async registerClient(client) {
    await prisma.oAuthClient.create({ data: { clientId: client.client_id, metadata: client } });
    return client;
  },
};

// ── login throttle: 8 failures / 15 min per ip+email ─────────────────────────
const failures = new Map();
const throttleKey = (ip, email) => `${ip}|${email}`;
function isThrottled(key) {
  const e = failures.get(key);
  if (!e) return false;
  if (Date.now() - e.first > 15 * 60 * 1000) { failures.delete(key); return false; }
  return e.count >= 8;
}
function recordFailure(key) {
  const e = failures.get(key);
  if (!e || Date.now() - e.first > 15 * 60 * 1000) failures.set(key, { count: 1, first: Date.now() });
  else e.count += 1;
}

function normaliseScopes(requested) {
  const asked = (requested && requested.length ? requested : SCOPES).filter((s) => SCOPES.includes(s));
  return asked.length ? asked : ['read'];
}

const provider = {
  clientsStore,

  // Step 1: the chat app sends the user's browser here. Show sign-in + consent.
  async authorize(client, params, res) {
    const scopes = normaliseScopes(params.scopes);
    const reqToken = jwt.sign({
      purpose: 'oauth-authorize',
      cid: client.client_id,
      ru: params.redirectUri,
      cc: params.codeChallenge,
      st: params.state ?? null,
      sc: scopes,
      rs: params.resource ? params.resource.toString() : null,
    }, secret(), { expiresIn: '10m' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderLoginPage({
      reqToken,
      clientName: client.client_name || 'An app',
      wantsWrite: scopes.includes('write'),
      clientUrl: process.env.CLIENT_URL || 'https://getcleanstays.com',
    }));
  },

  async challengeForAuthorizationCode(client, authorizationCode) {
    const row = await prisma.oAuthCode.findUnique({ where: { codeHash: sha(authorizationCode) } });
    if (!row || row.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
    return row.codeChallenge;
  },

  async exchangeAuthorizationCode(client, authorizationCode, _verifier, redirectUri) {
    const codeHash = sha(authorizationCode);
    const row = await prisma.oAuthCode.findUnique({ where: { codeHash } });
    if (!row || row.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
    if (row.expiresAt < new Date()) throw new InvalidGrantError('Authorization code expired');
    if (redirectUri && redirectUri !== row.redirectUri) throw new InvalidGrantError('redirect_uri mismatch');

    // single use — and if a code is replayed, kill everything issued to this client+user
    const claimed = await prisma.oAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) {
      await prisma.oAuthToken.updateMany({ where: { clientId: row.clientId, userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new InvalidGrantError('Authorization code already used');
    }

    const access = rand();
    const refresh = rand();
    await prisma.oAuthToken.create({
      data: {
        accessHash: sha(access), refreshHash: sha(refresh),
        clientId: row.clientId, userId: row.userId, scopes: row.scopes, resource: row.resource,
        accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000),
        refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: row.scopes.join(' ') };
  },

  async exchangeRefreshToken(client, refreshToken, scopes) {
    const row = await prisma.oAuthToken.findUnique({ where: { refreshHash: sha(refreshToken) } });
    if (!row || row.clientId !== client.client_id || row.revokedAt || !row.refreshExpiresAt || row.refreshExpiresAt < new Date())
      throw new InvalidGrantError('Invalid refresh token');
    const granted = scopes && scopes.length ? scopes.filter((s) => row.scopes.includes(s)) : row.scopes;
    const access = rand();
    const refresh = rand();
    await prisma.oAuthToken.update({
      where: { id: row.id },
      data: {
        accessHash: sha(access), refreshHash: sha(refresh), scopes: granted,
        accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000),
        refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: granted.join(' ') };
  },

  async verifyAccessToken(token) {
    const row = await prisma.oAuthToken.findUnique({ where: { accessHash: sha(token) } });
    if (!row || row.revokedAt || row.accessExpiresAt < new Date()) throw new InvalidTokenError('Invalid or expired token');
    prisma.oAuthToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return {
      token,
      clientId: row.clientId,
      scopes: row.scopes,
      expiresAt: Math.floor(row.accessExpiresAt.getTime() / 1000),
      extra: { userId: row.userId },
    };
  },

  async revokeToken(client, request) {
    const h = sha(request.token);
    await prisma.oAuthToken.updateMany({
      where: { clientId: client.client_id, revokedAt: null, OR: [{ accessHash: h }, { refreshHash: h }] },
      data: { revokedAt: new Date() },
    });
  },
};

// Step 2: the sign-in form posts here. Check credentials, then send the browser back to the app with a code.
async function handleConsent(req, res) {
  const { req: reqToken, email = '', password = '', action, allow_write } = req.body || {};
  let claims;
  try {
    claims = jwt.verify(reqToken, secret());
    if (claims.purpose !== 'oauth-authorize') throw new Error('bad purpose');
  } catch {
    return res.status(400).send('This sign-in link has expired. Please go back to your chat app and connect again.');
  }

  const redirect = (params) => {
    const u = new URL(claims.ru);
    Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
    return res.redirect(302, u.toString());
  };

  if (action === 'deny') return redirect({ error: 'access_denied', state: claims.st });

  const client = await clientsStore.getClient(claims.cid);
  if (!client) return res.status(400).send('Unknown application.');
  const page = (error) => res.status(200).type('html').send(renderLoginPage({
    reqToken, clientName: client.client_name || 'An app', wantsWrite: claims.sc.includes('write'), error, email,
    clientUrl: process.env.CLIENT_URL || 'https://getcleanstays.com',
  }));

  const normEmail = String(email).trim().toLowerCase();
  const key = throttleKey(req.ip, normEmail);
  if (isThrottled(key)) return page('Too many attempts. Please wait 15 minutes and try again.');

  const user = await prisma.user.findUnique({ where: { email: normEmail } });
  const ok = user?.password && await bcrypt.compare(String(password), user.password);
  if (!ok) { recordFailure(key); return page('Incorrect email or password.'); }
  failures.delete(key);

  const scopes = claims.sc.filter((s) => s === 'read' || (s === 'write' && allow_write === 'on'));
  const code = rand();
  await prisma.oAuthCode.create({
    data: {
      codeHash: sha(code), clientId: claims.cid, userId: user.id, scopes,
      codeChallenge: claims.cc, redirectUri: claims.ru, resource: claims.rs,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return redirect({ code, state: claims.st });
}

module.exports = { provider, handleConsent, SCOPES };
