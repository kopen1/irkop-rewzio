import { EconomicCoordinator } from './economic-coordinator.js';

export interface Env {
  DB: D1Database;
  REWZIO_DATABASE_NAME: string;
  ENVIRONMENT: string;
  ECONOMIC_COORDINATOR: DurableObjectNamespace;
  PAYOUT_QUEUE: Queue;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function health(env: Env): Promise<Response> {
  let database = 'unavailable';
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
    database = 'ok';
  } catch {
    database = 'not-bound';
  }
  return json({
    status: 'ok',
    service: 'rewzio-api',
    runtime: 'cloudflare-workers',
    environment: env.ENVIRONMENT,
    database: env.REWZIO_DATABASE_NAME,
    databaseStatus: database,
    apiVersion: 'v1',
  });
}

async function migrationStatus(env: Env): Promise<Response> {
  try {
    const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all<{ name: string }>();
    return json({
      status: 'ok',
      database: env.REWZIO_DATABASE_NAME,
      tables: row.results.map(x => x.name),
    });
  } catch (error) {
    return json({ status: 'error', message: error instanceof Error ? error.message : 'database error' }, 500);
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') return health(env);
    if (request.method === 'GET' && url.pathname === '/api/v1/migration/status') return migrationStatus(env);

    // Economic commands are serialized by user ID. The actual domain mutation
    // must be implemented against D1 before this route is exposed publicly.
    const economic = url.pathname.match(/^\/api\/v1\/economic\/([^/]+)$/);
    if (economic && request.method === 'POST') {
      const userId = decodeURIComponent(economic[1]);
      const id = env.ECONOMIC_COORDINATOR.idFromName(userId);
      return env.ECONOMIC_COORDINATOR.get(id).fetch(request);
    }

    return json({
      error: {
        code: 'MIGRATION_IN_PROGRESS',
        message: 'This API surface is not yet migrated to the Cloudflare runtime.',
      },
    }, 503);
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    // Queue consumer is intentionally conservative until payout mutations are
    // fully D1/idempotency based. Messages are retried by Cloudflare Queues.
    for (const message of batch.messages) {
      console.log('rewzio payout queue message received', message.id);
      message.ack();
    }
  },
};

export { EconomicCoordinator };
export default worker;
