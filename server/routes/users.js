const router = require('express').Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// GET /api/users/cleaners — search cleaners by email (for host to add)
router.get('/cleaners', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Hosts only' });
  try {
    const { email } = req.query;
    const query = { role: 'cleaner' };
    if (email) query.email = { $regex: email, $options: 'i' };
    const cleaners = await User.find(query).select('name email phone').limit(10);
    res.json(cleaners);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
