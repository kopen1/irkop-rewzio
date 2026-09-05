import { buildApp } from './app.js';
import { loadConfig } from './config/index.js';
import { createDatabaseClient, connectDatabase, disconnectDatabase } from './core/database.js';
import { RedisConnection, connectRedis } from './core/redis.js';

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const db = createDatabaseClient();
  const redis = new RedisConnection(config.redisUrl);
  const app = buildApp(config, { db, redis });
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'graceful shutdown started');
    try {
      await app.close();
      await Promise.allSettled([disconnectDatabase(db), redis.close()]);
      app.log.info('graceful shutdown completed');
    } catch (error) {
      app.log.error({ err: error }, 'graceful shutdown failed');
      process.exitCode = 1;
    }
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });

  try {
    await connectDatabase(db);
    await connectRedis(redis);
    await app.listen({ host: config.host, port: config.port });
    app.log.info({ host: config.host, port: config.port }, 'Rewzio API started');
  } catch (error) {
    app.log.error({ err: error }, 'Rewzio API failed to start');
    await Promise.allSettled([app.close(), disconnectDatabase(db), redis.close()]);
    process.exitCode = 1;
  }
}

if (process.env.NODE_ENV !== 'test') {
  void startServer();
}
