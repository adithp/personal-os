import type { JWTVerifyGetKey } from 'jose';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

/** The signed-in user, taken from a verified Supabase token. */
export interface AuthUser {
  /** Supabase auth user id (the token's "sub"). Every query is scoped by it. */
  id: string;
  email: string | null;
  role: string;
}

export interface JwtVerifier {
  /** Returns the user for a valid token. Rejects with AuthError for any problem. */
  verify: (token: string) => Promise<AuthUser>;
}

/** Any token problem. The reason is deliberately vague so callers cannot probe the checks. */
export class AuthError extends Error {
  constructor() {
    super('Invalid token');
    this.name = 'AuthError';
  }
}

/** Supabase signs tokens with asymmetric keys. HS256 is refused so a shared secret never works. */
export const ALLOWED_ALGORITHMS = ['ES256', 'RS256'];

/** Audience of tokens for signed-in users. */
export const AUDIENCE = 'authenticated';

function baseFor(supabaseUrl: string): URL {
  const url = new URL(supabaseUrl);
  return new URL(`${url.origin}/`);
}

/** Where Supabase publishes its public signing keys. */
export function jwksUrlFor(supabaseUrl: string): URL {
  return new URL('auth/v1/.well-known/jwks.json', baseFor(supabaseUrl));
}

/** The "iss" that tokens from this project must carry. */
export function issuerFor(supabaseUrl: string): string {
  return new URL('auth/v1', baseFor(supabaseUrl)).toString();
}

const claimsSchema = z.object({
  sub: z.uuid(),
  email: z.string().optional(),
  role: z.string().min(1),
});

export interface JwtVerifierOptions {
  supabaseUrl: string;
  /** Key lookup. Defaults to the project's remote JWKS; tests pass a local key set. */
  keys?: JWTVerifyGetKey;
}

/** Checks Supabase access tokens: signature, issuer, audience, expiry, and algorithm. */
export function createJwtVerifier({ supabaseUrl, keys }: JwtVerifierOptions): JwtVerifier {
  const issuer = issuerFor(supabaseUrl);
  const getKey =
    keys ??
    createRemoteJWKSet(jwksUrlFor(supabaseUrl), {
      timeoutDuration: 5000,
      cooldownDuration: 30_000,
    });

  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, getKey, {
          issuer,
          audience: AUDIENCE,
          algorithms: ALLOWED_ALGORITHMS,
          requiredClaims: ['exp', 'sub'],
        });
        const claims = claimsSchema.parse(payload);
        return { id: claims.sub, email: claims.email ?? null, role: claims.role };
      } catch {
        throw new AuthError();
      }
    },
  };
}
