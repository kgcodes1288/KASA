/**
 * One-time backfill: propagate existing room checklist templates
 * into all pending/in_progress jobs for each room.
 *
 * Run from the server/ directory:
 *   node scripts/backfill-job-checklists.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get all rooms that have checklist template items
  const rooms = await prisma.room.findMany({
    include: { checklistItems: true },
  });

  const roomsWithItems = rooms.filter((r) => r.checklistItems.length > 0);
  console.log(`Found ${roomsWithItems.length} rooms with checklist items.`);

  let totalAdded = 0;

  for (const room of roomsWithItems) {
    const templateTexts = room.checklistItems.map((i) => i.text.trim());

    // Find all pending/in_progress jobs for this room
    const activeJobs = await prisma.job.findMany({
      where: { roomId: room.id, status: { in: ['pending', 'in_progress'] } },
      include: { checklistItems: true },
    });

    if (activeJobs.length === 0) continue;

    for (const job of activeJobs) {
      const existingTexts = new Set(job.checklistItems.map((c) => c.text.trim().toLowerCase()));
      const toAdd = templateTexts.filter((t) => !existingTexts.has(t.toLowerCase()));

      if (toAdd.length > 0) {
        await prisma.jobChecklist.createMany({
          data: toAdd.map((text) => ({ jobId: job.id, text, done: false })),
        });
        console.log(`  Room "${room.name}" — job ${job.id}: added ${toAdd.length} item(s): ${toAdd.join(', ')}`);
        totalAdded += toAdd.length;
      }
    }
  }

  console.log(`\nDone. ${totalAdded} checklist item(s) added across all pending/in-progress jobs.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
