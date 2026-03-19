require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('./lib/prisma');
const { startPoller } = require('./services/icalPoller');
const { listingRouter, taskRouter } = require('./routes/maintenance');

const app = express();

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
app.use('/api/public',      require('./routes/public'));   // ← new

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

async function main() {
  try {
    await prisma.$connect();
    console.log('PostgreSQL connected via Prisma');
    startPoller();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('DB connection error:', err);
    process.exit(1);
  }
}

main();