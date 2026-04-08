const prisma = require('./prisma');

/**
 * Create a notification for a single user.
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
}

/**
 * Create a notification for the listing owner + all accepted co-hosts.
 * Optionally exclude one userId (e.g. the actor).
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
  } catch (err) {
    console.error('[notifyListingMembers]', err.message);
  }
}

module.exports = { notify, notifyListingMembers };
