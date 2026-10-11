require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('./lib/prisma');
const { startPoller } = require('./services/icalPoller');
const { listingRouter, taskRouter } = require('./routes/maintenance');

const app = express();
app.set('trust proxy', 1);                // behind Caddy: req.ip is the real client (used by rate limits)
app.disable('x-powered-by');
app.use((req, res, next) => {             // baseline security headers for every API response
  res.set({
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/listings',    require('./routes/listings'));
app.use('/api/listings',    require('./routes/cohosts'));
app.use('/api/listings',    listingRouter);
app.use('/api/rooms',       require('./routes/rooms'));
app.use('/api/jobs',        require('./routes/jobs'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/cohosts',     require('./routes/cohosts'));
app.use('/api/maintenance', taskRouter);
app.use('/api/contractors', require('./routes/contractor'));
app.use('/api/public',      require('./routes/public'));
app.use('/api/upload',      require('./routes/upload'));
app.use('/api/calendar',       require('./routes/calendar'));
app.use('/api/notifications',  require('./routes/notifications'));
app.use('/api/mcp',            require('./routes/mcp'));
app.use('/api/email',          require('./routes/email'));
app.use('/api/admin',          require('./routes/admin'));
app.use('/api/unsubscribe',    require('./routes/unsubscribe'));

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// last-resort handlers: JSON answers, never stack traces or internals
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, req, res, next) => {            // eslint-disable-line no-unused-vars
  if (err && err.type === 'entity.too.large') return res.status(413).json({ message: 'That request is too large.' });
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) return res.status(400).json({ message: 'That request could not be read.' });
  console.error('[unhandled]', err && err.message);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

async function main() {
  try {
    await prisma.$connect();
    console.log('PostgreSQL connected via Prisma');
    await require('./scripts/migrate-emails').migrateEmails().catch((e) => console.error('[migrate-emails] failed:', e.message));
    await require('./scripts/migrate-vendor-phones').migrateVendorPhones().catch((e) => console.error('[migrate-vendor-phones] failed:', e.message));
    await require('./scripts/migrate-turnover').migrateTurnover().catch((e) => console.error('[migrate-turnover] failed:', e.message));
    await require('./scripts/migrate-calendars').migrateCalendars().catch((e) => console.error('[migrate-calendars] failed:', e.message));
    startPoller();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('DB connection error:', err);
    process.exit(1);
  }
}

main();