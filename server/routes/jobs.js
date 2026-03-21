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

const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
};

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

  const { listingId, checkoutDate, phone, contractorId } = req.body;
  if (!listingId || !checkoutDate) {
    return res.status(400).json({ message: 'listingId and checkoutDate are required' });
  }
  if (!phone && !contractorId) {
    return res.status(400).json({ message: 'phone or contractorId is required' });
  }

  try {
    // Verify listing belongs to this host or they are an accepted co-host
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    const isOwner = listing.hostId === req.user.id;
    const isCoHost = await prisma.listingCoHost.findFirst({
      where: { listingId, userId: req.user.id, status: 'ACCEPTED' },
    });
    if (!isOwner && !isCoHost) return res.status(403).json({ message: 'Not authorised' });

    // Resolve phone + name from contractorId or raw phone
    let resolvedPhone;
    let resolvedName = null;

    if (contractorId) {
      const contractor = await prisma.contractor.findFirst({
        where: { id: contractorId, hostId: req.user.id },
      });
      if (!contractor) return res.status(404).json({ message: 'Contractor not found' });
      resolvedPhone = contractor.phone;
      resolvedName  = contractor.name;
    } else {
      resolvedPhone = normalizePhone(phone);
    }

    // Check checkout date range
    const checkoutStart = new Date(checkoutDate);
    checkoutStart.setHours(0, 0, 0, 0);
    const checkoutEnd = new Date(checkoutDate);
    checkoutEnd.setHours(23, 59, 59, 999);

    // Block if an active (PENDING or ACCEPTED) token already exists for this listing + date
    const existing = await prisma.jobToken.findFirst({
      where: {
        listingId,
        checkoutDate: { gte: checkoutStart, lte: checkoutEnd },
        status: { in: ['PENDING', 'ACCEPTED'] },
      },
    });
    if (existing) {
      return res.status(409).json({
        message: 'This job is already assigned. Withdraw the current assignment before reassigning.',
      });
    }

    // Verify there are jobs for this checkout date
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

    await prisma.jobToken.create({
      data: {
        token,
        phone:          resolvedPhone,
        contractorName: resolvedName,
        status:         'PENDING',
        listingId,
        checkoutDate:   checkoutStart,
        expiresAt,
      },
    });

    const clientUrl = process.env.CLIENT_URL || 'https://cleanstay.onrender.com';
    const link = `${clientUrl}/job/${token}`;

    console.log(`[JobToken] Contractor link: ${link}`);

    await twilioClient.messages.create({
      to:   resolvedPhone,
      from: process.env.TWILIO_PHONE,
      body: `Hi! You have a cleaning job at ${listing.name} on ${new Date(checkoutDate).toLocaleDateString()}. Open your task list here: ${link}`,
    });

    res.json({ message: 'SMS sent successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/jobs/withdraw/:token — host withdraws an active assignment
router.post('/withdraw/:token', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });

  try {
    const jobToken = await prisma.jobToken.findUnique({
      where: { token: req.params.token },
      include: { listing: true },
    });

    if (!jobToken) return res.status(404).json({ message: 'Assignment not found' });

    // Verify this host owns the listing
    const isOwner = jobToken.listing.hostId === req.user.id;
    const isCoHost = await prisma.listingCoHost.findFirst({
      where: { listingId: jobToken.listingId, userId: req.user.id, status: 'ACCEPTED' },
    });
    if (!isOwner && !isCoHost) return res.status(403).json({ message: 'Not authorised' });

    if (jobToken.status === 'WITHDRAWN') {
      return res.status(400).json({ message: 'Already withdrawn' });
    }

    await prisma.jobToken.update({
      where: { token: req.params.token },
      data: { status: 'WITHDRAWN' },
    });

    res.json({ message: 'Assignment withdrawn' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/jobs/token-status/:listingId/:checkoutDate — get active token for a checkout
router.get('/token-status/:listingId/:checkoutDate', auth, async (req, res) => {
  try {
    const checkoutStart = new Date(req.params.checkoutDate);
    checkoutStart.setHours(0, 0, 0, 0);
    const checkoutEnd = new Date(req.params.checkoutDate);
    checkoutEnd.setHours(23, 59, 59, 999);

    const jobToken = await prisma.jobToken.findFirst({
      where: {
        listingId: req.params.listingId,
        checkoutDate: { gte: checkoutStart, lte: checkoutEnd },
        status: { in: ['PENDING', 'ACCEPTED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(jobToken || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;