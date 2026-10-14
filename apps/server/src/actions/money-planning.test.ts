import { addDays, addMonthsToMonth, indiaDay, monthOf } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { MISSING, fails, failure, undoOf, useMoneyDb, type Result } from './money-test-utils.test';

const h = useMoneyDb();
const today = () => indiaDay(new Date());

interface Wallet {
  id: string;
}
interface Category {
  id: string;
  kind: string;
  name: string;
}
interface Tx {
  id: string;
  occurredOn: string;
  recurringId: string | null;
  amountPaise: number;
}
interface Recurring {
  id: string;
  nextOn: string;
  active: boolean;
  endsOn: string | null;
}
interface Budget {
  id: string;
  categoryId: string;
  month: string;
  amountPaise: number;
  spentPaise: number;
  percent: number;
}
interface Goal {
  id: string;
  savedPaise: number;
  targetPaise: number;
  percent: number;
  achieved: boolean;
}

let walletCount = 0;
const wallet = async (name = `W${String((walletCount += 1))}`, ctx = h.alice()) =>
  (await h.run<Wallet>(ctx, 'finance.wallets.create', { name })).data;
const categoryOf = async (kind: string, name?: string, ctx = h.alice()) => {
  const all = (await h.run<Category[]>(ctx, 'finance.categories.list', {})).data;
  const found = all.find((c) => c.kind === kind && (!name || c.name === name));
  if (!found) throw new Error('no category');
  return found;
};
const addTx = async (input: Record<string, unknown>) =>
  (await h.run<Tx>(h.alice(), 'finance.transactions.create', input)).data;
const allTx = async () =>
  (await h.run<Tx[]>(h.alice(), 'finance.transactions.list', { limit: 500 })).data;
const undo = (result: Result<unknown>) =>
  h.run(h.alice(), undoOf(result).action, undoOf(result).input);

describe('finance.recurring', () => {
  const repeat = async (extra: Record<string, unknown>, walletId?: string) =>
    await h.run<Recurring>(h.alice(), 'finance.recurring.create', {
      kind: 'expense',
      amountPaise: 1000,
      walletId: walletId ?? (await wallet()).id,
      rule: 'FREQ=DAILY',
      ...extra,
    });
  const run = async () =>
    (await h.run<{ created: Tx[] }>(h.alice(), 'finance.recurring.run', {})).data.created;

  it('creates with next day = start day (default today), lists, updates and deletes with undos', async () => {
    const created = await repeat({});
    expect(created.data).toMatchObject({ nextOn: today(), active: true, endsOn: null });
    const dated = await repeat({ startOn: '2030-01-15', rule: 'FREQ=MONTHLY;BYMONTHDAY=15' });
    expect(dated.data.nextOn).toBe('2030-01-15');
    const list = (await h.run<Recurring[]>(h.alice(), 'finance.recurring.list', {})).data;
    expect(list.map((r) => r.id)).toEqual([created.data.id, dated.data.id]);

    const paused = await h.run<Recurring>(h.alice(), 'finance.recurring.update', {
      id: created.data.id,
      active: false,
      amountPaise: 5,
    });
    expect(paused.data).toMatchObject({ active: false, amountPaise: 5 });
    await undo(paused);
    expect(
      (await h.run<Recurring[]>(h.alice(), 'finance.recurring.list', {})).data.find(
        (r) => r.id === created.data.id,
      ),
    ).toMatchObject({ active: true, amountPaise: 1000 });
    expect(
      (await h.run(h.alice(), 'finance.recurring.update', { id: created.data.id, active: true }))
        .undo,
    ).toBeNull();

    const deleted = await h.run(h.alice(), 'finance.recurring.delete', { id: created.data.id });
    expect((await h.run<Recurring[]>(h.alice(), 'finance.recurring.list', {})).data).toHaveLength(
      1,
    );
    await undo(deleted);
    expect((await h.run<Recurring[]>(h.alice(), 'finance.recurring.list', {})).data).toHaveLength(
      2,
    );
  });

  it('validates the rule, the wallets, the category kind and the end day', async () => {
    const w = await wallet();
    expect(await failure(repeat({ rule: 'EVERY SO OFTEN' }, w.id))).toBeInstanceOf(ZodError);
    expect(await failure(repeat({ kind: 'transfer' }, w.id))).toBeInstanceOf(ZodError);
    await fails(repeat({}, MISSING), 400);
    await fails(repeat({ categoryId: (await categoryOf('income')).id }, w.id), 400);
    await fails(repeat({ startOn: '2030-01-10', endsOn: '2030-01-01' }, w.id), 400);
  });

  it('is private: another user cannot change, delete, or restore a repeat', async () => {
    const { data } = await repeat({});
    await fails(h.run(h.bob(), 'finance.recurring.update', { id: data.id, active: false }), 404);
    await fails(h.run(h.bob(), 'finance.recurring.delete', { id: data.id }), 404);
    await fails(h.run(h.bob(), 'finance.recurring.restore', { id: data.id }), 404);
    expect((await h.run<Recurring[]>(h.bob(), 'finance.recurring.list', {})).data).toEqual([]);
  });

  it('run: a monthly rule on the 31st clamps to month ends, and a second run creates nothing', async () => {
    const w = await wallet();
    const rule = await repeat(
      { startOn: '2026-01-31', rule: 'FREQ=MONTHLY;BYMONTHDAY=31', note: 'Rent' },
      w.id,
    );
    const created = await run();
    expect(created.slice(0, 4).map((t) => t.occurredOn)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(created.every((t) => t.recurringId === rule.data.id && t.occurredOn <= today())).toBe(
      true,
    );
    const [after] = (await h.run<Recurring[]>(h.alice(), 'finance.recurring.list', {})).data;
    expect(after?.nextOn && after.nextOn > today()).toBe(true);
    expect(after?.active).toBe(true);
    expect(await run()).toEqual([]);
    expect(await allTx()).toHaveLength(created.length);
    const result = await h.run(h.alice(), 'finance.recurring.run', {});
    expect(result.undo ?? null).toBeNull();
  });

  it('run: creates one transaction per due day up to today, then moves nextOn to tomorrow', async () => {
    await repeat({ startOn: addDays(today(), -2) });
    const created = await run();
    expect(created.map((t) => t.occurredOn).sort()).toEqual([
      addDays(today(), -2),
      addDays(today(), -1),
      today(),
    ]);
    const [after] = (await h.run<Recurring[]>(h.alice(), 'finance.recurring.list', {})).data;
    expect(after?.nextOn).toBe(addDays(today(), 1));
  });

  it('run: leaves future, paused, deleted and other users repeats alone', async () => {
    await repeat({ startOn: addDays(today(), 3) });
    const paused = await repeat({ startOn: addDays(today(), -1) });
    await h.run(h.alice(), 'finance.recurring.update', { id: paused.data.id, active: false });
    const deleted = await repeat({ startOn: addDays(today(), -1) });
    await h.run(h.alice(), 'finance.recurring.delete', { id: deleted.data.id });
    const bobsWallet = await wallet('B', h.bob());
    await h.run(h.bob(), 'finance.recurring.create', {
      kind: 'expense',
      amountPaise: 1,
      walletId: bobsWallet.id,
      rule: 'FREQ=DAILY',
    });
    expect(await run()).toEqual([]);
    expect(await allTx()).toEqual([]);
  });

  it('run: stops at endsOn and turns the rule off', async () => {
    await repeat({ startOn: addDays(today(), -5), endsOn: addDays(today(), -3) });
    const created = await run();
    expect(created.map((t) => t.occurredOn).sort()).toEqual([
      addDays(today(), -5),
      addDays(today(), -4),
      addDays(today(), -3),
    ]);
    const [after] = (await h.run<Recurring[]>(h.alice(), 'finance.recurring.list', {})).data;
    expect(after).toMatchObject({ active: false, nextOn: addDays(today(), -2) });
    expect(await run()).toEqual([]);
  });

  it('run: a transfer rule moves money between wallets', async () => {
    const a = await wallet('A');
    const b = await wallet('B');
    await h.run(h.alice(), 'finance.recurring.create', {
      kind: 'transfer',
      amountPaise: 700,
      walletId: a.id,
      toWalletId: b.id,
      rule: 'FREQ=DAILY',
    });
    expect(await run()).toHaveLength(1);
    const list = (
      await h.run<{ name: string; balancePaise: number }[]>(h.alice(), 'finance.wallets.list', {})
    ).data;
    expect(list.map((w) => w.balancePaise)).toEqual([-700, 700]);
  });
});

describe('finance.budgets', () => {
  const month = () => monthOf(today());
  const budgets = async (input: Record<string, unknown> = {}, ctx = h.alice()) =>
    (await h.run<Budget[]>(ctx, 'finance.budgets.list', input)).data;
  const set = async (categoryId: string, amountPaise: number, m = month()) =>
    await h.run<Budget>(h.alice(), 'finance.budgets.set', { categoryId, month: m, amountPaise });

  it('sets, replaces, and undoes (delete when new, old amount when replaced)', async () => {
    const food = await categoryOf('expense', 'Food');
    const created = await set(food.id, 10000);
    expect(created.data).toMatchObject({
      categoryId: food.id,
      month: month(),
      amountPaise: 10000,
      spentPaise: 0,
      percent: 0,
    });
    expect(created.undo?.action).toBe('finance.budgets.delete');
    const replaced = await set(food.id, 20000);
    expect(replaced.data.id).toBe(created.data.id);
    expect(await budgets()).toHaveLength(1);
    await undo(replaced);
    expect((await budgets())[0]?.amountPaise).toBe(10000);
    await undo(created);
    expect(await budgets()).toEqual([]);
    expect((await set(food.id, 5)).undo?.action).toBe('finance.budgets.delete');
    expect((await set(food.id, 5)).undo).toBeNull();
  });

  it('shows spent and percent of live expenses of the month only', async () => {
    const w = await wallet();
    const food = await categoryOf('expense', 'Food');
    const bills = await categoryOf('expense', 'Bills');
    const salary = await categoryOf('income', 'Salary');
    await set(food.id, 10000);
    await set(bills.id, 1000);
    await addTx({ kind: 'expense', amountPaise: 2500, walletId: w.id, categoryId: food.id });
    await addTx({ kind: 'expense', amountPaise: 1250, walletId: w.id, categoryId: food.id });
    await addTx({
      kind: 'expense',
      amountPaise: 9999,
      walletId: w.id,
      categoryId: food.id,
      occurredOn: `${addMonthsToMonth(month(), -1)}-15`,
    });
    await addTx({ kind: 'income', amountPaise: 9999, walletId: w.id, categoryId: salary.id });
    await addTx({ kind: 'expense', amountPaise: 1500, walletId: w.id, categoryId: bills.id });
    const gone = await addTx({
      kind: 'expense',
      amountPaise: 7777,
      walletId: w.id,
      categoryId: bills.id,
    });
    await h.run(h.alice(), 'finance.transactions.delete', { id: gone.id });
    const list = await budgets();
    expect(list.find((b) => b.categoryId === food.id)).toMatchObject({
      spentPaise: 3750,
      percent: 38,
    });
    expect(list.find((b) => b.categoryId === bills.id)).toMatchObject({
      spentPaise: 1500,
      percent: 150,
    });
    // Another month has its own (empty) list and spent
    const previous = addMonthsToMonth(month(), -1);
    expect(await budgets({ month: previous })).toEqual([]);
    await set(food.id, 20000, previous);
    expect((await budgets({ month: previous }))[0]).toMatchObject({
      month: previous,
      spentPaise: 9999,
    });
  });

  it('accepts expense categories of the user only', async () => {
    const income = await categoryOf('income');
    const bobsFood = await categoryOf('expense', 'Food', h.bob());
    await fails(set(income.id, 100), 400);
    await fails(set(bobsFood.id, 100), 400);
    await fails(set(MISSING, 100), 400);
    expect(await failure(set(income.id, 0))).toBeInstanceOf(ZodError);
    expect(
      await failure(
        h.run(h.alice(), 'finance.budgets.set', {
          categoryId: income.id,
          month: '2026-13',
          amountPaise: 1,
        }),
      ),
    ).toBeInstanceOf(ZodError);
  });

  it('hides budgets of deleted categories and keeps them private', async () => {
    const food = await categoryOf('expense', 'Food');
    await set(food.id, 100);
    expect(await budgets({}, h.bob())).toEqual([]);
    await h.run(h.alice(), 'finance.categories.delete', { id: food.id });
    expect(await budgets()).toEqual([]);
  });

  it('deletes with an undo that sets it again; other users get 404', async () => {
    const food = await categoryOf('expense', 'Food');
    const created = await set(food.id, 4000);
    await fails(h.run(h.bob(), 'finance.budgets.delete', { id: created.data.id }), 404);
    const deleted = await h.run<Budget>(h.alice(), 'finance.budgets.delete', {
      id: created.data.id,
    });
    expect(deleted.data.amountPaise).toBe(4000);
    expect(await budgets()).toEqual([]);
    await undo(deleted);
    expect((await budgets())[0]).toMatchObject({ categoryId: food.id, amountPaise: 4000 });
    await fails(h.run(h.alice(), 'finance.budgets.delete', { id: MISSING }), 404);
  });
});

describe('finance.goals', () => {
  const goals = async (ctx = h.alice()) =>
    (await h.run<Goal[]>(ctx, 'finance.goals.list', {})).data;
  const create = async (input: Record<string, unknown> = {}) =>
    await h.run<Goal>(h.alice(), 'finance.goals.create', {
      name: 'Laptop',
      targetPaise: 10000,
      ...input,
    });

  it('creates with progress, updates with an undo, and has no undo for no change', async () => {
    const created = await create({ savedPaise: 2500, targetOn: '2030-05-01' });
    expect(created.data).toMatchObject({
      savedPaise: 2500,
      percent: 25,
      achieved: false,
      targetOn: '2030-05-01',
    });
    const updated = await h.run<Goal>(h.alice(), 'finance.goals.update', {
      id: created.data.id,
      targetPaise: 5000,
      name: 'Phone',
    });
    expect(updated.data).toMatchObject({ percent: 50, name: 'Phone' });
    await undo(updated);
    expect((await goals())[0]).toMatchObject({ name: 'Laptop', targetPaise: 10000 });
    expect(
      (await h.run(h.alice(), 'finance.goals.update', { id: created.data.id, name: 'Laptop' }))
        .undo,
    ).toBeNull();
    await undo(created);
    expect(await goals()).toEqual([]);
  });

  it('contributes, passes 100 percent, takes out, refuses below zero, and undoes', async () => {
    const { data } = await create();
    const added = await h.run<Goal>(h.alice(), 'finance.goals.contribute', {
      id: data.id,
      deltaPaise: 12000,
    });
    expect(added.data).toMatchObject({ savedPaise: 12000, percent: 120, achieved: true });
    await undo(added);
    expect((await goals())[0]?.savedPaise).toBe(0);
    await fails(
      h.run(h.alice(), 'finance.goals.contribute', { id: data.id, deltaPaise: -1 }),
      400,
      'validation_error',
    );
    expect(
      await failure(h.run(h.alice(), 'finance.goals.contribute', { id: data.id, deltaPaise: 0 })),
    ).toBeInstanceOf(ZodError);
    await h.run(h.alice(), 'finance.goals.contribute', { id: data.id, deltaPaise: 3000 });
    const out = await h.run<Goal>(h.alice(), 'finance.goals.contribute', {
      id: data.id,
      deltaPaise: -1000,
    });
    expect(out.data.savedPaise).toBe(2000);
    expect(out.undo?.input).toEqual({ id: data.id, deltaPaise: 1000 });
  });

  it('adds up money added at the same time', async () => {
    const { data } = await create();
    await Promise.all([
      h.run(h.alice(), 'finance.goals.contribute', { id: data.id, deltaPaise: 100 }),
      h.run(h.alice(), 'finance.goals.contribute', { id: data.id, deltaPaise: 200 }),
    ]);
    expect((await goals())[0]?.savedPaise).toBe(300);
  });

  it('deletes softly and restores; other users get 404', async () => {
    const { data } = await create();
    await fails(h.run(h.bob(), 'finance.goals.update', { id: data.id, name: 'x' }), 404);
    await fails(h.run(h.bob(), 'finance.goals.contribute', { id: data.id, deltaPaise: 5 }), 404);
    await fails(h.run(h.bob(), 'finance.goals.delete', { id: data.id }), 404);
    await fails(h.run(h.bob(), 'finance.goals.restore', { id: data.id }), 404);
    expect(await goals(h.bob())).toEqual([]);
    const deleted = await h.run(h.alice(), 'finance.goals.delete', { id: data.id });
    expect(await goals()).toEqual([]);
    await fails(h.run(h.alice(), 'finance.goals.contribute', { id: data.id, deltaPaise: 5 }), 404);
    await undo(deleted);
    expect(await goals()).toHaveLength(1);
    expect((await h.run(h.alice(), 'finance.goals.restore', { id: data.id })).undo).toBeNull();
  });
});

describe('finance.summary', () => {
  interface Summary {
    month: string;
    incomePaise: number;
    expensePaise: number;
    netPaise: number;
    previousExpensePaise: number;
    byCategory: { categoryId: string | null; kind: string; totalPaise: number }[];
    byDay: { date: string; incomePaise: number; expensePaise: number }[];
  }

  it('totals a month without transfers, by category and by day', async () => {
    const a = await wallet('A');
    const b = await wallet('B');
    const food = await categoryOf('expense', 'Food');
    const salary = await categoryOf('income', 'Salary');
    const base = { walletId: a.id };
    await addTx({
      ...base,
      kind: 'income',
      amountPaise: 100000,
      categoryId: salary.id,
      occurredOn: '2026-05-01',
    });
    await addTx({
      ...base,
      kind: 'expense',
      amountPaise: 3000,
      categoryId: food.id,
      occurredOn: '2026-05-03',
    });
    await addTx({
      ...base,
      kind: 'expense',
      amountPaise: 2000,
      categoryId: food.id,
      occurredOn: '2026-05-03',
    });
    await addTx({ ...base, kind: 'expense', amountPaise: 500, occurredOn: '2026-05-20' });
    await addTx({
      ...base,
      kind: 'transfer',
      toWalletId: b.id,
      amountPaise: 99999,
      occurredOn: '2026-05-04',
    });
    await addTx({ ...base, kind: 'expense', amountPaise: 4000, occurredOn: '2026-04-30' });
    await addTx({ ...base, kind: 'expense', amountPaise: 8000, occurredOn: '2026-06-01' });
    const deleted = await addTx({
      ...base,
      kind: 'expense',
      amountPaise: 123,
      occurredOn: '2026-05-05',
    });
    await h.run(h.alice(), 'finance.transactions.delete', { id: deleted.id });

    const { data } = await h.run<Summary>(h.alice(), 'finance.summary', { month: '2026-05' });
    expect(data).toMatchObject({
      month: '2026-05',
      incomePaise: 100000,
      expensePaise: 5500,
      netPaise: 94500,
      previousExpensePaise: 4000,
    });
    expect(data.byCategory).toEqual([
      { categoryId: salary.id, kind: 'income', totalPaise: 100000 },
      { categoryId: food.id, kind: 'expense', totalPaise: 5000 },
      { categoryId: null, kind: 'expense', totalPaise: 500 },
    ]);
    expect(data.byDay).toEqual([
      { date: '2026-05-01', incomePaise: 100000, expensePaise: 0 },
      { date: '2026-05-03', incomePaise: 0, expensePaise: 5000 },
      { date: '2026-05-20', incomePaise: 0, expensePaise: 500 },
    ]);
  });

  it('defaults to this month, is empty for new users, and is private', async () => {
    const w = await wallet();
    await addTx({ kind: 'expense', amountPaise: 700, walletId: w.id });
    const mine = (await h.run<Summary>(h.alice(), 'finance.summary', {})).data;
    expect(mine).toMatchObject({ month: monthOf(today()), expensePaise: 700 });
    const bobs = (await h.run<Summary>(h.bob(), 'finance.summary', {})).data;
    expect(bobs).toMatchObject({
      incomePaise: 0,
      expensePaise: 0,
      netPaise: 0,
      byCategory: [],
      byDay: [],
    });
    expect(await failure(h.run(h.alice(), 'finance.summary', { month: '2026-1' }))).toBeInstanceOf(
      ZodError,
    );
  });
});
