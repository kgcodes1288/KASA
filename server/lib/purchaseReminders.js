// Daily nudges so purchase requests don't stall: at most one reminder per request every 3 days.
const prisma = require('./prisma');
const { notify } = require('./notify');
const P = require('./purchase');

const DAY = 86400000;

async function sendPurchaseReminders() {
  const now = Date.now();
  const open = await prisma.maintenanceTask.findMany({
    where: { taskType: 'PURCHASE', purchaseStatus: { in: ['PENDING', 'APPROVED', 'ORDERED'] },
      OR: [{ purchaseReminderAt: null }, { purchaseReminderAt: { lt: new Date(now - 3 * DAY) } }] },
    include: { listing: { select: { name: true, hostId: true } } },
  });
  let sent = 0;
  for (const t of open) {
    const what = P.itemsSummary(t.purchaseItems);
    const since = (d) => (d ? now - new Date(d).getTime() : 0);
    let to = null, title = '', msg = '';
    if (t.purchaseStatus === 'PENDING' && since(t.createdAt) > 2 * DAY) {
      to = t.listing.hostId; title = 'A purchase request is waiting for you'; msg = `Your co-host is waiting for your answer on ${what} for ${t.listing.name}.`;
    } else if (t.purchaseStatus === 'APPROVED' && t.purchaseMode === 'OWNER_ORDERS' && since(t.decidedAt) > 2 * DAY) {
      to = t.listing.hostId; title = 'Still to order'; msg = `You approved ordering ${what} for ${t.listing.name}. Mark it ordered once it's placed so your co-host knows it's coming.`;
    } else if (t.purchaseStatus === 'APPROVED' && t.purchaseMode === 'COHOST_BUYS' && since(t.decidedAt) > 5 * DAY) {
      to = t.assignedByUserId; title = 'Bought it yet?'; msg = `${what} for ${t.listing.name} was approved. Once you've bought it, mark it purchased with the receipt to be reimbursed.`;
    } else if (t.purchaseStatus === 'ORDERED') {
      const eta = t.orderInfo?.eta ? new Date(t.orderInfo.eta + 'T23:59:59Z').getTime() : null;
      if ((eta && now > eta + DAY) || (!eta && since(t.updatedAt) > 10 * DAY)) {
        to = t.assignedByUserId; title = 'Has your delivery arrived?'; msg = `${what} for ${t.listing.name} should have arrived. Mark it received, or report a problem.`;
      }
    }
    if (!to) continue;
    await notify(to, 'PURCHASE_UPDATED', title, msg, t.listingId, { tab: 'overview' });
    await prisma.maintenanceTask.update({ where: { id: t.id }, data: { purchaseReminderAt: new Date() } });
    sent++;
  }
  if (sent) console.log(`[purchases] ${sent} reminder(s) sent`);
  return sent;
}

module.exports = { sendPurchaseReminders };
