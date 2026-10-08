import { EXPECTED_MIGRATIONS } from '@personal-os/db';
import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadEnv } from '../config/env';
import {
  OTHER_USER_ID,
  TEST_DATABASE_URL,
  TEST_SUPABASE_URL,
  USER_ID,
  createTestKeys,
  type TestKeys,
} from '../test/jwt';
import {
  createSchemaGuard,
  isSchemaError,
  SCHEMA_BEHIND_MESSAGE,
  type SchemaGuard,
} from './schema-guard';
import type { Db } from './user-scope';

let t: TestDb;
let keys: TestKeys;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  keys = await createTestKeys();
  db = t.db;
});

afterAll(async () => {
  await t.close();
});

/** Makes drizzle's migrations table with the first `count` migrations recorded as applied. */
async function recordApplied(count: number | null) {
  await t.db.execute(sql`drop schema if exists drizzle cascade`);
  if (count === null) return; // no migrations table at all
  await t.db.execute(sql`create schema drizzle`);
  await t.db.execute(
    sql`create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
  );
  for (const migration of EXPECTED_MIGRATIONS.slice(0, count)) {
    await t.db.execute(
      sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('x', ${migration.when})`,
    );
  }
}

beforeEach(async () => {
  await recordApplied(EXPECTED_MIGRATIONS.length);
});

describe('the code knows its migrations', () => {
  it('lists every migration file in order', () => {
    expect(EXPECTED_MIGRATIONS.length).toBeGreaterThanOrEqual(6);
    expect(EXPECTED_MIGRATIONS[0]?.tag).toBe('0000_entities_and_links');
    const times = EXPECTED_MIGRATIONS.map((m) => m.when);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('createSchemaGuard', () => {
  it('says the schema is fine when every migration is applied', async () => {
    expect(await createSchemaGuard(db).check()).toEqual({ behind: false, missing: [] });
  });

  it('names the migration files that are missing, oldest first', async () => {
    await recordApplied(EXPECTED_MIGRATIONS.length - 2);
    const status = await createSchemaGuard(db).check();
    expect(status.behind).toBe(true);
    expect(status.missing).toEqual(EXPECTED_MIGRATIONS.slice(-2).map((m) => `${m.tag}.sql`));
  });

  it('treats a database with no migrations table as having applied nothing', async () => {
    await recordApplied(null);
    const status = await createSchemaGuard(db).check();
    expect(status.missing).toHaveLength(EXPECTED_MIGRATIONS.length);
  });

  it('is read-only: it never changes the migrations table', async () => {
    await recordApplied(1);
    await createSchemaGuard(db).check();
    const rows = await t.pg.query('select count(*)::int as n from drizzle.__drizzle_migrations');
    expect((rows.rows[0] as { n: number }).n).toBe(1);
  });

  it('passes on other database errors (like a dead connection) instead of guessing', async () => {
    const broken = {
      execute: () => Promise.reject(new Error('connection refused')),
    } as unknown as Db;
    await expect(createSchemaGuard(broken).check()).rejects.toThrow('connection refused');
  });
});

describe('isSchemaError', () => {
  const withCode = (code: string) => Object.assign(new Error('x'), { code });

  it('recognises a missing table or column, also when wrapped', () => {
    expect(isSchemaError(withCode('42P01'))).toBe(true);
    expect(isSchemaError(withCode('42703'))).toBe(true);
    expect(isSchemaError(new Error('wrapper', { cause: withCode('42703') }))).toBe(true);
  });

  it('ignores everything else', () => {
    expect(isSchemaError(withCode('23505'))).toBe(false);
    expect(isSchemaError(new Error('plain'))).toBe(false);
    expect(isSchemaError('text')).toBe(false);
  });
});

describe('the API while migrations are missing', () => {
  const env = loadEnv({
    SUPABASE_URL: TEST_SUPABASE_URL,
    DATABASE_URL: TEST_DATABASE_URL,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  });

  async function request(guard: SchemaGuard | undefined) {
    const app = buildApp({ env, verifier: keys.verifier, db, schemaGuard: guard });
    const token = await keys.sign({ sub: USER_ID });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: { authorization: `Bearer ${token}` },
    });
    await app.close();
    return response;
  }

  async function breakTasksTable() {
    await t.db.execute(sql`alter table tasks rename column due_all_day to old_due_all_day`);
  }
  async function fixTasksTable() {
    await t.db.execute(sql`alter table tasks rename column old_due_all_day to due_all_day`);
  }

  beforeEach(async () => {
    await t.db.execute(
      sql`truncate table entity_tags, tags, links, tasks, entities, auth.users cascade`,
    );
    await createTestUser(t.db, USER_ID);
    await createTestUser(t.db, OTHER_USER_ID);
  });

  it('answers 503 schema_behind with the plain message, not a 500', async () => {
    await recordApplied(EXPECTED_MIGRATIONS.length - 2);
    await breakTasksTable();
    try {
      const response = await request(createSchemaGuard(db));
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: { code: 'schema_behind', message: SCHEMA_BEHIND_MESSAGE },
      });
      expect(SCHEMA_BEHIND_MESSAGE).toBe('Database update needed: run pnpm db:migrate');
    } finally {
      await fixTasksTable();
    }
  });

  it('keeps a real bug a 500: a missing column with every migration applied is not "behind"', async () => {
    await breakTasksTable();
    try {
      const response = await request(createSchemaGuard(db));
      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({ error: { code: 'internal_error' } });
    } finally {
      await fixTasksTable();
    }
  });

  it('answers normally when the schema is fine', async () => {
    expect((await request(createSchemaGuard(db))).statusCode).toBe(200);
  });

  it('answers 500 for a schema error when no guard is given', async () => {
    await breakTasksTable();
    try {
      expect((await request(undefined)).statusCode).toBe(500);
    } finally {
      await fixTasksTable();
    }
  });

  it('falls back to 500 when the check itself cannot run', async () => {
    await breakTasksTable();
    try {
      const failing: SchemaGuard = { check: () => Promise.reject(new Error('down')) };
      expect((await request(failing)).statusCode).toBe(500);
    } finally {
      await fixTasksTable();
    }
  });
});
