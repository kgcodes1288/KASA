const prisma = require('./prisma');

// Fire-and-forget security event log. Repeats of the same event from the same address are collapsed to one row a minute so an attack can't flood the table.
const recent = new Map();
setInterval(() => { const now = Date.now(); for (const [k, t] of recent) if (now - t > 60000) recent.delete(k); }, 60000).unref();

function secLog(type, req, detail, opts = {}) {
  try {
    const ip = req?.ip || null;
    const key = `${type}|${ip}|${detail || ''}`;
    if (opts.collapse !== false) { if (recent.has(key)) return; recent.set(key, Date.now()); }
    prisma.securityEvent.create({ data: { type, ip, userId: opts.userId || req?.user?.id || null, detail: detail ? String(detail).slice(0, 200) : null } }).catch(() => {});
  } catch { /* logging must never break a request */ }
}

const prune = () => prisma.securityEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } } }).catch(() => {});

module.exports = { secLog, prune };
