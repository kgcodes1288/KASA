const { secLog } = require('../lib/security');
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../lib/email');
const { normalizeEmail, isValidEmail, passwordProblem, cleanName } = require('../lib/validate');
const rl = require('../lib/rateLimit');
const { setSession, clearSession, parseCookies, cookieOpts } = require('../lib/session');

const VERIFY_HOURS = 24;
const verifyExpiry = () => new Date(Date.now() + VERIFY_HOURS * 3600 * 1000);
// case-insensitive account lookup (older accounts may have capitals in the stored address)
const findByEmail = (email) => prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// session token carries the user's tokenVersion: bumping it (password change/reset) signs every other session out
const signToken = (userOrId, version = 0) => {
  const id = typeof userOrId === 'object' ? userOrId.id : userOrId;
  const v = typeof userOrId === 'object' ? (userOrId.tokenVersion || 0) : version;
  return jwt.sign({ id, v }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
};

const safeUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone,
  hasPassword: !!u.password,
  emailVerified: u.emailVerified,
  emailNotifications: !u.emailUnsubscribed,
  isAdmin: !!(process.env.ADMIN_EMAIL && u.email.toLowerCase() === process.env.ADMIN_EMAIL.trim().toLowerCase()),
});

// Strip to 10 digits (removes +1 country code)
const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
};


// POST /api/auth/register
router.post('/register', rl.limit({ name: 'register', windowMs: 60 * 60 * 1000, max: 10, message: 'Too many sign-ups from this network.' }), async (req, res) => {
  try {
    const { name: rawName, password, phone } = req.body;
    const email = normalizeEmail(req.body.email);
    const role = 'host';
    if (!rawName || !email || !password)
      return res.status(400).json({ message: 'name, email, password are required' });
    const { name, error: nameErr } = cleanName(rawName);
    if (nameErr) return res.status(400).json({ message: nameErr });
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Please enter a valid email address' });
    const pwErr = passwordProblem(password, email);
    if (pwErr) return res.status(400).json({ message: pwErr });

    const existing = await findByEmail(email);
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const emailVerifyToken = crypto.randomBytes(32).toString('hex');
    const user = await prisma.user.create({
      data: {
        name, email, password: hashed, role,
        phone: normalizePhone(phone) || null,
        emailVerified: false,
        emailVerifyToken,
        emailVerifyExpires: verifyExpiry(),
      },
    });

    // Auto-link any pending co-host invites matching this email
    await prisma.listingCoHost.updateMany({
      where: { inviteEmail: email, status: 'PENDING', userId: null },
      data: { userId: user.id },
    });

    // Send verification email (non-blocking; failures are logged by the mailer)
    sendVerificationEmail({
      to: user.email,
      name: user.name,
      verifyUrl: `${CLIENT_URL}/verify-email?token=${emailVerifyToken}`,
    }).catch(() => {});

    const tok = signToken(user);
    setSession(res, tok);
    res.status(201).json({ token: tok, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });
    // brute-force guard: 10 failures per account+network, 60 per network, per 15 minutes. A successful sign-in clears the account counter.
    const WIN = 15 * 60 * 1000;
    const kAcct = `login-fail|${req.ip}|${email}`, kIp = `login-fail-ip|${req.ip}`;
    const bA = rl.peek(kAcct), bI = rl.peek(kIp);
    if ((bA && bA.n >= 10) || (bI && bI.n >= 60))
      return rl.retry(res, bA && bA.n >= 10 ? bA : bI, 'Too many failed sign-in attempts.', 'login-locked');
    const fail = (msg, status = 401) => { secLog('login_failed', req, email); rl.hit(kAcct, WIN); rl.hit(kIp, WIN); return res.status(status).json({ message: msg }); };
    const user = await findByEmail(email);
    if (!user) return fail('Invalid credentials');
    if (!user.password)
      return res.status(401).json({ message: 'This account uses Google sign-in. Please use "Continue with Google".' });
    if (!(await bcrypt.compare(String(password), user.password)))
      return fail('Invalid credentials');
    rl.clear(kAcct);
    const tok = signToken(user);
    setSession(res, tok);
    res.json({ token: tok, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/logout — ends the browser session (the cookie is HttpOnly, so only the server can remove it)
router.post('/logout', (req, res) => { clearSession(res); res.json({ message: 'Signed out' }); });

// GET /api/auth/google — redirect to Google OAuth consent screen
router.get('/google', (req, res) => {
  // CSRF protection for the sign-in round trip: a random value goes out with the request and must come back unchanged
  const state = require('crypto').randomBytes(24).toString('hex');
  res.cookie('g_state', state, { ...cookieOpts(), maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback — exchange code, find/create user, return JWT
router.get('/google/callback', async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${clientUrl}/login?error=google_failed`);
    const expected = parseCookies(req).g_state;
    res.clearCookie('g_state', cookieOpts());
    if (!expected || req.query.state !== expected)
      { secLog('google_state_failed', req); return res.redirect(`${clientUrl}/login?error=google_failed&msg=${encodeURIComponent('Sign-in could not be verified. Please try again.')}`); }

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
      where: { OR: [{ googleId: profile.id }, { email: { equals: profile.email, mode: 'insensitive' } }] },
    });

    if (user) {
      // Link Google ID if signing in via email match for the first time
      // Also mark email as verified — Google has confirmed ownership
      if (!user.googleId || !user.emailVerified) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            ...((!user.googleId) && { googleId: profile.id }),
            emailVerified: true,
          },
        });
      }
    } else {
      // Create new user — Google has already verified the email
      user = await prisma.user.create({
        data: {
          name: profile.name || profile.email.split('@')[0],
          email: normalizeEmail(profile.email),
          googleId: profile.id,
          role: 'host',
          emailVerified: true,
        },
      });
    }

    // Auto-link any pending co-host invites matching this email
    await prisma.listingCoHost.updateMany({
      where: { inviteEmail: profile.email.toLowerCase(), status: 'PENDING', userId: null },
      data: { userId: user.id },
    });

    setSession(res, signToken(user));
    res.redirect(`${clientUrl}/auth/callback?ok=1`);
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
    const { phone, currentPassword } = req.body;
    const email = normalizeEmail(req.body.email);
    const cn = cleanName(req.body.name);
    if (cn.error || !email)
      return res.status(400).json({ message: cn.error || 'Name and email are required' });
    const name = cn.name;
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Please enter a valid email address' });

    const emailChanging = email !== req.user.email.toLowerCase();

    if (emailChanging) {
      // Require password confirmation for password-based accounts
      if (req.user.password) {
        if (!currentPassword)
          return res.status(400).json({ message: 'Your current password is required to change your email address' });
        const ok = await bcrypt.compare(currentPassword, req.user.password);
        if (!ok)
          return res.status(401).json({ message: 'Incorrect password' });
      }
      const existing = await findByEmail(email);
      if (existing && existing.id !== req.user.id) return res.status(400).json({ message: 'Email already in use' });
    }

    // If email is changing, reset verification and send a new link
    const extraData = {};
    if (emailChanging) {
      const verifyToken = crypto.randomBytes(32).toString('hex');
      extraData.emailVerified = false;
      extraData.emailVerifyToken = verifyToken;
      extraData.emailVerifyExpires = verifyExpiry();
      // Non-blocking
      const updatedName = name || req.user.name;
      sendVerificationEmail({
        to: email,
        name: updatedName,
        verifyUrl: `${CLIENT_URL}/verify-email?token=${verifyToken}`,
      }).catch(() => {});
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, email, phone: normalizePhone(phone) || null, ...extraData },
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
    const pwErr = passwordProblem(newPassword, req.user.email);
    if (pwErr) return res.status(400).json({ message: pwErr });
    if (!req.user.password)
      return res.status(400).json({ message: 'This account uses Google sign-in and has no password to change.' });
    const isMatch = await bcrypt.compare(currentPassword, req.user.password);
    if (!isMatch)
      return res.status(401).json({ message: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPassword, 10);
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed, tokenVersion: { increment: 1 } },    // every other session is signed out
    });
    const fresh = signToken(updated);
    if (parseCookies(req)[require('../lib/session').COOKIE]) setSession(res, fresh);
    res.json({ message: 'Password updated successfully. Other devices have been signed out.', token: fresh });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/auth/email-preference — turn notification emails on/off (in-app notifications always stay on)
router.put('/email-preference', auth, async (req, res) => {
  if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ message: 'enabled must be true or false' });
  const updated = await prisma.user.update({ where: { id: req.user.id }, data: { emailUnsubscribed: !req.body.enabled } });
  res.json(safeUser(updated));
});

// GET /api/auth/verify-email?token=xxx — no auth required
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'Token required' });
    const user = await prisma.user.findFirst({ where: { emailVerifyToken: String(token) } });
    if (!user || (user.emailVerifyExpires && user.emailVerifyExpires < new Date()))
      return res.status(400).json({ message: 'Invalid or expired verification link' });
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
    });
    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/resend-verification — auth required
router.post('/resend-verification', auth, rl.limit({ name: 'resend-verify', windowMs: 60 * 60 * 1000, max: 5, key: (req) => req.ip, message: 'Too many verification emails requested.' }), async (req, res) => {
  try {
    if (req.user.emailVerified)
      return res.json({ message: 'Your email is already verified' });
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: req.user.id },
      data: { emailVerifyToken: token, emailVerifyExpires: verifyExpiry() },
    });
    await sendVerificationEmail({
      to: req.user.email,
      name: req.user.name,
      verifyUrl: `${CLIENT_URL}/verify-email?token=${token}`,
    });
    res.json({ message: 'Verification email sent' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/forgot-password — no auth required
router.post('/forgot-password', rl.limit({ name: 'forgot-ip', windowMs: 60 * 60 * 1000, max: 20, message: 'Too many reset requests from this network.' }), async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return res.status(400).json({ message: 'Email is required' });
    // at most 3 reset emails per address per hour (answers the same either way, so nothing is revealed)
    if (rl.hit(`forgot-email|${email}`, 60 * 60 * 1000).n > 3)
      return res.json({ message: 'If that email has an account, a reset link has been sent.' });
    const user = await findByEmail(email);
    // Always respond the same way to prevent email enumeration
    if (!user || !user.password) {
      return res.json({ message: 'If that email has an account, a reset link has been sent.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    });
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl: `${CLIENT_URL}/reset-password?token=${token}`,
    });
    res.json({ message: 'If that email has an account, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/reset-password — no auth required
router.post('/reset-password', rl.limit({ name: 'reset', windowMs: 60 * 60 * 1000, max: 20, message: 'Too many attempts.' }), async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword)
      return res.status(400).json({ message: 'Token and new password are required' });
    const user = await prisma.user.findFirst({
      where: { passwordResetToken: String(token), passwordResetExpires: { gt: new Date() } },
    });
    if (!user)
      return res.status(400).json({ message: 'Reset link is invalid or has expired' });
    const pwErr = passwordProblem(newPassword, user.email);
    if (pwErr) return res.status(400).json({ message: pwErr });
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, passwordResetToken: null, passwordResetExpires: null, tokenVersion: { increment: 1 } },   // signs out every old session
    });
    res.json({ message: 'Password reset successfully. You can now sign in.' });
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
