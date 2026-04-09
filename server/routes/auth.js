const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });

const safeUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, hasPassword: !!u.password });

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

// Auto-link any pending co-host invites matching this email
await prisma.listingCoHost.updateMany({
  where: { inviteEmail: email.toLowerCase(), status: 'PENDING', userId: null },
  data: { userId: user.id },
});

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
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.password)
      return res.status(401).json({ message: 'This account uses Google sign-in. Please use "Continue with Google".' });
    if (!(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ message: 'Invalid credentials' });
    res.json({ token: signToken(user.id), user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/google — redirect to Google OAuth consent screen
router.get('/google', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback — exchange code, find/create user, return JWT
router.get('/google/callback', async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${clientUrl}/login?error=google_failed`);

    // Exchange auth code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      const msg = tokenData.error_description || tokenData.error || 'Token exchange failed';
      console.error('Google token exchange failed:', tokenData);
      return res.redirect(`${clientUrl}/login?error=google_failed&msg=${encodeURIComponent(msg)}`);
    }

    // Fetch Google profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profile.email) return res.redirect(`${clientUrl}/login?error=google_failed&msg=${encodeURIComponent('Could not get email from Google')}`);

    // Find existing user by Google ID or email
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: profile.id }, { email: profile.email }] },
    });

    if (user) {
      // Link Google ID if signing in via email match for the first time
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: profile.id },
        });
      }
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          name: profile.name || profile.email.split('@')[0],
          email: profile.email,
          googleId: profile.id,
          role: 'host',
        },
      });
    }

    // Auto-link any pending co-host invites matching this email
    await prisma.listingCoHost.updateMany({
      where: { inviteEmail: profile.email.toLowerCase(), status: 'PENDING', userId: null },
      data: { userId: user.id },
    });

    const token = signToken(user.id);
    res.redirect(`${clientUrl}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect(`${clientUrl}/login?error=google_failed&msg=${encodeURIComponent(err.message || 'Unknown error')}`);
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
    if (!req.user.password)
      return res.status(400).json({ message: 'This account uses Google sign-in and has no password to change.' });
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
    // Google-only accounts can delete without password
    if (req.user.password) {
      if (!password)
        return res.status(400).json({ message: 'Password is required to delete your account' });
      const isMatch = await bcrypt.compare(password, req.user.password);
      if (!isMatch)
        return res.status(401).json({ message: 'Incorrect password' });
    }

    // Cascades handle listings, rooms, jobs, co-hosts via onDelete: Cascade
    await prisma.user.delete({ where: { id: req.user.id } });

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
