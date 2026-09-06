import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { AppConfig } from './config/index.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerResponseHooks, ok } from './middleware/response.js';
import { registerSecurity } from './middleware/security.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerUserRoutes } from './routes/user.js';
import { registerRewardRoutes } from './routes/rewards.js';
import { registerWatchRoutes } from './routes/watch.js';
import { registerProviderRewardRoutes } from './routes/provider-rewards.js';
import { registerEngagementRewardRoutes } from './routes/engagement-rewards.js';
import { registerWalletRoutes } from './routes/wallet.js';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from './core/redis.js';
export interface AppDependencies { db: PrismaClient; redis: RedisConnection; }
export function buildApp(config: AppConfig, dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel, base: { service: config.appName }, serializers: { req(request) { return { id: request.id, method: request.method, url: request.url }; }, res(reply) { return { statusCode: reply.statusCode }; } } }, requestIdHeader: 'x-request-id', genReqId: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` });
  app.register(swagger, { openapi: { openapi: '3.0.3', info: { title: 'Rewzio API', version: '0.1.0' }, servers: [{ url: '/' }] } });
  app.register(swaggerUi, { routePrefix: '/api/docs' });
  registerSecurity(app, config); registerResponseHooks(app); registerErrorHandler(app); registerHealthRoutes(app, dependencies); registerAuthRoutes(app, config, dependencies.db, dependencies.redis); registerUserRoutes(app, config, dependencies.db); registerRewardRoutes(app, config, dependencies.db, dependencies.redis); registerWatchRoutes(app, config, dependencies.db, dependencies.redis); registerProviderRewardRoutes(app, config, dependencies.db, dependencies.redis); registerEngagementRewardRoutes(app, config, dependencies.db, dependencies.redis); registerWalletRoutes(app, config, dependencies.db, dependencies.redis);
  app.get('/api/v1', async () => ok({ service: config.appName, version: 'v1' }));
  app.get('/health', async () => ok({ status: 'ok', service: config.appName }));
  return app;
}
