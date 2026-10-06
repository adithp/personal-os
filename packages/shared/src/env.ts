import { z } from 'zod';

/** True while a value is still the placeholder from .env.example. */
function isExampleValue(value: string): boolean {
  return value.includes('replace-me') || value.includes('xxxx') || value.includes('yourname');
}

const notExample = (value: string) => !isExampleValue(value);
const exampleMessage = 'still has the example value from .env.example';

/**
 * The only variables the desktop and mobile apps may have (docs/SECURITY.md).
 * The API URL is optional until the first screen that calls the backend.
 */
export const desktopEnvSchema = z.object({
  VITE_SUPABASE_URL: z
    .url('must be a full URL such as https://abcd.supabase.co')
    .refine(notExample, exampleMessage),
  VITE_SUPABASE_ANON_KEY: z.string().trim().min(1, 'is missing').refine(notExample, exampleMessage),
  VITE_API_URL: z
    .union([z.literal(''), z.url('must be a full URL').refine(notExample, exampleMessage)])
    .optional(),
});

export type DesktopEnv = z.infer<typeof desktopEnvSchema>;

export type EnvResult = { ok: true; env: DesktopEnv } | { ok: false; issues: string[] };

/**
 * Checks the raw env (import.meta.env). On failure returns readable lines that name the
 * variable and the problem and never include the values.
 */
export function parseDesktopEnv(raw: Record<string, unknown>): EnvResult {
  const result = desktopEnvSchema.safeParse(raw);
  if (result.success) return { ok: true, env: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => `${issue.path.join('.') || 'env'} ${issue.message}`),
  };
}
