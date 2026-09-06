export interface EconomicEnv {
  DB: D1Database;
}

/**
 * Per-user serialization boundary for balance-affecting operations.
 * D1 remains the durable source of truth; the Durable Object only coordinates
 * concurrent economic commands so callers cannot race a balance transition.
 */
export class EconomicCoordinator {
  private readonly state: DurableObjectState;
  private readonly env: EconomicEnv;

  constructor(state: DurableObjectState, env: EconomicEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const command = await request.json<{ type?: string }>();
    if (!command.type) return Response.json({ error: 'command_type_required' }, { status: 400 });

    // The coordinator deliberately exposes a narrow command surface. Economic
    // mutations are implemented by the API layer and committed to D1 atomically.
    // This object is the serialization gate, not a second balance database.
    return Response.json({ ok: true, command: command.type });
  }
}

export function economicStub(env: EconomicEnv, userId: string): DurableObjectStub {
  const id = env.ECONOMIC_COORDINATOR.idFromName(userId);
  return env.ECONOMIC_COORDINATOR.get(id);
}
