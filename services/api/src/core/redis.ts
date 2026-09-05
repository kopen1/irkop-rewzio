import { createConnection, type Socket } from 'node:net';

function parseRedisUrl(redisUrl: string): { host: string; port: number; password?: string; database: number } {
  const url = new URL(redisUrl);
  if (url.protocol !== 'redis:') throw new Error('REDIS_URL must use redis://');
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(database) || database < 0) throw new Error('Invalid Redis database number');
  const target: { host: string; port: number; password?: string; database: number } = { host: url.hostname || '127.0.0.1', port: Number(url.port) || 6379, database };
  if (url.password) target.password = decodeURIComponent(url.password);
  return target;
}

function command(parts: string[]): string { return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`; }

export class RedisConnection {
  private socket: Socket | null = null;
  private buffer = '';
  private pending: { resolve: (value: string) => void; reject: (error: Error) => void } | null = null;
  constructor(private readonly redisUrl: string) {}

  async connect(): Promise<void> {
    if (this.socket) return;
    const target = parseRedisUrl(this.redisUrl);
    const socket = createConnection({ host: target.host, port: target.port });
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on('data', (chunk: Uint8Array) => this.onData(Buffer.from(chunk).toString('utf8')));
    socket.on('error', (error: Error) => this.fail(error));
    socket.on('close', () => { this.socket = null; this.fail(new Error('Redis connection closed')); });
    await new Promise<void>((resolve, reject) => {
      const onConnect = (): void => { socket.off('error', onError); resolve(); };
      const onError = (error: Error): void => { socket.off('connect', onConnect); this.socket = null; reject(error); };
      socket.once('connect', onConnect); socket.once('error', onError);
    });
    if (target.password) await this.send(['AUTH', target.password]);
    if (target.database > 0) await this.send(['SELECT', String(target.database)]);
    await this.send(['PING']);
  }

  async ping(): Promise<void> { if (!this.socket) await this.connect(); await this.send(['PING']); }

  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    if (!this.socket) await this.connect();
    const count = Number(await this.send(['INCR', key]));
    if (count === 1) await this.send(['EXPIRE', key, String(ttlSeconds)]);
    return count;
  }

  async close(): Promise<void> {
    const socket = this.socket; this.socket = null;
    if (!socket) return;
    socket.end();
    await new Promise<void>((resolve) => socket.once('close', () => resolve()));
  }

  private async send(parts: string[]): Promise<string> {
    const socket = this.socket;
    if (!socket) throw new Error('Redis is not connected');
    return new Promise<string>((resolve, reject) => { this.pending = { resolve, reject }; socket.write(command(parts)); });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    const end = this.buffer.indexOf('\r\n');
    if (end === -1 || !this.pending) return;
    const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 2);
    const pending = this.pending; this.pending = null;
    if (line.startsWith('-')) pending.reject(new Error(line.slice(1)));
    else if (line.startsWith('$')) {
      const length = Number(line.slice(1));
      if (length === -1) pending.resolve('');
      else if (this.buffer.length >= length + 2) { const value = this.buffer.slice(0, length); this.buffer = this.buffer.slice(length + 2); pending.resolve(value); }
      else { this.pending = pending; this.buffer = line + '\r\n' + this.buffer; }
    } else pending.resolve(line.slice(1));
  }

  private fail(error: Error): void { const pending = this.pending; this.pending = null; pending?.reject(error); }
}

export async function connectRedis(redis: RedisConnection): Promise<void> { await redis.connect(); }
