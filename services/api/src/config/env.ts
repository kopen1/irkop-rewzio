export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  appName: string;
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  corsOrigin: string;
  logLevel: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validUrl(name: string, value: string, protocols: string[]): string {
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) throw new Error();
    return value;
  } catch {
    throw new Error(`Invalid ${name}: expected ${protocols.join(' or ')} URL`);
  }
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid ${name}: expected an integer between 1 and 65535`);
  }
  return value;
}

function nodeEnv(): AppConfig['nodeEnv'] {
  const value = process.env.NODE_ENV?.trim() || 'development';
  if (value !== 'development' && value !== 'test' && value !== 'production') {
    throw new Error(`Invalid NODE_ENV: ${value}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const databaseUrl = required('DATABASE_URL');
  const redisUrl = required('REDIS_URL');
  return {
    nodeEnv: nodeEnv(),
    appName: process.env.APP_NAME?.trim() || 'rewzio',
    host: process.env.HOST?.trim() || '0.0.0.0',
    port: numberEnv('PORT', 3001),
    databaseUrl: validUrl('DATABASE_URL', databaseUrl, ['postgresql:', 'postgres:']),
    redisUrl: validUrl('REDIS_URL', redisUrl, ['redis:']),
    corsOrigin: process.env.CORS_ORIGIN?.trim() || '*',
    logLevel: process.env.LOG_LEVEL?.trim() || 'info',
  };
}
