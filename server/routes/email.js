const router = require('express').Router();
const auth   = require('../middleware/auth');
const prisma  = require('../lib/prisma');
const { sendDirectEmail } = require('../lib/email');
const { listingAccess } = require('../lib/access');
const rl = require('../lib/rateLimit');

// POST /api/email/send — send a direct message email to another user
router.post('/send', auth, async (req, res) => {
  const { toUserId, subject, body, listingId } = req.body;
  if (!toUserId || !subject?.trim() || !body?.trim()) {
    return res.status(400).json({ message: 'toUserId, subject and body are required' });
  }

  if (subject.trim().length > 150) return res.status(400).json({ message: 'Subject must be 150 characters or fewer' });
  if (body.trim().length > 2000) return res.status(400).json({ message: 'Message must be 2,000 characters or fewer' });
  if (rl.hit(`direct-email|${req.user.id}`, 24 * 60 * 60 * 1000).n > 20)
    return res.status(429).json({ message: "You've sent a lot of messages today. Please try again tomorrow." });

  try {
    // you can only message people you work with: both of you must be on a property's team
    const mine = await prisma.listing.findMany({
      where: { OR: [{ hostId: req.user.id }, { coHosts: { some: { userId: req.user.id, status: 'ACCEPTED' } } }] },
      select: { id: true, hostId: true, coHosts: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
    });
    const shared = mine.filter((l) => l.hostId === toUserId || l.coHosts.some((c) => c.userId === toUserId));
    if (!shared.length || (listingId && !shared.some((l) => l.id === listingId)))
      return res.status(403).json({ message: 'You can only message people on your properties.' });

    const [sender, recipient] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true } }),
      prisma.user.findUnique({ where: { id: toUserId },    select: { id: true, name: true, email: true } }),
    ]);

    if (!recipient) return res.status(404).json({ message: 'Recipient not found' });
    if (!recipient.email) return res.status(400).json({ message: 'Recipient has no email address' });

    // Optional: verify they share a listing
    let listingName = null;
    if (listingId) {
      const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { name: true } });
      listingName = listing?.name || null;
    }

    await sendDirectEmail({
      fromName:  sender.name,
      fromEmail: sender.email,
      toName:    recipient.name,
      toEmail:   recipient.email,
      subject:   subject.trim(),
      body:      body.trim(),
      listingName,
    });

    res.json({ message: 'Email sent' });
  } catch (err) {
    console.error('[email/send]', err.message);
    res.status(502).json({ message: "We couldn't send that message. Please try again." });
  }
});

module.exports = router;
