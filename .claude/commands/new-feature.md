Build the feature: $ARGUMENTS

Steps:
1. Read docs/features/$ARGUMENTS.md, docs/DESIGN.md, docs/DATABASE.md, and docs/AI_SYSTEM.md.
2. List the tables, actions, API endpoints, and screens you will create. Wait for my approval.
3. Add Zod schemas and types to packages/shared.
4. Add Drizzle tables and a migration in packages/db (with Row Level Security).
5. Add actions to the action registry in apps/server, with permission levels.
6. Add Fastify routes that call the actions.
7. Build the screens in apps/desktop using the design system components.
8. Write Vitest tests for actions and routes.
9. Tick the matching items in docs/ROADMAP.md.
