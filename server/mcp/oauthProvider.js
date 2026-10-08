const prisma = require('../lib/prisma');
const { InvalidGrantError, InvalidTokenError } = require('@modelcontextprotocol/sdk/server/auth/errors.js');
const { signReq, sha, rand } = require('./shared');

const SCOPES = ['read', 'write'];
const ACCESS_TTL_S = 60 * 60;                 // 1 hour
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

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

function normaliseScopes(requested) {
  const asked = (requested && requested.length ? requested : SCOPES).filter((s) => SCOPES.includes(s));
  return asked.length ? asked : ['read'];
}

const provider = {
  clientsStore,

  // Step 1: the chat app sends the user's browser here. Hand off to the CleanStay web app,
  // where the user is already signed in (email or Google) and approves the connection.
  async authorize(client, params, res) {
    const scopes = normaliseScopes(params.scopes);
    const reqToken = signReq({
      cid: client.client_id,
      ru: params.redirectUri,
      cc: params.codeChallenge,
      st: params.state ?? null,
      sc: scopes,
      rs: params.resource ? params.resource.toString() : null,
    });
    const clientUrl = (process.env.CLIENT_URL || 'https://getcleanstays.com').replace(/\/$/, '');
    res.redirect(302, `${clientUrl}/connect?req=${encodeURIComponent(reqToken)}`);
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

module.exports = { provider, SCOPES, normaliseScopes };
