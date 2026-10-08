// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Checks the CI workflow file (.github/workflows/ci.yml) without running GitHub Actions. */
const root = fileURLToPath(new URL('../', import.meta.url));
const ci = readFileSync(root + '.github/workflows/ci.yml', 'utf8').replace(/\r\n/g, '\n');

describe('CI workflow', () => {
  it('runs on every push and pull request', () => {
    expect(ci).toMatch(/^on:\n {2}push:\n {2}pull_request:/m);
  });

  it('runs lint, tests, and the build, in that order, from the lockfile', () => {
    const steps = ['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm test', 'pnpm build'];
    const positions = steps.map((step) => ci.indexOf(`- run: ${step}`));
    for (const position of positions) expect(position).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('uses Node 22 and the pnpm version from package.json', () => {
    expect(ci).toContain('node-version: 22');
    expect(ci).toContain('pnpm/action-setup@v4');
    expect(ci).not.toMatch(/pnpm\/action-setup@v4\n\s+with:\n\s+version:/);
  });

  it('can only read the repository and uses no secrets', () => {
    expect(ci).toMatch(/permissions:\n {2}contents: read/);
    expect(ci).not.toContain('secrets.');
  });
});
