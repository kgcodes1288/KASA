// Small in-memory rate limiter (one API instance). Counts hits per key inside a sliding window.
const buckets = new Map();
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60 * 1000).unref();

function hit(key, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  return b;
}
const peek = (key) => { const b = buckets.get(key); return b && b.reset > Date.now() ? b : null; };
const clear = (key) => buckets.delete(key);

const retry = (res, b, msg) => {
  const secs = Math.max(1, Math.ceil((b.reset - Date.now()) / 1000));
  res.set('Retry-After', String(secs));
  return res.status(429).json({ message: `${msg} Try again in ${secs > 90 ? Math.ceil(secs / 60) + ' minutes' : secs + ' seconds'}.` });
};

// middleware: at most `max` requests per `windowMs` for key(req)
const limit = ({ name, windowMs, max, key = (req) => req.ip, message = 'Too many requests.' }) => (req, res, next) => {
  const b = hit(`${name}|${key(req)}`, windowMs);
  if (b.n > max) return retry(res, b, message);
  next();
};

module.exports = { limit, hit, peek, clear, retry };
