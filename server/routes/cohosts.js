const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const authenticate2 = require('../middleware/auth');
const crypto = require('crypto');
const twilio = require('twilio');

const router = express.Router();

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const normalizePhone = (phone) => phone ? phone.replace(/\s+/g, '').trim() : null;

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
router.post('/:id/cohosts/invite', authenticate2, async (req, res) => {
  const { id: listingId } = req.params;
  const { phone: rawPhone, role } = req.body;
  const phone = normalizePhone(rawPhone);
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

  if (phone === normalizePhone(req.user.phone)) {
    return res.status(400).json({ error: 'You cannot invite yourself.' });
  }

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

  // Check if invitee already has an account
  const invitee = await prisma.user.findFirst({ where: { phone } });

  const inviteToken = crypto.randomBytes(32).toString('hex');
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

  // Send SMS — link goes to login, which redirects to account page
  const link = `${process.env.CLIENT_URL}/login?redirect=/account`;
  const roleLabel = role === 'COHOST' ? 'Co-host' : 'View Only';

  await twilioClient.messages.create({
    body: `Hi! ${req.user.name} has invited you to co-host "${listing.name}" on CleanStay as ${roleLabel}. Tap to join: ${link}. Reply STOP to opt out.`,
    from: process.env.TWILIO_PHONE,
    to: phone,
  });

    res.status(201).json({ message: 'Invite sent via SMS.', coHost });
});


// GET /api/listings/:id/cohosts
router.get('/:id/cohosts', authenticate2, async (req, res) => {
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

// GET /api/cohosts/my-listings
router.get('/my-listings', authenticate2, async (req, res) => {
  const coHosted = await prisma.listingCoHost.findMany({
    where: { userId: req.user.id, status: 'ACCEPTED' },
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

// GET /api/cohosts/pending
// Returns pending invites for the logged-in user
router.get('/pending', authenticate2, async (req, res) => {
  const pending = await prisma.listingCoHost.findMany({
    where: { userId: req.user.id, status: 'PENDING' },
    include: {
      listing: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });

  // Also include host info
  const withHost = await Promise.all(
    pending.map(async (p) => {
      const listing = await prisma.listing.findUnique({
        where: { id: p.listingId },
        include: { host: { select: { id: true, name: true } } },
      });
      return { ...p, listing };
    })
  );

  res.json(withHost);
});

// POST /api/cohosts/:id/accept
router.post('/:id/accept', authenticate2, async (req, res) => {
  const coHost = await prisma.listingCoHost.findFirst({
    where: { id: req.params.id, userId: req.user.id, status: 'PENDING' },
  });

  if (!coHost) {
    return res.status(404).json({ error: 'Invite not found.' });
  }

  const updated = await prisma.listingCoHost.update({
    where: { id: coHost.id },
    data: { status: 'ACCEPTED' },
  });

  res.json({ message: 'Invite accepted.', coHost: updated });
});

// POST /api/cohosts/:id/decline
router.post('/:id/decline', authenticate2, async (req, res) => {
  const coHost = await prisma.listingCoHost.findFirst({
    where: { id: req.params.id, userId: req.user.id, status: 'PENDING' },
  });

  if (!coHost) {
    return res.status(404).json({ error: 'Invite not found.' });
  }

  await prisma.listingCoHost.delete({ where: { id: coHost.id } });

  res.json({ message: 'Invite declined.' });
});

// DELETE /api/listings/:id/cohosts/:userId
router.delete('/:id/cohosts/:userId', authenticate2, async (req, res) => {
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

// DELETE /api/listings/:id/cohosts/invite/:coHostId
router.delete('/:id/cohosts/invite/:coHostId', authenticate2, async (req, res) => {
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