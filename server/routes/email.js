const router = require('express').Router();
const auth   = require('../middleware/auth');
const prisma  = require('../lib/prisma');
const { sendDirectEmail } = require('../lib/email');

// POST /api/email/send — send a direct message email to another user
router.post('/send', auth, async (req, res) => {
  const { toUserId, subject, body, listingId } = req.body;
  if (!toUserId || !subject?.trim() || !body?.trim()) {
    return res.status(400).json({ message: 'toUserId, subject and body are required' });
  }

  try {
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
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
