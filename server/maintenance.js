const { Router } = require('express');
const prisma = require('../lib/prisma');
const authenticate = require('../middleware/auth');

async function getAccess(listingId, userId) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return { listing: null, canRead: false, canWrite: false };
  const isOwner = listing.hostId === userId;
  const coHost = await prisma.listingCoHost.findFirst({
    where: { listingId, userId, status: 'ACCEPTED' },
  });
  const canRead  = isOwner || !!coHost;
  const canWrite = isOwner || (coHost?.role === 'COHOST');
  return { listing, canRead, canWrite };
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ── Listing-scoped router (/api/listings/:id/maintenance) ──
const listingRouter = Router();

listingRouter.get('/:id/maintenance', authenticate, async (req, res) => {
  const { canRead } = await getAccess(req.params.id, req.user.id);
  if (!canRead) return res.status(403).json({ message: 'Forbidden' });

  const rooms = await prisma.room.findMany({
    where: { listingId: req.params.id },
    include: {
      checklistItems: { orderBy: { order: 'asc' } },
      maintenanceTasks: {
        include: { assignedUser: { select: { id: true, name: true } } },
        orderBy: { nextDueAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(rooms);
});

listingRouter.post('/:id/maintenance', authenticate, async (req, res) => {
  const { canWrite } = await getAccess(req.params.id, req.user.id);
  if (!canWrite) return res.status(403).json({ message: 'Forbidden' });

  const { title, notes, intervalMonths, lastServicedAt, nextDueAt, roomId, assignedUserId } = req.body;
  if (!title?.trim())    return res.status(400).json({ message: 'Title is required' });
  if (!intervalMonths || intervalMonths < 1)
                          return res.status(400).json({ message: 'Interval must be at least 1 month' });
  if (!nextDueAt)         return res.status(400).json({ message: 'Next due date is required' });

  const task = await prisma.maintenanceTask.create({
    data: {
      title: title.trim(),
      notes: notes?.trim() || null,
      intervalMonths: parseInt(intervalMonths),
      lastServicedAt: lastServicedAt ? new Date(lastServicedAt) : null,
      nextDueAt: new Date(nextDueAt),
      listingId: req.params.id,
      roomId: roomId || null,
      assignedUserId: assignedUserId || null,
    },
    include: { assignedUser: { select: { id: true, name: true } } },
  });
  res.status(201).json(task);
});

// ── Task-level router (/api/maintenance/:taskId) ──
const taskRouter = Router();

taskRouter.patch('/:taskId/complete', authenticate, async (req, res) => {
  const task = await prisma.maintenanceTask.findUnique({ where: { id: req.params.taskId } });
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const { canWrite } = await getAccess(task.listingId, req.user.id);
  if (!canWrite) return res.status(403).json({ message: 'Forbidden' });

  const now = new Date();
  const updated = await prisma.maintenanceTask.update({
    where: { id: req.params.taskId },
    data: {
      status: 'COMPLETED',
      lastServicedAt: now,
      nextDueAt: addMonths(now, task.intervalMonths),
      notificationSent: false,
    },
    include: { assignedUser: { select: { id: true, name: true } } },
  });
  res.json(updated);
});

taskRouter.delete('/:taskId', authenticate, async (req, res) => {
  const task = await prisma.maintenanceTask.findUnique({ where: { id: req.params.taskId } });
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const { canWrite } = await getAccess(task.listingId, req.user.id);
  if (!canWrite) return res.status(403).json({ message: 'Forbidden' });

  await prisma.maintenanceTask.delete({ where: { id: req.params.taskId } });
  res.json({ message: 'Deleted' });
});

module.exports = { listingRouter, taskRouter };