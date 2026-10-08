import { describe, expect, it } from 'vitest';
import { loginSchema } from './auth';
import { parseDesktopEnv } from './env';

describe('loginSchema', () => {
  it('accepts an email and a password and trims the email', () => {
    expect(loginSchema.parse({ email: '  me@example.com ', password: 'secret' })).toEqual({
      email: 'me@example.com',
      password: 'secret',
    });
  });

  it('keeps spaces inside the password', () => {
    expect(loginSchema.parse({ email: 'me@example.com', password: ' pass word ' }).password).toBe(
      ' pass word ',
    );
  });

  it.each([
    [{ email: '', password: 'x' }, 'Enter your email'],
    [{ email: '   ', password: 'x' }, 'Enter your email'],
    [{ email: 'not-an-email', password: 'x' }, 'Enter a valid email'],
    [{ email: 'me@example.com', password: '' }, 'Enter your password'],
  ])('rejects %j with "%s"', (input, message) => {
    const result = loginSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(message);
  });
});

const valid = {
  VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.some-public-anon-key',
  VITE_API_URL: 'https://mydomain.duckdns.org/api/v1',
};

describe('parseDesktopEnv', () => {
  it('accepts a complete env', () => {
    expect(parseDesktopEnv(valid)).toEqual({ ok: true, env: valid });
  });

  it('allows the API URL to be missing or empty', () => {
    expect(parseDesktopEnv({ ...valid, VITE_API_URL: undefined }).ok).toBe(true);
    expect(parseDesktopEnv({ ...valid, VITE_API_URL: '' }).ok).toBe(true);
  });

  it('ignores unrelated variables such as MODE and DEV', () => {
    expect(parseDesktopEnv({ ...valid, MODE: 'development', DEV: true }).ok).toBe(true);
  });

  it('names every missing variable', () => {
    const result = parseDesktopEnv({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.join('\n')).toContain('VITE_SUPABASE_URL');
    expect(result.issues.join('\n')).toContain('VITE_SUPABASE_ANON_KEY');
  });

  it('rejects the placeholder values from .env.example', () => {
    const result = parseDesktopEnv({
      VITE_SUPABASE_URL: 'https://xxxx.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'replace-me',
      VITE_API_URL: 'https://yourname.duckdns.org/api/v1',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(3);
  });

  it('rejects a Supabase URL that is not a URL', () => {
    expect(parseDesktopEnv({ ...valid, VITE_SUPABASE_URL: 'abcdefgh.supabase.co' }).ok).toBe(false);
  });

  it('never repeats the values in its messages', () => {
    const result = parseDesktopEnv({ ...valid, VITE_SUPABASE_ANON_KEY: 'replace-me' });
    if (result.ok) throw new Error('should fail');
    expect(result.issues.join('\n')).not.toContain('replace-me');
  });
});
