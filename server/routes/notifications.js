const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

// GET /api/notifications — last 3 days
router.get('/', auth, async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 3);

    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
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
      where: { userId: req.user.id, read: false },
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
