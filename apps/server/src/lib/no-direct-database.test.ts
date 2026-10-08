// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Rule from apps/server/CLAUDE.md: the server connects as postgres (no RLS), so user data may
 * only be reached through the user-scope helper. These checks stop code from opening its own
 * database connection or running raw SQL outside src/lib.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  name: relative(SRC, path).replaceAll('\\', '/'),
  text: readFileSync(path, 'utf8'),
}));

const outsideLib = files.filter((file) => !file.name.startsWith('lib/'));

describe('database access rule', () => {
  it('finds the server source files', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((file) => file.name === 'lib/user-scope.ts')).toBe(true);
  });

  it.each([
    ['opens a connection with createDatabase', /createDatabase/],
    ['imports the postgres driver', /from ['"]postgres['"]/],
    ['imports the drizzle postgres-js driver', /drizzle-orm\/postgres-js/],
    ['runs raw SQL with db.execute', /\.execute\(/],
    ['imports the database test helpers', /@personal-os\/db\/testing/],
  ])('no file outside src/lib %s', (_rule, pattern) => {
    const offenders = outsideLib.filter((file) => pattern.test(file.text)).map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  it('the helper adds the owner to every kind of query', () => {
    const helper = files.find((file) => file.name === 'lib/user-scope.ts')?.text ?? '';
    expect(helper).toContain('eq(table.userId, id)');
    expect(helper).toMatch(/\.\.\.row, userId: id/);
    for (const method of ['select', 'insert', 'update', 'delete', 'softDelete']) {
      expect(helper).toContain(`${method}:`);
    }
  });

  it('the server rules document the requirement', () => {
    const rules = readFileSync(join(SRC, '..', 'CLAUDE.md'), 'utf8');
    expect(rules).toContain('user-scope helper');
    expect(rules).toContain('bypasses RLS');
  });
});
