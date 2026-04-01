const { Router } = require('express');
const prisma = require('../lib/prisma');
const authenticate = require('../middleware/auth');
const crypto = require('crypto');
const twilio = require('twilio');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function getAccess(listingId, userId) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return { found: false, canWrite: false };
  if (listing.hostId === userId) return { found: true, canWrite: true };
  const coHost = await prisma.listingCoHost.findFirst({
    where: { listingId, userId, status: 'ACCEPTED' },
  });
  return { found: true, canWrite: coHost?.role === 'COHOST' };
}

// ── Listing-level router (/api/listings/:id/maintenance) ──────────────────────
const listingRouter = Router({ mergeParams: true });

// GET /api/listings/:id/maintenance — returns rooms with nested checklistItems + maintenanceTasks, plus general tasks
listingRouter.get('/:id/maintenance', authenticate, async (req, res) => {
  try {
    const { found } = await getAccess(req.params.id, req.user.id);
    if (!found) return res.status(404).json({ message: 'Listing not found' });

    const taskInclude = {
      assignedUser: { select: { id: true, name: true } },
      assignedBy: { select: { id: true, name: true } },
      maintenanceTokens: { orderBy: { createdAt: 'desc' }, take: 1 },
    };

    const [rooms, generalTasks] = await Promise.all([
      prisma.room.findMany({
        where: { listingId: req.params.id },
        include: {
          checklistItems: { orderBy: { order: 'asc' } },
          maintenanceTasks: {
            include: taskInclude,
            orderBy: { nextDueAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.maintenanceTask.findMany({
        where: { listingId: req.params.id, roomId: null },
        include: taskInclude,
        orderBy: { nextDueAt: 'asc' },
      }),
    ]);

    const result = [...rooms];
    if (generalTasks.length > 0) {
      result.push({
        id: '__general__',
        name: 'General',
        entityType: 'GENERAL',
        checklistItems: [],
        maintenanceTasks: generalTasks,
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/listings/:id/maintenance
listingRouter.post('/:id/maintenance', authenticate, async (req, res) => {
  try {
    const { canWrite, found } = await getAccess(req.params.id, req.user.id);
    if (!found) return res.status(404).json({ message: 'Listing not found' });
    if (!canWrite) return res.status(403).json({ message: 'Forbidden' });

    const { title, notes, intervalMonths, lastServicedAt, nextDueAt, roomId, assignedUserId, taskType, isRecurring, paymentAmount, attachments } = req.body;
    if (!title || !nextDueAt)
      return res.status(400).json({ message: 'title and nextDueAt are required' });

    const recurring = isRecurring !== false;
    if (recurring && !intervalMonths)
      return res.status(400).json({ message: 'intervalMonths is required for recurring tasks' });

    const task = await prisma.maintenanceTask.create({
      data: {
        title,
        notes: notes || null,
        intervalMonths: recurring ? parseInt(intervalMonths) : 0,
        isRecurring: recurring,
        taskType: taskType || 'MAINTENANCE',
        paymentAmount: paymentAmount || null,
        attachments: Array.isArray(attachments) ? attachments : [],
        lastServicedAt: lastServicedAt ? new Date(lastServicedAt) : null,
        nextDueAt: new Date(nextDueAt),
        listingId: req.params.id,
        roomId: roomId || null,
        assignedUserId: assignedUserId || null,
        assignedByUserId: req.user.id,
      },
      include: { assignedUser: { select: { id: true, name: true } } },
    });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Task-level router (/api/maintenance/:taskId) ──────────────────────────────
const taskRouter = Router();

// PATCH /api/maintenance/:taskId/complete
taskRouter.patch('/:taskId/complete', authenticate, async (req, res) => {
  try {
    const task = await prisma.maintenanceTask.findUnique({ where: { id: req.params.taskId } });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const { canWrite } = await getAccess(task.listingId, req.user.id);
    if (!canWrite) return res.status(403).json({ message: 'Forbidden' });

    const now = new Date();
    const updateData = {
      status: 'COMPLETED',
      lastServicedAt: now,
      notificationSent: false,
    };
    if (task.isRecurring && task.intervalMonths > 0) {
      updateData.nextDueAt = addMonths(now, task.intervalMonths);
    }
    const updated = await prisma.maintenanceTask.update({
      where: { id: req.params.taskId },
      data: updateData,
      include: { assignedUser: { select: { id: true, name: true } } },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/maintenance/:taskId/assign
taskRouter.post('/:taskId/assign', authenticate, async (req, res) => {
  try {
    const task = await prisma.maintenanceTask.findUnique({
      where: { id: req.params.taskId },
      include: { listing: true },
    });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const { canWrite } = await getAccess(task.listingId, req.user.id);
    if (!canWrite) return res.status(403).json({ message: 'Forbidden' });

    const { type, userId, phone } = req.body;

    if (type === 'cohost') {
      if (!userId) return res.status(400).json({ message: 'userId is required for cohost assignment' });

      const updated = await prisma.maintenanceTask.update({
        where: { id: req.params.taskId },
        data: { assignedUserId: userId },
        include: { assignedUser: { select: { id: true, name: true } } },
      });
      return res.json({ message: 'Co-host assigned', task: updated });
    }

    if (type === 'contractor') {
      if (!phone) return res.status(400).json({ message: 'phone is required for contractor assignment' });

      const digits = phone.replace(/\D/g, '');
      const e164 = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

      const token = crypto.randomBytes(20).toString('hex');
      const expiresAt = addMonths(new Date(task.nextDueAt), 1);

      await prisma.maintenanceToken.create({
        data: { token, phone: e164, expiresAt, taskId: task.id },
      });

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const link = `${clientUrl}/maintenance/${token}`;

      console.log(`[MaintenanceToken] Contractor link: ${link}`);

      await twilioClient.messages.create({
        to: e164,
        from: process.env.TWILIO_PHONE,
        body: `Hi! You've been assigned a maintenance task "${task.title}" at ${task.listing.name}. Due: ${new Date(task.nextDueAt).toLocaleDateString()}. View details here: ${link}`,
      });

      return res.json({ message: 'SMS sent to contractor' });
    }

    return res.status(400).json({ message: 'type must be cohost or contractor' });
  } catch (err) {
    console.error('[assign maintenance]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/maintenance/:taskId
taskRouter.delete('/:taskId', authenticate, async (req, res) => {
  try {
    const task = await prisma.maintenanceTask.findUnique({ where: { id: req.params.taskId } });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const { canWrite } = await getAccess(task.listingId, req.user.id);
    if (!canWrite) return res.status(403).json({ message: 'Forbidden' });

    // Delete Cloudinary assets before removing the DB record
    if (task.attachments && task.attachments.length > 0) {
      await Promise.allSettled(task.attachments.map((url) => {
        // Extract public_id from URL: everything after /upload/vXXXX/ (strip version)
        const match = url.match(/\/(?:image|raw)\/upload\/(?:v\d+\/)?(.+)$/);
        if (!match) return Promise.resolve();
        const publicId = match[1].replace(/\.[^/.]+$/, ''); // strip extension for images
        const resourceType = url.includes('/raw/upload/') ? 'raw' : 'image';
        return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      }));
    }

    await prisma.maintenanceTask.delete({ where: { id: req.params.taskId } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = { listingRouter, taskRouter };