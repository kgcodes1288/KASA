const router = require('express').Router();
const prisma = require('../lib/prisma');

// GET /api/unsubscribe?token=xxx  — no auth, one-click unsubscribe
router.get('/', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send(page('Invalid link', 'This unsubscribe link is invalid.'));

  try {
    const user = await prisma.user.findUnique({ where: { unsubscribeToken: token } });
    if (!user) return res.status(404).send(page('Not found', 'This unsubscribe link is invalid or has already been used.'));

    if (!user.emailUnsubscribed) {
      await prisma.user.update({ where: { id: user.id }, data: { emailUnsubscribed: true } });
    }

    res.send(page('Unsubscribed', `You've been unsubscribed from CleanStay email notifications. You won't receive any more emails from us.`));
  } catch (err) {
    console.error('[unsubscribe]', err.message);
    res.status(500).send(page('Error', 'Something went wrong. Please try again later.'));
  }
});

function page(title, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${title} — CleanStay</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border-radius:12px;padding:40px 32px;max-width:420px;width:100%;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <p style="font-size:32px;margin:0 0 16px;">🧹</p>
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">${title}</h1>
    <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.6;">${body}</p>
  </div>
</body></html>`;
}

module.exports = router;
