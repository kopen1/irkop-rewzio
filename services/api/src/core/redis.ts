import { createConnection, type Socket } from 'node:net';

function parseRedisUrl(redisUrl: string): { host: string; port: number; password?: string; database: number } {
  const url = new URL(redisUrl);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }
  if (url.protocol === 'rediss:') {
    throw new Error('REDIS_URL rediss:// is not supported by the built-in client');
  }
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(database) || database < 0) throw new Error('Invalid Redis database number');
  const password = url.password ? decodeURIComponent(url.password) : undefined;
  return { host: url.hostname || '127.0.0.1', port: Number(url.port) || 6379, password, database };
}

function command(parts: string[]): string {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`;
}

export class RedisConnection {
  private socket: Socket | null = null;
  private buffer = '';
  private pending: { resolve: () => void; reject: (error: Error) => void } | null = null;

  constructor(private readonly redisUrl: string) {}

  async connect(): Promise<void> {
    if (this.socket) return;
    const target = parseRedisUrl(this.redisUrl);
    const socket = createConnection({ host: target.host, port: target.port });
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on('data', (chunk: Uint8Array) => this.onData(Buffer.from(chunk).toString('utf8')));
    socket.on('error', (error: Error) => this.fail(error));
    socket.on('close', () => {
      this.socket = null;
      this.fail(new Error('Redis connection closed'));
    });

    await new Promise<void>((resolve, reject) => {
      const onConnect = (): void => {
        socket.off('error', onError);
        resolve();
      };
      const onError = (error: Error): void => {
        socket.off('connect', onConnect);
        this.socket = null;
        reject(error);
      };
      socket.once('connect', onConnect);
      socket.once('error', onError);
    });

    if (target.password) await this.send(['AUTH', target.password]);
    if (target.database > 0) await this.send(['SELECT', String(target.database)]);
    await this.send(['PING']);
  }

  async ping(): Promise<void> {
    if (!this.socket) await this.connect();
    await this.send(['PING']);
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.end();
    await new Promise<void>((resolve) => socket.once('close', () => resolve()));
  }

  private async send(parts: string[]): Promise<void> {
    const socket = this.socket;
    if (!socket) throw new Error('Redis is not connected');
    await new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject };
      socket.write(command(parts));
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    const end = this.buffer.indexOf('\r\n');
    if (end === -1 || !this.pending) return;
    const line = this.buffer.slice(0, end);
    this.buffer = this.buffer.slice(end + 2);
    const pending = this.pending;
    this.pending = null;
    if (line.startsWith('-')) pending.reject(new Error(line.slice(1)));
    else pending.resolve();
  }

  private fail(error: Error): void {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
  }
}

export async function connectRedis(redis: RedisConnection): Promise<void> {
  await redis.connect();
}
