// Fetch a calendar (iCal) feed safely. The URL is typed in by users, so the server must never be tricked into reading
// internal services (SSRF): only http(s) on ports 80/443, hostnames must resolve to PUBLIC addresses (checked at connect
// time, so DNS tricks don't help), redirects are re-checked, 15 s timeout, 5 MB cap.
const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');

const ALLOW_PRIVATE = process.env.ICAL_ALLOW_PRIVATE === 'true';   // staging demo feeds only
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15000;

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::1' || x === '::' || x.startsWith('fe80') || x.startsWith('fc') || x.startsWith('fd')) return true;
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateIp(m[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
    || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });

// Rules checked when a link is SAVED (fast feedback) and again on every connection
function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw friendly('That does not look like a valid calendar link'); }
  if (!/^https?:$/.test(u.protocol)) throw friendly('Calendar links must start with https://');
  if (u.username || u.password) throw friendly('Remove the username/password from the link');
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  if (!ALLOW_PRIVATE && !['80', '443'].includes(port)) throw friendly('That link uses an unusual port. Calendar links normally do not');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!ALLOW_PRIVATE && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !net.isIP(host)))
    throw friendly('That link points at a private address, not a booking site');
  if (!ALLOW_PRIVATE && net.isIP(host) && isPrivateIp(host)) throw friendly('That link points at a private address, not a booking site');
  return u;
}

function safeLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!ALLOW_PRIVATE && addrs.some((a) => isPrivateIp(a.address))) return cb(friendly('That link points at a private address, not a booking site'));
    if (options && options.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

function getOnce(u) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { lookup: safeLookup, timeout: TIMEOUT_MS, headers: { 'User-Agent': 'CleanStay-Calendar-Sync/1.0', Accept: 'text/calendar, text/plain, */*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, u).toString() }); }
      if (res.statusCode !== 200) { res.resume(); return reject(friendly(`The calendar site answered with an error (${res.statusCode}). Check the link`)); }
      let size = 0; const chunks = [];
      res.on('data', (c) => { size += c.length; if (size > MAX_BYTES) { req.destroy(friendly('That calendar file is too large')); } else chunks.push(c); });
      res.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(friendly('The calendar site took too long to answer')));
    req.on('error', (e) => reject(e.friendly ? e : friendly(e.code === 'ENOTFOUND' ? 'That calendar address was not found' : e.code === 'ECONNREFUSED' ? 'The calendar site refused the connection' : 'Could not reach the calendar site')));
  });
}

async function fetchCalendarText(raw) {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = checkUrl(url);
    const r = await getOnce(u);
    if (r.redirect) { url = r.redirect; continue; }
    if (!/BEGIN:VCALENDAR/i.test(r.text)) throw friendly('That link is not a calendar. Use the iCal / Export calendar link from the booking site');
    return r.text;
  }
  throw friendly('That calendar link redirects too many times');
}

module.exports = { fetchCalendarText, checkUrl, isPrivateIp };
