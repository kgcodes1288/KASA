const ical = require('node-ical');
const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { sendCleaningAlert } = require('./sms');

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

    // Get cleaners for this listing
    const listingWithCleaners = await prisma.listing.findUnique({
      where: { id: listing.id },
      include: { cleaners: { include: { cleaner: true } } },
    });
    const cleaners = listingWithCleaners.cleaners.map((lc) => lc.cleaner);

    for (const event of Object.values(events)) {
      if (event.type !== 'VEVENT') continue;

      const checkoutDate = event.end ? new Date(event.end) : null;
      const checkinDate = event.start ? new Date(event.start) : null;

      if (!checkoutDate || checkoutDate < cutoff) continue;

      for (const room of rooms) {
        const existing = await prisma.job.findFirst({
          where: { listingId: listing.id, roomId: room.id, checkoutDate },
        });
        if (existing) continue;

        // Assign a cleaner randomly
        let assignedCleaner = null;
        if (cleaners.length > 0) {
          assignedCleaner = cleaners[Math.floor(Math.random() * cleaners.length)];
        }

        const job = await prisma.job.create({
          data: {
            listingId: listing.id,
            roomId: room.id,
            cleanerId: assignedCleaner?.id || null,
            checkoutDate,
            checkinDate,
            guestName: event.summary || 'Airbnb Guest',
            status: 'pending',
            checklistItems: {
              create: room.checklistItems.map((item) => ({ text: item.text })),
            },
          },
        });

        console.log(`[iCal] Created job for room "${room.name}" — checkout ${checkoutDate}`);

        if (assignedCleaner?.phone) {
          await sendCleaningAlert({
            to: assignedCleaner.phone,
            cleanerName: assignedCleaner.name,
            listingName: listing.name,
            roomName: room.name,
            checkoutDate,
          });
          await prisma.job.update({ where: { id: job.id }, data: { smsSent: true } });
        }
      }
    }

    await prisma.listing.update({ where: { id: listing.id }, data: { lastSynced: new Date() } });
    console.log(`[iCal] Sync complete for: ${listing.name}`);
  } catch (err) {
    console.error(`[iCal] Error syncing listing ${listing.id}:`, err.message);
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
