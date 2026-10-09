import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'desktop',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Big page tests can pass 5 s when the machine is busy (a full run with the server tests)
    testTimeout: 20_000,
  },
});
