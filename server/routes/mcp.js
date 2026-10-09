const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { verifyReq, sha, rand, CODE_TTL_MS } = require('../mcp/shared');

// Chat apps we expect to see; anything else gets a warning on the consent screen
const KNOWN_APP_HOSTS = ['claude.ai', 'claude.com', 'anthropic.com', 'chatgpt.com', 'openai.com', 'gemini.google.com', 'google.com'];
const isKnownApp = (host) => KNOWN_APP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

// Reads a pending authorization request (created by the MCP service) for the consent screen
async function loadRequest(token) {
  let claims;
  try { claims = verifyReq(token); } catch { return null; }
  const row = await prisma.oAuthClient.findUnique({ where: { clientId: claims.cid } });
  if (!row) return null;
  return { claims, clientName: row.metadata?.client_name || 'An app' };
}

// GET /api/mcp/authorize-info?req= — what the "Allow this app?" screen shows
router.get('/authorize-info', auth, async (req, res) => {
  const r = await loadRequest(req.query.req);
  if (!r) return res.status(400).json({ message: 'This connection link has expired. Go back to your chat app and connect again.' });
  const ru = new URL(r.claims.ru);
  res.json({ clientName: r.clientName, wantsWrite: r.claims.sc.includes('write'), redirectHost: ru.host, knownApp: isKnownApp(ru.hostname) });
});

// POST /api/mcp/authorize — the signed-in user allows or denies; returns where to send the browser next
router.post('/authorize', auth, async (req, res) => {
  try {
    const { req: token, action, allowWrite } = req.body || {};
    const r = await loadRequest(token);
    if (!r) return res.status(400).json({ message: 'This connection link has expired. Go back to your chat app and connect again.' });
    const { claims } = r;
    const back = new URL(claims.ru);
    if (claims.st) back.searchParams.set('state', claims.st);

    if (action !== 'allow') {
      back.searchParams.set('error', 'access_denied');
      return res.json({ redirectUrl: back.toString() });
    }
    const scopes = claims.sc.filter((s) => s === 'read' || (s === 'write' && allowWrite === true));
    const code = rand();
    await prisma.oAuthCode.create({
      data: {
        codeHash: sha(code), clientId: claims.cid, userId: req.user.id, scopes,
        codeChallenge: claims.cc, redirectUri: claims.ru, resource: claims.rs,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    back.searchParams.set('code', code);
    res.json({ redirectUrl: back.toString() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/mcp/connections — chat apps connected to this account + recent assistant activity
router.get('/connections', auth, async (req, res) => {
  try {
    const tokens = await prisma.oAuthToken.findMany({
      where: { userId: req.user.id, revokedAt: null, refreshExpiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
    const clients = await prisma.oAuthClient.findMany({ where: { clientId: { in: [...new Set(tokens.map((t) => t.clientId))] } } });
    const names = Object.fromEntries(clients.map((c) => [c.clientId, c.metadata?.client_name || 'Unnamed app']));
    const byClient = {};
    tokens.forEach((t) => {
      const c = (byClient[t.clientId] ||= { clientId: t.clientId, name: names[t.clientId], scopes: new Set(), connectedAt: t.createdAt, lastUsedAt: null });
      t.scopes.forEach((s) => c.scopes.add(s));
      if (t.lastUsedAt && (!c.lastUsedAt || t.lastUsedAt > c.lastUsedAt)) c.lastUsedAt = t.lastUsedAt;
    });
    const recent = await prisma.mcpAuditLog.findMany({
      // detail is NULL for most rows; a plain NOT(detail = x) would silently drop those
      where: { userId: req.user.id, OR: [{ detail: null }, { detail: { not: 'awaiting confirmation' } }] },
      orderBy: { createdAt: 'desc' }, take: 15,
      select: { id: true, tool: true, isWrite: true, ok: true, createdAt: true },
    });
    res.json({
      connectorUrl: process.env.MCP_PUBLIC_URL ? `${process.env.MCP_PUBLIC_URL.replace(/\/$/, '')}/mcp` : null,
      connections: Object.values(byClient).map((c) => ({ ...c, scopes: [...c.scopes] })),
      recent,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/mcp/connections/:clientId — disconnect a chat app (revokes all its tokens)
router.delete('/connections/:clientId', auth, async (req, res) => {
  try {
    await prisma.oAuthToken.updateMany({
      where: { userId: req.user.id, clientId: req.params.clientId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.json({ message: 'Disconnected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
