import type { FastifyInstance } from 'fastify';
export interface ErrorBody { success: false; error: { code: string; message: string }; }
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler(async (_request, reply) => reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.setErrorHandler(async (error, request, reply) => {
    const err = error as { statusCode?: number; message?: string; code?: string };
    request.log.error({ err: error, requestId: request.id }, 'request failed');
    const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    const code = statusCode >= 500 ? 'INTERNAL_ERROR' : err.code && /^[A-Z0-9_]+$/.test(err.code) ? err.code : statusCode === 400 ? 'BAD_REQUEST' : statusCode === 404 ? 'NOT_FOUND' : 'AUTH_ERROR';
    const message = statusCode >= 500 ? 'Internal server error' : err.message || 'Request failed';
    return reply.status(statusCode).send({ success: false, error: { code, message } });
  });
}
