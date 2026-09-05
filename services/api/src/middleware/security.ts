import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/index.js';

export function registerSecurity(app: FastifyInstance, config: AppConfig): void {
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (config.corsOrigin === '*' || (origin && origin === config.corsOrigin)) {
      reply.header('access-control-allow-origin', config.corsOrigin === '*' ? '*' : origin);
    }
    reply.header('access-control-allow-methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    reply.header('access-control-allow-headers', 'Content-Type, Authorization, X-Request-ID');
    reply.header('access-control-expose-headers', 'X-Request-ID');
    if (request.method === 'OPTIONS') {
      reply.header('access-control-max-age', '86400');
      return reply.status(204).send();
    }
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('permissions-policy', 'geolocation=(), microphone=(), camera=()');
    reply.header('cross-origin-resource-policy', 'same-origin');
    if (config.nodeEnv === 'production') reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
  });
}
