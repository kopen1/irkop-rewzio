import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../core/redis.js';
import { pingDatabase } from '../core/database.js';
import { ok } from '../middleware/response.js';

interface Dependencies {
  db: PrismaClient;
  redis: RedisConnection;
}

export function registerHealthRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.register(async (api) => {
    api.get('/health', async (_request, reply) => {
      return reply.status(200).send(ok({ status: 'ok' }));
    });

    api.get('/ready', async (_request, reply) => {
      const checks = await Promise.allSettled([
        pingDatabase(dependencies.db),
        dependencies.redis.ping(),
      ]);
      const database = checks[0]?.status === 'fulfilled';
      const redis = checks[1]?.status === 'fulfilled';
      const ready = database && redis;
      const data = { status: ready ? 'ready' : 'not_ready', dependencies: { database, redis } };
      return reply.status(ready ? 200 : 503).send(ok(data));
    });
  }, { prefix: '/api/v1' });
}
