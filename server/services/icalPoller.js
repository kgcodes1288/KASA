const ical = require('node-ical');
const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { notifyCleaningDigest, sendDayOfReminders } = require('../lib/notify');

async function syncListing(listing) {
  try {
    console.log(`[iCal] Syncing listing: ${listing.name}`);
    const events = await ical.async.fromURL(listing.icalUrl);
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const rooms = await prisma.room.findMany({
      where: { listingId: listing.id },
      include: { checklistItems: { orderBy: { order: 'asc' } } },
    });

    if (rooms.length === 0) {
      console.log(`[iCal] No rooms for listing ${listing.name} — skipping`);
      return;
    }

    // iCal all-day dates are midnight UTC — normalize to noon UTC so
    // no timezone offset can shift the display date to the previous day
    const toNoonUTC = (d) => { const n = new Date(d); n.setUTCHours(12,0,0,0); return n; };

    // Track newly created jobs for digest (keyed by checkoutDate ISO string)
    const newJobsByDate = {};

    for (const event of Object.values(events)) {
      if (event.type !== 'VEVENT') continue;
      const checkoutDate = event.end   ? toNoonUTC(event.end)   : null;
      const checkinDate  = event.start ? toNoonUTC(event.start) : null;
      if (!checkoutDate || checkoutDate < cutoff) continue;

      let createdCount = 0;
      for (const room of rooms) {
        const existing = await prisma.job.findFirst({
          where: { listingId: listing.id, roomId: room.id, checkoutDate },
        });
        if (existing) continue;

        await prisma.job.create({
          data: {
            listingId: listing.id,
            roomId: room.id,
            cleanerId: null,
            checkoutDate,
            checkinDate,
            guestName: event.summary || 'Airbnb Guest',
            status: 'pending',
            checklistItems: {
              create: room.checklistItems.map((item) => ({ text: item.text })),
            },
          },
        });
        createdCount++;
        console.log(`[iCal] Created job for room "${room.name}" — checkout ${checkoutDate}`);
      }

      if (createdCount > 0) {
        const key = checkoutDate.toISOString();
        newJobsByDate[key] = { checkoutDate, roomCount: (newJobsByDate[key]?.roomCount || 0) + createdCount };
      }
    }

    // Send ONE digest notification + email for all new jobs from this sync
    const newJobsSummary = Object.values(newJobsByDate);
    if (newJobsSummary.length > 0) {
      await notifyCleaningDigest(listing.id, newJobsSummary);
      console.log(`[iCal] Digest sent for ${listing.name} — ${newJobsSummary.length} new checkout date(s)`);
    }

    await prisma.listing.update({ where: { id: listing.id }, data: { lastSynced: new Date() } });
    console.log(`[iCal] Sync complete for: ${listing.name}`);
  } catch (err) {
    console.error(`[iCal] Error syncing listing ${listing.id}:`, err.message);
    throw err;
  }
}

function startPoller() {
  cron.schedule('0 */12 * * *', async () => {
    console.log('[iCal] Running 12-hour sync...');
    try {
      const listings = await prisma.listing.findMany();
      for (const listing of listings) await syncListing(listing);
      await sendDayOfReminders();
    } catch (err) {
      console.error('[iCal] Poller error:', err.message);
    }
  });
  console.log('[iCal] Poller started — runs every 12 hours');
}

module.exports = { startPoller, syncListing };