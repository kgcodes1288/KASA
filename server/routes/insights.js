const { Router } = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = Router();
const DAY = 86400000;
const amt = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; };
const monthKey = (d) => new Date(d).toISOString().slice(0, 7);
const r2 = (n) => Math.round(n * 100) / 100;

// Planned work   = turnover cleans + recurring maintenance (known in advance)
// Unplanned work = one-off action items and quotes (repairs, things that came up)
// Invoices       = payment requests that have been sent (drafts are private to their author)
async function insightsFor(listingIds, from, to, userId) {
  const inRange = { gte: from, lt: to };
  const [jobs, tasks, bookings] = await Promise.all([
    prisma.job.findMany({ where: { listingId: { in: listingIds }, checkoutDate: inRange }, select: { listingId: true, status: true, checkoutDate: true, updatedAt: true } }),
    prisma.maintenanceTask.findMany({
      where: { listingId: { in: listingIds }, OR: [{ isDraft: false }, { assignedByUserId: userId }] },
      select: { listingId: true, taskType: true, isRecurring: true, paymentAmount: true, quoteStatus: true, status: true, isDraft: true, createdAt: true, updatedAt: true, lastServicedAt: true, nextDueAt: true },
    }),
    prisma.booking.findMany({ where: { listingId: { in: listingIds }, echo: false, type: 'guest', checkoutDate: inRange }, select: { listingId: true, checkinDate: true, checkoutDate: true } }),
  ]);
  const now = Date.now();
  const mk = () => ({
    stays: 0, nights: 0,
    planned: { cleans: 0, cleansDone: 0, maintenanceDone: 0, maintenanceOverdue: 0 },
    unplanned: { raised: 0, resolved: 0, open: 0, avgDaysToResolve: null },
    invoices: { count: 0, total: 0, paid: 0, paidTotal: 0, outstanding: 0, outstandingTotal: 0, avg: 0 },
    quotes: { count: 0, approved: 0, declined: 0, pending: 0, approvedTotal: 0 },
    openNow: 0, overdueNow: 0, _res: [],
  });
  const by = Object.fromEntries(listingIds.map((id) => [id, mk()]));
  const months = {};
  const bucket = (d) => (months[monthKey(d)] ||= { month: monthKey(d), cleans: 0, unplanned: 0, invoiceTotal: 0 });

  for (const b of bookings) {
    by[b.listingId].stays++;
    by[b.listingId].nights += Math.max(0, Math.round((b.checkoutDate - b.checkinDate) / DAY));
  }
  for (const j of jobs) {
    const m = by[j.listingId]; m.planned.cleans++; bucket(j.checkoutDate).cleans++;
    if (j.status === 'completed') m.planned.cleansDone++;
  }
  for (const t of tasks) {
    const m = by[t.listingId];
    const created = t.createdAt >= from && t.createdAt < to;
    const done = t.status === 'COMPLETED';
    // "needs attention right now" is a live count, independent of the date range
    if (t.taskType !== 'QUOTE' && !t.isDraft && !(done && !t.isRecurring)) {
      const overdue = t.nextDueAt < now && !done;
      if (!t.isRecurring || t.nextDueAt - now < 30 * DAY) { m.openNow++; if (overdue) m.overdueNow++; }
    }
    if (t.taskType === 'PAYMENT_REQUEST' && !t.isDraft && created) {
      const v = amt(t.paymentAmount); const x = m.invoices;
      x.count++; x.total += v; bucket(t.createdAt).invoiceTotal += v;
      if (done) { x.paid++; x.paidTotal += v; } else { x.outstanding++; x.outstandingTotal += v; }
    } else if (t.taskType === 'QUOTE' && created) {
      const q = m.quotes; q.count++;
      if (t.quoteStatus === 'APPROVED') { q.approved++; q.approvedTotal += amt(t.paymentAmount); }
      else if (t.quoteStatus === 'DECLINED') q.declined++; else q.pending++;
      bucket(t.createdAt).unplanned++; m.unplanned.raised++;
    } else if (t.taskType === 'ACTION' && !t.isRecurring && created) {
      m.unplanned.raised++; bucket(t.createdAt).unplanned++;
      if (done) { m.unplanned.resolved++; m._res.push((t.updatedAt - t.createdAt) / DAY); } else m.unplanned.open++;
    } else if (t.taskType === 'MAINTENANCE') {
      if (t.lastServicedAt && t.lastServicedAt >= from && t.lastServicedAt < to) m.planned.maintenanceDone++;
      if (t.status !== 'COMPLETED' && t.nextDueAt < now) m.planned.maintenanceOverdue++;
    }
  }
  const sum = mk(); const flat = (o, p) => { for (const k of Object.keys(o)) { if (typeof o[k] === 'object' && o[k] && !Array.isArray(o[k])) flat(o[k], p[k]); else if (typeof o[k] === 'number') p[k] = (p[k] || 0) + o[k]; } };
  let resAll = [];
  for (const id of listingIds) {
    const m = by[id]; resAll = resAll.concat(m._res);
    m.unplanned.avgDaysToResolve = m._res.length ? r2(m._res.reduce((a, b) => a + b, 0) / m._res.length) : null;
    m.invoices.avg = m.invoices.count ? r2(m.invoices.total / m.invoices.count) : 0;
    delete m._res; flat(m, sum);
  }
  sum.unplanned.avgDaysToResolve = resAll.length ? r2(resAll.reduce((a, b) => a + b, 0) / resAll.length) : null;
  sum.invoices.avg = sum.invoices.count ? r2(sum.invoices.total / sum.invoices.count) : 0;
  delete sum._res;
  for (const m of [sum, ...Object.values(by)]) { m.invoices.total = r2(m.invoices.total); m.invoices.paidTotal = r2(m.invoices.paidTotal); m.invoices.outstandingTotal = r2(m.invoices.outstandingTotal); m.quotes.approvedTotal = r2(m.quotes.approvedTotal); }
  return { totals: sum, byListing: by, trend: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).map((x) => ({ ...x, invoiceTotal: r2(x.invoiceTotal) })) };
}

// GET /api/insights?from=YYYY-MM-DD&to=YYYY-MM-DD&listingIds=a,b
router.get('/', auth, async (req, res) => {
  try {
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 90 * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return res.status(400).json({ message: 'Choose a valid date range' });
    if (to - from > 800 * DAY) return res.status(400).json({ message: 'Choose a range of two years or less' });
    to.setUTCHours(24, 0, 0, 0); // include the end day

    const mine = await prisma.listing.findMany({ where: { OR: [{ hostId: req.user.id }, { coHosts: { some: { userId: req.user.id, status: 'ACCEPTED' } } }] }, select: { id: true, name: true, city: true }, orderBy: { createdAt: 'asc' } });
    const wanted = String(req.query.listingIds || '').split(',').filter(Boolean);
    const chosen = wanted.length ? mine.filter((l) => wanted.includes(l.id)) : mine;
    if (!chosen.length) return res.json({ listings: mine, from, to, totals: null, byListing: {}, trend: [] });
    const data = await insightsFor(chosen.map((l) => l.id), from, to, req.user.id);
    res.json({ listings: mine, selected: chosen.map((l) => l.id), from, to, ...data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
