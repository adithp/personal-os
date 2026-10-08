import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWTVerifyGetKey,
} from 'jose';
import { createJwtVerifier, issuerFor, type JwtVerifier } from '../auth/verify-jwt';

export const TEST_SUPABASE_URL = 'https://abcdefgh.supabase.co';
export const USER_ID = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
export const OTHER_USER_ID = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';

export interface TestKeys {
  keys: JWTVerifyGetKey;
  verifier: JwtVerifier;
  /** Signs with the key the verifier trusts. */
  sign: (options?: SignOptions) => Promise<string>;
  /** Signs with a different key the verifier has never seen. */
  signWithUnknownKey: (options?: SignOptions) => Promise<string>;
}

export interface SignOptions {
  sub?: string | null;
  /** null leaves the email claim out. */
  email?: string | null;
  role?: string;
  issuer?: string;
  audience?: string;
  /** Seconds from now; negative means already expired. Default one hour. */
  expiresIn?: number | null;
  alg?: 'ES256' | 'RS256';
  extra?: Record<string, unknown>;
}

async function signWith(privateKey: CryptoKey, kid: string, options: SignOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({
    ...(options.email === null ? {} : { email: options.email ?? 'me@example.com' }),
    role: options.role ?? 'authenticated',
    ...options.extra,
  })
    .setProtectedHeader({ alg: options.alg ?? 'ES256', kid })
    .setIssuedAt(now)
    .setIssuer(options.issuer ?? issuerFor(TEST_SUPABASE_URL))
    .setAudience(options.audience ?? 'authenticated');
  if (options.sub !== null) jwt.setSubject(options.sub ?? USER_ID);
  if (options.expiresIn !== null) jwt.setExpirationTime(now + (options.expiresIn ?? 3600));
  return jwt.sign(privateKey);
}

/** A trusted signing key (like Supabase's) and a stranger's key, both generated fresh. */
export async function createTestKeys(): Promise<TestKeys> {
  const trusted = await generateKeyPair('ES256');
  const stranger = await generateKeyPair('ES256');
  const jwk = {
    ...(await exportJWK(trusted.publicKey)),
    kid: 'test-key',
    alg: 'ES256',
    use: 'sig',
  };
  const keys = createLocalJWKSet({ keys: [jwk] });

  return {
    keys,
    verifier: createJwtVerifier({ supabaseUrl: TEST_SUPABASE_URL, keys }),
    sign: (options = {}) => signWith(trusted.privateKey, 'test-key', options),
    signWithUnknownKey: (options = {}) => signWith(stranger.privateKey, 'stranger-key', options),
  };
}
