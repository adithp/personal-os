import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    include: ['src/**/*.test.ts'],
    // The in-memory Postgres (PGlite) starts slowly when many test files run at once
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
