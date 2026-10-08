import { describe, expect, it } from 'vitest';
import { DEFAULT_CORS_ORIGINS, EnvError, loadEnv } from './env';

const valid = { SUPABASE_URL: 'https://abcdefgh.supabase.co' };

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info',
      SUPABASE_URL: 'https://abcdefgh.supabase.co',
    });
    expect(env.corsOrigins).toEqual([...DEFAULT_CORS_ORIGINS]);
  });

  it('reads the port as a number', () => {
    expect(loadEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it.each(['0', '70000', 'abc', '3000.5', '-1'])('rejects the port %s', (PORT) => {
    expect(() => loadEnv({ ...valid, PORT })).toThrow(EnvError);
  });

  it('reads a comma-separated list of allowed origins', () => {
    expect(
      loadEnv({ ...valid, CORS_ORIGINS: ' https://a.example , http://localhost:1420,, ' })
        .corsOrigins,
    ).toEqual(['https://a.example', 'http://localhost:1420']);
  });

  it('falls back to the desktop origins for an empty list', () => {
    expect(loadEnv({ ...valid, CORS_ORIGINS: ' , ' }).corsOrigins).toEqual([
      ...DEFAULT_CORS_ORIGINS,
    ]);
  });

  it('allows the desktop app (Tauri and the dev server) by default', () => {
    expect(DEFAULT_CORS_ORIGINS).toContain('http://tauri.localhost');
    expect(DEFAULT_CORS_ORIGINS).toContain('http://127.0.0.1:1420');
  });

  it('fails clearly when SUPABASE_URL is missing', () => {
    expect(() => loadEnv({})).toThrow(EnvError);
    try {
      loadEnv({});
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as EnvError).message).toContain('SUPABASE_URL');
    }
  });

  it('rejects the example values from .env.example', () => {
    expect(() => loadEnv({ SUPABASE_URL: 'https://xxxx.supabase.co' })).toThrow(/example value/);
  });

  it('rejects a value that is not a URL', () => {
    expect(() => loadEnv({ SUPABASE_URL: 'abcdefgh.supabase.co' })).toThrow(EnvError);
  });

  it('rejects an unknown NODE_ENV or log level', () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(EnvError);
    expect(() => loadEnv({ ...valid, LOG_LEVEL: 'loud' })).toThrow(EnvError);
  });

  it('never repeats a secret value in the error', () => {
    try {
      loadEnv({ SUPABASE_URL: 'https://xxxx.supabase.co', PORT: 'super-secret-port-text' });
    } catch (error) {
      expect((error as EnvError).message).not.toContain('super-secret-port-text');
      expect((error as EnvError).message).not.toContain('xxxx.supabase.co');
    }
  });
});
