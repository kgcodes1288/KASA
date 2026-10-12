const express = require('express');
const prisma = require('../lib/prisma');
const authenticate2 = require('../middleware/auth');
const crypto = require('crypto');

const { notify } = require('../lib/notify');
const { sendInviteEmail } = require('../lib/email');
const { isValidEmail } = require('../lib/validate');
const rl = require('../lib/rateLimit');

const router = express.Router();

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
  const { email: rawEmail, role } = req.body;
  const email = rawEmail?.trim().toLowerCase();
  const requesterId = req.user.id;

  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role are required.' });
  }

  if (!['COHOST', 'VIEW_ONLY'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const listingRole = await getListingRole(listingId, requesterId);
  if (listingRole !== 'OWNER') {
    return res.status(403).json({ error: 'Only the listing owner can invite co-hosts.' });
  }

  if (email === req.user.email?.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot invite yourself.' });
  }
  // abuse limits: 20 invite emails per owner per day, 10 team members per property
  if (rl.hit(`invite|${requesterId}`, 24 * 60 * 60 * 1000).n > 20)
    return res.status(429).json({ error: 'You have sent a lot of invites today. Please try again tomorrow.' });
  if ((await prisma.listingCoHost.count({ where: { listingId, status: { in: ['PENDING', 'ACCEPTED'] } } })) >= 10)
    return res.status(400).json({ error: 'A property can have up to 10 co-hosts.' });

  // Check if already invited/accepted
  const existing = await prisma.listingCoHost.findFirst({
    where: {
      listingId,
      inviteEmail: email,
      status: { in: ['PENDING', 'ACCEPTED'] },
    },
  });

  if (existing) {
    return res.status(409).json({ error: 'This email already has a pending or active invite for this listing.' });
  }

  // Check if invitee already has an account
  const invitee = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

  const inviteToken = crypto.randomBytes(32).toString('hex');
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });

  const coHost = await prisma.listingCoHost.create({
    data: {
      listingId,
      userId:      invitee ? invitee.id : null,
      role,
      status:      'PENDING',
      inviteToken,
      inviteEmail: email,
    },
  });

  // Send invite email
  const inviteUrl = `${process.env.CLIENT_URL}/accept-invite/${inviteToken}`;
  try {
    await sendInviteEmail({
      toEmail:     email,
      fromName:    req.user.name,
      listingName: listing.name,
      role,
      inviteUrl,
    });
  } catch (emailErr) {
    console.error('[cohosts] invite email failed:', emailErr.message);
    // Still return success — the invite record exists and the user can resend
  }

  res.status(201).json({ message: 'Invite sent via email.', coHost });
});

// GET /api/listings/:id/cohosts
router.get('/:id/cohosts', authenticate2, async (req, res) => {
  const { id: listingId } = req.params;

  const listingRole = await getListingRole(listingId, req.user.id);
  if (!listingRole) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { host: { select: { id: true, name: true, phone: true, email: true } } },
  });

  const coHosts = await prisma.listingCoHost.findMany({
    where: { listingId },
    include: { user: { select: { id: true, name: true, phone: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  // Attach listing owner as a virtual entry so co-hosts can assign tasks to the owner
  const ownerEntry = {
    id: `owner-${listing.host.id}`,
    listingId,
    userId: listing.host.id,
    role: 'OWNER',
    status: 'ACCEPTED',
    isOwner: true,
    user: listing.host,
    inviteEmail: null,
  };

  res.json([ownerEntry, ...coHosts]);
});

// GET /api/cohosts/my-listings
router.get('/my-listings', authenticate2, async (req, res) => {
  const coHosted = await prisma.listingCoHost.findMany({
    where: { userId: req.user.id, status: 'ACCEPTED' },
    include: {
      listing: {
        include: {
          host: { select: { id: true, name: true } },
          bookings: {
            where: { echo: false },
            select: { id: true, checkinDate: true, checkoutDate: true, guestName: true, type: true, calendarId: true },
            orderBy: { checkoutDate: 'asc' },
          },
          calendars: { select: { id: true, label: true, url: true, order: true, lastSynced: true, lastError: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
          _count: { select: { rooms: true } },
        },
      },
    },
  });

  const { findConflicts } = require('../lib/calendars');
  const listings = await Promise.all(coHosted.map(async (c) => ({
    ...c.listing,
    coHostRole: c.role,
    conflicts: await findConflicts(c.listing.id),
  })));

  res.json(listings);
});

// GET /api/cohosts/pending
router.get('/pending', authenticate2, async (req, res) => {
  const userEmail = req.user.email?.toLowerCase();

  // Match by userId OR by inviteEmail (handles cases where userId wasn't linked yet)
  const whereClause = {
    status: 'PENDING',
    OR: [
      { userId: req.user.id },
      ...(userEmail ? [{ inviteEmail: userEmail, userId: null }] : []),
    ],
  };

  const pending = await prisma.listingCoHost.findMany({
    where: whereClause,
    include: {
      listing: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });

  // Auto-link any invites found by email that don't have a userId yet
  const unlinked = pending.filter((p) => !p.userId);
  if (unlinked.length > 0) {
    await prisma.listingCoHost.updateMany({
      where: { id: { in: unlinked.map((p) => p.id) } },
      data: { userId: req.user.id },
    });
  }

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

// POST /api/cohosts/accept-invite/:token — the "Accept Invite" button in the invitation email.
// The token proves the person can read the invited mailbox; the signed-in account must also use that email address.
router.post('/accept-invite/:token', authenticate2, async (req, res) => {
  const invite = await prisma.listingCoHost.findFirst({
    where: { inviteToken: String(req.params.token), status: 'PENDING' },
    include: { listing: { include: { host: { select: { id: true, name: true } } } } },
  });
  if (!invite) return res.status(404).json({ error: 'This invitation is no longer valid. Ask the owner to send a new one.' });
  if ((invite.inviteEmail || '').toLowerCase() !== String(req.user.email || '').toLowerCase()) {
    const [u, d] = String(invite.inviteEmail || '').split('@');
    return res.status(403).json({ error: `This invitation was sent to ${u.slice(0, 2)}***@${d || ''}. Sign in with that email address to accept it.` });
  }
  if (invite.listing.hostId === req.user.id) return res.status(400).json({ error: 'You own this property.' });
  await prisma.listingCoHost.update({ where: { id: invite.id }, data: { status: 'ACCEPTED', userId: req.user.id } });
  await notify(invite.listing.host.id, 'COHOST_ACCEPTED', 'Co-host accepted', `${req.user.name} accepted your co-host invite for ${invite.listing.name}`, invite.listingId);
  res.json({ message: 'Invite accepted.', listingId: invite.listingId, listingName: invite.listing.name });
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
    include: {
      listing: { include: { host: { select: { id: true, name: true } } } },
      user: { select: { id: true, name: true } },
    },
  });

  // Notify the listing owner
  if (updated.listing?.host?.id) {
    await notify(
      updated.listing.host.id,
      'COHOST_ACCEPTED',
      'Co-host accepted',
      `${updated.user?.name || 'Someone'} accepted your co-host invite for ${updated.listing.name}`,
      updated.listingId
    );
  }

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
