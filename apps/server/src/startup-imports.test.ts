// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  // The Docker image holds only the bundled file, so a package loaded at run time (a require that
  // the bundler cannot see) is missing there (lesson 2026-10-14: rrule). Build the bundle like the
  // Dockerfile does and start it with no settings: it must stop for the missing settings, never
  // for a missing module.
  it('starts the production bundle far enough to read its settings', () => {
    const out = mkdtempSync(join(tmpdir(), 'personal-os-bundle-'));
    try {
      execFileSync('pnpm', ['exec', 'tsup', '--out-dir', out, '--no-sourcemap'], {
        cwd: serverFolder,
        encoding: 'utf8',
        timeout: 120_000,
        shell: process.platform === 'win32',
      });
      const result = spawnSync(process.execPath, [join(out, 'index.js')], {
        cwd: out,
        encoding: 'utf8',
        timeout: 30_000,
        env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production' },
      });
      const text = `${result.stdout}${result.stderr}`;
      expect(text).not.toContain('Cannot find module');
      expect(text).not.toContain('MODULE_NOT_FOUND');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 180_000);
});
