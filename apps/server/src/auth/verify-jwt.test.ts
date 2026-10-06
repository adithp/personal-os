import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  OTHER_USER_ID,
  TEST_SUPABASE_URL,
  USER_ID,
  createTestKeys,
  type TestKeys,
} from '../test/jwt';
import {
  ALLOWED_ALGORITHMS,
  AuthError,
  createJwtVerifier,
  issuerFor,
  jwksUrlFor,
} from './verify-jwt';

let keys: TestKeys;

beforeAll(async () => {
  keys = await createTestKeys();
});

describe('where Supabase keeps its keys', () => {
  it('builds the JWKS address and the issuer from the project URL', () => {
    expect(jwksUrlFor(TEST_SUPABASE_URL).toString()).toBe(
      'https://abcdefgh.supabase.co/auth/v1/.well-known/jwks.json',
    );
    expect(issuerFor(TEST_SUPABASE_URL)).toBe('https://abcdefgh.supabase.co/auth/v1');
  });

  it('ignores a trailing slash or path on the project URL', () => {
    expect(jwksUrlFor('https://abcdefgh.supabase.co/').toString()).toBe(
      'https://abcdefgh.supabase.co/auth/v1/.well-known/jwks.json',
    );
    expect(issuerFor('https://abcdefgh.supabase.co/some/path')).toBe(
      'https://abcdefgh.supabase.co/auth/v1',
    );
  });

  it('only accepts asymmetric algorithms', () => {
    expect(ALLOWED_ALGORITHMS).toEqual(['ES256', 'RS256']);
  });
});

describe('verify', () => {
  it('accepts a valid token and returns the user', async () => {
    const user = await keys.verifier.verify(await keys.sign({ email: 'me@example.com' }));
    expect(user).toEqual({ id: USER_ID, email: 'me@example.com', role: 'authenticated' });
  });

  it('uses the token subject as the user id', async () => {
    const user = await keys.verifier.verify(await keys.sign({ sub: OTHER_USER_ID }));
    expect(user.id).toBe(OTHER_USER_ID);
  });

  it('allows a token without an email', async () => {
    const user = await keys.verifier.verify(await keys.sign({ email: null }));
    expect(user).toEqual({ id: USER_ID, email: null, role: 'authenticated' });
  });

  const rejected: [string, () => Promise<string>][] = [
    ['an expired token', () => keys.sign({ expiresIn: -60 })],
    ['a token with no expiry', () => keys.sign({ expiresIn: null })],
    ['a token with no subject', () => keys.sign({ sub: null })],
    ['a subject that is not a UUID', () => keys.sign({ sub: 'not-a-uuid' })],
    ['the wrong issuer', () => keys.sign({ issuer: 'https://evil.example/auth/v1' })],
    [
      'another project’s issuer',
      () => keys.sign({ issuer: 'https://zzzzzzzz.supabase.co/auth/v1' }),
    ],
    ['the wrong audience', () => keys.sign({ audience: 'anon' })],
    ['an unknown signing key', () => keys.signWithUnknownKey()],
    ['an empty string', () => Promise.resolve('')],
    ['a malformed token', () => Promise.resolve('not.a.jwt')],
    ['random text', () => Promise.resolve('hello world')],
    ['a cut-off token', async () => (await keys.sign()).slice(0, -10)],
  ];

  it.each(rejected)('rejects %s', async (_name, makeToken) => {
    await expect(keys.verifier.verify(await makeToken())).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects a token whose signature was tampered with', async () => {
    const token = await keys.sign();
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()),
        sub: OTHER_USER_ID,
      }),
    ).toString('base64url');
    await expect(
      keys.verifier.verify(`${header ?? ''}.${forged}.${signature ?? ''}`),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects an unsigned token (alg none)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: USER_ID,
        iss: issuerFor(TEST_SUPABASE_URL),
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url');
    await expect(keys.verifier.verify(`${header}.${payload}.`)).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects a token signed with a shared secret (HS256), even a well-formed one', async () => {
    const secret = new TextEncoder().encode('legacy-shared-jwt-secret-legacy-shared-jwt-secret');
    const token = await new SignJWT({ role: 'authenticated', email: 'me@example.com' })
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .setIssuer(issuerFor(TEST_SUPABASE_URL))
      .setAudience('authenticated')
      .setSubject(USER_ID)
      .setExpirationTime('1h')
      .sign(secret);
    await expect(keys.verifier.verify(token)).rejects.toBeInstanceOf(AuthError);
  });

  it('gives the same vague error for every problem', async () => {
    const messages = new Set<string>();
    for (const [, makeToken] of rejected) {
      try {
        await keys.verifier.verify(await makeToken());
      } catch (error) {
        messages.add((error as Error).message);
      }
    }
    expect([...messages]).toEqual(['Invalid token']);
  });

  it('works with the real Supabase key lookup configured (no network call until used)', () => {
    expect(() => createJwtVerifier({ supabaseUrl: TEST_SUPABASE_URL })).not.toThrow();
  });
});
