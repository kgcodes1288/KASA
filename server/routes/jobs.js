const router = require('express').Router();
const auth = require('../middleware/auth');
const Job = require('../models/Job');
const Listing = require('../models/Listing');

// GET /api/jobs
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'cleaner') {
      query.cleaner = req.user._id;
    } else {
      const listings = await Listing.find({ host: req.user._id }).select('_id');
      query.listing = { $in: listings.map((l) => l._id) };
    }

    const { status } = req.query;
    if (status) query.status = status;

    const jobs = await Job.find(query)
      .populate('listing', 'name address')
      .populate('room', 'name')
      .populate('cleaner', 'name phone')
      .sort({ checkoutDate: 1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/jobs/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('listing', 'name address')
      .populate('room', 'name')
      .populate('cleaner', 'name phone');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/jobs/:id/checklist/:itemId — toggle a checklist item
router.patch('/:id/checklist/:itemId', auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    const item = job.checklist.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Checklist item not found' });

    item.completed = req.body.completed;
    item.completedAt = req.body.completed ? new Date() : null;

    // Auto-update job status
    const total = job.checklist.length;
    const done = job.checklist.filter((i) => i.completed).length;
    job.status = done === total ? 'completed' : done > 0 ? 'in_progress' : 'pending';

    await job.save();
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/jobs/:id/assign — host assigns a cleaner
router.patch('/:id/assign', auth, async (req, res) => {
  if (req.user.role !== 'host')
    return res.status(403).json({ message: 'Hosts only' });
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { cleaner: req.body.cleanerId },
      { new: true }
    ).populate('cleaner', 'name phone');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
