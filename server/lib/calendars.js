const prisma = require('./prisma');

const MAX_CALENDARS = 3;
const GENERIC_NAME = /^(reserved|booked|unavailable|not available|blocked|closed.*|(airbnb|vrbo|booking\.?com|guest)( guest)?|airbnb guest)$/i;
const DAY = 86400000;
const dkey = (d) => new Date(d).toISOString().slice(0, 10);

// "Airbnb", "VRBO", "Booking.com" from the link when we can tell; otherwise the generic label
function guessLabel(url = '') {
  const u = url.toLowerCase();
  if (u.includes('airbnb')) return 'Airbnb';
  if (u.includes('vrbo') || u.includes('homeaway')) return 'VRBO';
  if (u.includes('booking.com')) return 'Booking.com';
  if (u.includes('expedia')) return 'Expedia';
  if (u.includes('tripadvisor')) return 'Tripadvisor';
  if (u.includes('hipcamp')) return 'Hipcamp';
  if (u.includes('google')) return 'Google Calendar';
  return 'Calendar';
}

// Validate + clean the calendars sent from the client: max 3, http(s) only, no duplicate links
function normalizeCalendars(input) {
  const items = [];
  const seen = new Set();
  for (const raw of Array.isArray(input) ? input : []) {
    let url = String(raw?.url || '').trim();
    if (!url) continue;
    url = url.replace(/^webcal:\/\//i, 'https://');
    if (!/^https?:\/\/\S+$/i.test(url)) throw Object.assign(new Error(`"${url.slice(0, 60)}" is not a valid calendar link (it should start with https://)`), { status: 400 });
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ id: raw.id || null, url, label: String(raw.label || '').trim().slice(0, 30) || guessLabel(url) });
  }
  if (items.length > MAX_CALENDARS) throw Object.assign(new Error(`You can connect up to ${MAX_CALENDARS} calendars per listing`), { status: 400 });
  return items;
}

// Keep Listing.icalUrl (legacy single link) pointing at the first calendar
async function syncLegacyField(listingId) {
  const first = await prisma.listingCalendar.findFirst({ where: { listingId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  await prisma.listing.update({ where: { id: listingId }, data: { icalUrl: first?.url || null } });
}

// Jobs only exist for real, un-cancelled checkouts. Remove unstarted, unassigned jobs whose checkout no longer has a booking.
async function pruneJobs(listingId) {
  const cutoff = new Date(Date.now() - DAY);
  const jobs = await prisma.job.findMany({
    where: { listingId, status: 'pending', checkoutDate: { gte: cutoff } },
    include: { checklistItems: { select: { completed: true } } },
  });
  let removed = 0;
  for (const j of jobs) {
    if (j.checklistItems.some((c) => c.completed)) continue;
    const day = new Date(j.checkoutDate); day.setUTCHours(0, 0, 0, 0);
    const next = new Date(day.getTime() + DAY);
    const stay = await prisma.booking.count({ where: { listingId, type: 'guest', echo: false, checkoutDate: { gte: day, lt: next } } });
    if (stay) continue;
    const token = await prisma.jobToken.count({ where: { listingId, status: { in: ['PENDING', 'ACCEPTED'] }, checkoutDate: { gte: day, lt: next } } });
    if (token) continue;                       // a cleaner already has the link: leave it for the host to withdraw
    await prisma.job.delete({ where: { id: j.id } }); removed++;
  }
  return removed;
}

// Create / update / delete the listing's calendars to match `items` (from normalizeCalendars)
async function reconcileCalendars(listingId, items) {
  const existing = await prisma.listingCalendar.findMany({ where: { listingId } });
  const keep = new Set();
  let order = 0;
  for (const it of items) {
    const match = (it.id && existing.find((c) => c.id === it.id)) || existing.find((c) => c.url === it.url);
    if (match) {
      keep.add(match.id);
      await prisma.listingCalendar.update({ where: { id: match.id }, data: { label: it.label, url: it.url, order: order++, ...(match.url !== it.url && { lastError: null }) } });
    } else {
      const c = await prisma.listingCalendar.create({ data: { listingId, label: it.label, url: it.url, order: order++ } });
      keep.add(c.id);
    }
  }
  const drop = existing.filter((c) => !keep.has(c.id));
  if (drop.length) {
    await prisma.listingCalendar.deleteMany({ where: { id: { in: drop.map((c) => c.id) } } });   // bookings cascade
    await pruneJobs(listingId);
  }
  await syncLegacyField(listingId);
  return prisma.listingCalendar.findMany({ where: { listingId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
}

/**
 * Cross-calendar sanity for one listing.
 *  - same stay reported twice (identical dates on two calendars): the duplicate is marked `echo` (hidden, no job). The copy with a
 *    real guest name wins; otherwise the first calendar wins.
 *  - overlapping but different dates from two calendars: reported as a possible double-booking.
 * Returns the conflicts: [{ a: {label, checkin, checkout, guest}, b: {...} }]
 */
async function recomputeFlags(listingId) {
  const cutoff = new Date(Date.now() - DAY);
  const cals = await prisma.listingCalendar.findMany({ where: { listingId } });
  const rank = Object.fromEntries(cals.map((c, i) => [c.id, c.order * 10 + i]));
  const label = Object.fromEntries(cals.map((c) => [c.id, c.label]));
  const all = await prisma.booking.findMany({ where: { listingId, type: 'guest', checkoutDate: { gte: cutoff } } });
  const echoIds = new Set();
  const conflicts = [];
  const real = (b) => !GENERIC_NAME.test((b.guestName || '').trim());
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (!a.calendarId || !b.calendarId || a.calendarId === b.calendarId) continue;
      if (a.checkoutDate <= b.checkinDate || b.checkoutDate <= a.checkinDate) continue;       // no overlap (same-day turnover is fine)
      if (dkey(a.checkinDate) === dkey(b.checkinDate) && dkey(a.checkoutDate) === dkey(b.checkoutDate)) {
        const loser = (real(a) === real(b)) ? ((rank[a.calendarId] ?? 0) <= (rank[b.calendarId] ?? 0) ? b : a) : (real(a) ? b : a);
        echoIds.add(loser.id);
      } else {
        conflicts.push({ a, b });
      }
    }
  }
  // Blocked dates that another site shows for a stay (or the same block shown twice) are just echoes of it: hide them
  const blocks = await prisma.booking.findMany({ where: { listingId, type: 'blocked', checkoutDate: { gte: cutoff } } });
  for (const bl of blocks) {
    const covers = [...all.filter((g) => g.calendarId !== bl.calendarId && !echoIds.has(g.id)),
                    ...blocks.filter((o) => o.id !== bl.id && o.calendarId !== bl.calendarId && (rank[o.calendarId] ?? 0) < (rank[bl.calendarId] ?? 0))];
    if (covers.some((o) => o.checkinDate < bl.checkoutDate && bl.checkinDate < o.checkoutDate)) echoIds.add(bl.id);
  }
  await prisma.booking.updateMany({ where: { listingId, echo: true, id: { notIn: [...echoIds] } }, data: { echo: false } });
  if (echoIds.size) await prisma.booking.updateMany({ where: { id: { in: [...echoIds] } }, data: { echo: true } });
  const fmt = (b) => ({ label: label[b.calendarId] || 'Calendar', checkin: b.checkinDate, checkout: b.checkoutDate, guest: b.guestName });
  return conflicts.filter((c) => !echoIds.has(c.a.id) && !echoIds.has(c.b.id)).map((c) => ({ a: fmt(c.a), b: fmt(c.b) }));
}

// Read-only: possible double-bookings among the visible (non-echo) stays, for the dashboards
async function findConflicts(listingId) {
  const cutoff = new Date(Date.now() - DAY);
  const cals = await prisma.listingCalendar.findMany({ where: { listingId }, select: { id: true, label: true } });
  const label = Object.fromEntries(cals.map((c) => [c.id, c.label]));
  const all = await prisma.booking.findMany({ where: { listingId, type: 'guest', echo: false, checkoutDate: { gte: cutoff } }, orderBy: { checkinDate: 'asc' } });
  const out = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (!a.calendarId || !b.calendarId || a.calendarId === b.calendarId) continue;
    if (a.checkoutDate <= b.checkinDate || b.checkoutDate <= a.checkinDate) continue;
    const f = (x) => ({ label: label[x.calendarId] || 'Calendar', checkin: x.checkinDate, checkout: x.checkoutDate, guest: x.guestName });
    out.push({ a: f(a), b: f(b) });
  }
  return out;
}

// Public shape of a listing's calendars for the API/UI
const calendarSelect = { id: true, label: true, url: true, order: true, lastSynced: true, lastError: true };

module.exports = { MAX_CALENDARS, guessLabel, normalizeCalendars, reconcileCalendars, syncLegacyField, pruneJobs, recomputeFlags, findConflicts, calendarSelect };
