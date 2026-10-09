// One-time, idempotent: convert the old per-room cleaning model to one turnover job per checkout.
//  - each room's checklist template becomes a reset-list item tagged with that room
//  - all per-room jobs for a (listing, checkout date) merge into one job with no room,
//    keeping every checklist step (tagged with its room) and its completed state
// Safe to run on every start: it only touches jobs that still have a roomId.
const prisma = require('../lib/prisma');

const DEFAULT_ONLY = (items) => items.length === 1 && /^done$/i.test(items[0].text.trim());

async function migrateTurnover() {
  // 1) templates -> reset list (only for listings that don't have one yet)
  const rooms = await prisma.room.findMany({
    include: { checklistItems: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  const byListing = {};
  rooms.forEach((r) => { (byListing[r.listingId] ||= []).push(r); });
  let templates = 0;
  for (const [listingId, list] of Object.entries(byListing)) {
    if (!list.some((r) => r.checklistItems.length)) continue;
    if (await prisma.resetItem.count({ where: { listingId } })) continue;
    const data = [];
    list.forEach((r) => r.checklistItems.forEach((c) => data.push({ listingId, roomId: r.id, text: c.text, order: data.length })));
    await prisma.resetItem.createMany({ data });
    templates += data.length;
  }

  // 2) per-room jobs -> one turnover job per checkout
  const legacy = await prisma.job.findMany({
    where: { roomId: { not: null } },
    include: { room: { select: { name: true } }, checklistItems: true },
    orderBy: { createdAt: 'asc' },
  });
  const groups = {};
  legacy.forEach((j) => {
    const key = `${j.listingId}|${j.checkoutDate.toISOString().slice(0, 10)}`;
    (groups[key] ||= []).push(j);
  });
  let merged = 0;
  for (const jobs of Object.values(groups)) {
    const first = jobs[0];
    const steps = [];
    jobs.forEach((j) => {
      const items = j.checklistItems;
      if (DEFAULT_ONLY(items) || !items.length) return; // "Done" placeholder = no sub-tasks
      items.sort((a, b) => (a.id < b.id ? -1 : 1)).forEach((c) => steps.push({
        text: c.text, completed: c.completed, completedAt: c.completedAt, tag: j.room?.name || null,
      }));
    });
    const statuses = jobs.map((j) => j.status);
    const status = statuses.every((s) => s === 'completed') ? 'completed'
      : (statuses.some((s) => s !== 'pending') || steps.some((s) => s.completed)) ? 'in_progress' : 'pending';
    await prisma.$transaction([
      prisma.job.create({
        data: {
          listingId: first.listingId,
          cleanerId: jobs.find((j) => j.cleanerId)?.cleanerId || null,
          checkoutDate: first.checkoutDate, checkinDate: first.checkinDate,
          guestName: first.guestName, status,
          smsSent: jobs.some((j) => j.smsSent), reminderSentAt: first.reminderSentAt,
          checklistItems: { create: steps },
        },
      }),
      prisma.job.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } }),
    ]);
    merged++;
  }
  if (templates || merged) console.log(`[migrate-turnover] ${templates} reset item(s) created, ${legacy.length} per-room job(s) merged into ${merged} turnover job(s)`);
}

module.exports = { migrateTurnover };
