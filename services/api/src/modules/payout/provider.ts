import crypto from 'node:crypto';

export type ProviderPayoutStatus = 'ACCEPTED' | 'PENDING' | 'COMPLETED' | 'FAILED';
export interface PayoutRequest { transactionId: string; withdrawalId: string; amount: string; fee: string; currency: string; accountName: string; accountNumber: string; methodType: string; }
export interface PayoutResult { providerReference: string; status: ProviderPayoutStatus; raw?: Record<string, unknown>; }
export interface PayoutProvider { readonly code: string; createPayout(input: PayoutRequest): Promise<PayoutResult>; verifyWebhook(signature: string | undefined, rawPayload: string): boolean; parseWebhook(payload: Record<string, unknown>): { eventId: string; eventType: string; providerReference: string; status: ProviderPayoutStatus }; }

export class MockPayoutProvider implements PayoutProvider {
  readonly code = 'MOCK';
  async createPayout(input: PayoutRequest): Promise<PayoutResult> { return { providerReference: `MOCK-${input.transactionId}`, status: 'PENDING' }; }
  verifyWebhook(signature: string | undefined, rawPayload: string): boolean { return validHmac(signature, rawPayload, process.env.PAYOUT_WEBHOOK_SECRET || 'mock-development-secret'); }
  parseWebhook(payload: Record<string, unknown>) { return parseGenericWebhook(payload); }
}

export class DuitkuPayoutProvider implements PayoutProvider {
  readonly code = 'DUITKU';
  async createPayout(_input: PayoutRequest): Promise<PayoutResult> { throw new Error('Duitku payout provider is not configured for direct execution yet'); }
  verifyWebhook(signature: string | undefined, rawPayload: string): boolean { return validHmac(signature, rawPayload, process.env.DUITKU_WEBHOOK_SECRET || ''); }
  parseWebhook(payload: Record<string, unknown>) { return parseGenericWebhook(payload); }
}

export class XenditPayoutProvider implements PayoutProvider {
  readonly code = 'XENDIT';
  async createPayout(_input: PayoutRequest): Promise<PayoutResult> { throw new Error('Xendit payout provider is reserved for the next provider integration'); }
  verifyWebhook(signature: string | undefined, rawPayload: string): boolean { return validHmac(signature, rawPayload, process.env.XENDIT_WEBHOOK_SECRET || ''); }
  parseWebhook(payload: Record<string, unknown>) { return parseGenericWebhook(payload); }
}

export function createPayoutProvider(code = process.env.PAYOUT_MODE || 'MOCK'): PayoutProvider {
  switch (code.toUpperCase()) {
    case 'MOCK': return new MockPayoutProvider();
    case 'DUITKU': return new DuitkuPayoutProvider();
    case 'XENDIT': return new XenditPayoutProvider();
    default: throw new Error(`Unsupported payout provider: ${code}`);
  }
}

function validHmac(signature: string | undefined, payload: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const left = Buffer.from(signature.trim().toLowerCase(), 'utf8'); const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseGenericWebhook(payload: Record<string, unknown>): { eventId: string; eventType: string; providerReference: string; status: ProviderPayoutStatus } {
  const eventId = stringValue(payload.eventId ?? payload.event_id ?? payload.id);
  const providerReference = stringValue(payload.providerReference ?? payload.provider_reference ?? payload.reference ?? payload.referenceId);
  const eventType = stringValue(payload.eventType ?? payload.event_type ?? 'payout.update');
  const rawStatus = stringValue(payload.status).toUpperCase();
  const status: ProviderPayoutStatus = ['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PAID'].includes(rawStatus) ? 'COMPLETED' : ['FAILED', 'FAIL', 'REJECTED', 'CANCELLED'].includes(rawStatus) ? 'FAILED' : ['ACCEPTED'].includes(rawStatus) ? 'ACCEPTED' : 'PENDING';
  if (!eventId || !providerReference) throw new Error('Webhook payload requires eventId and providerReference');
  return { eventId, eventType, providerReference, status };
}
function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''; }
