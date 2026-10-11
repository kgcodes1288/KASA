const { Router } = require('express');
const prisma = require('../lib/prisma');
const authenticate = require('../middleware/auth');
const { listingAccess } = require('../lib/access');
const rl = require('../lib/rateLimit');

const fmtMoney = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}` : ''; };

// ── input rules ───────────────────────────────────────────────────────────────
const TASK_TYPES = ['MAINTENANCE', 'ACTION', 'PAYMENT_REQUEST', 'QUOTE'];
const validDate = (v) => v && !Number.isNaN(new Date(v).getTime());
// money as typed ("$1,200.50") -> "1200.50"; null when it is not a sensible amount
function cleanAmount(v) {
  if (v === undefined || v === null || String(v).trim() === '') return { value: null };
  const t = String(v).replace(/[$,\s]/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t) || !(parseFloat(t) > 0)) return { error: 'Enter a valid amount, like 150 or 1200.50 (up to 9,999,999.99)' };
  return { value: t };
}
function cleanAttachments(a) {
  if (a === undefined) return { value: [] };
  if (!Array.isArray(a) || a.length > 5) return { error: 'You can attach up to 5 files' };
  if (!a.every((u) => typeof u === 'string' && u.length <= 500 && /^https:\/\//i.test(u))) return { error: 'Attachments must be uploaded files' };
  return { value: a };
}
const toUs10 = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.length === 10 ? d : d.length === 11 && d.startsWith('1') ? d.slice(1) : null; };
// the person must be on the listing's team and able to act (owner or full co-host)
async function isActingMember(listingId, userId) {
  const a = await listingAccess(listingId, userId);
  return a.canWrite;
}
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
    const access = await listingAccess(req.params.id, req.user.id);
    if (!access.listing || !access.canRead) return res.status(404).json({ message: 'Listing not found' });

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
    if (!title || !String(title).trim() || !nextDueAt)
      return res.status(400).json({ message: 'title and nextDueAt are required' });
    if (String(title).trim().length > 120) return res.status(400).json({ message: 'Title must be 120 characters or fewer' });
    if (notes && String(notes).length > 1000) return res.status(400).json({ message: 'Notes must be 1,000 characters or fewer' });
    if (!validDate(nextDueAt) || (lastServicedAt && !validDate(lastServicedAt))) return res.status(400).json({ message: 'That date is not valid' });
    if (taskType !== undefined && !TASK_TYPES.includes(taskType)) return res.status(400).json({ message: 'Unknown task type' });
    const amt = cleanAmount(paymentAmount);
    if (amt.error) return res.status(400).json({ message: amt.error });
    const att = cleanAttachments(attachments);
    if (att.error) return res.status(400).json({ message: att.error });
    if (assignedUserId && !(await isActingMember(req.params.id, assignedUserId)) && assignedUserId !== (await prisma.listing.findUnique({ where: { id: req.params.id }, select: { hostId: true } }))?.hostId)
      return res.status(400).json({ message: "That person isn't on this property's team" });
    if (roomId && !(await prisma.room.findFirst({ where: { id: roomId, listingId: req.params.id }, select: { id: true } })))
      return res.status(400).json({ message: 'That room is not part of this property' });

    const isQuote = taskType === 'QUOTE';
    if (isQuote) {
      const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
      if (!amt.value) return res.status(400).json({ message: 'A quote needs an amount' });
      if (assignedUserId !== listing.hostId)
        return res.status(400).json({ message: 'Quotes are sent to the listing owner for approval' });
      if (req.user.id === listing.hostId)
        return res.status(400).json({ message: 'Only a co-host can send a quote to the owner' });
    }

    const recurring = !isQuote && isRecurring !== false;
    if (recurring && !(Number.isInteger(Number(intervalMonths)) && Number(intervalMonths) >= 1 && Number(intervalMonths) <= 120))
      return res.status(400).json({ message: 'Repeat interval must be between 1 and 120 months' });

    const task = await prisma.maintenanceTask.create({
      data: {
        title: String(title).trim(),
        notes: notes ? String(notes).trim() : null,
        intervalMonths: recurring ? parseInt(intervalMonths) : 0,
        isRecurring: recurring,
        taskType: taskType || 'MAINTENANCE',
        paymentAmount: amt.value,
        ...(isQuote && { quoteStatus: 'PENDING' }),
        attachments: att.value,
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
          ? `${req.user.name} sent a quote for "${title}" (${fmtMoney(amt.value)}) at ${task.listing.name}`
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
    if (title !== undefined && (!String(title).trim() || String(title).trim().length > 120)) return res.status(400).json({ message: 'Title must be 1–120 characters' });
    if (notes && String(notes).length > 1000) return res.status(400).json({ message: 'Notes must be 1,000 characters or fewer' });
    if (nextDueAt && !validDate(nextDueAt)) return res.status(400).json({ message: 'That date is not valid' });
    const amt = paymentAmount !== undefined ? cleanAmount(paymentAmount) : { value: undefined };
    if (amt.error) return res.status(400).json({ message: amt.error });
    if (attachments !== undefined) { const att = cleanAttachments(attachments); if (att.error) return res.status(400).json({ message: att.error }); }
    const updated = await prisma.maintenanceTask.update({
      where: { id: task.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(paymentAmount !== undefined && { paymentAmount: amt.value }),
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
      `${req.user.name} sent an invoice for "${task.title.replace(/^Invoice: /, '')}" (${fmtMoney(task.paymentAmount)}) at ${task.listing.name}`,
      task.listingId,
      { subject: 'An invoice is waiting for you', tab: 'overview' }
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
    if (note && String(note).length > 500) return res.status(400).json({ message: 'Note must be 500 characters or fewer' });
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
      if (!(await isActingMember(task.listingId, userId)))
        return res.status(400).json({ message: "That person isn't on this property's team (or has view-only access)" });

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
      const ten = toUs10(phone);
      if (!ten) return res.status(400).json({ message: 'That phone number does not look right. Use a 10-digit US number.' });
      const e164 = `+1${ten}`;

      // texting needs the person's agreement: a saved vendor with consent, or an explicit confirmation
      const vendors = await prisma.contractor.findMany({ where: { hostId: { in: [req.user.id, task.listing.hostId] } } });
      const saved = vendors.find((v) => toUs10(v.phone) === ten);
      if (saved && !saved.smsConsent)
        return res.status(400).json({ message: `${saved.name} hasn't agreed to receive texts. Open Account → Contractors and tick the consent box once they agree.` });
      if (!saved && req.body.consentConfirmed !== true)
        return res.status(400).json({ message: 'Please confirm this person has agreed to receive text messages from CleanStay.' });

      const userBucket = rl.hit(`sms-user|${req.user.id}`, 60 * 60 * 1000);
      if (userBucket.n > 30) return rl.retry(res, userBucket, "You've sent a lot of texts.");
      const phoneBucket = rl.hit(`sms-phone|${e164}`, 24 * 60 * 60 * 1000);
      if (phoneBucket.n > 5) return rl.retry(res, phoneBucket, 'This number has already received several texts today.');

      const token = crypto.randomBytes(20).toString('hex');
      const expiresAt = addMonths(new Date(task.nextDueAt), 1);
      const clientUrl = process.env.CLIENT_URL || 'https://getcleanstays.com';
      const link = `${clientUrl}/maintenance/${token}`;

      // text first: if it can't be sent, nothing is recorded
      try {
        await sendSms({
          to: e164,
          body: `Hi! You've been assigned a maintenance task "${task.title}" at ${task.listing.name}. Due: ${new Date(task.nextDueAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}. View details here: ${link}`,
        });
      } catch (smsErr) {
        console.error('[assign maintenance] SMS failed:', smsErr.message);
        return res.status(502).json({ message: "We couldn't send that text. Check the phone number and try again." });
      }
      await prisma.maintenanceToken.create({ data: { token, phone: e164, expiresAt, taskId: task.id } });
      return res.json({ message: 'SMS sent to contractor' });
    }

    return res.status(400).json({ message: 'type must be cohost or contractor' });
  } catch (err) {
    console.error('[assign maintenance]', err.message);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
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