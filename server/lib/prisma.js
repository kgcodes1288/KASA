const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Debug middleware — log any time a User record is created or updated
prisma.$use(async (params, next) => {
  if (params.model === 'User' && ['create', 'update', 'upsert'].includes(params.action)) {
    const hasPassword = !!(params.args?.data?.password);
    console.log(`[Prisma] User ${params.action} — password being set: ${hasPassword}`, JSON.stringify(params.args?.data || {}));
  }
  return next(params);
});

module.exports = prisma;
