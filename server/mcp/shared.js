const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Pending authorization requests are signed with a key derived from JWT_SECRET, so a
// normal login token can never be mistaken for one (and vice versa).
const reqSecret = () => `${process.env.JWT_SECRET || 'dev_secret'}:oauth-authorize`;

const signReq = (claims) => jwt.sign({ purpose: 'oauth-authorize', ...claims }, reqSecret(), { expiresIn: '10m' });
function verifyReq(token) {
  const claims = jwt.verify(token, reqSecret());
  if (claims.purpose !== 'oauth-authorize') throw new Error('bad purpose');
  return claims;
}

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const rand = (n = 32) => crypto.randomBytes(n).toString('base64url');

module.exports = { signReq, verifyReq, sha, rand, CODE_TTL_MS: 5 * 60 * 1000 };
