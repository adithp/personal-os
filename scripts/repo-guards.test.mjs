// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Automated guards for lessons we learned the hard way (docs/LESSONS.md). Each one fails loudly if
 * a known mistake comes back.
 */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));

describe('repo guards', () => {
  it('TypeScript stays below 6.1 (typescript-eslint does not support 7 yet)', () => {
    const version = json('package.json').devDependencies.typescript;
    expect(version).toMatch(/^6\.0\.\d+$/);
  });

  it('Prettier leaves the generated drizzle meta files alone', () => {
    expect(read('.prettierignore')).toContain('packages/db/drizzle/meta/');
  });

  it('ESLint skips agent worktrees (each holds a full copy of the repo)', () => {
    expect(read('eslint.config.js')).toContain('.claude/worktrees/');
    expect(read('.gitignore')).toContain('.claude/worktrees/');
  });

  it('agent worktrees branch from the current branch, not the default one', () => {
    expect(json('.claude/settings.json').worktree).toEqual({ baseRef: 'head' });
  });

  it('.env files stay unreadable for Claude', () => {
    const deny = json('.claude/settings.json').permissions.deny.join('\n');
    expect(deny).toContain('Read(./.env)');
    expect(deny).toContain('Read(./**/.env)');
    expect(deny).toContain('Bash(pnpm db:migrate)');
  });

  it('PGlite-based test projects have long hook timeouts (they start slowly when many files run)', () => {
    for (const project of ['apps/server', 'packages/db']) {
      expect(read(`${project}/vitest.config.ts`)).toMatch(/hookTimeout:\s*60_?000/);
    }
  });

  it('the desktop test setup provides what jsdom lacks (ResizeObserver, scrollIntoView)', () => {
    const setup = read('apps/desktop/src/test/setup.ts');
    expect(setup).toContain('ResizeObserver');
    expect(setup).toContain('scrollIntoView');
  });

  it('the docs hook is wired: hooks path script, prepare script, and the commit-msg hook', () => {
    const pkg = json('package.json');
    expect(pkg.scripts['docs:check']).toContain('docs-check.mjs');
    expect(pkg.scripts['hooks:install']).toContain('install-hooks.mjs');
    expect(pkg.scripts.prepare).toContain('install-hooks.mjs');
    expect(pkg.scripts.prepare).toContain('exit 0'); // a missing .git or script never fails an install
    expect(read('.githooks/commit-msg')).toContain('docs-check.mjs');
  });
});
