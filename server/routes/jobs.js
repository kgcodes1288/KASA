const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const crypto = require('crypto');
const twilio = require('twilio');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const jobInclude = {
  include: {
    listing: { select: { id: true, name: true, address: true } },
    room:    { select: { id: true, name: true } },
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
    const items = await prisma.jobChecklist.findMany({ where: { jobId: req.params.id } });
    const total = items.length;
    const done  = items.filter((i) => i.completed).length;
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

// POST /api/jobs/send-link — generate a token and SMS it to a contractor
router.post('/send-link', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });

  const { listingId, checkoutDate, phone } = req.body;
  if (!listingId || !checkoutDate || !phone) {
    return res.status(400).json({ message: 'listingId, checkoutDate and phone are required' });
  }

  try {
    // Verify listing belongs to this host (or they are an accepted co-host)
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    const isOwner = listing.hostId === req.user.id;
    const isCoHost = await prisma.listingCoHost.findFirst({
      where: { listingId, userId: req.user.id, status: 'ACCEPTED' },
    });
    if (!isOwner && !isCoHost) return res.status(403).json({ message: 'Not authorised' });

    // Verify there are jobs for this checkout date
    const checkoutStart = new Date(checkoutDate);
    checkoutStart.setHours(0, 0, 0, 0);
    const checkoutEnd = new Date(checkoutDate);
    checkoutEnd.setHours(23, 59, 59, 999);

    const jobs = await prisma.job.findMany({
      where: {
        listingId,
        checkoutDate: { gte: checkoutStart, lte: checkoutEnd },
      },
    });
    if (jobs.length === 0) {
      return res.status(404).json({ message: 'No jobs found for that checkout date' });
    }

    // Generate token — expires at end of checkout day
    const token     = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(checkoutDate);
    expiresAt.setHours(23, 59, 59, 999);

    // Normalise phone
    const normalised = phone.replace(/\D/g, '');
    const e164 = normalised.startsWith('1') ? `+${normalised}` : `+1${normalised}`;

    await prisma.jobToken.create({
      data: { token, phone: e164, listingId, checkoutDate: checkoutStart, expiresAt },
    });

    const clientUrl = process.env.CLIENT_URL || 'https://cleanstay.onrender.com';
    const link = `${clientUrl}/job/${token}`;

    console.log(`[JobToken] Contractor link: ${link}`);

    await twilioClient.messages.create({
      to:   e164,
      from: process.env.TWILIO_PHONE,
      body: `Hi! You have a cleaning job at ${listing.name} on ${new Date(checkoutDate).toLocaleDateString()}. Open your task list here: ${link}`,
    });

    res.json({ message: 'SMS sent successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
