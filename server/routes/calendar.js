const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

const dateKey = (d) => new Date(d).toISOString().slice(0, 10);

// GET /api/calendar
router.get('/', auth, async (req, res) => {
  try {
    const [ownListings, coHosted] = await Promise.all([
      prisma.listing.findMany({
        where: { hostId: req.user.id },
        select: { id: true, name: true },
      }),
      prisma.listingCoHost.findMany({
        where: { userId: req.user.id, status: 'ACCEPTED' },
        select: { listing: { select: { id: true, name: true } } },
      }),
    ]);

    const allListings = [
      ...ownListings,
      ...coHosted
        .map((c) => c.listing)
        .filter((l) => !ownListings.find((o) => o.id === l.id)),
    ];
    const listingIds = allListings.map((l) => l.id);

    if (!listingIds.length) {
      return res.json({ listings: [], contractorNames: [], events: [] });
    }

    const [jobs, tokens, contractors] = await Promise.all([
      prisma.job.findMany({
        where: { listingId: { in: listingIds } },
        include: { cleaner: { select: { id: true, name: true, phone: true } } },
        orderBy: { checkoutDate: 'asc' },
      }),
      prisma.jobToken.findMany({
        where: { listingId: { in: listingIds }, status: { not: 'WITHDRAWN' } },
        select: {
          id: true,
          contractorName: true,
          phone: true,
          checkoutDate: true,
          listingId: true,
          status: true,
        },
      }),
      prisma.contractor.findMany({
        where: { hostId: req.user.id },
        select: { id: true, name: true, phone: true, trade: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const events = [];
    const seenStays = new Set();
    const seenJobs = new Set();

    for (const job of jobs) {
      const listingName = allListings.find((l) => l.id === job.listingId)?.name;

      // Guest stay — deduplicated by listing + checkin + checkout
      if (job.checkinDate && job.checkoutDate) {
        const key = `${job.listingId}|${dateKey(job.checkinDate)}|${dateKey(job.checkoutDate)}`;
        if (!seenStays.has(key)) {
          seenStays.add(key);
          events.push({
            type: 'guest_stay',
            listingId: job.listingId,
            listingName,
            checkinDate: job.checkinDate,
            checkoutDate: job.checkoutDate,
            guestName: job.guestName || 'Guest',
          });
        }
      }

      // Contractor job from assigned cleaner
      if (job.cleaner) {
        const key = `${job.listingId}|${dateKey(job.checkoutDate)}|${job.cleaner.name}`;
        if (!seenJobs.has(key)) {
          seenJobs.add(key);
          events.push({
            type: 'contractor_job',
            listingId: job.listingId,
            listingName,
            date: job.checkoutDate,
            contractorName: job.cleaner.name,
            contractorPhone: job.cleaner.phone,
            status: job.status,
          });
        }
      }
    }

    // Contractor jobs from job tokens
    for (const token of tokens) {
      if (!token.contractorName) continue;
      const listingName = allListings.find((l) => l.id === token.listingId)?.name;
      const key = `${token.listingId}|${dateKey(token.checkoutDate)}|${token.contractorName}`;
      if (!seenJobs.has(key)) {
        seenJobs.add(key);
        events.push({
          type: 'contractor_job',
          listingId: token.listingId,
          listingName,
          date: token.checkoutDate,
          contractorName: token.contractorName,
          contractorPhone: token.phone,
          status: token.status,
        });
      }
    }

    // Unique contractor names from all sources
    const contractorNamesSet = new Set([
      ...contractors.map((c) => c.name),
      ...events
        .filter((e) => e.type === 'contractor_job')
        .map((e) => e.contractorName),
    ]);
    const contractorNames = [...contractorNamesSet].sort();

    res.json({ listings: allListings, contractorNames, events });
  } catch (err) {
    console.error('[calendar]', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
