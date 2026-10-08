import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/shared',
      'packages/db',
      'packages/ui',
      'apps/server',
      'apps/desktop',
      'infra',
    ],
  },
});
