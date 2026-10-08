const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

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
      where: { userId: req.user.id, NOT: { detail: 'awaiting confirmation' } },
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
