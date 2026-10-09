const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

// Helper: check if user is owner or accepted co-host of a listing
async function hasListingAccess(listingId, userId) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return false;
  if (listing.hostId === userId) return true;
  const coHost = await prisma.listingCoHost.findFirst({
    where: { listingId, userId, status: 'ACCEPTED' },
  });
  return !!coHost;
}

// GET /api/rooms/listing/:listingId
router.get('/listing/:listingId', auth, async (req, res) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { listingId: req.params.listingId },
      orderBy: { name: 'asc' },
    });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/rooms/listing/:listingId/batch — create multiple rooms at once
router.post('/listing/:listingId/batch', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const { listingId } = req.params;
    const ok = await hasListingAccess(listingId, req.user.id);
    if (!ok) return res.status(403).json({ message: 'Not your listing' });

    const { rooms } = req.body;
    if (!Array.isArray(rooms) || rooms.length === 0)
      return res.status(400).json({ message: 'No rooms provided' });

    const validTypes = ['ROOM', 'APPLIANCE', 'SPACE'];
    const created = await Promise.all(
      rooms.map((r) =>
        prisma.room.create({
          data: {
            name: r.name,
            entityType: validTypes.includes(r.entityType) ? r.entityType : 'ROOM',
            listingId,
          },
        })
      )
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/rooms — owner or co-host can create rooms
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const { listing: listingId, name, entityType } = req.body;
    const ok = await hasListingAccess(listingId, req.user.id);
    if (!ok) return res.status(403).json({ message: 'Not your listing' });

    const validTypes = ['ROOM', 'APPLIANCE', 'SPACE'];
    const room = await prisma.room.create({
      data: {
        name,
        entityType: validTypes.includes(entityType) ? entityType : 'ROOM',
        listingId,
      },
    });
    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/rooms/:id — owner or co-host can update rooms
router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const room = await prisma.room.findUnique({ where: { id: req.params.id }, include: { listing: true } });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const ok = await hasListingAccess(room.listingId, req.user.id);
    if (!ok) return res.status(403).json({ message: 'Not your listing' });

    const { name, entityType } = req.body;
    const validTypes = ['ROOM', 'APPLIANCE', 'SPACE'];
    const updated = await prisma.room.update({
      where: { id: req.params.id },
      data: {
        name: name || room.name,
        entityType: validTypes.includes(entityType) ? entityType : room.entityType,
      },
    });
    // keep the label on existing turnover steps in step with a rename
    if (name && name !== room.name) {
      await prisma.jobChecklist.updateMany({ where: { tag: room.name, job: { listingId: room.listingId } }, data: { tag: name } });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/rooms/:id — owner or co-host can delete rooms
router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const room = await prisma.room.findUnique({ where: { id: req.params.id }, include: { listing: true } });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const ok = await hasListingAccess(room.listingId, req.user.id);
    if (!ok) return res.status(403).json({ message: 'Not your listing' });

    await prisma.room.delete({ where: { id: req.params.id } });
    res.json({ message: 'Room deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
