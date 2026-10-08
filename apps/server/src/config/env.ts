import { isExampleValue } from '@personal-os/shared';
import { z } from 'zod';

/** Origins of the Tauri desktop app: Windows release builds and the Vite dev server. */
export const DEFAULT_CORS_ORIGINS = [
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'http://localhost:1420',
  'http://127.0.0.1:1420',
] as const;

const notExample = (value: string) => !isExampleValue(value);

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Local machine only by default. The Docker image sets HOST=0.0.0.0 so Caddy can reach it. */
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Supabase project URL. Its public keys (JWKS) are used to check login tokens. */
  SUPABASE_URL: z
    .url('must be a full URL such as https://abcd.supabase.co')
    .refine(notExample, 'still has the example value from .env.example'),
  /** Supabase session pooler address (IPv4). Holds a password, so it is never logged. */
  DATABASE_URL: z
    .string()
    .trim()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// address')
    .refine(notExample, 'still has the example value from .env.example'),
  /** Comma-separated list of allowed browser origins. Defaults to the desktop app. */
  CORS_ORIGINS: z.string().optional(),
});

export type ServerEnvInput = z.infer<typeof serverEnvSchema>;

export interface ServerEnv extends Omit<ServerEnvInput, 'CORS_ORIGINS'> {
  corsOrigins: string[];
}

/** Thrown when the environment is not usable. The message names variables, never values. */
export class EnvError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid environment:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'EnvError';
    this.issues = issues;
  }
}

/** Reads and checks the settings (process.env). */
export function loadEnv(raw: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'} ${issue.message}`),
    );
  }
  const { CORS_ORIGINS, ...rest } = result.data;
  const listed = (CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return { ...rest, corsOrigins: listed.length > 0 ? listed : [...DEFAULT_CORS_ORIGINS] };
}
