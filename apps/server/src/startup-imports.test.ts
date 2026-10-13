// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const serverFolder = fileURLToPath(new URL('..', import.meta.url));

describe('the server modules load in real Node', () => {
  // Vitest hides a problem that crashes the real server: a CommonJS package (rrule) imported by
  // name from an ES module works in tests but not in Node (lesson 2026-10-13)
  it('imports every action and route with tsx, like pnpm dev:server does', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "await import('./src/actions/index.ts'); await import('./src/routes/v1.ts'); console.log('loaded');",
      ],
      { cwd: serverFolder, encoding: 'utf8', timeout: 60_000 },
    );
    expect(output).toContain('loaded');
  }, 90_000);
});
