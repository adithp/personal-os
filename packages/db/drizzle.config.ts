import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` only reads the schema. `pnpm db:migrate` is run by the owner and gets
// DATABASE_URL from apps/server/.env (see the script in package.json).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  schemaFilter: ['public'],
  // Knows the Supabase roles (anon, authenticated, …) so policies are generated correctly
  entities: { roles: { provider: 'supabase' } },
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
