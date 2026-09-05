import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/index.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerResponseHooks } from './middleware/response.js';
import { registerSecurity } from './middleware/security.js';
import { registerHealthRoutes } from './routes/health.js';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from './core/redis.js';
import { ok } from './middleware/response.js';

export interface AppDependencies {
  db: PrismaClient;
  redis: RedisConnection;
}

export function buildApp(config: AppConfig, dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      base: { service: config.appName },
      serializers: {
        req(request) {
          return { id: request.id, method: request.method, url: request.url };
        },
        res(reply) {
          return { statusCode: reply.statusCode };
        },
      },
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  });

  registerSecurity(app, config);
  registerResponseHooks(app);
  registerErrorHandler(app);
  registerHealthRoutes(app, dependencies);

  app.get('/api/v1', async () => ok({ service: config.appName, version: 'v1' }));

  return app;
}
