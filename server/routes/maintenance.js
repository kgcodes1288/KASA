const { Router } = require('express');
const prisma = require('../lib/prisma');
const authenticate = require('../middleware/auth');
const { notify } = require('../lib/notify');
const crypto = require('crypto');
const { sendSms } = require('../lib/sendSms');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

    // Drafts are only visible to the person who created them
    const visible = { OR: [{ isDraft: false }, { assignedByUserId: req.user.id }] };

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
            where: visible,
            include: taskInclude,
            orderBy: { nextDueAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.maintenanceTask.findMany({
        where: { listingId: req.params.id, roomId: null, ...visible },
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

    const isQuote = taskType === 'QUOTE';
    if (isQuote) {
      const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
      if (!paymentAmount || !String(paymentAmount).trim())
        return res.status(400).json({ message: 'A quote needs an amount' });
      if (assignedUserId !== listing.hostId)
        return res.status(400).json({ message: 'Quotes are sent to the listing owner for approval' });
      if (req.user.id === listing.hostId)
        return res.status(400).json({ message: 'Only a co-host can send a quote to the owner' });
    }

    const recurring = !isQuote && isRecurring !== false;
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
        ...(isQuote && { quoteStatus: 'PENDING' }),
        attachments: Array.isArray(attachments) ? attachments : [],
        lastServicedAt: lastServicedAt ? new Date(lastServicedAt) : null,
        nextDueAt: new Date(nextDueAt),
        listingId: req.params.id,
        roomId: roomId || null,
        assignedUserId: assignedUserId || null,
        assignedByUserId: req.user.id,
      },
      include: {
        assignedUser: { select: { id: true, name: true } },
        listing: { select: { name: true } },
      },
    });

    // Notify assigned user if different from creator
    if (assignedUserId && assignedUserId !== req.user.id) {
      await notify(
        assignedUserId,
        isQuote ? 'QUOTE_REQUESTED' : 'TASK_ASSIGNED',
        isQuote ? 'Quote needs your approval' : 'Task assigned to you',
        isQuote
          ? `${req.user.name} sent a quote for "${title}" ($${String(paymentAmount).replace(/^\$/, '')}) at ${task.listing.name}`
          : `You've been assigned "${title}" at ${task.listing.name}`,
        req.params.id
      );
    }

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
    if (task.taskType === 'QUOTE')
      return res.status(400).json({ message: 'Quotes are approved or declined, not completed' });
    if (task.isDraft)
      return res.status(400).json({ message: 'Send this draft invoice first' });

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

// Draft invoices belong to the co-host who received the quote approval
async function loadOwnDraft(req, res) {
  const task = await prisma.maintenanceTask.findUnique({
    where: { id: req.params.taskId },
    include: { listing: true },
  });
  if (!task || !task.isDraft || task.assignedByUserId !== req.user.id) {
    res.status(404).json({ message: 'Draft not found' });
    return null;
  }
  return task;
}

// PUT /api/maintenance/:taskId/draft — edit a draft invoice
taskRouter.put('/:taskId/draft', authenticate, async (req, res) => {
  try {
    const task = await loadOwnDraft(req, res);
    if (!task) return;
    const { title, notes, paymentAmount, nextDueAt, attachments } = req.body;
    if (title !== undefined && !title.trim()) return res.status(400).json({ message: 'Title is required' });
    const updated = await prisma.maintenanceTask.update({
      where: { id: task.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(paymentAmount !== undefined && { paymentAmount: String(paymentAmount).trim() || null }),
        ...(nextDueAt && { nextDueAt: new Date(nextDueAt) }),
        ...(Array.isArray(attachments) && { attachments }),
      },
      include: { assignedUser: { select: { id: true, name: true } }, assignedBy: { select: { id: true, name: true } } },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/maintenance/:taskId/send — send a draft invoice to the owner
taskRouter.post('/:taskId/send', authenticate, async (req, res) => {
  try {
    const task = await loadOwnDraft(req, res);
    if (!task) return;
    if (!(parseFloat(String(task.paymentAmount ?? '').replace(/[^0-9.]/g, '')) > 0))
      return res.status(400).json({ message: 'Add the invoice amount before sending' });

    const updated = await prisma.maintenanceTask.update({
      where: { id: task.id },
      data: { isDraft: false, nextDueAt: task.nextDueAt < new Date() ? new Date(Date.now() + 14 * 86400000) : task.nextDueAt },
      include: { assignedUser: { select: { id: true, name: true } }, assignedBy: { select: { id: true, name: true } } },
    });
    await notify(
      task.listing.hostId,
      'TASK_ASSIGNED',
      'Invoice received',
      `${req.user.name} sent an invoice for "${task.title.replace(/^Invoice: /, '')}" ($${String(task.paymentAmount).replace(/^\$/, '')}) at ${task.listing.name}`,
      task.listingId
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/maintenance/:taskId/decision — the listing owner approves or declines a quote
taskRouter.post('/:taskId/decision', authenticate, async (req, res) => {
  try {
    const task = await prisma.maintenanceTask.findUnique({
      where: { id: req.params.taskId },
      include: { listing: true },
    });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.taskType !== 'QUOTE') return res.status(400).json({ message: 'Not a quote' });
    if (task.listing.hostId !== req.user.id)
      return res.status(403).json({ message: 'Only the listing owner can approve or decline a quote' });
    if (task.quoteStatus !== 'PENDING')
      return res.status(409).json({ message: `This quote was already ${task.quoteStatus.toLowerCase()}` });

    const { decision, note } = req.body;
    if (!['APPROVED', 'DECLINED'].includes(decision))
      return res.status(400).json({ message: 'decision must be APPROVED or DECLINED' });

    // Approving a quote drafts an invoice for the co-host to edit and send once the work is done
    const draftInvoice = decision === 'APPROVED' && task.assignedByUserId
      ? [prisma.maintenanceTask.create({
          data: {
            title: `Invoice: ${task.title}`,
            notes: `Quote approved ${new Date().toLocaleDateString('en-US')}.${task.notes ? ` ${task.notes}` : ''}`,
            taskType: 'PAYMENT_REQUEST',
            paymentAmount: task.paymentAmount,
            isRecurring: false,
            intervalMonths: 0,
            isDraft: true,
            sourceQuoteId: task.id,
            nextDueAt: new Date(Date.now() + 14 * 86400000),
            listingId: task.listingId,
            roomId: task.roomId,
            assignedUserId: task.listing.hostId,
            assignedByUserId: task.assignedByUserId,
          },
        })]
      : [];

    const [updated] = await prisma.$transaction([
      prisma.maintenanceTask.update({
        where: { id: task.id },
        data: {
          quoteStatus: decision,
          status: 'COMPLETED',
          decisionNote: note?.trim() || null,
          decidedAt: new Date(),
        },
        include: { assignedUser: { select: { id: true, name: true } }, assignedBy: { select: { id: true, name: true } } },
      }),
      ...draftInvoice,
    ]);

    if (task.assignedByUserId && task.assignedByUserId !== req.user.id) {
      await notify(
        task.assignedByUserId,
        'QUOTE_DECIDED',
        `Quote ${decision.toLowerCase()}`,
        `${req.user.name} ${decision.toLowerCase()} "${task.title}" at ${task.listing.name}${note?.trim() ? `: "${note.trim()}"` : ''}${decision === 'APPROVED' ? '. A draft invoice is waiting on your dashboard.' : ''}`,
        task.listingId
      );
    }
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

      // Notify the assigned user (if different from assigner)
      if (userId !== req.user.id) {
        await notify(
          userId,
          'TASK_ASSIGNED',
          'Task assigned to you',
          `You've been assigned "${task.title}" at ${task.listing.name}`,
          task.listingId
        );
      }

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

      await sendSms({
        to: e164,
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
        const match = url.match(/\/image\/upload\/(?:v\d+\/)?(.+)$/);
        if (!match) return Promise.resolve();
        const publicId = match[1].replace(/\.[^/.]+$/, ''); // strip extension
        return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      }));
    }

    await prisma.maintenanceTask.delete({ where: { id: req.params.taskId } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = { listingRouter, taskRouter };