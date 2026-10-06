# Conventions

## Code
- TypeScript strict mode everywhere. No any.
- Files and folders: kebab-case. React components: PascalCase. Functions and variables: camelCase. Database: snake_case.
- One module per folder in apps/desktop/src/modules and apps/server/src/actions.
- Shared types and Zod schemas only in packages/shared.
- Design tokens and shared components only in packages/ui.
- Validate every input at the API boundary with Zod.
- Every data change goes through an action.
- Money in integer paise; format with Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).
- Store UTC, display Asia/Kolkata.

## Tools
- pnpm workspaces, ESLint, Prettier, Vitest.

## Tests
- Every action: success, invalid input, permission behavior, undo.
- Every API route: auth required, validation, happy path.

## Git
- Branch per roadmap step: step-1-foundation, step-2-tasks-notes, ...
- Conventional Commits: feat:, fix:, docs:, refactor:, test:, chore:.
- Never commit .env files.
