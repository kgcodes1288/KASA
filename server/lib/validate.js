// Input rules shared by sign-up, sign-in, profile, reset and invites.
const EMAIL_RE = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/;
const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', 'iloveyou', 'abc12345',
  'letmein123', 'welcome123', 'admin123', 'passw0rd', '11111111', '00000000', 'aaaaaaaa', 'abcdefgh', 'cleanstay', 'cleanstays', 'getcleanstays']);

const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
const isValidEmail = (e) => e.length <= 254 && EMAIL_RE.test(e);

// returns an error message, or null when the password is acceptable
function passwordProblem(pw, email) {
  const p = String(pw || '');
  if (p.length < 8) return 'Password must be at least 8 characters';
  if (p.length > 128) return 'Password must be 128 characters or fewer';
  if (COMMON.has(p.toLowerCase()) || /^(.)\1+$/.test(p)) return 'That password is too easy to guess. Please choose a less common one';
  if (email && p.toLowerCase() === String(email).toLowerCase()) return 'Your password cannot be your email address';
  return null;
}

function cleanName(n) {
  const name = String(n || '').replace(/\s+/g, ' ').trim();
  if (!name) return { error: 'Name is required' };
  if (name.length > 80) return { error: 'Name must be 80 characters or fewer' };
  return { name };
}

module.exports = { normalizeEmail, isValidEmail, passwordProblem, cleanName };
