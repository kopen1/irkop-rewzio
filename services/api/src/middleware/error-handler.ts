import type { FastifyInstance } from 'fastify';

export interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler(async (_request, reply) => {
    const body: ErrorBody = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    };
    return reply.status(404).send(body);
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, 'request failed');
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    const code = statusCode === 400 ? 'BAD_REQUEST' : statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR';
    const message = statusCode < 500 ? error.message : 'Internal server error';
    return reply.status(statusCode).send({ success: false, error: { code, message } });
  });
}
