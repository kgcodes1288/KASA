const prisma = require('./prisma');
const { sendNotificationEmail, sendCleaningDigestEmail, sendCleaningReminderEmail } = require('./email');

const APP_URL = process.env.CLIENT_URL || 'https://getcleanstays.com';

const EMAIL_SUBJECT = {
  COHOST_ACCEPTED:     'Co-host accepted your invitation',
  JOB_CREATED:         'New cleaning job added',
  CONTRACTOR_ACCEPTED: 'Contractor accepted the job',
  CONTRACTOR_REJECTED: 'Contractor declined the job',
  CONTRACTOR_STARTED:  'Contractor started the job',
  JOB_COMPLETED:       'Cleaning job completed',
  TASK_ASSIGNED:       'A task has been assigned to you',
};

/**
 * Create a notification for a single user and send an email.
 */
async function notify(userId, type, title, message, listingId = null) {
  try {
    await prisma.notification.create({
      data: { userId, type, title, message, listingId },
    });
    console.log(`[notify] Created ${type} for user ${userId}`);
  } catch (err) {
    console.error(`[notify] FAILED to create ${type} for user ${userId}:`, err.message);
  }

  // Send email (non-blocking — don't let email failure affect the response)
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, emailUnsubscribed: true, unsubscribeToken: true } });
    if (user?.email && !user.emailUnsubscribed) {
      const actionUrl = listingId ? `${APP_URL}/listings/${listingId}?tab=jobs` : `${APP_URL}/account`;
      await sendNotificationEmail({
        to:               user.email,
        toName:           user.name,
        subject:          EMAIL_SUBJECT[type] || title,
        title,
        message,
        actionUrl,
        actionLabel:      'View on CleanStay',
        unsubscribeToken: user.unsubscribeToken,
      });
    }
  } catch (err) {
    console.error(`[notify] Email send failed for user ${userId}:`, err.message);
  }
}

/**
 * Create notifications for the listing owner + all accepted co-hosts and email each.
 * Optionally exclude one userId (e.g. the actor who triggered the event).
 */
async function notifyListingMembers(listingId, type, title, message, excludeUserId = null) {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        coHosts: {
          where: { status: 'ACCEPTED' },
          select: { userId: true },
        },
      },
    });
    if (!listing) return;

    const ids = [
      listing.hostId,
      ...listing.coHosts.map((c) => c.userId).filter(Boolean),
    ].filter((id) => id && id !== excludeUserId);

    const unique = [...new Set(ids)];
    if (!unique.length) return;

    await prisma.notification.createMany({
      data: unique.map((userId) => ({ userId, type, title, message, listingId })),
    });

    // Send emails to each recipient (non-blocking)
    const users = await prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, email: true, name: true, emailUnsubscribed: true, unsubscribeToken: true },
    });
    const actionUrl = `${APP_URL}/listings/${listingId}?tab=jobs`;
    await Promise.allSettled(users.map((u) =>
      u.email && !u.emailUnsubscribed ? sendNotificationEmail({
        to:               u.email,
        toName:           u.name,
        subject:          EMAIL_SUBJECT[type] || title,
        title,
        message,
        actionUrl,
        actionLabel:      'View on CleanStay',
        unsubscribeToken: u.unsubscribeToken,
      }) : Promise.resolve()
    ));
  } catch (err) {
    console.error('[notifyListingMembers]', err.message);
  }
}

/**
 * Send one digest notification + email for all newly created cleaning jobs in a sync run.
 * newJobs: [{ checkoutDate, roomCount }]
 * assigneeId: if set, notify only that person; otherwise notify host + co-hosts.
 */
async function notifyCleaningDigest(listingId, newJobs, assigneeId = null) {
  if (!newJobs.length) return;
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: { coHosts: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
    });
    if (!listing) return;

    // If jobs are assigned, only the assignee is notified.
    // If unassigned, host + all co-hosts are notified.
    const ids = assigneeId
      ? [assigneeId]
      : [...new Set([listing.hostId, ...listing.coHosts.map((c) => c.userId).filter(Boolean)])];
    if (!ids.length) return;

    const title   = `${newJobs.length} new cleaning job${newJobs.length !== 1 ? 's' : ''} added`;
    const message = `${newJobs.length} new checkout${newJobs.length !== 1 ? 's' : ''} synced for ${listing.name}`;

    await prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, type: 'JOB_CREATED', title, message, listingId })),
    });

    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true, emailUnsubscribed: true, unsubscribeToken: true } });
    await Promise.allSettled(users.map((u) =>
      u.email && !u.emailUnsubscribed ? sendCleaningDigestEmail({
        toEmail: u.email, toName: u.name,
        listingName: listing.name, listingId,
        jobs: newJobs,
        unsubscribeToken: u.unsubscribeToken,
      }) : Promise.resolve()
    ));
  } catch (err) {
    console.error('[notifyCleaningDigest]', err.message);
  }
}

/**
 * Send reminder notifications + emails for jobs checking out today.
 * Groups by (listing + assignee): assigned jobs notify only the assignee;
 * unassigned jobs notify host + co-hosts.
 */
async function sendDayOfReminders() {
  try {
    const todayStart = new Date(); todayStart.setUTCHours(0,0,0,0);
    const todayEnd   = new Date(); todayEnd.setUTCHours(23,59,59,999);

    const jobs = await prisma.job.findMany({
      where: {
        checkoutDate:   { gte: todayStart, lte: todayEnd },
        reminderSentAt: null,
        status:         { not: 'completed' },
      },
      include: {
        listing: {
          include: { coHosts: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
        },
      },
    });

    if (!jobs.length) return;

    // Group by listing + assignee (null = unassigned)
    const byGroup = {};
    jobs.forEach((j) => {
      const key = `${j.listingId}::${j.cleanerId || 'unassigned'}`;
      if (!byGroup[key]) byGroup[key] = { listing: j.listing, cleanerId: j.cleanerId, jobs: [] };
      byGroup[key].jobs.push(j);
    });

    for (const { listing, cleanerId, jobs: groupJobs } of Object.values(byGroup)) {
      // Summarise by checkout date
      const byDate = {};
      groupJobs.forEach((j) => {
        const key = j.checkoutDate.toISOString().slice(0, 10);
        if (!byDate[key]) byDate[key] = { checkoutDate: j.checkoutDate, roomCount: 0 };
        byDate[key].roomCount++;
      });
      const jobSummary = Object.values(byDate);

      // Assigned → notify only the assignee. Unassigned → host + co-hosts.
      const ids = cleanerId
        ? [cleanerId]
        : [...new Set([listing.hostId, ...listing.coHosts.map((c) => c.userId).filter(Boolean)])];

      const title   = '🔔 Cleaning reminder — checkout today';
      const message = `${jobSummary.length > 1 ? `${jobSummary.length} checkouts` : 'A checkout'} today at ${listing.name}`;

      await prisma.notification.createMany({
        data: ids.map((userId) => ({ userId, type: 'JOB_CREATED', title, message, listingId: listing.id })),
      });

      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { email: true, name: true, emailUnsubscribed: true, unsubscribeToken: true },
      });
      await Promise.allSettled(users.map((u) =>
        u.email && !u.emailUnsubscribed ? sendCleaningReminderEmail({
          toEmail: u.email, toName: u.name,
          listingName: listing.name, listingId: listing.id,
          jobs: jobSummary,
          unsubscribeToken: u.unsubscribeToken,
        }) : Promise.resolve()
      ));

      await prisma.job.updateMany({
        where: { id: { in: groupJobs.map((j) => j.id) } },
        data:  { reminderSentAt: new Date() },
      });

      console.log(`[notify] Reminder sent for ${listing.name} — ${jobSummary.length} checkout(s) today (assignee: ${cleanerId || 'host/co-hosts'})`);
    }
  } catch (err) {
    console.error('[sendDayOfReminders]', err.message);
  }
}

module.exports = { notify, notifyListingMembers, notifyCleaningDigest, sendDayOfReminders };
