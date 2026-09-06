export interface EconomicEnv {
  DB: D1Database;
  ECONOMIC_COORDINATOR: DurableObjectNamespace;
}

/** Per-user serialization boundary. D1 remains the economic source of truth. */
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
    return Response.json({ ok: true, command: command.type });
  }
}

export function economicStub(env: EconomicEnv, userId: string): DurableObjectStub {
  const id = env.ECONOMIC_COORDINATOR.idFromName(userId);
  return env.ECONOMIC_COORDINATOR.get(id);
}
