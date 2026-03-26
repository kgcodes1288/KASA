const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const authenticate = require('../middleware/auth');

const normalizePhone = (phone) =>
  phone ? phone.replace(/\s+/g, '').replace(/[^\d+]/g, '') : phone;

// GET /api/contractors
router.get('/', authenticate, async (req, res) => {
  try {
    const contractors = await prisma.contractor.findMany({
      where: { hostId: req.user.id },
      orderBy: { name: 'asc' },
    });
    res.json(contractors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch contractors' });
  }
});

// POST /api/contractors
router.post('/', authenticate, async (req, res) => {
  const { name, phone, trade, notes, smsConsent } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone is required' });
  try {
    const contractor = await prisma.contractor.create({
      data: {
        name:       name.trim(),
        phone:      normalizePhone(phone),
        trade:      trade?.trim() || null,
        notes:      notes?.trim() || null,
        smsConsent: smsConsent === true,
        hostId:     req.user.id,
      },
    });
    res.status(201).json(contractor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create contractor' });
  }
});

// PUT /api/contractors/:id
router.put('/:id', authenticate, async (req, res) => {
  const { name, phone, trade, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone is required' });
  try {
    const existing = await prisma.contractor.findFirst({
      where: { id: req.params.id, hostId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Contractor not found' });
    const contractor = await prisma.contractor.update({
      where: { id: req.params.id },
      data: {
        name:  name.trim(),
        phone: normalizePhone(phone),
        trade: trade?.trim() || null,
        notes: notes?.trim() || null,
      },
    });
    res.json(contractor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update contractor' });
  }
});

// DELETE /api/contractors/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.contractor.findFirst({
      where: { id: req.params.id, hostId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Contractor not found' });
    await prisma.contractor.delete({ where: { id: req.params.id } });
    res.json({ message: 'Contractor deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete contractor' });
  }
});

module.exports = router;