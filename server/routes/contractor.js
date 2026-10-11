const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const authenticate = require('../middleware/auth');

const normalizePhone = (phone) =>
  phone ? phone.replace(/\s+/g, '').replace(/[^\d+]/g, '') : phone;

// 10-digit US number (optionally with a leading 1 / +1); returns the 10 digits or null
const usPhone = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return d;
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return null;
};
const checkFields = ({ name, phone, trade, notes }) => {
  if (!name || !name.trim()) return 'Name is required';
  if (name.trim().length > 80) return 'Name must be 80 characters or fewer';
  if (!phone || !phone.trim()) return 'Phone is required';
  if (!usPhone(phone)) return 'Enter a 10-digit US phone number';
  if (trade && String(trade).length > 60) return 'Trade must be 60 characters or fewer';
  if (notes && String(notes).length > 500) return 'Notes must be 500 characters or fewer';
  return null;
};

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
  const bad = checkFields(req.body);
  if (bad) return res.status(400).json({ error: bad });
  try {
    const contractor = await prisma.contractor.create({
      data: {
        name:       name.trim(),
        phone:      usPhone(phone),
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
  const { name, phone, trade, notes, smsConsent } = req.body;
  const bad = checkFields(req.body);
  if (bad) return res.status(400).json({ error: bad });
  try {
    const existing = await prisma.contractor.findFirst({
      where: { id: req.params.id, hostId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Contractor not found' });
    const contractor = await prisma.contractor.update({
      where: { id: req.params.id },
      data: {
        name:  name.trim(),
        phone: usPhone(phone),
        trade: trade?.trim() || null,
        notes: notes?.trim() || null,
        ...(typeof smsConsent === 'boolean' && { smsConsent }),
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