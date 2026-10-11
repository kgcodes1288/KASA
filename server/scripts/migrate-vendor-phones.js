// One-time, idempotent: store vendor phones as plain 10-digit US numbers (what sign-up/edit now enforces).
const prisma = require('../lib/prisma');

async function migrateVendorPhones() {
  const vendors = await prisma.contractor.findMany({ select: { id: true, phone: true } });
  let n = 0;
  for (const v of vendors) {
    const d = String(v.phone || '').replace(/\D/g, '');
    const ten = d.length === 10 ? d : d.length === 11 && d.startsWith('1') ? d.slice(1) : null;
    if (ten && ten !== v.phone) { await prisma.contractor.update({ where: { id: v.id }, data: { phone: ten } }); n++; }
  }
  if (n) console.log(`[migrate-vendor-phones] ${n} normalised`);
}

module.exports = { migrateVendorPhones };
