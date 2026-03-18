const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

const jobInclude = {
  include: {
    listing: { select: { id: true, name: true, address: true } },
    room: { select: { id: true, name: true } },
    cleaner: { select: { id: true, name: true, phone: true } },
    checklistItems: { orderBy: { id: 'asc' } },
  },
};

const fmt = (j) => ({ ...j, checklist: j.checklistItems });

// GET /api/jobs
router.get('/', auth, async (req, res) => {
  try {
    let where = {};

    if (req.user.role === 'cleaner') {
      where.cleanerId = req.user.id;
    } else {
      // Get listings the user owns OR is an accepted co-host on
      const coHosted = await prisma.listingCoHost.findMany({
        where: { userId: req.user.id, status: 'ACCEPTED' },
        select: { listingId: true },
      });

      const coHostedIds = coHosted.map((c) => c.listingId);

      where.listing = {
        OR: [
          { hostId: req.user.id },
          { id: { in: coHostedIds } },
        ],
      };
    }

    if (req.query.status) where.status = req.query.status;

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { checkoutDate: 'asc' },
      ...jobInclude,
    });

    res.json(jobs.map(fmt));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/jobs/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id }, ...jobInclude });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(fmt(job));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/jobs/:id/checklist/:itemId — toggle a checklist item
router.patch('/:id/checklist/:itemId', auth, async (req, res) => {
  try {
    const { completed } = req.body;

    await prisma.jobChecklist.update({
      where: { id: req.params.itemId },
      data: { completed, completedAt: completed ? new Date() : null },
    });

    // Recalculate job status
    const items = await prisma.jobChecklist.findMany({ where: { jobId: req.params.id } });
    const total = items.length;
    const done = items.filter((i) => i.completed).length;
    const status = done === total ? 'completed' : done > 0 ? 'in_progress' : 'pending';

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { status },
      ...jobInclude,
    });
    res.json(fmt(job));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/jobs/:id/assign
router.patch('/:id/assign', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { cleanerId: req.body.cleanerId },
      ...jobInclude,
    });
    res.json(fmt(job));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
