import { PrismaClient } from '@prisma/client';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import ws from 'ws';

// Configure WebSocket constructor globally on neonConfig
neonConfig.webSocketConstructor = ws;

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL || '';

  if (!connectionString) {
    console.warn('[Prisma] WARNING: DATABASE_URL is not defined in environment.');
  }

  // If connecting to Neon serverless database, connect via Neon WebSocket Driver Adapter
  // This enables instant connection pooling, full transaction support ($transaction),
  // and communicates over Port 443 (WebSocket) to bypass port 5432 TCP resets.
  if (connectionString.includes('neon.tech')) {
    const adapter = new PrismaNeon({ connectionString });
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  // Standard PostgreSQL connection fallback for local / non-Neon databases
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma_v2: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma_v2 ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma_v2 = prisma;

export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
