// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOCS_OK, checkChanges, globToRegex } from './docs-check.mjs';

const docMap = JSON.parse(readFileSync(new URL('../docs/doc-map.json', import.meta.url), 'utf8'));

const check = (files, dependenciesChanged) => checkChanges({ files, docMap, dependenciesChanged });
const names = (violations) =>
  violations.map((v) => (v.module ? `${v.entry}:${v.module}` : v.entry));

describe('globToRegex', () => {
  it('matches ** across folders, * inside a name, and {module}', () => {
    expect(globToRegex('apps/server/src/routes/**').test('apps/server/src/routes/a/b.ts')).toBe(
      true,
    );
    expect(globToRegex('**/Dockerfile').test('apps/server/Dockerfile')).toBe(true);
    expect(globToRegex('**/Dockerfile').test('Dockerfile')).toBe(true);
    expect(globToRegex('apps/*/package.json').test('apps/desktop/package.json')).toBe(true);
    expect(globToRegex('apps/*/package.json').test('apps/a/b/package.json')).toBe(false);
    expect(globToRegex('a/{module}/**').exec('a/tasks/x.ts')?.groups?.module).toBe('tasks');
  });

  it('treats dots literally', () => {
    expect(globToRegex('.env.example').test('.env.example')).toBe(true);
    expect(globToRegex('.env.example').test('xenvyexample')).toBe(false);
  });
});

describe('the doc map', () => {
  it('only points at docs that exist (or at module patterns)', () => {
    for (const entry of docMap.entries) {
      for (const doc of entry.docs.filter((d) => !d.includes('{module}'))) {
        expect(() => readFileSync(new URL(`../${doc}`, import.meta.url))).not.toThrow();
      }
    }
  });
});

describe('checkChanges', () => {
  it('passes when no mapped code changed', () => {
    expect(check(['README.md', 'LICENSE'])).toEqual([]);
  });

  it('fails a route change without docs/API.md, and names the doc and why', () => {
    const violations = check(['apps/server/src/routes/tasks.ts']);
    expect(names(violations)).toEqual(['API routes']);
    expect(violations[0]?.docs).toEqual(['docs/API.md']);
    expect(violations[0]?.why).toMatch(/API doc/);
  });

  it('passes when the mapped doc changed too', () => {
    expect(check(['apps/server/src/routes/tasks.ts', 'docs/API.md'])).toEqual([]);
  });

  it('ignores test files, the lockfile, generated files, and drizzle meta', () => {
    expect(
      check([
        'apps/server/src/routes/tasks.test.ts',
        'pnpm-lock.yaml',
        'apps/desktop/src/routeTree.gen.ts',
        'packages/db/drizzle/meta/_journal.json',
      ]),
    ).toEqual([]);
  });

  it('maps schema and migrations to DATABASE.md, actions to AI_SYSTEM.md, ui to DESIGN.md', () => {
    expect(names(check(['packages/db/src/schema/tags.ts']))).toEqual([
      'Database schema and migrations',
    ]);
    expect(names(check(['packages/db/drizzle/0004_x.sql']))).toEqual([
      'Database schema and migrations',
    ]);
    expect(names(check(['apps/server/src/actions/tasks.ts']))).toEqual(['Server actions']);
    expect(names(check(['packages/ui/src/components/button.tsx']))).toEqual([
      'Design system and desktop shell',
    ]);
    expect(names(check(['apps/desktop/src/shell/title-bar.tsx']))).toEqual([
      'Design system and desktop shell',
    ]);
  });

  it('maps a module to its own feature doc, per module', () => {
    const violations = check([
      'apps/desktop/src/modules/tasks/tasks-queries.ts',
      'apps/desktop/src/modules/settings/settings-page.tsx',
      'docs/features/tasks.md',
    ]);
    expect(names(violations)).toEqual(['Desktop module:settings']);
    expect(violations[0]?.docs).toEqual([
      'docs/features/settings.md',
      'docs/features/settings-*.md',
    ]);
  });

  it('accepts a module sub-doc such as tasks-redesign.md', () => {
    expect(
      check(['apps/desktop/src/modules/tasks/x.tsx', 'docs/features/tasks-redesign.md']),
    ).toEqual([]);
  });

  it('maps infra, Dockerfiles, env example, workflows, and hooks to the deployment or security doc', () => {
    for (const file of [
      'infra/docker-compose.yml',
      'apps/server/Dockerfile',
      '.env.example',
      '.github/workflows/ci.yml',
      '.githooks/commit-msg',
    ]) {
      expect(names(check([file]))).toEqual(['Deployment and environment']);
      expect(check([file, 'docs/SECURITY.md'])).toEqual([]);
      expect(check([file, 'docs/DEPLOYMENT.md'])).toEqual([]);
    }
  });

  it('asks about ARCHITECTURE.md only when dependencies changed in a package.json', () => {
    expect(check(['apps/desktop/package.json'], () => false)).toEqual([]);
    expect(names(check(['apps/desktop/package.json'], () => true))).toEqual(['Dependencies']);
    expect(check(['apps/desktop/package.json', 'docs/ARCHITECTURE.md'], () => true)).toEqual([]);
  });

  it('lists every failing area at once', () => {
    const violations = check([
      'apps/server/src/routes/tasks.ts',
      'packages/db/src/schema/tags.ts',
      'apps/server/src/actions/tasks.ts',
    ]);
    expect(names(violations)).toEqual([
      'API routes',
      'Database schema and migrations',
      'Server actions',
    ]);
  });
});

describe('the [docs-ok] marker', () => {
  it('needs a reason', () => {
    expect(DOCS_OK.test('fix: typo\n\n[docs-ok] no behavior change')).toBe(true);
    expect(DOCS_OK.test('fix: typo [docs-ok]')).toBe(false);
    expect(DOCS_OK.test('fix: typo')).toBe(false);
  });
});
