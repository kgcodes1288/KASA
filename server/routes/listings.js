const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { syncListing } = require('../services/icalPoller');

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

// POST /api/listings
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Only hosts can create listings' });
  try {
    const { name, address, icalUrl } = req.body;
    if (!name || !icalUrl)
      return res.status(400).json({ message: 'name and icalUrl are required' });
    const listing = await prisma.listing.create({
      data: { name, address: address || null, icalUrl, hostId: req.user.id },
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

    const { name, address, icalUrl } = req.body;
    const updated = await prisma.listing.update({
      where: { id: req.params.id },
      data: { name, address, icalUrl },
    });
    res.json(updated);
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

    await syncListing(listing);

    const updated = await prisma.listing.findUnique({ where: { id: req.params.id } });
    res.json({ message: 'Sync complete', lastSynced: updated.lastSynced });
  } catch (err) {
    console.error('[sync route] error:', err.message);
    res.status(500).json({ message: `Sync failed: ${err.message}` });
  }
});

module.exports = router;
