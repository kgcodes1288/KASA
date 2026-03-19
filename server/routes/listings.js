const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { syncListing } = require('../services/icalPoller');

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

// GET /api/listings
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

// PUT /api/listings/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, address, icalUrl } = req.body;
    const listing = await prisma.listing.update({
      where: { id: req.params.id, hostId: req.user.id },
      data: { name, address, icalUrl },
    });
    res.json(listing);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Not found or not authorized' });
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/listings/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await prisma.listing.delete({ where: { id: req.params.id, hostId: req.user.id } });
    res.json({ message: 'Listing deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Not found or not authorized' });
    res.status(500).json({ message: err.message });
  }
});

// POST /api/listings/:id/sync
router.post('/:id/sync', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const listing = await prisma.listing.findFirst({
      where: { id: req.params.id, hostId: req.user.id },
    });
    if (!listing) return res.status(404).json({ message: 'Not found' });
    await syncListing(listing);
    res.json({ message: 'Sync complete', lastSynced: listing.lastSynced });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;