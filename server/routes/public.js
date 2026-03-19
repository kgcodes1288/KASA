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
    if (new Date() > new Date(jobToken.expiresAt)) {
      return res.status(410).json({ message: 'This link has expired' });
    }

    // Find all jobs for this listing + checkout date
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
        room:          { select: { id: true, name: true } },
        checklistItems: { orderBy: { id: 'asc' } },
      },
      orderBy: { room: { name: 'asc' } },
    });

    // Deduplicate by room name, keep first occurrence
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
      listing:      jobToken.listing,
      checkoutDate: jobToken.checkoutDate,
      expiresAt:    jobToken.expiresAt,
      rooms,
    });
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
    if (new Date() > new Date(jobToken.expiresAt)) {
      return res.status(410).json({ message: 'This link has expired' });
    }

    const { completed } = req.body;

    // Verify the checklist item belongs to a job under this token's listing + checkout
    const item = await prisma.jobChecklist.findUnique({
      where: { id: req.params.itemId },
      include: { job: true },
    });

    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (item.job.listingId !== jobToken.listingId) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    // Toggle the item
    await prisma.jobChecklist.update({
      where: { id: req.params.itemId },
      data: { completed, completedAt: completed ? new Date() : null },
    });

    // Recalculate job status
    const allItems = await prisma.jobChecklist.findMany({ where: { jobId: item.jobId } });
    const done     = allItems.filter((i) => i.completed).length;
    const status   = done === allItems.length ? 'completed' : done > 0 ? 'in_progress' : 'pending';

    await prisma.job.update({
      where: { id: item.jobId },
      data:  { status },
    });

    res.json({ success: true, completed, status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;