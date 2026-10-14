import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpError } from '../lib/http-error';
import { createUserScope } from '../lib/user-scope';
import { createRegistry, type ActionContext } from '.';

/** Shared setup of the Money action tests (PGlite database, two users, run helpers). */

export const ALICE = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
export const BOB = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';
export const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';

export interface Undo {
  action: string;
  input: Record<string, unknown>;
}
export interface Result<T> {
  data: T;
  undo?: Undo | null;
}

export interface MoneyHarness {
  db: () => TestDb['db'];
  alice: () => ActionContext;
  bob: () => ActionContext;
  run: <T = Record<string, any>>(
    ctx: ActionContext,
    name: string,
    input: unknown,
  ) => Promise<Result<T>>;
}

/** Registers the hooks of a test file; call once at the top. */
export function useMoneyDb(): MoneyHarness {
  let t: TestDb;
  const registry = createRegistry();
  const context = (userId: string): ActionContext => ({
    scope: createUserScope(t.db, userId),
    source: 'ui',
    confirmed: true,
  });

  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await t.db.execute(
      sql`truncate table transactions, recurring_transactions, budgets, savings_goals, subscriptions, categories, wallets, entities, auth.users cascade`,
    );
    await createTestUser(t.db, ALICE);
    await createTestUser(t.db, BOB);
  });

  return {
    db: () => t.db,
    alice: () => context(ALICE),
    bob: () => context(BOB),
    run: async (ctx, name, input) => (await registry.run(ctx, name, input)) as never,
  };
}

export async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('failure', () => {
  it('gives back the error a promise rejects with, or undefined', async () => {
    const boom = new Error('boom');
    expect(await failure(Promise.reject(boom))).toBe(boom);
    expect(await failure(Promise.resolve(1))).toBeUndefined();
  });
});

/** Expects an HttpError with this status (and code). */
export async function fails(promise: Promise<unknown>, statusCode: number, code?: string) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(HttpError);
  expect(error).toMatchObject({ statusCode, ...(code ? { code } : {}) });
}

export function undoOf(result: Result<unknown>): Undo {
  if (!result.undo) throw new Error('Expected an undo');
  return result.undo;
}
