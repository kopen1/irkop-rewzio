export type PlayIntegrityStatus = 'VERIFIED' | 'UNVERIFIED' | 'UNSUPPORTED' | 'FAILED' | 'UNKNOWN';

export interface PlayIntegrityResult {
  status: PlayIntegrityStatus;
  provider?: string;
  details?: Record<string, unknown>;
}

export interface PlayIntegrityProvider {
  verify(input: { appId: string; userId: string; deviceId: string; token?: string }): Promise<PlayIntegrityResult>;
}

export class DefaultPlayIntegrityProvider implements PlayIntegrityProvider {
  async verify(_input: { appId: string; userId: string; deviceId: string; token?: string }): Promise<PlayIntegrityResult> {
    return { status: 'UNKNOWN', provider: 'none' };
  }
}

export function normalizeIntegrityStatus(value: string | null | undefined): PlayIntegrityStatus {
  if (value === 'VERIFIED' || value === 'UNVERIFIED' || value === 'UNSUPPORTED' || value === 'FAILED' || value === 'UNKNOWN') return value;
  return 'UNKNOWN';
}
