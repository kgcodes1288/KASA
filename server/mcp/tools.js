const { z } = require('zod');
const prisma = require('../lib/prisma');
const { callApi } = require('./api');

const DAY = 86400000;
const money = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : String(v ?? '');
};
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const daysUntil = (d) => Math.ceil((new Date(d) - Date.now()) / DAY);
const json = (o) => JSON.stringify(o, null, 1);

// Flatten /listings/:id/maintenance into tasks tagged with their room
const flattenTasks = (rooms) => rooms.flatMap((r) =>
  (r.maintenanceTasks || []).map((t) => ({ ...t, roomName: r.entityType === 'GENERAL' ? null : r.name })));

const shapeTask = (t) => ({
  id: t.id,
  title: t.title,
  type: t.taskType,                       // MAINTENANCE | ACTION | PAYMENT_REQUEST | QUOTE
  amount: t.paymentAmount ? money(t.paymentAmount) : undefined,
  notes: t.notes || undefined,
  due: dayKey(t.nextDueAt),
  daysUntilDue: daysUntil(t.nextDueAt),
  recurringEveryMonths: t.isRecurring ? t.intervalMonths : undefined,
  lastServiced: t.lastServicedAt ? dayKey(t.lastServicedAt) : undefined,
  status: t.status,
  quoteStatus: t.quoteStatus || undefined,
  decisionNote: t.decisionNote || undefined,
  isDraftInvoice: t.isDraft || undefined,
  room: t.roomName || undefined,
  assignedTo: t.assignedUser?.name,
  from: t.assignedBy?.name,
  attachments: t.attachments?.length ? t.attachments : undefined,
});

const isOpen = (t) => (t.isRecurring ? daysUntil(t.nextDueAt) <= 30 : t.status !== 'COMPLETED');

function registerTools(server, ctx) {
  const api = (method, path, body) => callApi(ctx.userId, method, path, body);

  const audit = (tool, isWrite, ok, detail) =>
    prisma.mcpAuditLog.create({ data: { userId: ctx.userId, clientId: ctx.clientId, tool, isWrite, ok, detail: detail ? String(detail).slice(0, 300) : null } }).catch(() => {});

  const textResult = (text) => ({ content: [{ type: 'text', text }] });
  const errResult = (text) => ({ content: [{ type: 'text', text }], isError: true });

  // opts.write: needs the write scope. opts.confirm(args): returns a preview string if this
  // call must be confirmed by the human first (requires re-calling with confirm=true).
  function def(name, config, opts, run) {
    const { write = false, destructive = false, confirm } = opts;
    const inputSchema = { ...config.input };
    if (confirm) inputSchema.confirm = z.boolean().optional().describe('Set to true only after the user has explicitly approved this exact action.');
    server.registerTool(name, {
      title: config.title,
      description: config.description,
      inputSchema,
      annotations: { readOnlyHint: !write, destructiveHint: write && destructive, idempotentHint: !write, openWorldHint: false },
    }, async (args) => {
      if (write && !ctx.scopes.includes('write'))
        return errResult('This connection is read-only. The user needs to reconnect CleanStay and allow changes to use this tool.');
      try {
        if (confirm && args.confirm !== true) {
          const preview = await confirm(args);
          await audit(name, write, true, 'awaiting confirmation');
          return textResult(`CONFIRMATION REQUIRED — nothing has been done yet.\n${preview}\nAsk the user to approve this exactly, then call ${name} again with the same arguments and confirm=true.`);
        }
        const out = await run(args);
        await audit(name, write, true);
        return textResult(typeof out === 'string' ? out : json(out));
      } catch (e) {
        await audit(name, write, false, e.message);
        return errResult(e.message || 'Something went wrong');
      }
    });
  }

  const listingId = z.string().describe('Property (listing) id from list_properties');

  // Resolve who a task is assigned to: 'me', 'owner', 'cohost', or a user id
  async function resolveAssignee(lid, who) {
    if (!who) return undefined;
    if (who === 'me') return ctx.userId;
    if (who === 'owner') return (await api('GET', `/listings/${lid}`)).hostId;
    if (who === 'cohost') {
      const ch = (await api('GET', `/listings/${lid}/cohosts`)).find((c) => c.status === 'ACCEPTED' && c.role === 'COHOST' && c.userId);
      if (!ch) throw new Error('This property has no accepted co-host.');
      return ch.userId;
    }
    return who;
  }

  async function getTask(lid, taskId) {
    const t = flattenTasks(await api('GET', `/listings/${lid}/maintenance`)).find((x) => x.id === taskId);
    if (!t) throw new Error('Task not found on that property.');
    return t;
  }

  // ───────────────────────────── READ ─────────────────────────────

  def('list_properties', {
    title: 'List my properties',
    description: 'List every property the user owns or co-hosts, with ids, address, how it is managed, and their role. Call this first to get property ids.',
    input: {},
  }, {}, async () => {
    const [own, shared] = await Promise.all([api('GET', '/listings'), api('GET', '/cohosts/my-listings')]);
    const shape = (l, role) => ({
      id: l.id, name: l.name, address: l.address, city: l.city, street: l.street,
      managementType: l.managementType, yourRole: role, owner: l.host?.name,
      calendarConnected: !!l.icalUrl, lastSynced: l.lastSynced || undefined,
    });
    return [...own.map((l) => shape(l, 'owner')), ...shared.map((l) => shape(l, 'co-host'))];
  });

  def('get_dashboard', {
    title: 'What needs attention',
    description: 'Summary of what needs attention on one property or all of them: upcoming turnovers (and which need a cleaner), maintenance due or overdue, quotes awaiting approval, open tasks, and draft invoices. Best first call for "what\'s going on?" questions.',
    input: { listingId: z.string().optional().describe('Limit to one property; omit for all') },
  }, {}, async ({ listingId: only }) => {
    const [own, shared, allJobs] = await Promise.all([api('GET', '/listings'), api('GET', '/cohosts/my-listings'), api('GET', '/jobs')]);
    const props = [...own.map((l) => ({ ...l, role: 'owner' })), ...shared.map((l) => ({ ...l, role: 'co-host' }))]
      .filter((l) => !only || l.id === only);
    const out = [];
    for (const l of props) {
      const tasks = flattenTasks(await api('GET', `/listings/${l.id}/maintenance`));
      const open = tasks.filter((t) => !t.isDraft && isOpen(t));
      const jobs = allJobs.filter((j) => (j.listing?.id || j.listing) === l.id);
      const byDate = {};
      jobs.forEach((j) => {
        const k = dayKey(j.checkoutDate);
        const g = (byDate[k] ||= { checkout: k, inDays: daysUntil(j.checkoutDate), rooms: 0, roomsDone: 0, cleaners: new Set() });
        g.rooms += 1; if (j.status === 'completed') g.roomsDone += 1; if (j.cleaner?.name) g.cleaners.add(j.cleaner.name);
      });
      const turnovers = Object.values(byDate).filter((g) => g.inDays >= 0 && g.inDays <= 14 && g.roomsDone < g.rooms).sort((a, b) => a.inDays - b.inDays);
      for (const g of turnovers) {
        if (g.cleaners.size === 0) {
          try { g.contractor = (await api('GET', `/jobs/token-status/${l.id}/${g.checkout}`))?.status; } catch { /* none */ }
        }
      }
      out.push({
        property: l.name, id: l.id, yourRole: l.role, managementType: l.managementType,
        turnoversNext14Days: turnovers.map((g) => ({
          checkout: g.checkout, inDays: g.inDays, rooms: `${g.roomsDone}/${g.rooms} done`,
          cleaner: g.cleaners.size ? [...g.cleaners].join(', ') : (g.contractor ? `contractor (${g.contractor.toLowerCase()})` : 'NEEDS A CLEANER'),
        })),
        maintenanceDue: open.filter((t) => t.taskType === 'MAINTENANCE').map(shapeTask),
        quotesAwaitingApproval: tasks.filter((t) => t.taskType === 'QUOTE' && t.quoteStatus === 'PENDING').map(shapeTask),
        openTasks: open.filter((t) => t.taskType === 'ACTION' || t.taskType === 'PAYMENT_REQUEST').map(shapeTask),
        draftInvoices: tasks.filter((t) => t.isDraft).map(shapeTask),
      });
    }
    return out;
  });

  def('list_upcoming_checkouts', {
    title: 'Upcoming checkouts / cleanings',
    description: 'Upcoming guest checkouts that have cleaning jobs, grouped by date, with room progress and the assigned cleaner.',
    input: { listingId: z.string().optional(), days: z.number().int().min(1).max(365).optional().describe('Look-ahead window, default 30') },
  }, {}, async ({ listingId: only, days = 30 }) => {
    const jobs = (await api('GET', '/jobs')).filter((j) => !only || (j.listing?.id || j.listing) === only);
    const groups = {};
    jobs.forEach((j) => {
      const lid = j.listing?.id || j.listing;
      const k = `${lid}|${dayKey(j.checkoutDate)}`;
      const g = (groups[k] ||= { property: j.listing?.name, listingId: lid, checkout: dayKey(j.checkoutDate), inDays: daysUntil(j.checkoutDate), nextCheckin: j.checkinDate ? dayKey(j.checkinDate) : undefined, rooms: [], cleaners: new Set(), jobIds: [] });
      g.rooms.push({ room: j.room?.name, status: j.status }); g.jobIds.push(j.id);
      if (j.cleaner?.name) g.cleaners.add(j.cleaner.name);
    });
    return Object.values(groups).filter((g) => g.inDays >= 0 && g.inDays <= days).sort((a, b) => a.inDays - b.inDays)
      .map((g) => ({ ...g, cleaners: [...g.cleaners], roomsDone: g.rooms.filter((r) => r.status === 'completed').length, roomCount: g.rooms.length }));
  });

  def('get_calendar', {
    title: 'Bookings & calendar',
    description: 'Guest stays, blocked dates, contractor jobs and maintenance due dates across the user\'s properties, optionally filtered by property and date range (YYYY-MM-DD).',
    input: { listingId: z.string().optional(), from: z.string().optional(), to: z.string().optional() },
  }, {}, async ({ listingId: only, from, to }) => {
    const { events } = await api('GET', '/calendar');
    const f = from ? new Date(from) : null; const t = to ? new Date(`${to}T23:59:59Z`) : null;
    return events.filter((e) => !only || e.listingId === only).filter((e) => {
      const start = new Date(e.checkinDate || e.date); const end = new Date(e.checkoutDate || e.date);
      return (!f || end >= f) && (!t || start <= t);
    }).map((e) => ({ ...e, checkinDate: e.checkinDate ? dayKey(e.checkinDate) : undefined, checkoutDate: e.checkoutDate ? dayKey(e.checkoutDate) : undefined, date: e.date ? dayKey(e.date) : undefined }));
  });

  def('list_tasks', {
    title: 'List tasks, maintenance, quotes & invoices',
    description: 'Tasks for one property. kind: maintenance (recurring upkeep), requests (actions & payment requests between owner and co-host), quotes, drafts (the co-host\'s draft invoices), or all. Completed items are hidden unless includeCompleted.',
    input: {
      listingId,
      kind: z.enum(['all', 'maintenance', 'requests', 'quotes', 'drafts']).optional(),
      includeCompleted: z.boolean().optional(),
    },
  }, {}, async ({ listingId: lid, kind = 'all', includeCompleted }) => {
    let tasks = flattenTasks(await api('GET', `/listings/${lid}/maintenance`));
    tasks = tasks.filter((t) => {
      if (kind === 'drafts') return t.isDraft;
      if (t.isDraft) return kind === 'all';
      if (kind === 'maintenance') return t.taskType === 'MAINTENANCE';
      if (kind === 'quotes') return t.taskType === 'QUOTE';
      if (kind === 'requests') return t.taskType === 'ACTION' || t.taskType === 'PAYMENT_REQUEST';
      return true;
    });
    if (!includeCompleted) tasks = tasks.filter((t) => t.taskType === 'QUOTE' ? t.quoteStatus === 'PENDING' : t.isDraft || isOpen(t) || (t.isRecurring && t.taskType === 'MAINTENANCE'));
    return tasks.sort((a, b) => new Date(a.nextDueAt) - new Date(b.nextDueAt)).map(shapeTask);
  });

  def('list_vendors', {
    title: 'List vendors',
    description: 'The user\'s saved vendors / contractors (cleaners, plumbers, landscapers…) with phone and trade.',
    input: {},
  }, {}, async () => (await api('GET', '/contractors')).map((c) => ({ id: c.id, name: c.name, phone: c.phone, trade: c.trade, notes: c.notes, smsConsent: c.smsConsent })));

  def('list_team', {
    title: 'Property team',
    description: 'The owner and accepted co-hosts of a property (with user ids) plus pending co-host invitations.',
    input: { listingId },
  }, {}, async ({ listingId: lid }) => {
    const [members, cohosts] = await Promise.all([api('GET', `/listings/${lid}/members`), api('GET', `/listings/${lid}/cohosts`)]);
    return {
      members: members.map((m) => ({ userId: m.id, name: m.name, role: m.role })),
      invitations: cohosts.filter((c) => c.status === 'PENDING').map((c) => ({ email: c.inviteEmail || c.user?.email, role: c.role, status: c.status })),
    };
  });

  def('list_notifications', {
    title: 'Notifications',
    description: 'Recent CleanStay notifications (new jobs, accepted jobs, quotes, tasks).',
    input: { unreadOnly: z.boolean().optional() },
  }, {}, async ({ unreadOnly }) => (await api('GET', '/notifications')).filter((n) => !unreadOnly || !n.read).slice(0, 30)
    .map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, read: n.read, at: n.createdAt, listingId: n.listingId })));

  // ───────────────────────────── WRITE ─────────────────────────────

  def('create_property', {
    title: 'Add a property',
    description: 'Create a new property. managementType: SELF (owner manages it), COHOST (user is a co-host managing for an owner), HOST_WITH_COHOST (owner uses a co-host to manage).',
    input: { name: z.string(), city: z.string(), street: z.string().optional(), managementType: z.enum(['SELF', 'COHOST', 'HOST_WITH_COHOST']), icalUrl: z.string().url().optional().describe('Airbnb calendar export URL') },
  }, { write: true }, async (a) => api('POST', '/listings', a));

  def('update_property', {
    title: 'Edit a property',
    description: 'Change a property\'s name, address, calendar link or management type.',
    input: { listingId, name: z.string().optional(), city: z.string().optional(), street: z.string().optional(), managementType: z.enum(['SELF', 'COHOST', 'HOST_WITH_COHOST']).optional(), icalUrl: z.string().optional() },
  }, { write: true }, async ({ listingId: lid, ...rest }) => api('PUT', `/listings/${lid}`, rest));

  def('sync_calendar', {
    title: 'Sync Airbnb calendar',
    description: 'Pull the latest bookings from the property\'s Airbnb calendar link and create any new cleaning jobs.',
    input: { listingId },
  }, { write: true }, async ({ listingId: lid }) => api('POST', `/listings/${lid}/sync`));

  def('create_task', {
    title: 'Create a task or maintenance reminder',
    description: 'Create an action task (e.g. "call the plumber", "order new chairs") or a maintenance reminder (e.g. "lawn", "AC filter"). For recurring maintenance give recurringEveryMonths. assignTo: "me", "owner", "cohost", or a user id from list_team. For payments use send_invoice; for quotes use send_quote.',
    input: {
      listingId, title: z.string(), type: z.enum(['action', 'maintenance']), dueDate: z.string().describe('YYYY-MM-DD'),
      notes: z.string().optional(), recurringEveryMonths: z.number().int().min(1).optional(), lastServicedDate: z.string().optional(),
      assignTo: z.string().optional(),
    },
  }, { write: true }, async (a) => {
    const recurring = !!a.recurringEveryMonths;
    return shapeTask(await api('POST', `/listings/${a.listingId}/maintenance`, {
      title: a.title, notes: a.notes || null, taskType: a.type === 'maintenance' ? 'MAINTENANCE' : 'ACTION',
      isRecurring: recurring, intervalMonths: recurring ? a.recurringEveryMonths : 0,
      lastServicedAt: a.lastServicedDate || null, nextDueAt: a.dueDate, assignedUserId: await resolveAssignee(a.listingId, a.assignTo) || null,
    }));
  });

  def('complete_task', {
    title: 'Mark a task done / paid',
    description: 'Mark a task complete (recurring maintenance re-arms for its next interval). Marking a payment request as paid needs confirmation. Quotes use decide_quote; draft invoices use send_invoice.',
    input: { listingId, taskId: z.string() },
  }, {
    write: true,
    confirm: async ({ listingId: lid, taskId }) => {
      const t = await getTask(lid, taskId);
      return t.taskType === 'PAYMENT_REQUEST' ? `Mark the ${money(t.paymentAmount)} payment "${t.title}" as PAID.` : null;
    },
  }, async ({ listingId: lid, taskId, confirm }) => {
    const t = await getTask(lid, taskId);
    if (t.taskType === 'PAYMENT_REQUEST' && confirm !== true) throw new Error('Payments must be confirmed.');
    return shapeTask(await api('PATCH', `/maintenance/${taskId}/complete`));
  });

  def('add_vendor', {
    title: 'Add a vendor',
    description: 'Save a vendor / contractor (cleaner, plumber, landscaper…).',
    input: { name: z.string(), phone: z.string(), trade: z.string().optional(), notes: z.string().optional(), smsConsent: z.boolean().optional().describe('True only if the vendor agreed to receive job texts') },
  }, { write: true }, async (a) => api('POST', '/contractors', a));

  def('update_vendor', {
    title: 'Edit a vendor',
    description: 'Change a saved vendor\'s details.',
    input: { vendorId: z.string(), name: z.string().optional(), phone: z.string().optional(), trade: z.string().optional(), notes: z.string().optional(), smsConsent: z.boolean().optional() },
  }, { write: true }, async ({ vendorId, ...rest }) => {
    const cur = (await api('GET', '/contractors')).find((c) => c.id === vendorId);
    if (!cur) throw new Error('Vendor not found.');
    return api('PUT', `/contractors/${vendorId}`, { name: cur.name, phone: cur.phone, trade: cur.trade, notes: cur.notes, smsConsent: cur.smsConsent, ...rest });
  });

  def('delete_vendor', {
    title: 'Delete a vendor',
    description: 'Permanently remove a saved vendor.',
    input: { vendorId: z.string() },
  }, {
    write: true, destructive: true,
    confirm: async ({ vendorId }) => { const v = (await api('GET', '/contractors')).find((c) => c.id === vendorId); return `PERMANENTLY DELETE vendor ${v ? `"${v.name}"` : vendorId}.`; },
  }, async ({ vendorId }) => api('DELETE', `/contractors/${vendorId}`));

  def('assign_cleaner', {
    title: 'Assign a cleaner to a job',
    description: 'Assign a team member (user id from list_team) to a cleaning job. Job ids come from list_upcoming_checkouts (jobIds); assign each room\'s job in a checkout, or all of them.',
    input: { jobId: z.string(), cleanerId: z.string() },
  }, { write: true }, async ({ jobId, cleanerId }) => api('PATCH', `/jobs/${jobId}/assign`, { cleanerId }));

  def('send_contractor_link', {
    title: 'Text a contractor the job link',
    description: 'Text a saved vendor (or a raw phone number) a link to view and check off the cleaning for one checkout date. This sends a real SMS.',
    input: { listingId, checkoutDate: z.string().describe('YYYY-MM-DD'), vendorId: z.string().optional(), phone: z.string().optional() },
  }, {
    write: true,
    confirm: async ({ checkoutDate, vendorId, phone }) => {
      const v = vendorId ? (await api('GET', '/contractors')).find((c) => c.id === vendorId) : null;
      return `SEND AN SMS to ${v ? `${v.name} (${v.phone})` : phone} with the cleaning link for the ${checkoutDate} checkout.`;
    },
  }, async ({ listingId: lid, checkoutDate, vendorId, phone }) => api('POST', '/jobs/send-link', { listingId: lid, checkoutDate, contractorId: vendorId, phone }));

  def('invite_cohost', {
    title: 'Invite a co-host',
    description: 'Email a co-host invitation for a property (owner only). role COHOST can edit; VIEW_ONLY can only look.',
    input: { listingId, email: z.string().email(), role: z.enum(['COHOST', 'VIEW_ONLY']) },
  }, {
    write: true,
    confirm: async ({ email, role }) => `SEND AN EMAIL INVITATION to ${email} as ${role === 'COHOST' ? 'a co-host (can edit)' : 'view-only'}.`,
  }, async ({ listingId: lid, email, role }) => api('POST', `/listings/${lid}/cohosts/invite`, { email, role }));

  def('mark_notifications_read', {
    title: 'Mark notifications read',
    description: 'Mark all notifications as read.',
    input: {},
  }, { write: true }, async () => api('PATCH', '/notifications/read-all'));

  // ───────────────────── QUOTES & INVOICES (money) ─────────────────────

  def('send_quote', {
    title: 'Send a quote to the owner',
    description: 'Co-host sends the owner a quote for approval (e.g. "replace patio chairs, $480"). The owner approves or declines; approval auto-creates a draft invoice for the co-host.',
    input: { listingId, title: z.string().describe('What the quote is for'), amount: z.number().positive(), scope: z.string().optional().describe('Vendor and scope of work'), replyByDate: z.string().describe('YYYY-MM-DD') },
  }, {
    write: true,
    confirm: async ({ listingId: lid, title, amount, replyByDate }) => {
      const l = await api('GET', `/listings/${lid}`);
      return `SEND A QUOTE to ${l.host?.name || 'the owner'} for "${title}" — ${money(amount)}, reply needed by ${replyByDate}.`;
    },
  }, async (a) => {
    const owner = await resolveAssignee(a.listingId, 'owner');
    return shapeTask(await api('POST', `/listings/${a.listingId}/maintenance`, {
      title: a.title, notes: a.scope || null, taskType: 'QUOTE', paymentAmount: String(a.amount), isRecurring: false, nextDueAt: a.replyByDate, assignedUserId: owner,
    }));
  });

  def('decide_quote', {
    title: 'Approve or decline a quote',
    description: 'Owner approves or declines a co-host\'s pending quote (task id from list_tasks kind=quotes). A decision is final. Approving commits the owner to the amount.',
    input: { listingId, taskId: z.string(), decision: z.enum(['APPROVED', 'DECLINED']), note: z.string().optional().describe('Reason or counter-offer') },
  }, {
    write: true,
    confirm: async ({ listingId: lid, taskId, decision, note }) => {
      const t = await getTask(lid, taskId);
      return `${decision === 'APPROVED' ? 'APPROVE' : 'DECLINE'} the quote "${t.title}" for ${money(t.paymentAmount)} from ${t.assignedBy?.name || 'the co-host'}${note ? ` (note: "${note}")` : ''}. This cannot be undone.`;
    },
  }, async ({ taskId, decision, note }) => shapeTask(await api('POST', `/maintenance/${taskId}/decision`, { decision, note })));

  def('edit_draft_invoice', {
    title: 'Edit a draft invoice',
    description: 'Co-host edits a draft invoice (auto-created when a quote is approved) before sending: amount, title, notes, due date. Draft ids come from list_tasks kind=drafts.',
    input: { taskId: z.string(), amount: z.number().positive().optional(), title: z.string().optional(), notes: z.string().optional(), dueDate: z.string().optional() },
  }, { write: true }, async ({ taskId, amount, title, notes, dueDate }) => shapeTask(await api('PUT', `/maintenance/${taskId}/draft`, {
    ...(amount !== undefined && { paymentAmount: String(amount) }), ...(title && { title }), ...(notes !== undefined && { notes }), ...(dueDate && { nextDueAt: dueDate }),
  })));

  def('send_invoice', {
    title: 'Send a draft invoice to the owner',
    description: 'Co-host sends a draft invoice to the owner for payment. Only do this once the work is complete.',
    input: { listingId, taskId: z.string() },
  }, {
    write: true,
    confirm: async ({ listingId: lid, taskId }) => {
      const t = await getTask(lid, taskId);
      return `SEND the invoice "${t.title}" for ${money(t.paymentAmount)} to the owner. Only do this if the work is finished.`;
    },
  }, async ({ taskId }) => shapeTask(await api('POST', `/maintenance/${taskId}/send`)));
}

module.exports = { registerTools };
