// One-time, idempotent: the single Listing.icalUrl becomes a ListingCalendar, and its existing bookings are attached to it
// (their icalUid gets the calendar id prefix used by the multi-calendar sync). Only touches bookings with no calendar yet.
const prisma = require('../lib/prisma');
const { guessLabel } = require('../lib/calendars');

async function migrateCalendars() {
  const listings = await prisma.listing.findMany({ where: { icalUrl: { not: null } }, select: { id: true, icalUrl: true } });
  let cals = 0, moved = 0;
  for (const l of listings) {
    if (!l.icalUrl.trim()) continue;
    let cal = await prisma.listingCalendar.findFirst({ where: { listingId: l.id }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    if (!cal) { cal = await prisma.listingCalendar.create({ data: { listingId: l.id, url: l.icalUrl, label: guessLabel(l.icalUrl) } }); cals++; }
    const orphans = await prisma.booking.findMany({ where: { listingId: l.id, calendarId: null }, select: { id: true, icalUid: true } });
    for (const b of orphans) {
      await prisma.booking.update({ where: { id: b.id }, data: { calendarId: cal.id, icalUid: `${cal.id}|${b.icalUid}` } });
      moved++;
    }
  }
  if (cals || moved) console.log(`[migrate-calendars] ${cals} calendar(s) created, ${moved} booking(s) attached`);
}

module.exports = { migrateCalendars };
