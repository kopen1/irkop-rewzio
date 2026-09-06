declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number; last_row_id?: number } }>;
}

declare interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T extends D1PreparedStatement>(statements: T[]): Promise<Array<{ meta: { changes?: number; last_row_id?: number } }>>;
}

declare interface DurableObjectNamespace { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): DurableObjectStub; }
declare interface DurableObjectId { toString(): string; }
declare interface DurableObjectStub { fetch(request: Request): Promise<Response>; }
declare interface DurableObjectState { storage: unknown; }
declare interface Queue { send(message: unknown): Promise<void>; }
declare interface Message<T> { id: string; body: T; ack(): void; retry(options?: { delaySeconds?: number }): void; }
declare interface MessageBatch<T> { messages: Message<T>[]; queue: string; }
