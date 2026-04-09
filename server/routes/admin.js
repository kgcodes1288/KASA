const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

// Admin-only middleware
const adminOnly = (req, res, next) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || req.user.email !== adminEmail) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// GET /api/admin/stats
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers, hostCount, cleanerCount, newUsersThisMonth,
      totalListings,
      totalJobs, jobsByStatus,
      totalTasks, tasksByType, tasksByStatus,
      totalContractors,
      totalCoHosts,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'host' } }),
      prisma.user.count({ where: { role: 'cleaner' } }),
      prisma.user.count({ where: { createdAt: { gte: firstOfMonth } } }),
      prisma.listing.count(),
      prisma.job.count(),
      prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.maintenanceTask.count(),
      prisma.maintenanceTask.groupBy({ by: ['taskType'], _count: { _all: true } }),
      prisma.maintenanceTask.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.contractor.count(),
      prisma.listingCoHost.count({ where: { status: 'ACCEPTED' } }),
    ]);

    res.json({
      users: { total: totalUsers, hosts: hostCount, cleaners: cleanerCount, newThisMonth: newUsersThisMonth },
      listings: { total: totalListings },
      jobs: { total: totalJobs, byStatus: jobsByStatus },
      tasks: { total: totalTasks, byType: tasksByType, byStatus: tasksByStatus },
      contractors: { total: totalContractors },
      coHosts: { total: totalCoHosts },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/users
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { listings: true, contractors: true, coHosting: true },
        },
      },
    });
    res.json(users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      hasPassword: !!u.password,
      hasGoogle: !!u.googleId,
      createdAt: u.createdAt,
      listings: u._count.listings,
      contractors: u._count.contractors,
      coHosting: u._count.coHosting,
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/listings
router.get('/listings', auth, adminOnly, async (req, res) => {
  try {
    const listings = await prisma.listing.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        host: { select: { id: true, name: true, email: true } },
        _count: {
          select: { rooms: true, jobs: true, coHosts: true, maintenanceTasks: true },
        },
      },
    });
    res.json(listings.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      host: l.host,
      createdAt: l.createdAt,
      lastSynced: l.lastSynced,
      rooms: l._count.rooms,
      jobs: l._count.jobs,
      coHosts: l._count.coHosts,
      tasks: l._count.maintenanceTasks,
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
