const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

const { listingAccess } = require('../lib/access');

// write access: owner or full co-host (view-only co-hosts can look but not change)
async function hasListingAccess(listingId, userId) {
  return (await listingAccess(listingId, userId)).canWrite;
}

// GET /api/rooms/listing/:listingId
router.get('/listing/:listingId', auth, async (req, res) => {
  try {
    if (!(await listingAccess(req.params.listingId, req.user.id)).canRead) return res.status(404).json({ message: 'Not found' });
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
    if (rooms.length > 60) return res.status(400).json({ message: 'Too many rooms at once' });

    const validTypes = ['ROOM', 'APPLIANCE', 'SPACE'];
    const created = await Promise.all(
      rooms.map((r) =>
        prisma.room.create({
          data: {
            name: String(r.name || '').trim().slice(0, 60) || 'Space',
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

    if (!name || !String(name).trim() || String(name).trim().length > 60)
      return res.status(400).json({ message: 'Name must be 1–60 characters' });
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
    if (name !== undefined && (!String(name).trim() || String(name).trim().length > 60))
      return res.status(400).json({ message: 'Name must be 1–60 characters' });
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
