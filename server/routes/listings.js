const router = require('express').Router();
const auth = require('../middleware/auth');
const Listing = require('../models/Listing');
const { syncListing } = require('../services/icalPoller');

// POST /api/listings — host creates listing
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Only hosts can create listings' });
  try {
    const { name, address, icalUrl } = req.body;
    if (!name || !icalUrl)
      return res.status(400).json({ message: 'name and icalUrl are required' });
    const listing = await Listing.create({ host: req.user._id, name, address, icalUrl });
    res.status(201).json(listing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/listings — host: own; cleaner: assigned
router.get('/', auth, async (req, res) => {
  try {
    const query =
      req.user.role === 'host'
        ? { host: req.user._id }
        : { cleaners: req.user._id };
    const listings = await Listing.find(query)
      .populate('cleaners', 'name email phone')
      .sort({ createdAt: -1 });
    res.json(listings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/listings/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id).populate('cleaners', 'name email phone');
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    res.json(listing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/listings/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, host: req.user._id },
      { $set: req.body },
      { new: true }
    ).populate('cleaners', 'name email phone');
    if (!listing) return res.status(404).json({ message: 'Not found or not authorized' });
    res.json(listing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/listings/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const listing = await Listing.findOneAndDelete({ _id: req.params.id, host: req.user._id });
    if (!listing) return res.status(404).json({ message: 'Not found or not authorized' });
    res.json({ message: 'Listing deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/listings/:id/cleaners — add cleaner by email
router.post('/:id/cleaners', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Hosts only' });
  try {
    const User = require('../models/User');
    const cleaner = await User.findOne({ email: req.body.email, role: 'cleaner' });
    if (!cleaner) return res.status(404).json({ message: 'Cleaner not found with that email' });

    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, host: req.user._id },
      { $addToSet: { cleaners: cleaner._id } },
      { new: true }
    ).populate('cleaners', 'name email phone');
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    res.json(listing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/listings/:id/cleaners/:cleanerId
router.delete('/:id/cleaners/:cleanerId', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Hosts only' });
  try {
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, host: req.user._id },
      { $pull: { cleaners: req.params.cleanerId } },
      { new: true }
    ).populate('cleaners', 'name email phone');
    res.json(listing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/listings/:id/sync — manual iCal sync
router.post('/:id/sync', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Hosts only' });
  try {
    const listing = await Listing.findOne({ _id: req.params.id, host: req.user._id }).populate('cleaners');
    if (!listing) return res.status(404).json({ message: 'Not found' });
    await syncListing(listing);
    res.json({ message: 'Sync complete', lastSynced: listing.lastSynced });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
