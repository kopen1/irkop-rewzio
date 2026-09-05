import { PrismaClient } from '@prisma/client';

export function createDatabaseClient(): PrismaClient {
  return new PrismaClient({
    log: ['warn', 'error'],
  });
}

export async function connectDatabase(db: PrismaClient): Promise<void> {
  await db.$connect();
}

export async function pingDatabase(db: PrismaClient): Promise<void> {
  await db.$queryRaw`SELECT 1`;
}

export async function disconnectDatabase(db: PrismaClient): Promise<void> {
  await db.$disconnect();
}
