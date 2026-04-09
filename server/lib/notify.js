const prisma = require('./prisma');
const { sendNotificationEmail } = require('./email');

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
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (user?.email) {
      const actionUrl = listingId ? `${APP_URL}/listings/${listingId}?tab=jobs` : `${APP_URL}/account`;
      await sendNotificationEmail({
        to:          user.email,
        toName:      user.name,
        subject:     EMAIL_SUBJECT[type] || title,
        title,
        message,
        actionUrl,
        actionLabel: 'View on CleanStay',
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
      select: { id: true, email: true, name: true },
    });
    const actionUrl = `${APP_URL}/listings/${listingId}?tab=jobs`;
    await Promise.allSettled(users.map((u) =>
      u.email ? sendNotificationEmail({
        to:          u.email,
        toName:      u.name,
        subject:     EMAIL_SUBJECT[type] || title,
        title,
        message,
        actionUrl,
        actionLabel: 'View on CleanStay',
      }) : Promise.resolve()
    ));
  } catch (err) {
    console.error('[notifyListingMembers]', err.message);
  }
}

module.exports = { notify, notifyListingMembers };
