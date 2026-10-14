import { createTestDb, createTestUser, type TestDb } from '@personal-os/db/testing';
import { addDays, indiaDay } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const env = loadEnv({
  SUPABASE_URL: TEST_SUPABASE_URL,
  DATABASE_URL: TEST_DATABASE_URL,
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
});

let t: TestDb;
let keys: TestKeys;
let app: FastifyInstance;
let alice: Record<string, string>;
let bob: Record<string, string>;

beforeAll(async () => {
  t = await createTestDb();
  keys = await createTestKeys();
  alice = { authorization: `Bearer ${await keys.sign({ sub: USER_ID })}` };
  bob = { authorization: `Bearer ${await keys.sign({ sub: OTHER_USER_ID })}` };
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(
    sql`truncate table transactions, recurring_transactions, budgets, savings_goals, subscriptions, categories, wallets, entities, auth.users cascade`,
  );
  await createTestUser(t.db, USER_ID);
  await createTestUser(t.db, OTHER_USER_ID);
  app = buildApp({ env, verifier: keys.verifier, db: t.db });
});

afterEach(async () => {
  await app.close();
});

const MISSING = '8d3a4c55-0b2e-4e0e-9a56-5f4d0a1b2c3d';
const today = () => indiaDay(new Date());

const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  headers: Record<string, string> = alice,
  payload?: unknown,
) => app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as object | undefined });

interface Written<T = Record<string, any>> {
  item: T;
  undo: { action: string; input: Record<string, unknown> } | null;
}
const write = async (method: 'POST' | 'PATCH' | 'PUT', url: string, payload: unknown, headers = alice) =>
  (await call(method, url, headers, payload)).json<Written>();
const items = async (url: string, headers = alice) =>
  (await call('GET', url, headers)).json<{ items: Record<string, any>[] }>().items;

describe('login is required on every money route', () => {
  it.each([
    ['GET', '/wallets'],
    ['POST', '/wallets'],
    ['PATCH', `/wallets/${MISSING}`],
    ['DELETE', `/wallets/${MISSING}`],
    ['POST', `/wallets/${MISSING}/restore`],
    ['GET', '/categories'],
    ['GET', '/transactions'],
    ['POST', '/recurring-transactions/run'],
    ['GET', '/budgets'],
    ['PUT', '/budgets'],
    ['GET', '/savings-goals'],
    ['POST', `/savings-goals/${MISSING}/contribute`],
    ['GET', '/finance/summary'],
    ['GET', '/subscriptions'],
    ['GET', '/subscriptions/upcoming'],
    ['POST', `/subscriptions/${MISSING}/renew`],
  ])('%s %s answers 401 with no token', async (method, url) => {
    const response = await call(method as 'GET', url, {}, method === 'GET' ? undefined : {});
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });
});

describe('wallets, categories and transactions', () => {
  it('creates a wallet (201), lists balances, hides archived ones, and undoes', async () => {
    const response = await call('POST', '/wallets', alice, { name: 'HDFC', openingBalancePaise: 5000 });
    expect(response.statusCode).toBe(201);
    const created = response.json<Written>();
    expect(created.item).toMatchObject({ name: 'HDFC', balancePaise: 5000 });
    expect(created.undo).toEqual({ action: 'finance.wallets.delete', input: { id: created.item.id } });
    const archived = await write('PATCH', `/wallets/${created.item.id}`, { archived: true });
    expect(await items('/wallets')).toEqual([]);
    expect(await items('/wallets?includeArchived=true')).toHaveLength(1);
    await call('POST', '/undo', alice, archived.undo);
    expect(await items('/wallets')).toHaveLength(1);
    expect(await items('/wallets', bob)).toEqual([]);
  });

  it('answers 400, 404 and 409 with the error format', async () => {
    const wallet = (await write('POST', '/wallets', { name: 'A' })).item;
    expect((await call('POST', '/wallets', alice, { name: '' })).statusCode).toBe(400);
    expect((await call('PATCH', `/wallets/${wallet.id}`, alice, {})).statusCode).toBe(400);
    expect((await call('PATCH', '/wallets/nope', alice, { name: 'x' })).statusCode).toBe(400);
    expect((await call('PATCH', `/wallets/${MISSING}`, alice, { name: 'x' })).statusCode).toBe(404);
    expect((await call('PATCH', `/wallets/${wallet.id}`, bob, { name: 'x' })).statusCode).toBe(404);
    const taken = await call('POST', '/wallets', alice, { name: 'a' });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ error: { code: 'name_taken' } });
    await call('POST', '/transactions', alice, { kind: 'income', amountPaise: 1, walletId: wallet.id });
    const inUse = await call('DELETE', `/wallets/${wallet.id}`);
    expect(inUse.statusCode).toBe(409);
    expect(inUse.json()).toMatchObject({ error: { code: 'wallet_in_use' } });
  });

  it('lists the default categories and manages one', async () => {
    expect((await items('/categories')).length).toBeGreaterThan(5);
    const created = await call('POST', '/categories', alice, { name: 'Pets', kind: 'expense' });
    expect(created.statusCode).toBe(201);
    const { item } = created.json<Written>();
    const deleted = await write('PATCH', `/categories/${item.id}`, { name: 'Dogs' });
    expect(deleted.item.name).toBe('Dogs');
    const removed = (await call('DELETE', `/categories/${item.id}`)).json<Written>();
    expect(removed.undo?.action).toBe('finance.categories.restore');
    const restored = await call('POST', `/categories/${item.id}/restore`);
    expect(restored.statusCode).toBe(200);
  });

  it('adds, filters, updates, deletes and restores transactions', async () => {
    const a = (await write('POST', '/wallets', { name: 'A' })).item;
    const b = (await write('POST', '/wallets', { name: 'B' })).item;
    const created = await call('POST', '/transactions', alice, {
      kind: 'transfer',
      amountPaise: 400,
      walletId: a.id,
      toWalletId: b.id,
      occurredOn: '2026-02-01',
      note: 'move',
    });
    expect(created.statusCode).toBe(201);
    const tx = created.json<Written>();
    await write('POST', '/transactions', { kind: 'expense', amountPaise: 100, walletId: a.id, occurredOn: '2026-01-01' });
    expect((await items('/transactions')).map((x) => x.amountPaise)).toEqual([400, 100]);
    expect((await items(`/transactions?walletId=${b.id}&limit=5&offset=0`)).map((x) => x.amountPaise)).toEqual([400]);
    expect((await items('/transactions?q=MOV&from=2026-01-15&kind=transfer')).map((x) => x.amountPaise)).toEqual([400]);
    expect((await call('GET', '/transactions?limit=0')).statusCode).toBe(400);
    expect((await call('GET', '/transactions?from=2026-02-30')).statusCode).toBe(400);
    expect((await call('POST', '/transactions', alice, { kind: 'transfer', amountPaise: 1, walletId: a.id })).statusCode).toBe(400);
    const updated = await write('PATCH', `/transactions/${tx.item.id}`, { amountPaise: 450 });
    expect(updated.item.amountPaise).toBe(450);
    const deleted = (await call('DELETE', `/transactions/${tx.item.id}`)).json<Written>();
    expect(await items('/transactions')).toHaveLength(1);
    await call('POST', '/undo', alice, deleted.undo);
    expect(await items('/transactions')).toHaveLength(2);
    expect((await call('DELETE', `/transactions/${tx.item.id}`, bob)).statusCode).toBe(404);
    expect(await items('/transactions', bob)).toEqual([]);
  });
});

describe('repeats, budgets, goals and the summary', () => {
  it('creates a repeat, runs it with { created }, and a second run creates nothing', async () => {
    const wallet = (await write('POST', '/wallets', { name: 'W' })).item;
    const created = await call('POST', '/recurring-transactions', alice, {
      kind: 'expense',
      amountPaise: 900,
      walletId: wallet.id,
      rule: 'FREQ=DAILY',
      startOn: addDays(today(), -1),
    });
    expect(created.statusCode).toBe(201);
    expect(await items('/recurring-transactions')).toHaveLength(1);
    const first = await call('POST', '/recurring-transactions/run');
    expect(first.statusCode).toBe(200);
    expect(first.json<{ created: unknown[] }>().created).toHaveLength(2);
    expect((await call('POST', '/recurring-transactions/run')).json()).toEqual({ created: [] });
    const { item } = created.json<Written>();
    const deleted = (await call('DELETE', `/recurring-transactions/${item.id}`)).json<Written>();
    expect(await items('/recurring-transactions')).toEqual([]);
    await call('POST', '/undo', alice, deleted.undo);
    expect(await items('/recurring-transactions')).toHaveLength(1);
    expect((await call('PATCH', `/recurring-transactions/${item.id}`, bob, { active: false })).statusCode).toBe(404);
  });

  it('sets budgets with PUT (200), lists progress for a month, and deletes', async () => {
    const wallet = (await write('POST', '/wallets', { name: 'W' })).item;
    const food = (await items('/categories')).find((c) => c.name === 'Food')!;
    const month = today().slice(0, 7);
    const set = await call('PUT', '/budgets', alice, { categoryId: food.id, month, amountPaise: 10000 });
    expect(set.statusCode).toBe(200);
    await call('POST', '/transactions', alice, { kind: 'expense', amountPaise: 2500, walletId: wallet.id, categoryId: food.id });
    expect(await items(`/budgets?month=${month}`)).toMatchObject([{ spentPaise: 2500, percent: 25 }]);
    expect(await items('/budgets')).toHaveLength(1);
    expect((await call('GET', '/budgets?month=bad')).statusCode).toBe(400);
    expect((await call('PUT', '/budgets', alice, { categoryId: MISSING, month, amountPaise: 1 })).statusCode).toBe(400);
    const { item, undo } = set.json<Written>();
    expect(undo?.action).toBe('finance.budgets.delete');
    expect((await call('DELETE', `/budgets/${item.id}`, bob)).statusCode).toBe(404);
    const deleted = (await call('DELETE', `/budgets/${item.id}`)).json<Written>();
    expect(deleted.undo?.action).toBe('finance.budgets.set');
    expect(await items('/budgets')).toEqual([]);
  });

  it('manages savings goals and contributes', async () => {
    const created = await call('POST', '/savings-goals', alice, { name: 'Trip', targetPaise: 10000 });
    expect(created.statusCode).toBe(201);
    const { item } = created.json<Written>();
    const added = await write('POST', `/savings-goals/${item.id}/contribute`, { deltaPaise: 2500 });
    expect(added.item).toMatchObject({ savedPaise: 2500, percent: 25 });
    expect((await call('POST', `/savings-goals/${item.id}/contribute`, alice, { deltaPaise: -9999 })).statusCode).toBe(400);
    expect((await call('POST', `/savings-goals/${item.id}/contribute`, bob, { deltaPaise: 1 })).statusCode).toBe(404);
    await call('POST', '/undo', alice, added.undo);
    expect((await items('/savings-goals'))[0]?.savedPaise).toBe(0);
    const deleted = (await call('DELETE', `/savings-goals/${item.id}`)).json<Written>();
    expect(await items('/savings-goals')).toEqual([]);
    expect((await call('POST', `/savings-goals/${item.id}/restore`)).statusCode).toBe(200);
    expect(deleted.undo?.action).toBe('finance.goals.restore');
    expect((await call('PATCH', `/savings-goals/${item.id}`, alice, { name: 'Trip 2' })).statusCode).toBe(200);
  });

  it('answers the summary as { summary }', async () => {
    const wallet = (await write('POST', '/wallets', { name: 'W' })).item;
    await call('POST', '/transactions', alice, { kind: 'expense', amountPaise: 300, walletId: wallet.id });
    const response = await call('GET', '/finance/summary');
    expect(response.statusCode).toBe(200);
    expect(response.json<{ summary: Record<string, unknown> }>().summary).toMatchObject({
      expensePaise: 300,
      incomePaise: 0,
      byCategory: [{ categoryId: null, totalPaise: 300 }],
    });
    expect((await call('GET', '/finance/summary?month=2026-1')).statusCode).toBe(400);
  });
});

describe('subscriptions', () => {
  it('lists with a summary, upcoming, and renews with an undo', async () => {
    const wallet = (await write('POST', '/wallets', { name: 'W' })).item;
    const created = await call('POST', '/subscriptions', alice, {
      name: 'Netflix',
      amountPaise: 64900,
      nextRenewalOn: addDays(today(), -1),
      walletId: wallet.id,
    });
    expect(created.statusCode).toBe(201);
    const { item } = created.json<Written>();
    const list = (await call('GET', '/subscriptions')).json<{ items: Record<string, any>[]; summary: Record<string, number> }>();
    expect(list.items[0]).toMatchObject({ overdue: true, daysUntilRenewal: -1 });
    expect(list.summary).toMatchObject({ activeCount: 1, monthlyPaise: 64900 });
    expect((await call('GET', '/subscriptions?status=paused')).json<{ items: unknown[] }>().items).toEqual([]);
    expect((await call('GET', '/subscriptions?status=nope')).statusCode).toBe(400);
    expect(await items('/subscriptions/upcoming?days=7')).toHaveLength(1);
    expect((await call('GET', '/subscriptions/upcoming?days=0')).statusCode).toBe(400);

    const renewed = await call('POST', `/subscriptions/${item.id}/renew`, alice, {});
    expect(renewed.statusCode).toBe(200);
    const body = renewed.json<Written<{ subscription: Record<string, any>; transaction: Record<string, any> | null }>>();
    expect(body.item.subscription.overdue).toBe(false);
    expect(body.item.transaction).toMatchObject({ amountPaise: 64900, subscriptionId: item.id });
    expect(await items('/transactions')).toHaveLength(1);
    await call('POST', '/undo', alice, body.undo);
    expect(await items('/transactions')).toEqual([]);
    expect((await items('/subscriptions'))[0]?.overdue).toBe(true);
  });

  it('answers 409 not_active, 404 for others, and handles update, delete and restore', async () => {
    const { item } = await write('POST', '/subscriptions', { name: 'X', amountPaise: 100, nextRenewalOn: today() });
    await write('PATCH', `/subscriptions/${item.id}`, { status: 'paused' });
    const refused = await call('POST', `/subscriptions/${item.id}/renew`, alice, {});
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: 'not_active' } });
    expect((await call('POST', `/subscriptions/${item.id}/renew`, bob, {})).statusCode).toBe(404);
    expect((await call('PATCH', `/subscriptions/${item.id}`, alice, {})).statusCode).toBe(400);
    const deleted = (await call('DELETE', `/subscriptions/${item.id}`)).json<Written>();
    expect(await items('/subscriptions')).toEqual([]);
    expect(deleted.undo?.action).toBe('subscriptions.restore');
    expect((await call('POST', `/subscriptions/${item.id}/restore`)).statusCode).toBe(200);
    expect(await items('/subscriptions', bob)).toEqual([]);
  });
});
