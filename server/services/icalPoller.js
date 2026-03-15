const ical = require('node-ical');
const cron = require('node-cron');
const Listing = require('../models/Listing');
const Room = require('../models/Room');
const Job = require('../models/Job');
const User = require('../models/User');
const { sendCleaningAlert } = require('./sms');

/**
 * Sync a single listing: parse its iCal URL and create jobs for upcoming checkouts.
 */
async function syncListing(listing) {
  try {
    console.log(`[iCal] Syncing listing: ${listing.name}`);
    const events = await ical.async.fromURL(listing.icalUrl);
    const now = new Date();
    const rooms = await Room.find({ listing: listing._id });

    if (rooms.length === 0) {
      console.log(`[iCal] No rooms for listing ${listing.name} — skipping`);
      return;
    }

    for (const event of Object.values(events)) {
      if (event.type !== 'VEVENT') continue;

      const checkoutDate = event.end ? new Date(event.end) : null;
      const checkinDate = event.start ? new Date(event.start) : null;

      // Only process future or very recent checkouts (within last 24h)
      if (!checkoutDate) continue;
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (checkoutDate < cutoff) continue;

      for (const room of rooms) {
        const existing = await Job.findOne({
          listing: listing._id,
          room: room._id,
          checkoutDate,
        });
        if (existing) continue;

        // Assign a cleaner round-robin from the listing's cleaners list
        let assignedCleaner = null;
        if (listing.cleaners && listing.cleaners.length > 0) {
          const idx = Math.floor(Math.random() * listing.cleaners.length);
          assignedCleaner = listing.cleaners[idx]._id || listing.cleaners[idx];
        }

        const job = await Job.create({
          listing: listing._id,
          room: room._id,
          cleaner: assignedCleaner,
          checkoutDate,
          checkinDate,
          guestName: event.summary || 'Airbnb Guest',
          status: 'pending',
          checklist: room.checklist.map((item) => ({
            text: item.text,
            completed: false,
          })),
        });

        console.log(`[iCal] Created job for room "${room.name}" — checkout ${checkoutDate}`);

        // Send SMS notification to the assigned cleaner
        if (assignedCleaner) {
          const cleanerUser = await User.findById(assignedCleaner);
          if (cleanerUser?.phone) {
            await sendCleaningAlert({
              to: cleanerUser.phone,
              cleanerName: cleanerUser.name,
              listingName: listing.name,
              roomName: room.name,
              checkoutDate,
            });
            job.smsSent = true;
            await job.save();
          }
        }
      }
    }

    listing.lastSynced = new Date();
    await listing.save();
    console.log(`[iCal] Sync complete for: ${listing.name}`);
  } catch (err) {
    console.error(`[iCal] Error syncing listing ${listing._id}:`, err.message);
  }
}

/**
 * Start the hourly cron job to poll all listings.
 */
function startPoller() {
  cron.schedule('0 * * * *', async () => {
    console.log('[iCal] Running hourly sync...');
    try {
      const listings = await Listing.find({}).populate('cleaners');
      for (const listing of listings) {
        await syncListing(listing);
      }
    } catch (err) {
      console.error('[iCal] Poller error:', err.message);
    }
  });
  console.log('[iCal] Poller started — runs every hour');
}

module.exports = { startPoller, syncListing };
