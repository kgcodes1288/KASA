const prisma = require('./prisma');

/**
 * One definition of "who may do what" on a listing.
 *   OWNER      read + write
 *   COHOST     read + write (accepted co-host)
 *   VIEW_ONLY  read only
 *   anyone else: nothing
 */
async function listingAccess(listingId, userId) {
  const listing = await prisma.listing.findUnique({ where: { id: String(listingId) } });
  if (!listing) return { listing: null, role: null, canRead: false, canWrite: false, isOwner: false };
  if (listing.hostId === userId) return { listing, role: 'OWNER', canRead: true, canWrite: true, isOwner: true };
  const co = await prisma.listingCoHost.findFirst({ where: { listingId: listing.id, userId, status: 'ACCEPTED' }, select: { role: true } });
  return { listing, role: co?.role || null, canRead: !!co, canWrite: co?.role === 'COHOST', isOwner: false };
}

module.exports = { listingAccess };
