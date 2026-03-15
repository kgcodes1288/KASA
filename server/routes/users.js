const router = require('express').Router();
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

// GET /api/users/cleaners
router.get('/cleaners', auth, async (req, res) => {
  if (req.user.role !== 'host') return res.status(403).json({ message: 'Hosts only' });
  try {
    const { email } = req.query;
    const cleaners = await prisma.user.findMany({
      where: {
        role: 'cleaner',
        ...(email ? { email: { contains: email, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, email: true, phone: true },
      take: 10,
    });
    res.json(cleaners);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
