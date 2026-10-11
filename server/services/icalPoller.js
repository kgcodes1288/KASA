const ical = require('node-ical');
const { fetchCalendarText } = require('../lib/safeFetch');
const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { notifyCleaningDigest, sendDayOfReminders } = require('../lib/notify');
const { getResetItems, checklistFromReset } = require('../lib/turnover');
const { guessLabel, syncLegacyField, pruneJobs, recomputeFlags } = require('../lib/calendars');

const DAY = 24 * 60 * 60 * 1000;
const BLOCKED = /not available|airbnb \(not available\)|blocked|closed/i;
// iCal all-day dates are midnight UTC: normalise to noon UTC so no timezone can shift the date
const toNoonUTC = (d) => { const n = new Date(d); n.setUTCHours(12, 0, 0, 0); return n; };

// Listings created before multi-calendar support only have icalUrl: turn it into a calendar
async function ensureCalendars(listing) {
  let cals = await prisma.listingCalendar.findMany({ where: { listingId: listing.id }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  if (!cals.length && listing.icalUrl) {
    await prisma.listingCalendar.create({ data: { listingId: listing.id, url: listing.icalUrl, label: guessLabel(listing.icalUrl) } });
    cals = await prisma.listingCalendar.findMany({ where: { listingId: listing.id }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  }
  return cals;
}

// Pull one calendar: upsert its bookings, drop the ones that disappeared (cancellations). Never throws for a bad feed.
async function syncCalendar(listing, cal, cutoff) {
  let events;
  try {
    events = ical.parseICS(await fetchCalendarText(cal.url));
  } catch (err) {
    // only our own readable messages are shown; anything else stays generic so internal details never leak
    const msg = err.friendly ? err.message : 'Could not read this calendar';
    if (!err.friendly) console.error(`[iCal] ${listing.name} / ${cal.label}: ${err.message}`);
    await prisma.listingCalendar.update({ where: { id: cal.id }, data: { lastError: msg } });
    console.error(`[iCal] ${listing.name} / ${cal.label}: ${msg}`);
    return { ok: false, error: msg, synced: 0, removed: 0 };
  }
  const seen = new Set();
  let synced = 0;
  for (const event of Object.values(events)) {
    if (event.type !== 'VEVENT') continue;
    const checkoutDate = event.end ? toNoonUTC(event.end) : null;
    const checkinDate = event.start ? toNoonUTC(event.start) : null;
    if (!checkoutDate || checkoutDate < cutoff) continue;
    const uid = `${cal.id}|${event.uid || `${listing.id}-${checkoutDate.toISOString()}`}`;
    const summary = event.summary || '';
    const isBlocked = BLOCKED.test(summary);
    const type = isBlocked ? 'blocked' : 'guest';
    const guestName = isBlocked ? 'Blocked' : (summary || `${cal.label} guest`);
    seen.add(uid);
    await prisma.booking.upsert({
      where: { listingId_icalUid: { listingId: listing.id, icalUid: uid } },
      create: { listingId: listing.id, calendarId: cal.id, checkinDate, checkoutDate, guestName, icalUid: uid, type },
      update: { calendarId: cal.id, checkinDate, checkoutDate, guestName, type },
    });
    synced++;
  }
  // Cancellations: current/future bookings of THIS calendar that are no longer in its feed. If the feed came back completely
  // empty while we hold bookings, treat it as a glitch and keep them.
  let removed = 0;
  const stale = await prisma.booking.findMany({ where: { calendarId: cal.id, checkoutDate: { gte: cutoff }, icalUid: { notIn: [...seen] } }, select: { id: true } });
  if (stale.length && synced === 0) {
    console.warn(`[iCal] ${listing.name} / ${cal.label}: empty feed, keeping ${stale.length} booking(s)`);
  } else if (stale.length) {
    await prisma.booking.deleteMany({ where: { id: { in: stale.map((b) => b.id) } } });
    removed = stale.length;
  }
  await prisma.listingCalendar.update({ where: { id: cal.id }, data: { lastSynced: new Date(), lastError: null } });
  return { ok: true, synced, removed };
}

async function syncListing(listing) {
  const cals = await ensureCalendars(listing);
  if (!cals.length) {
    console.log(`[iCal] Skipping ${listing.name}: no calendar link configured`);
    return { jobsCreated: 0, bookingsSynced: 0, reason: 'no_url', calendars: [] };
  }
  console.log(`[iCal] Syncing listing: ${listing.name} (${cals.length} calendar${cals.length > 1 ? 's' : ''})`);
  const cutoff = new Date(Date.now() - DAY);

  const results = [];
  for (const cal of cals) results.push({ id: cal.id, label: cal.label, ...(await syncCalendar(listing, cal, cutoff)) });
  if (results.every((r) => !r.ok)) throw new Error(results.map((r) => `${r.label}: ${r.error}`).join('; '));

  const conflicts = await recomputeFlags(listing.id);
  const cancelled = await pruneJobs(listing.id);

  // One turnover job per real guest checkout (stays reported twice are marked echo and skipped)
  const resetItems = await getResetItems(listing.id);
  const stays = await prisma.booking.findMany({ where: { listingId: listing.id, type: 'guest', echo: false, checkoutDate: { gte: cutoff } }, orderBy: { checkoutDate: 'asc' } });
  const fresh = await prisma.listing.findUnique({ where: { id: listing.id }, select: { defaultCleanerId: true } });
  const created = {};
  for (const b of stays) {
    const day = new Date(b.checkoutDate); day.setUTCHours(0, 0, 0, 0);
    const existing = await prisma.job.findFirst({ where: { listingId: listing.id, checkoutDate: { gte: day, lt: new Date(day.getTime() + DAY) } } });
    if (existing) continue;
    await prisma.job.create({
      data: {
        listingId: listing.id, cleanerId: fresh?.defaultCleanerId || null, checkoutDate: b.checkoutDate, checkinDate: b.checkinDate,
        guestName: b.guestName, status: 'pending', checklistItems: { create: checklistFromReset(resetItems) },
      },
    });
    created[b.checkoutDate.toISOString()] = { checkoutDate: b.checkoutDate, roomCount: 1 };
    console.log(`[iCal] Created turnover job: checkout ${b.checkoutDate}`);
  }

  // ONE digest per sync; skip jobs more than 6 months out (calendars can show phantom future bookings)
  const sixMonthsOut = new Date(); sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
  const summary = Object.values(created).filter((j) => j.checkoutDate <= sixMonthsOut);
  if (summary.length) await notifyCleaningDigest(listing.id, summary, fresh?.defaultCleanerId || null);

  await prisma.listing.update({ where: { id: listing.id }, data: { lastSynced: new Date() } });
  const bookingsSynced = results.reduce((n, r) => n + (r.synced || 0), 0);
  console.log(`[iCal] Sync complete for ${listing.name}: ${bookingsSynced} booking(s), ${Object.keys(created).length} job(s) created, ${cancelled} cancelled job(s) removed`);
  return {
    jobsCreated: Object.keys(created).length, bookingsSynced, jobsRemoved: cancelled, conflicts: conflicts.length, reason: 'ok',
    calendars: results.map((r) => ({ id: r.id, label: r.label, ok: r.ok, error: r.error || null, synced: r.synced, removed: r.removed })),
  };
}

function startPoller() {
  cron.schedule('0 */12 * * *', async () => {
    console.log('[iCal] Running 12-hour sync...');
    try {
      const listings = await prisma.listing.findMany();
      for (const listing of listings) {
        try { await syncListing(listing); } catch (err) { console.error(`[iCal] ${listing.name}: ${err.message}`); }
      }
      await sendDayOfReminders();
    } catch (err) {
      console.error('[iCal] Poller error:', err.message);
    }
  });
  console.log('[iCal] Poller started: runs every 12 hours');
}

module.exports = { startPoller, syncListing };
