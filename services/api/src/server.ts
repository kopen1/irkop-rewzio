import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: { title: 'Rewzio API', version: '0.1.0' },
      servers: [{ url: '/' }]
    }
  });

  app.register(swaggerUi, { routePrefix: '/api/docs' });

  app.get('/health', async () => ({ status: 'ok', service: 'rewzio-api' }));

  return app;
}

const app = buildServer();

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 3001);
  app.listen({ host: '0.0.0.0', port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
