import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client singleton.
 *
 * Pool: controlado via DATABASE_URL query params:
 *   - Serverless (Vercel):   ?connection_limit=5&pool_timeout=10
 *   - Self-hosted (PM2):     ?connection_limit=20&pool_timeout=30
 *
 * Graceful shutdown em SIGTERM/beforeExit evita connection leaks no Docker/PM2.
 * Em serverless, o processo termina com o request — shutdown é no-op.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown — relevante em Docker/PM2; no-op silencioso em serverless
if (process.env.NODE_ENV === 'production') {
  const shutdown = async () => {
    await prisma.$disconnect();
  };
  process.once('SIGTERM', shutdown);
  process.once('beforeExit', shutdown);
}
