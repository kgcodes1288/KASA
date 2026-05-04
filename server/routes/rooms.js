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

    // Snapshot old checklist texts before wiping them
    const oldItems = await prisma.checklistTemplate.findMany({ where: { roomId: req.params.id } });
    const oldTexts = new Set(oldItems.map((i) => i.text.trim().toLowerCase()));

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

    // Propagate newly added checklist items into pending/in_progress jobs for this room
    const newTexts = (checklist || [])
      .map((item) => (typeof item === 'string' ? item : item.text).trim())
      .filter((t) => !oldTexts.has(t.toLowerCase()));

    if (newTexts.length > 0) {
      const activeJobs = await prisma.job.findMany({
        where: { roomId: req.params.id, status: { in: ['pending', 'in_progress'] } },
        include: { checklistItems: true },
      });

      for (const job of activeJobs) {
        const existingJobTexts = new Set(job.checklistItems.map((c) => c.text.trim().toLowerCase()));
        const toAdd = newTexts.filter((t) => !existingJobTexts.has(t.toLowerCase()));
        if (toAdd.length > 0) {
          await prisma.jobChecklist.createMany({
            data: toAdd.map((text) => ({ jobId: job.id, text, completed: false })),
          });
        }
      }
    }

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
