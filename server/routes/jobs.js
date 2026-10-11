const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const crypto = require('crypto');
const { sendSms } = require('../lib/sendSms');
const rl = require('../lib/rateLimit');

// Who may see / act on a listing's jobs: the owner, an accepted co-host, or the person the job is assigned to
async function listingRole(listingId, userId) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, hostId: true } });
  if (!listing) return { listing: null, member: false };
  if (listing.hostId === userId) return { listing, member: true };
  const co = await prisma.listingCoHost.findFirst({ where: { listingId, userId, status: 'ACCEPTED' }, select: { id: true } });
  return { listing, member: !!co };
}
async function canTouchJob(job, userId) {
  if (job.cleanerId === userId) return true;
  return (await listingRole(job.listingId, userId)).member;
}

// US numbers only (the texting service is US): returns +1XXXXXXXXXX or null
function toE164(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

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
    if (!job || !(await canTouchJob({ listingId: job.listing.id, cleanerId: job.cleanerId }, req.user.id)))
      return res.status(404).json({ message: 'Job not found' });
    res.json(fmt(job));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/jobs/:id/checklist/:itemId — toggle a checklist item
router.patch('/:id/checklist/:itemId', auth, async (req, res) => {
  try {
    const { completed } = req.body;
    const owning = await prisma.jobChecklist.findFirst({ where: { id: req.params.itemId, jobId: req.params.id }, include: { job: { select: { listingId: true, cleanerId: true } } } });
    if (!owning || !(await canTouchJob(owning.job, req.user.id))) return res.status(404).json({ message: 'Step not found' });
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

// PATCH /api/jobs/:id/status — mark a job done / not done (for jobs with no checklist)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const existing = await prisma.job.findUnique({ where: { id: req.params.id }, include: { listing: true, checklistItems: true } });
    if (!existing) return res.status(404).json({ message: 'Job not found' });
    const allowed = existing.cleanerId === req.user.id || existing.listing.hostId === req.user.id ||
      !!(await prisma.listingCoHost.findFirst({ where: { listingId: existing.listingId, userId: req.user.id, status: 'ACCEPTED' } }));
    if (!allowed) return res.status(403).json({ message: 'Not authorised' });
    const done = !!req.body.completed;
    // with sub-tasks, "done" ticks every step so the checklist and status always agree
    if (existing.checklistItems.length) {
      await prisma.jobChecklist.updateMany({ where: { jobId: existing.id }, data: { completed: done, completedAt: done ? new Date() : null } });
    }
    const job = await prisma.job.update({ where: { id: existing.id }, data: { status: done ? 'completed' : 'pending' }, ...jobInclude });
    res.json(fmt(job));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/jobs/:id/assign
router.patch('/:id/assign', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const existing = await prisma.job.findUnique({ where: { id: req.params.id }, include: { listing: true } });
    if (!existing) return res.status(404).json({ message: 'Job not found' });
    const isOwner = existing.listing.hostId === req.user.id;
    const isCoHost = await prisma.listingCoHost.findFirst({
      where: { listingId: existing.listingId, userId: req.user.id, status: 'ACCEPTED' },
    });
    if (!isOwner && !isCoHost) return res.status(403).json({ message: 'Not authorised' });

    const cleanerId = req.body.cleanerId || null;
    if (cleanerId) {
      const ok = cleanerId === existing.listing.hostId || !!(await prisma.listingCoHost.findFirst({ where: { listingId: existing.listingId, userId: cleanerId, status: 'ACCEPTED' } }));
      if (!ok) return res.status(400).json({ message: "That person isn't on this property's team. Invite them as a co-host first." });
    }
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { cleanerId },
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

  const { listingId, checkoutDate, phone, contractorId, consentConfirmed } = req.body;
  if (!listingId || !checkoutDate) {
    return res.status(400).json({ message: 'listingId and checkoutDate are required' });
  }
  if (!phone && !contractorId) {
    return res.status(400).json({ message: 'phone or contractorId is required' });
  }
  if (Number.isNaN(new Date(checkoutDate).getTime())) return res.status(400).json({ message: 'Invalid checkout date' });

  try {
    // Verify listing belongs to this host or they are an accepted co-host
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    const isOwner = listing.hostId === req.user.id;
    const isCoHost = await prisma.listingCoHost.findFirst({
      where: { listingId, userId: req.user.id, status: 'ACCEPTED' },
    });
    if (!isOwner && !isCoHost) return res.status(403).json({ message: 'Not authorised' });

    // Resolve phone + name from contractorId or raw phone. Texting needs the person's agreement.
    let resolvedPhone;
    let resolvedName = null;

    if (contractorId) {
      const listingOwnerId = listing.hostId;
      const contractor = await prisma.contractor.findFirst({
        where: { id: contractorId, hostId: { in: [req.user.id, listingOwnerId] } },
      });
      if (!contractor) return res.status(404).json({ message: 'Contractor not found' });
      if (!contractor.smsConsent)
        return res.status(400).json({ message: `${contractor.name} hasn't agreed to receive texts. Open Account → Contractors, edit them and tick the consent box once they agree.` });
      resolvedPhone = toE164(contractor.phone);
      resolvedName  = contractor.name;
    } else {
      if (consentConfirmed !== true)
        return res.status(400).json({ message: 'Please confirm this person has agreed to receive text messages from CleanStay.' });
      resolvedPhone = toE164(phone);
    }
    if (!resolvedPhone) return res.status(400).json({ message: 'That phone number does not look right. Use a 10-digit US number.' });

    // Abuse limits: 30 texts per account per hour, 5 per phone number per day
    const userBucket = rl.hit(`sms-user|${req.user.id}`, 60 * 60 * 1000);
    if (userBucket.n > 30) return rl.retry(res, userBucket, "You've sent a lot of texts.");
    const phoneBucket = rl.hit(`sms-phone|${resolvedPhone}`, 24 * 60 * 60 * 1000);
    if (phoneBucket.n > 5) return rl.retry(res, phoneBucket, 'This number has already received several texts today.');

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

    const clientUrl = process.env.CLIENT_URL || 'https://getcleanstays.com';
    const link = `${clientUrl}/job/${token}`;

    // Text FIRST: if the message can't be sent nothing is assigned, so the checkout is never stuck
    try {
      await sendSms({
        to:   resolvedPhone,
        body: `Hi! You have a cleaning job at ${listing.name} on ${new Date(checkoutDate).toLocaleDateString('en-US', { timeZone: 'UTC' })}. Open your task list here: ${link}`,
      });
    } catch (smsErr) {
      console.error('[send-link] SMS failed:', smsErr.message);
      return res.status(502).json({ message: "We couldn't send that text. Check the phone number and try again." });
    }

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
    console.log('[JobToken] contractor link created for', listing.name);

    res.json({ message: 'SMS sent successfully' });
  } catch (err) {
    console.error('[send-link]', err.message);
    res.status(500).json({ message: 'Something went wrong sending the link. Please try again.' });
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
    if (!(await listingRole(req.params.listingId, req.user.id)).member) return res.status(403).json({ message: 'Not authorised' });
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