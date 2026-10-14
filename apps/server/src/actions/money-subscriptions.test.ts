import { addDays, indiaDay } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { MISSING, fails, failure, undoOf, useMoneyDb, type Result } from './money-test-utils.test';

const h = useMoneyDb();
const today = () => indiaDay(new Date());

interface Sub {
  id: string;
  name: string;
  status: string;
  nextRenewalOn: string;
  monthlyPaise: number;
  yearlyPaise: number;
  daysUntilRenewal: number;
  overdue: boolean;
  walletId: string | null;
}
interface Listed {
  items: Sub[];
  summary: { activeCount: number; monthlyPaise: number; yearlyPaise: number };
}
interface Renewed {
  subscription: Sub;
  transaction: {
    id: string;
    amountPaise: number;
    occurredOn: string;
    note: string | null;
    subscriptionId: string | null;
    kind: string;
  } | null;
}

const wallet = async (name = 'W', ctx = h.alice()) =>
  (
    await h.run<{ id: string }>(ctx, 'finance.wallets.create', {
      name,
      openingBalancePaise: 100000,
    })
  ).data;
const add = async (input: Record<string, unknown>) =>
  await h.run<Sub>(h.alice(), 'subscriptions.create', {
    name: 'Netflix',
    amountPaise: 64900,
    nextRenewalOn: today(),
    ...input,
  });
const list = async (input: Record<string, unknown> = {}, ctx = h.alice()) =>
  (await h.run<Listed>(ctx, 'subscriptions.list', input)).data;
const upcoming = async (input: Record<string, unknown> = {}, ctx = h.alice()) =>
  (await h.run<Sub[]>(ctx, 'subscriptions.upcoming', input)).data;
const renew = async (id: string, input: Record<string, unknown> = {}) =>
  await h.run<Renewed>(h.alice(), 'subscriptions.renew', { id, ...input });
const undo = (result: Result<unknown>) =>
  h.run(h.alice(), undoOf(result).action, undoOf(result).input);
const transactions = async () =>
  (await h.run<{ id: string }[]>(h.alice(), 'finance.transactions.list', {})).data;

describe('subscriptions.create, update, delete', () => {
  it('creates with costs, days until renewal and an undo that deletes it', async () => {
    const created = await add({
      cycle: 'weekly',
      amountPaise: 10000,
      nextRenewalOn: addDays(today(), 3),
    });
    expect(created.data).toMatchObject({
      status: 'active',
      monthlyPaise: Math.round((10000 * 52) / 12),
      yearlyPaise: 520000,
      daysUntilRenewal: 3,
      overdue: false,
    });
    await undo(created);
    expect((await list()).items).toEqual([]);
  });

  it('rejects bad input and foreign wallets or categories', async () => {
    const bobsWallet = await wallet('B', h.bob());
    const income = (
      await h.run<{ id: string; kind: string }[]>(h.alice(), 'finance.categories.list', {})
    ).data.find((c) => c.kind === 'income');
    expect(await failure(add({ amountPaise: 0 }))).toBeInstanceOf(ZodError);
    expect(await failure(add({ nextRenewalOn: '2026-13-01' }))).toBeInstanceOf(ZodError);
    expect(await failure(add({ cycle: 'daily' }))).toBeInstanceOf(ZodError);
    await fails(add({ walletId: bobsWallet.id }), 400);
    await fails(add({ walletId: MISSING }), 400);
    await fails(add({ categoryId: income?.id }), 400);
    expect((await list()).items).toEqual([]);
  });

  it('updates with an undo of the old values and pauses; summary counts active only', async () => {
    const a = await add({ name: 'A', amountPaise: 1200, cycle: 'monthly' });
    await add({ name: 'B', amountPaise: 1200, cycle: 'yearly' });
    expect((await list()).summary).toEqual({
      activeCount: 2,
      monthlyPaise: 1200 + 100,
      yearlyPaise: 14400 + 1200,
    });
    const paused = await h.run<Sub>(h.alice(), 'subscriptions.update', {
      id: a.data.id,
      status: 'paused',
      name: 'A2',
    });
    expect(paused.data).toMatchObject({ status: 'paused', name: 'A2', overdue: false });
    expect((await list()).summary).toEqual({
      activeCount: 1,
      monthlyPaise: 100,
      yearlyPaise: 1200,
    });
    expect((await list({ status: 'paused' })).items.map((s) => s.name)).toEqual(['A2']);
    await undo(paused);
    expect((await list()).items.find((s) => s.id === a.data.id)).toMatchObject({
      status: 'active',
      name: 'A',
    });
    expect(
      (await h.run(h.alice(), 'subscriptions.update', { id: a.data.id, name: 'A' })).undo,
    ).toBeNull();
  });

  it('orders by renewal day and flags overdue ones', async () => {
    await add({ name: 'Later', nextRenewalOn: addDays(today(), 10) });
    await add({ name: 'Late', nextRenewalOn: addDays(today(), -2) });
    await add({ name: 'Soon', nextRenewalOn: addDays(today(), 1) });
    const { items } = await list();
    expect(items.map((s) => s.name)).toEqual(['Late', 'Soon', 'Later']);
    expect(items.map((s) => s.overdue)).toEqual([true, false, false]);
    expect(items.map((s) => s.daysUntilRenewal)).toEqual([-2, 1, 10]);
    // Paused and cancelled ones are never overdue
    await h.run(h.alice(), 'subscriptions.update', { id: items[0]?.id, status: 'cancelled' });
    expect((await list()).items.find((s) => s.name === 'Late')?.overdue).toBe(false);
  });

  it('deletes softly with a restore undo, and is private', async () => {
    const { data } = await add({});
    await fails(h.run(h.bob(), 'subscriptions.update', { id: data.id, name: 'x' }), 404);
    await fails(h.run(h.bob(), 'subscriptions.delete', { id: data.id }), 404);
    await fails(h.run(h.bob(), 'subscriptions.restore', { id: data.id }), 404);
    await fails(h.run(h.bob(), 'subscriptions.renew', { id: data.id }), 404);
    expect((await list({}, h.bob())).items).toEqual([]);
    expect(await upcoming({}, h.bob())).toEqual([]);
    const deleted = await h.run(h.alice(), 'subscriptions.delete', { id: data.id });
    expect((await list()).items).toEqual([]);
    await fails(h.run(h.alice(), 'subscriptions.delete', { id: data.id }), 404);
    await undo(deleted);
    expect((await list()).items).toHaveLength(1);
    expect((await h.run(h.alice(), 'subscriptions.restore', { id: data.id })).undo).toBeNull();
  });
});

describe('subscriptions.upcoming', () => {
  it('lists active ones within the days, overdue included, in date order', async () => {
    await add({ name: 'Far', nextRenewalOn: addDays(today(), 40) });
    await add({ name: 'Edge', nextRenewalOn: addDays(today(), 30) });
    await add({ name: 'Overdue', nextRenewalOn: addDays(today(), -5) });
    await add({ name: 'Soon', nextRenewalOn: addDays(today(), 2) });
    const paused = await add({ name: 'Paused', nextRenewalOn: addDays(today(), 1) });
    await h.run(h.alice(), 'subscriptions.update', { id: paused.data.id, status: 'paused' });
    expect((await upcoming()).map((s) => s.name)).toEqual(['Overdue', 'Soon', 'Edge']);
    expect((await upcoming({ days: 7 })).map((s) => s.name)).toEqual(['Overdue', 'Soon']);
    expect(await failure(h.run(h.alice(), 'subscriptions.upcoming', { days: 0 }))).toBeInstanceOf(
      ZodError,
    );
  });
});

describe('subscriptions.renew and undo_renew', () => {
  it('moves the day one cycle on and books an expense in the wallet; the undo reverses both', async () => {
    const w = await wallet();
    const { data } = await add({ walletId: w.id, nextRenewalOn: '2030-01-31' });
    const renewed = await renew(data.id, { paidOn: '2030-01-30' });
    expect(renewed.data.subscription.nextRenewalOn).toBe('2030-02-28');
    expect(renewed.data.transaction).toMatchObject({
      kind: 'expense',
      amountPaise: 64900,
      occurredOn: '2030-01-30',
      note: 'Netflix',
      subscriptionId: data.id,
    });
    const balance = async () =>
      (await h.run<{ balancePaise: number }[]>(h.alice(), 'finance.wallets.list', {})).data[0]
        ?.balancePaise;
    expect(await balance()).toBe(100000 - 64900);
    expect(renewed.undo).toEqual({
      action: 'subscriptions.undo_renew',
      input: {
        id: data.id,
        previousRenewalOn: '2030-01-31',
        transactionId: renewed.data.transaction?.id,
      },
    });
    const undone = await undo(renewed);
    expect(undone.undo ?? null).toBeNull();
    expect((await list()).items[0]?.nextRenewalOn).toBe('2030-01-31');
    expect(await transactions()).toEqual([]);
    expect(await balance()).toBe(100000);
  });

  it.each([
    ['weekly', '2030-03-01', '2030-03-08'],
    ['monthly', '2030-03-15', '2030-04-15'],
    ['quarterly', '2030-03-15', '2030-06-15'],
    ['yearly', '2030-03-15', '2031-03-15'],
  ])('a %s subscription due %s renews to %s', async (cycle, from, to) => {
    const { data } = await add({ cycle, nextRenewalOn: from });
    const renewed = await renew(data.id, { paidOn: from });
    expect(renewed.data.subscription.nextRenewalOn).toBe(to);
  });

  it('keeps advancing until the renewal day is after the day it was paid', async () => {
    const { data } = await add({ cycle: 'monthly', nextRenewalOn: '2030-01-10' });
    const renewed = await renew(data.id, { paidOn: '2030-04-12' });
    expect(renewed.data.subscription.nextRenewalOn).toBe('2030-05-10');
  });

  it('defaults to today and renews an overdue subscription past today', async () => {
    const { data } = await add({ cycle: 'weekly', nextRenewalOn: addDays(today(), -10) });
    const renewed = await renew(data.id);
    expect(renewed.data.subscription.nextRenewalOn > today()).toBe(true);
    expect(renewed.data.subscription.overdue).toBe(false);
  });

  it('books nothing without a wallet or with createTransaction false', async () => {
    const w = await wallet();
    const noWallet = await add({ name: 'NoWallet' });
    const first = await renew(noWallet.data.id);
    expect(first.data.transaction).toBeNull();
    expect(first.undo?.input).toMatchObject({ transactionId: null });
    const withWallet = await add({ name: 'WithWallet', walletId: w.id });
    const second = await renew(withWallet.data.id, { createTransaction: false });
    expect(second.data.transaction).toBeNull();
    expect(await transactions()).toEqual([]);
    await undo(second);
    expect((await list()).items.find((s) => s.name === 'WithWallet')?.nextRenewalOn).toBe(today());
  });

  it('refuses a paused or cancelled subscription with 409 not_active', async () => {
    const { data } = await add({});
    for (const status of ['paused', 'cancelled']) {
      await h.run(h.alice(), 'subscriptions.update', { id: data.id, status });
      await fails(renew(data.id), 409, 'not_active');
    }
    await fails(renew(MISSING), 404);
  });

  it('undo_renew only deletes the transaction of that subscription', async () => {
    const w = await wallet();
    const a = await add({ name: 'A', walletId: w.id });
    const b = await add({ name: 'B', walletId: w.id });
    const renewedA = await renew(a.data.id);
    await h.run(h.alice(), 'subscriptions.undo_renew', {
      id: b.data.id,
      previousRenewalOn: today(),
      transactionId: renewedA.data.transaction?.id,
    });
    expect(await transactions()).toHaveLength(1);
    await fails(
      h.run(h.bob(), 'subscriptions.undo_renew', {
        id: a.data.id,
        previousRenewalOn: today(),
        transactionId: null,
      }),
      404,
    );
  });
});
