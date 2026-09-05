declare const process: {
  env: Record<string, string | undefined>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  exitCode: number;
};

declare const Buffer: {
  byteLength(value: string): number;
  from(value: Uint8Array | string): { toString(encoding?: string): string };
};

declare module 'node:net' {
  export interface Socket {
    setNoDelay(noDelay?: boolean): void;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    write(data: string): boolean;
    end(): void;
  }
  export function createConnection(options: { host: string; port: number }): Socket;
}
