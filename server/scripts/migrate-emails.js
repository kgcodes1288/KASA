// One-time, idempotent: store every account email in lowercase (sign-in and sign-up now compare case-insensitively).
// An address is skipped if lowercasing it would collide with another account.
const prisma = require('../lib/prisma');

async function migrateEmails() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const taken = new Set(users.map((u) => u.email));
  let changed = 0, skipped = 0;
  for (const u of users) {
    const clean = u.email.trim().toLowerCase();
    if (clean === u.email) continue;
    if (taken.has(clean)) { skipped++; console.warn(`[migrate-emails] not lowercasing ${u.email}: ${clean} already exists`); continue; }
    await prisma.user.update({ where: { id: u.id }, data: { email: clean } });
    taken.delete(u.email); taken.add(clean); changed++;
  }
  if (changed || skipped) console.log(`[migrate-emails] ${changed} lowercased, ${skipped} skipped`);
}

module.exports = { migrateEmails };
