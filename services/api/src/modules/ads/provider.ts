export interface AdsCallbackEvent {
  provider: string;
  eventId: string;
  userId: string;
  appId: string;
  placementId?: string;
  rewardAmount?: string | number | bigint;
  status?: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
}

export interface AdsProvider {
  readonly name: string;
  verifyCallback(input: { headers: Record<string, string | undefined>; rawBody: string }): Promise<boolean>;
  normalizeCallback(input: unknown): Promise<AdsCallbackEvent>;
}

export async function withProviderTimeout<T>(task: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(providerError('PROVIDER_TIMEOUT', 'Provider request timed out', 504)), timeoutMs); })]);
  } finally { if (timer) clearTimeout(timer); }
}

export function providerError(code: string, message: string, statusCode = 400): Error & { code: string; statusCode: number } {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = code; error.statusCode = statusCode; return error;
}
