/**
 * Cloudflare Workers entrypoint for the Rewzio API migration.
 *
 * This is intentionally a small compatibility shell. The existing Fastify
 * application remains the source implementation until each module is moved
 * to Workers-compatible runtime APIs and D1/DO/Queues semantics are verified.
 */

export interface Env {
  REWZIO_DATABASE_NAME: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "rewzio-api",
        runtime: "cloudflare-workers",
        database: env.REWZIO_DATABASE_NAME,
      });
    }

    return Response.json(
      {
        error: {
          code: "MIGRATION_IN_PROGRESS",
          message: "Rewzio API Cloudflare migration is in progress.",
        },
      },
      { status: 503 },
    );
  },
};
