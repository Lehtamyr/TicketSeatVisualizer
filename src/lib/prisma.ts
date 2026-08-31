import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL || '';

  if (!connectionString) {
    console.warn('[Prisma] WARNING: DATABASE_URL is not defined in environment.');
  }

  // Connect via standard PostgreSQL connection pool with TCP keep-alive
  // This maintains active connections, prevents idle timeouts, and works seamlessly with Neon poolers
  if (connectionString) {
    const pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma_v2: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma_v2 ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma_v2 = prisma;

export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
