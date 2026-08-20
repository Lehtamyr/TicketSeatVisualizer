import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  // Guard early in development/runtime if DATABASE_URL is missing
  console.warn('[Prisma] WARNING: DATABASE_URL is not defined in environment.');
}

const globalForPrisma = globalThis as unknown as {
  prisma_v2: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma_v2 ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma_v2 = prisma;

export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

