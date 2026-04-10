const ical = require('node-ical');
const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { notifyListingMembers } = require('../lib/notify');

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

    for (const event of Object.values(events)) {
      if (event.type !== 'VEVENT') continue;
      // iCal all-day dates are midnight UTC — normalize to noon UTC so
      // no timezone offset can shift the display date to the previous day
      const toNoonUTC = (d) => { const n = new Date(d); n.setUTCHours(12,0,0,0); return n; };
      const checkoutDate = event.end   ? toNoonUTC(event.end)   : null;
      const checkinDate  = event.start ? toNoonUTC(event.start) : null;
      if (!checkoutDate || checkoutDate < cutoff) continue;

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

        const dateStr = checkoutDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        await notifyListingMembers(
          listing.id,
          'JOB_CREATED',
          'New cleaning job',
          `New cleaning job added for ${listing.name} — checkout ${dateStr}`
        );

        console.log(`[iCal] Created job for room "${room.name}" — checkout ${checkoutDate}`);
      }
    }

    await prisma.listing.update({ where: { id: listing.id }, data: { lastSynced: new Date() } });
    console.log(`[iCal] Sync complete for: ${listing.name}`);
  } catch (err) {
    console.error(`[iCal] Error syncing listing ${listing.id}:`, err.message);
    throw err;
  }
}

function startPoller() {
  cron.schedule('0 * * * *', async () => {
    console.log('[iCal] Running hourly sync...');
    try {
      const listings = await prisma.listing.findMany();
      for (const listing of listings) await syncListing(listing);
    } catch (err) {
      console.error('[iCal] Poller error:', err.message);
    }
  });
  console.log('[iCal] Poller started — runs every hour');
}

module.exports = { startPoller, syncListing };