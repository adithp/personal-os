# Backend rules

- Node.js 22, TypeScript, Fastify.
- All routes are registered under /api/v1 by Fastify (Caddy does not strip paths). Health: /api/v1/health.
- Verify the Supabase JWT with jose against the Supabase JWKS on every route except /health (the Google callback joins that list in Step 4).
- The backend connects as the postgres role, which bypasses RLS. Every query on user data MUST go through the shared user-scope helper in src/lib so it is filtered by the verified user_id. Never query user tables without it. Tests must prove rows of one user_id can never be read, updated, or deleted with another user_id.
- Validate inputs with Zod schemas from packages/shared.
- Every data change goes through the action registry (src/actions) with the right permission level. The registry tells observers after each action; the ai_action_log observer is added in Step 3.
- AI calls only through OmniRoute using the Vercel AI SDK and the route names fast, smart, embed.
- Google calls only through src/integrations/google with encrypted tokens (Step 4; the folder does not exist yet).
- Scheduled jobs in src/jobs using croner, times in Asia/Kolkata (Step 3 and later; the folder does not exist yet).
- Never log tokens, email bodies, file contents, or SQL text and query parameters (the logger drops them from database errors).
