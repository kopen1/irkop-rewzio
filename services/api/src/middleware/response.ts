import type { FastifyInstance } from 'fastify';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string | null;
}

export function ok<T>(data: T, message: string | null = null): ApiSuccess<T> {
  return { success: true, data, message };
}

export function registerResponseHooks(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
}
