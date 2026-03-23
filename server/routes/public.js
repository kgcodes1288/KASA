const router = require('express').Router();
const prisma = require('../lib/prisma');

// GET /api/public/job/:token — return all jobs for this checkout grouped by room
router.get('/job/:token', async (req, res) => {
  try {
    const jobToken = await prisma.jobToken.findUnique({
      where: { token: req.params.token },
      include: { listing: { select: { id: true, name: true, address: true } } },
    });

    if (!jobToken) return res.status(404).json({ message: 'Invalid link' });

    if (jobToken.status === 'WITHDRAWN') {
      return res.status(410).json({ message: 'This job assignment has been withdrawn' });
    }

    if (new Date() > new Date(jobToken.expiresAt)) {
      return res.status(410).json({ message: 'This link has expired' });
    }

    const checkoutStart = new Date(jobToken.checkoutDate);
    checkoutStart.setHours(0, 0, 0, 0);
    const checkoutEnd = new Date(jobToken.checkoutDate);
    checkoutEnd.setHours(23, 59, 59, 999);

    const jobs = await prisma.job.findMany({
      where: {
        listingId: jobToken.listingId,
        checkoutDate: { gte: checkoutStart, lte: checkoutEnd },
      },
      include: {
        room:           { select: { id: true, name: true } },
        checklistItems: { orderBy: { id: 'asc' } },
      },
      orderBy: { room: { name: 'asc' } },
    });

    const seen = new Set();
    const deduped = jobs.filter((j) => {
      const name = j.room?.name || 'Room';
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });

    const rooms = deduped.map((j) => ({
      jobId:     j.id,
      roomName:  j.room?.name || 'Room',
      status:    j.status,
      checklist: j.checklistItems,
    }));

    res.json({
      listing:        jobToken.listing,
      checkoutDate:   jobToken.checkoutDate,
      expiresAt:      jobToken.expiresAt,
      tokenStatus:    jobToken.status,
      contractorName: jobToken.contractorName,
      rooms,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/public/job/:token/accept
router.post('/job/:token/accept', async (req, res) => {
  try {
    const jobToken = await prisma.jobToken.findUnique({
      where: { token: req.params.token },
    });

    if (!jobToken) return res.status(404).json({ message: 'Invalid link' });
    if (jobToken.status === 'WITHDRAWN') return res.status(410).json({ message: 'This job assignment has been withdrawn' });
    if (new Date() > new Date(jobToken.expiresAt)) return res.status(410).json({ message: 'This link has expired' });
    if (jobToken.status === 'ACCEPTED') return res.json({ message: 'Already accepted' });

    await prisma.jobToken.update({
      where: { token: req.params.token },
      data:  { status: 'ACCEPTED' },
    });

    res.json({ message: 'Job accepted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/public/job/:token/checklist/:itemId — toggle a checklist item
router.patch('/job/:token/checklist/:itemId', async (req, res) => {
  try {
    const jobToken = await prisma.jobToken.findUnique({
      where: { token: req.params.token },
    });

    if (!jobToken) return res.status(404).json({ message: 'Invalid link' });
    if (jobToken.status === 'WITHDRAWN') return res.status(410).json({ message: 'This job assignment has been withdrawn' });
    if (new Date() > new Date(jobToken.expiresAt)) return res.status(410).json({ message: 'This link has expired' });

    const { completed } = req.body;

    const item = await prisma.jobChecklist.findUnique({
      where: { id: req.params.itemId },
      include: { job: true },
    });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (item.job.listingId !== jobToken.listingId) return res.status(403).json({ message: 'Not authorised' });

    await prisma.jobChecklist.update({
      where: { id: req.params.itemId },
      data:  { completed, completedAt: completed ? new Date() : null },
    });

    const allItems = await prisma.jobChecklist.findMany({ where: { jobId: item.jobId } });
    const done     = allItems.filter((i) => i.completed).length;
    const status   = done === allItems.length ? 'completed' : done > 0 ? 'in_progress' : 'pending';
    await prisma.job.update({ where: { id: item.jobId }, data: { status } });

    res.json({ success: true, completed, status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Maintenance token routes ──────────────────────────────────────────────────

// GET /api/public/maintenance/:token — return task details for contractor
router.get('/maintenance/:token', async (req, res) => {
  try {
    const mt = await prisma.maintenanceToken.findUnique({
      where: { token: req.params.token },
      include: {
        task: {
          include: {
            listing: { select: { id: true, name: true, address: true } },
            room:    { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!mt) return res.status(404).json({ message: 'Invalid link' });
    if (new Date() > new Date(mt.expiresAt)) return res.status(410).json({ message: 'This link has expired' });

    res.json({
      taskId:       mt.task.id,
      title:        mt.task.title,
      notes:        mt.task.notes,
      status:       mt.task.status,
      nextDueAt:    mt.task.nextDueAt,
      listingName:  mt.task.listing.name,
      listingAddress: mt.task.listing.address,
      roomName:     mt.task.room?.name || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/public/maintenance/:token/complete — contractor marks task done
router.patch('/maintenance/:token/complete', async (req, res) => {
  try {
    const mt = await prisma.maintenanceToken.findUnique({
      where: { token: req.params.token },
      include: { task: true },
    });

    if (!mt) return res.status(404).json({ message: 'Invalid link' });
    if (new Date() > new Date(mt.expiresAt)) return res.status(410).json({ message: 'This link has expired' });

    const now = new Date();
    const nextDueAt = new Date(mt.task.nextDueAt);
    nextDueAt.setMonth(nextDueAt.getMonth() + mt.task.intervalMonths);

    await prisma.maintenanceTask.update({
      where: { id: mt.task.id },
      data: {
        status:          'COMPLETED',
        lastServicedAt:  now,
        nextDueAt,
        notificationSent: false,
      },
    });

    res.json({ message: 'Task marked complete' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;