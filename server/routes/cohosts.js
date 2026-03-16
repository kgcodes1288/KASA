const express = require('express');
const prisma = require('../lib/prisma');
const authenticate = require('../middleware/auth');
const crypto = require('crypto');
const twilio = require('twilio');

const router = express.Router();

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);


// Helper — check what role a user has on a listing
async function getListingRole(listingId, userId) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { coHosts: true },
  });

  if (!listing) return null;
  if (listing.hostId === userId) return 'OWNER';

  const coHost = listing.coHosts.find(
    (c) => c.userId === userId && c.status === 'ACCEPTED'
  );

  return coHost ? coHost.role : null;
}

// POST /api/listings/:id/cohosts/invite
// Owner invites someone by phone number with a role
router.post('/:id/cohosts/invite', authenticate, async (req, res) => {
  const { id: listingId } = req.params;
  const { phone, role } = req.body;
  const requesterId = req.user.id;

  if (!phone || !role) {
    return res.status(400).json({ error: 'Phone number and role are required.' });
  }

  if (!['COHOST', 'VIEW_ONLY'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  const listingRole = await getListingRole(listingId, requesterId);
  if (listingRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the listing owner can invite co-hosts.' });
  }

  // Don't invite yourself
  if (phone === req.user.phone) {
    return res.status(400).json({ error: 'You cannot invite yourself.' });
  }

  // Look up invitee by phone
  const invitee = await prisma.user.findFirst({ where: { phone } });

  // Check if already invited/accepted
  const existing = await prisma.listingCoHost.findFirst({
    where: {
      listingId,
      invitePhone: phone,
      status: { in: ['PENDING', 'ACCEPTED'] },
    },
  });

  if (existing) {
    return res.status(409).json({ error: 'This phone number already has a pending or active invite for this listing.' });
  }

  const inviteToken = crypto.randomBytes(32).toString('hex');
  const inviteUrl = `${process.env.CLIENT_URL}/accept-invite/${inviteToken}`;

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });

  const coHost = await prisma.listingCoHost.create({
    data: {
      listingId,
      userId: invitee ? invitee.id : null,
      role,
      status: 'PENDING',
      inviteToken,
      invitePhone: phone,
    },
  });

  // If invitee has an account, SMS them the link
  if (invitee) {
    await twilioClient.messages.create({
      body: `Hi ${invitee.name}, ${req.user.name} has invited you to co-host "${listing.name}" on CleanStay. Tap to accept: ${inviteUrl}`,
      from: `whatsapp:${process.env.TWILIO_PHONE}`,
      to: `whatsapp:${phone}`,
    });

    return res.status(201).json({
      message: 'Invite sent via SMS.',
      smsSent: true,
      coHost,
    });
  }

  // No account found — return the link for the owner to share manually
  return res.status(201).json({
    message: 'No account found for that phone number. Share this link manually.',
    smsSent: false,
    inviteUrl,
    coHost,
  });
});

// GET /api/listings/:id/cohosts
// Owner sees all co-hosts for a listing
router.get('/:id/cohosts', authenticate, async (req, res) => {
  const { id: listingId } = req.params;

  const listingRole = await getListingRole(listingId, req.user.id);
  if (listingRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the listing owner can view co-hosts.' });
  }

  const coHosts = await prisma.listingCoHost.findMany({
    where: { listingId },
    include: { user: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: 'asc' },
  });

  res.json(coHosts);
});

// DELETE /api/listings/:id/cohosts/:userId
// Owner removes someone OR user removes themselves
router.delete('/:id/cohosts/:userId', authenticate, async (req, res) => {
  const { id: listingId, userId: targetUserId } = req.params;
  const requesterId = req.user.id;

  const isSelf = requesterId === targetUserId;
  const listingRole = await getListingRole(listingId, requesterId);

  if (!isSelf && listingRole !== 'OWNER') {
    return res.status(403).json({ error: 'You do not have permission to remove this co-host.' });
  }

  const coHost = await prisma.listingCoHost.findFirst({
    where: { listingId, userId: targetUserId },
  });

  if (!coHost) {
    return res.status(404).json({ error: 'Co-host not found.' });
  }

  await prisma.listingCoHost.delete({ where: { id: coHost.id } });

  res.json({ message: 'Co-host removed successfully.' });
});

// GET /api/cohosts/accept/:token
// Accepts an invite — must be logged in
router.get('/accept/:token', authenticate, async (req, res) => {
  const { token } = req.params;

  const coHost = await prisma.listingCoHost.findUnique({
    where: { inviteToken: token },
  });

  if (!coHost) {
    return res.status(404).json({ error: 'Invite not found or already used.' });
  }

  if (coHost.status === 'ACCEPTED') {
    return res.status(400).json({ error: 'Invite already accepted.' });
  }

  if (coHost.invitePhone !== req.user.phone) {
    return res.status(403).json({ error: 'This invite was sent to a different phone number.' });
  }

  const updated = await prisma.listingCoHost.update({
    where: { id: coHost.id },
    data: {
      status: 'ACCEPTED',
      userId: req.user.id,
    },
  });

  res.json({ message: 'Invite accepted.', coHost: updated });
});


// GET /api/cohosts/my-listings
// Returns all listings the logged-in user is a co-host on
router.get('/my-listings', authenticate, async (req, res) => {
  const coHosted = await prisma.listingCoHost.findMany({
    where: {
      userId: req.user.id,
      status: 'ACCEPTED',
    },
    include: {
      listing: {
        include: {
          host: { select: { id: true, name: true } },
        },
      },
    },
  });

  const listings = coHosted.map((c) => ({
    ...c.listing,
    coHostRole: c.role,
  }));

  res.json(listings);
});


// DELETE /api/listings/:id/cohosts/invite/:coHostId
// Owner withdraws a pending invite by record id
router.delete('/:id/cohosts/invite/:coHostId', authenticate, async (req, res) => {
  const { id: listingId, coHostId } = req.params;

  const listingRole = await getListingRole(listingId, req.user.id);
  if (listingRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the listing owner can withdraw invites.' });
  }

  const coHost = await prisma.listingCoHost.findFirst({
    where: { id: coHostId, listingId },
  });

  if (!coHost) {
    return res.status(404).json({ error: 'Invite not found.' });
  }

  await prisma.listingCoHost.delete({ where: { id: coHostId } });

  res.json({ message: 'Invite withdrawn.' });
});

module.exports = router;