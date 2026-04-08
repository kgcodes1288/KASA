const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });

const safeUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone });

// Strip to 10 digits (removes +1 country code)
const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
};


// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const role = 'host';
    if (!name || !email || !password)
      return res.status(400).json({ message: 'name, email, password are required' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role, phone: normalizePhone(phone) || null },
    });

// Auto-link any pending co-host invites matching this phone number.
// Check both 10-digit and +1 formats to catch records stored either way.
if (phone) {
  const phone10 = normalizePhone(phone);
  await prisma.listingCoHost.updateMany({
    where: {
      invitePhone: { in: [phone10, `+1${phone10}`] },
      status: 'PENDING',
      userId: null,
    },
    data: { userId: user.id },
  });
}

    res.status(201).json({ token: signToken(user.id), user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ message: 'Invalid credentials' });
    res.json({ token: signToken(user.id), user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json(safeUser(req.user));
});

// PUT /api/auth/profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email)
      return res.status(400).json({ message: 'Name and email are required' });
    if (email !== req.user.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(400).json({ message: 'Email already in use' });
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, email, phone: normalizePhone(phone) || null },
    });
    res.json(safeUser(updated));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/auth/password
router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'Both fields are required' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    const isMatch = await bcrypt.compare(currentPassword, req.user.password);
    if (!isMatch)
      return res.status(401).json({ message: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed },
    });
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/auth/account
router.delete('/account', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password)
      return res.status(400).json({ message: 'Password is required to delete your account' });

    const isMatch = await bcrypt.compare(password, req.user.password);
    if (!isMatch)
      return res.status(401).json({ message: 'Incorrect password' });

    // Cascades handle listings, rooms, jobs, co-hosts via onDelete: Cascade
    await prisma.user.delete({ where: { id: req.user.id } });

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;