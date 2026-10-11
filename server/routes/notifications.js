const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

// The list and the unread badge look at the SAME window, so the badge never counts something you cannot open
const WINDOW_DAYS = 14;
const windowStart = () => { const d = new Date(); d.setDate(d.getDate() - WINDOW_DAYS); return d; };

// GET /api/notifications — last 14 days, newest first (max 100)
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id, createdAt: { gte: windowStart() } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user.id, read: false, createdAt: { gte: windowStart() } },
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', auth, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true },
    });
    res.json({ message: 'All marked read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/notifications — clear all for this user
router.delete('/', auth, async (req, res) => {
  try {
    await prisma.notification.deleteMany({ where: { userId: req.user.id } });
    res.json({ message: 'All notifications cleared' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { read: true },
    });
    res.json({ message: 'Marked read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
