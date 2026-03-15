const router = require('express').Router();
const auth = require('../middleware/auth');
const Room = require('../models/Room');
const Listing = require('../models/Listing');

// GET /api/rooms/listing/:listingId
router.get('/listing/:listingId', auth, async (req, res) => {
  try {
    const rooms = await Room.find({ listing: req.params.listingId }).sort({ name: 1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/rooms
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Hosts only' });
  try {
    const { listing: listingId, name, checklist } = req.body;
    const listing = await Listing.findOne({ _id: listingId, host: req.user._id });
    if (!listing) return res.status(403).json({ message: 'Not your listing' });

    const room = await Room.create({
      listing: listingId,
      name,
      checklist: (checklist || []).map((text, i) => ({ text, order: i })),
    });
    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/rooms/:id
router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Hosts only' });
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const listing = await Listing.findOne({ _id: room.listing, host: req.user._id });
    if (!listing) return res.status(403).json({ message: 'Not your listing' });

    const { name, checklist } = req.body;
    if (name) room.name = name;
    if (checklist !== undefined) {
      room.checklist = checklist.map((item, i) =>
        typeof item === 'string'
          ? { text: item, order: i }
          : { text: item.text, order: item.order ?? i }
      );
    }
    await room.save();
    res.json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/rooms/:id
router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Hosts only' });
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const listing = await Listing.findOne({ _id: room.listing, host: req.user._id });
    if (!listing) return res.status(403).json({ message: 'Not your listing' });

    await room.deleteOne();
    res.json({ message: 'Room deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
