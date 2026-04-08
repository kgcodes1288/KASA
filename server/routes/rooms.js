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
      include: { checklistItems: { orderBy: { order: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(rooms.map((r) => ({ ...r, checklist: r.checklistItems })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/rooms — owner or co-host can create rooms
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const { listing: listingId, name, entityType, checklist } = req.body;
    const ok = await hasListingAccess(listingId, req.user.id);
    if (!ok) return res.status(403).json({ message: 'Not your listing' });

    const validTypes = ['ROOM', 'APPLIANCE', 'SPACE'];
    const room = await prisma.room.create({
      data: {
        name,
        entityType: validTypes.includes(entityType) ? entityType : 'ROOM',
        listingId,
        checklistItems: {
          create: (checklist || []).map((text, i) => ({ text, order: i })),
        },
      },
      include: { checklistItems: { orderBy: { order: 'asc' } } },
    });
    res.status(201).json({ ...room, checklist: room.checklistItems });
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

    const { name, entityType, checklist } = req.body;
    const validTypes = ['ROOM', 'APPLIANCE', 'SPACE'];

    await prisma.checklistTemplate.deleteMany({ where: { roomId: req.params.id } });
    const updated = await prisma.room.update({
      where: { id: req.params.id },
      data: {
        name: name || room.name,
        entityType: validTypes.includes(entityType) ? entityType : room.entityType,
        checklistItems: {
          create: (checklist || []).map((item, i) => ({
            text: typeof item === 'string' ? item : item.text,
            order: i,
          })),
        },
      },
      include: { checklistItems: { orderBy: { order: 'asc' } } },
    });
    res.json({ ...updated, checklist: updated.checklistItems });
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
