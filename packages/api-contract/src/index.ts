import type { ApiError } from '@rewzio/shared';

export interface HealthResponse {
  status: 'ok';
  service: 'rewzio-api';
}

export type ApiResponse<T> = T | ApiError;

export const API_V1_PREFIX = '/api/v1' as const;
