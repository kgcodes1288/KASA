const prisma = require('./prisma');

// A listing's reset list: ordered steps, each optionally tagged with a room/appliance.
async function getResetItems(listingId) {
  return prisma.resetItem.findMany({
    where: { listingId },
    orderBy: { order: 'asc' },
    include: { room: { select: { id: true, name: true, entityType: true } } },
  });
}

// Checklist rows to copy onto a new turnover job (none when the listing has no reset list).
const checklistFromReset = (items) =>
  items.map((i) => ({ text: i.text, tag: i.room?.name || null }));

module.exports = { getResetItems, checklistFromReset };
