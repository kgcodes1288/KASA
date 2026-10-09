const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { syncListing } = require('../services/icalPoller');
const { getResetItems } = require('../lib/turnover');

// Helper: check if user is owner or accepted co-host of a listing
async function hasAccess(listingId, userId) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return { listing: null, ok: false, isOwner: false };
  if (listing.hostId === userId) return { listing, ok: true, isOwner: true };
  const coHost = await prisma.listingCoHost.findFirst({
    where: { listingId, userId, status: 'ACCEPTED' },
  });
  return { listing, ok: !!coHost, isOwner: false };
}

const MANAGEMENT_TYPES = ['SELF', 'COHOST', 'HOST_WITH_COHOST'];

// Combine street + city into the legacy single-line address
const composeAddress = (street, city) => [street, city].filter(Boolean).join(', ') || null;

// POST /api/listings
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Only hosts can create listings' });
  try {
    const { name, street, city, managementType, icalUrl } = req.body;
    if (!name)
      return res.status(400).json({ message: 'Listing name is required' });
    if (!city || !city.trim())
      return res.status(400).json({ message: 'City is required' });
    if (!MANAGEMENT_TYPES.includes(managementType))
      return res.status(400).json({ message: 'Please select how this property is managed' });
    const listing = await prisma.listing.create({
      data: {
        name,
        street: street?.trim() || null,
        city: city.trim(),
        address: composeAddress(street?.trim(), city.trim()),
        managementType,
        icalUrl: icalUrl || null,
        hostId: req.user.id,
      },
    });
    res.status(201).json(listing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/listings — returns owned listings only (co-hosted fetched separately)
router.get('/', auth, async (req, res) => {
  try {
    const listings = await prisma.listing.findMany({
      where: { hostId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        bookings: {
          select: { id: true, checkinDate: true, checkoutDate: true, guestName: true, type: true },
          orderBy: { checkoutDate: 'asc' },
        },
        _count: { select: { rooms: true } },
      },
    });
    res.json(listings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/listings/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: { host: { select: { id: true, name: true } } },
    });
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    res.json(listing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/listings/:id — owner or co-host can edit
router.put('/:id', auth, async (req, res) => {
  try {
    const { ok, listing } = await hasAccess(req.params.id, req.user.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (!ok) return res.status(403).json({ message: 'Not authorised' });

    const { name, street, city, managementType, icalUrl, defaultCleanerId } = req.body;
    if (managementType !== undefined && !MANAGEMENT_TYPES.includes(managementType))
      return res.status(400).json({ message: 'Invalid management type' });
    if ((city !== undefined || street !== undefined) && !(city ?? listing.city)?.trim())
      return res.status(400).json({ message: 'City is required' });
    // Only the owner decides how the property is managed
    if (managementType !== undefined && managementType !== listing.managementType && listing.hostId !== req.user.id)
      return res.status(403).json({ message: 'Only the owner can change this' });
    const newStreet = street !== undefined ? (street?.trim() || null) : listing.street;
    const newCity = city !== undefined ? city.trim() : listing.city;
    const updated = await prisma.listing.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...((street !== undefined || city !== undefined) && {
          street: newStreet,
          city: newCity,
          address: composeAddress(newStreet, newCity),
        }),
        ...(managementType !== undefined && { managementType }),
        ...(icalUrl !== undefined && { icalUrl }),
        ...('defaultCleanerId' in req.body && { defaultCleanerId: defaultCleanerId || null }),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/listings/:id/members — host + accepted co-hosts as User objects
router.get('/:id/members', auth, async (req, res) => {
  try {
    const { ok, listing } = await hasAccess(req.params.id, req.user.id);
    if (!listing) return res.status(404).json({ message: 'Not found' });
    if (!ok) return res.status(403).json({ message: 'Not authorised' });

    const host = await prisma.user.findUnique({
      where: { id: listing.hostId },
      select: { id: true, name: true, email: true },
    });

    const coHostLinks = await prisma.listingCoHost.findMany({
      where: { listingId: req.params.id, status: 'ACCEPTED' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const members = [
      { ...host, role: 'Host' },
      ...coHostLinks.filter((c) => c.user).map((c) => ({ ...c.user, role: 'Co-host' })),
    ];

    res.json(members);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/listings/:id/reset-list — the steps copied onto every checkout job
router.get('/:id/reset-list', auth, async (req, res) => {
  try {
    const { ok, listing } = await hasAccess(req.params.id, req.user.id);
    if (!listing) return res.status(404).json({ message: 'Not found' });
    if (!ok) return res.status(403).json({ message: 'Not authorised' });
    const items = await getResetItems(listing.id);
    res.json(items.map((i) => ({ id: i.id, text: i.text, order: i.order, roomId: i.roomId, roomName: i.room?.name || null })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/listings/:id/reset-list — replace the list. Body: { items: [{ text, roomId? }] }
// Added steps are also added to, and removed steps taken off, upcoming checkout jobs that are not finished yet.
router.put('/:id/reset-list', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const { ok, listing } = await hasAccess(req.params.id, req.user.id);
    if (!listing) return res.status(404).json({ message: 'Not found' });
    if (!ok) return res.status(403).json({ message: 'Not authorised' });

    const raw = Array.isArray(req.body.items) ? req.body.items : [];
    const rooms = await prisma.room.findMany({ where: { listingId: listing.id }, select: { id: true, name: true } });
    const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));
    const roomByName = Object.fromEntries(rooms.map((r) => [r.name.toLowerCase(), r]));
    const items = raw
      .map((i) => ({
        text: String(i.text || '').trim(),
        roomId: i.roomId && roomById[i.roomId] ? i.roomId : (i.roomName && roomByName[String(i.roomName).toLowerCase()]?.id) || null,
      }))
      .filter((i) => i.text);

    const beforeItems = await getResetItems(listing.id);
    const before = new Set(beforeItems.map((i) => i.text.toLowerCase()));
    await prisma.$transaction([
      prisma.resetItem.deleteMany({ where: { listingId: listing.id } }),
      prisma.resetItem.createMany({ data: items.map((i, order) => ({ ...i, order, listingId: listing.id })) }),
    ]);

    const after = new Set(items.map((i) => i.text.toLowerCase()));
    const removed = beforeItems.filter((i) => !after.has(i.text.toLowerCase())).map((i) => i.text.toLowerCase());
    const added = items.filter((i) => !before.has(i.text.toLowerCase()));
    if (removed.length || added.length) {
      const active = await prisma.job.findMany({
        where: { listingId: listing.id, status: { in: ['pending', 'in_progress'] } },
        include: { checklistItems: true },
      });
      for (const job of active) {
        // steps taken off the list disappear from unfinished jobs (ticked ones stay as a record)
        const gone = job.checklistItems.filter((c) => !c.completed && removed.includes(c.text.trim().toLowerCase())).map((c) => c.id);
        if (gone.length) {
          await prisma.jobChecklist.deleteMany({ where: { id: { in: gone } } });
          job.checklistItems = job.checklistItems.filter((c) => !gone.includes(c.id));
          if (!job.checklistItems.length) await prisma.job.update({ where: { id: job.id }, data: { status: 'pending' } });
        }
        const have = new Set(job.checklistItems.map((c) => c.text.trim().toLowerCase()));
        const toAdd = added.filter((i) => !have.has(i.text.toLowerCase()));
        if (toAdd.length) {
          await prisma.jobChecklist.createMany({
            data: toAdd.map((i) => ({ jobId: job.id, text: i.text, tag: i.roomId ? roomById[i.roomId].name : null })),
          });
        }
      }
    }

    const saved = await getResetItems(listing.id);
    res.json(saved.map((i) => ({ id: i.id, text: i.text, order: i.order, roomId: i.roomId, roomName: i.room?.name || null })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/listings/:id — owner only
router.delete('/:id', auth, async (req, res) => {
  try {
    await prisma.listing.delete({ where: { id: req.params.id, hostId: req.user.id } });
    res.json({ message: 'Listing deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Not found or not authorized' });
    res.status(500).json({ message: err.message });
  }
});

// POST /api/listings/:id/sync — owner or co-host can sync
router.post('/:id/sync', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const { ok, listing } = await hasAccess(req.params.id, req.user.id);
    if (!listing) return res.status(404).json({ message: 'Not found' });
    if (!ok) return res.status(403).json({ message: 'Not authorised' });

    const result = await syncListing(listing);

    const updated = await prisma.listing.findUnique({ where: { id: req.params.id } });
    res.json({
      message: 'Sync complete',
      lastSynced: updated.lastSynced,
      jobsCreated: result?.jobsCreated ?? 0,
      bookingsSynced: result?.bookingsSynced ?? 0,
      reason: result?.reason ?? 'ok',
    });
  } catch (err) {
    console.error('[sync route] error:', err.message);
    res.status(500).json({ message: `Sync failed: ${err.message}` });
  }
});

module.exports = router;
