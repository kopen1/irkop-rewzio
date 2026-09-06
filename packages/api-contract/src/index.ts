import type { ApiError } from '@rewzio/shared';
import { openapiDocument } from './openapi.js';

export interface HealthResponse { status: 'ok'; service: 'rewzio-api'; }
export interface ApiSuccess<T = unknown> { success: true; data: T; message: string | null; }
export interface ApiErrorResponse { success: false; error: { code: string; message: string; }; }
export type ApiResponse<T> = ApiSuccess<T> | ApiErrorResponse | ApiError;
export type StandardErrorCode = typeof openapiDocument.components.schemas.ErrorCodes.enum[number];
export const API_V1_PREFIX = '/api/v1' as const;
export const API_DOCS_PATH = '/api/docs' as const;
export { openapiDocument };
