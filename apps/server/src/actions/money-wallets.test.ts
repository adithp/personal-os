import { DEFAULT_CATEGORIES, indiaDay } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { MISSING, fails, failure, undoOf, useMoneyDb, type Result } from './money-test-utils.test';

const h = useMoneyDb();
const today = () => indiaDay(new Date());

interface Wallet {
  id: string;
  name: string;
  balancePaise: number;
  archived: boolean;
  openingBalancePaise: number;
}
interface Category {
  id: string;
  name: string;
  kind: string;
}
interface Tx {
  id: string;
  kind: string;
  amountPaise: number;
  occurredOn: string;
  walletId: string;
  toWalletId: string | null;
  categoryId: string | null;
  note: string | null;
}

const addWallet = async (name: string, openingBalancePaise = 0, ctx = h.alice()) =>
  (await h.run<Wallet>(ctx, 'finance.wallets.create', { name, openingBalancePaise })).data;
const wallets = async (ctx = h.alice(), includeArchived = false) =>
  (await h.run<Wallet[]>(ctx, 'finance.wallets.list', { includeArchived })).data;
const balances = async () => Object.fromEntries((await wallets()).map((w) => [w.name, w.balancePaise]));
const categories = async (ctx = h.alice()) =>
  (await h.run<Category[]>(ctx, 'finance.categories.list', {})).data;
const category = async (kind: string, ctx = h.alice()) => {
  const found = (await categories(ctx)).find((c) => c.kind === kind);
  if (!found) throw new Error('no category');
  return found;
};
const addTx = async (input: Record<string, unknown>, ctx = h.alice()) =>
  await h.run<Tx>(ctx, 'finance.transactions.create', input);
const txs = async (input: Record<string, unknown> = {}, ctx = h.alice()) =>
  (await h.run<Tx[]>(ctx, 'finance.transactions.list', input)).data;
const undo = (result: Result<unknown>, ctx = h.alice()) =>
  h.run(ctx, undoOf(result).action, undoOf(result).input);

describe('permission levels', () => {
  it('writes are write and reads are read', async () => {
    const { financeActions } = await import('@personal-os/shared');
    expect(financeActions.walletsList.permission).toBe('read');
    expect(financeActions.transactionsCreate.permission).toBe('write');
    expect(financeActions.recurringRun.permission).toBe('write');
  });
});

describe('finance.wallets', () => {
  it('creates, lists with the opening balance, and undoes the create', async () => {
    const created = await h.run<Wallet>(h.alice(), 'finance.wallets.create', {
      name: 'HDFC',
      kind: 'bank',
      openingBalancePaise: 500000,
    });
    expect(created.data).toMatchObject({ name: 'HDFC', balancePaise: 500000, archived: false });
    expect(await wallets()).toHaveLength(1);
    await undo(created);
    expect(await wallets()).toHaveLength(0);
  });

  it('rejects bad input with a ZodError', async () => {
    expect(await failure(h.run(h.alice(), 'finance.wallets.create', { name: ' ' }))).toBeInstanceOf(
      ZodError,
    );
    expect(await failure(h.run(h.alice(), 'finance.wallets.update', { id: MISSING }))).toBeInstanceOf(
      ZodError,
    );
  });

  it('refuses a name twice (409 name_taken, ignoring case) but not for another user', async () => {
    await addWallet('Cash');
    await fails(h.run(h.alice(), 'finance.wallets.create', { name: 'CASH' }), 409, 'name_taken');
    await addWallet('Cash', 0, h.bob());
    const other = await addWallet('Card');
    await fails(
      h.run(h.alice(), 'finance.wallets.update', { id: other.id, name: 'cash' }),
      409,
      'name_taken',
    );
  });

  it('updates with an undo that restores the old values, and has no undo for no change', async () => {
    const wallet = await addWallet('Old', 1000);
    const updated = await h.run<Wallet>(h.alice(), 'finance.wallets.update', {
      id: wallet.id,
      name: 'New',
      openingBalancePaise: 2000,
    });
    expect(updated.data).toMatchObject({ name: 'New', balancePaise: 2000 });
    await undo(updated);
    expect((await wallets())[0]).toMatchObject({ name: 'Old', balancePaise: 1000 });
    const same = await h.run(h.alice(), 'finance.wallets.update', { id: wallet.id, name: 'Old' });
    expect(same.undo).toBeNull();
  });

  it('archives (hidden from the list unless asked) and the undo unarchives', async () => {
    const wallet = await addWallet('Old card');
    const archived = await h.run(h.alice(), 'finance.wallets.update', { id: wallet.id, archived: true });
    expect(await wallets()).toHaveLength(0);
    expect(await wallets(h.alice(), true)).toMatchObject([{ archived: true }]);
    await undo(archived);
    expect(await wallets()).toHaveLength(1);
  });

  it('computes balances with income, expense and transfers on both wallets', async () => {
    const a = await addWallet('A', 100000);
    const b = await addWallet('B', 0);
    const salary = await category('income');
    const food = await category('expense');
    await addTx({ kind: 'income', amountPaise: 50000, walletId: a.id, categoryId: salary.id });
    await addTx({ kind: 'expense', amountPaise: 20000, walletId: a.id, categoryId: food.id });
    const transfer = await addTx({
      kind: 'transfer',
      amountPaise: 30000,
      walletId: a.id,
      toWalletId: b.id,
    });
    expect(await balances()).toEqual({ A: 100000 + 50000 - 20000 - 30000, B: 30000 });
    // The transfer shows on both wallets in the transaction list
    expect(await txs({ walletId: a.id })).toHaveLength(3);
    expect(await txs({ walletId: b.id })).toHaveLength(1);
    // Deleting a transaction takes it out of the balance; the undo puts it back
    const deleted = await h.run(h.alice(), 'finance.transactions.delete', { id: transfer.data.id });
    expect(await balances()).toEqual({ A: 130000, B: 0 });
    await undo(deleted);
    expect(await balances()).toEqual({ A: 100000, B: 30000 });
  });

  it('refuses to delete a wallet in use (409 wallet_in_use) and deletes a free one', async () => {
    const used = await addWallet('Used');
    const free = await addWallet('Free');
    await addTx({ kind: 'income', amountPaise: 100, walletId: used.id });
    await fails(h.run(h.alice(), 'finance.wallets.delete', { id: used.id }), 409, 'wallet_in_use');
    const deleted = await h.run(h.alice(), 'finance.wallets.delete', { id: free.id });
    expect((await wallets()).map((w) => w.name)).toEqual(['Used']);
    await undo(deleted);
    expect((await wallets()).map((w) => w.name)).toEqual(['Used', 'Free']);
  });

  it('counts repeats and subscriptions as use', async () => {
    const forRepeat = await addWallet('R');
    const forSub = await addWallet('S');
    await h.run(h.alice(), 'finance.recurring.create', {
      kind: 'expense',
      amountPaise: 100,
      walletId: forRepeat.id,
      rule: 'FREQ=DAILY',
    });
    await h.run(h.alice(), 'subscriptions.create', {
      name: 'Netflix',
      amountPaise: 100,
      nextRenewalOn: today(),
      walletId: forSub.id,
    });
    await fails(h.run(h.alice(), 'finance.wallets.delete', { id: forRepeat.id }), 409, 'wallet_in_use');
    await fails(h.run(h.alice(), 'finance.wallets.delete', { id: forSub.id }), 409, 'wallet_in_use');
  });

  it('is private: another user cannot see, change, delete, or restore a wallet', async () => {
    const wallet = await addWallet('Mine');
    expect(await wallets(h.bob())).toEqual([]);
    await fails(h.run(h.bob(), 'finance.wallets.update', { id: wallet.id, name: 'x' }), 404);
    await fails(h.run(h.bob(), 'finance.wallets.delete', { id: wallet.id }), 404);
    await fails(h.run(h.bob(), 'finance.wallets.restore', { id: wallet.id }), 404);
    await fails(h.run(h.alice(), 'finance.wallets.delete', { id: MISSING }), 404);
    expect(await wallets()).toHaveLength(1);
  });

  it('restores a deleted wallet, refuses a taken name, and restoring a live one does nothing', async () => {
    const wallet = await addWallet('A');
    await h.run(h.alice(), 'finance.wallets.delete', { id: wallet.id });
    await addWallet('a');
    await fails(h.run(h.alice(), 'finance.wallets.restore', { id: wallet.id }), 409, 'name_taken');
    const live = await h.run(h.alice(), 'finance.wallets.restore', { id: (await wallets())[0]!.id });
    expect(live.undo).toBeNull();
  });
});

describe('finance.categories', () => {
  it('creates the defaults on the first list only', async () => {
    const first = await categories();
    expect(first).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(first.map((c) => c.name)).toContain('Food');
    expect(first.slice(0, 7).every((c) => c.kind === 'expense')).toBe(true);
    expect(await categories()).toHaveLength(DEFAULT_CATEGORIES.length);
    // Deleting every category does not bring the defaults back
    for (const c of first) await h.run(h.alice(), 'finance.categories.delete', { id: c.id });
    expect(await categories()).toEqual([]);
    // Another user gets their own defaults
    expect(await categories(h.bob())).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it('creates, renames, deletes, and restores with undos', async () => {
    const created = await h.run<Category>(h.alice(), 'finance.categories.create', {
      name: 'Pets',
      kind: 'expense',
    });
    expect(created.data).toMatchObject({ name: 'Pets', kind: 'expense' });
    const renamed = await h.run<Category>(h.alice(), 'finance.categories.update', {
      id: created.data.id,
      name: 'Dogs',
    });
    await undo(renamed);
    expect((await categories()).some((c) => c.name === 'Pets')).toBe(true);
    const deleted = await h.run(h.alice(), 'finance.categories.delete', { id: created.data.id });
    expect((await categories()).some((c) => c.name === 'Pets')).toBe(false);
    await undo(deleted);
    expect((await categories()).some((c) => c.name === 'Pets')).toBe(true);
    await undo(created);
    expect((await categories()).some((c) => c.name === 'Pets')).toBe(false);
  });

  it('refuses a name twice per kind (409 name_taken) but allows it in the other kind', async () => {
    await categories();
    await fails(
      h.run(h.alice(), 'finance.categories.create', { name: 'food', kind: 'expense' }),
      409,
      'name_taken',
    );
    await h.run(h.alice(), 'finance.categories.create', { name: 'Food', kind: 'income' });
    const other = (await categories()).find((c) => c.name === 'Transport')!;
    await fails(
      h.run(h.alice(), 'finance.categories.update', { id: other.id, name: 'FOOD' }),
      409,
      'name_taken',
    );
  });

  it('keeps transactions of a deleted category and hides other users categories', async () => {
    const wallet = await addWallet('W');
    const food = await category('expense');
    const tx = await addTx({ kind: 'expense', amountPaise: 100, walletId: wallet.id, categoryId: food.id });
    await h.run(h.alice(), 'finance.categories.delete', { id: food.id });
    expect((await txs())[0]?.id).toBe(tx.data.id);
    await fails(h.run(h.bob(), 'finance.categories.delete', { id: food.id }), 404);
    await fails(h.run(h.bob(), 'finance.categories.update', { id: food.id, name: 'x' }), 404);
  });
});

describe('finance.transactions', () => {
  it('creates with today as the default day and an undo that deletes it', async () => {
    const wallet = await addWallet('W');
    const created = await addTx({ kind: 'expense', amountPaise: 12345, walletId: wallet.id, note: ' Tea ' });
    expect(created.data).toMatchObject({ occurredOn: today(), note: 'Tea', categoryId: null });
    await undo(created);
    expect(await txs()).toEqual([]);
  });

  it('rejects bad shapes: ZodError for transfers without a target, 400 for foreign rows and wrong category kinds', async () => {
    const wallet = await addWallet('W');
    const bobsWallet = await addWallet('Bobs', 0, h.bob());
    const income = await category('income');
    const expense = await category('expense');
    expect(
      await failure(addTx({ kind: 'transfer', amountPaise: 1, walletId: wallet.id })),
    ).toBeInstanceOf(ZodError);
    expect(
      await failure(addTx({ kind: 'transfer', amountPaise: 1, walletId: wallet.id, toWalletId: wallet.id })),
    ).toBeInstanceOf(ZodError);
    expect(await failure(addTx({ kind: 'expense', amountPaise: 0, walletId: wallet.id }))).toBeInstanceOf(
      ZodError,
    );
    expect(
      await failure(addTx({ kind: 'expense', amountPaise: 1.5, walletId: wallet.id })),
    ).toBeInstanceOf(ZodError);
    await fails(addTx({ kind: 'expense', amountPaise: 1, walletId: MISSING }), 400, 'validation_error');
    await fails(addTx({ kind: 'expense', amountPaise: 1, walletId: bobsWallet.id }), 400);
    await fails(
      addTx({ kind: 'transfer', amountPaise: 1, walletId: wallet.id, toWalletId: bobsWallet.id }),
      400,
    );
    await fails(
      addTx({ kind: 'expense', amountPaise: 1, walletId: wallet.id, categoryId: income.id }),
      400,
    );
    await fails(
      addTx({ kind: 'income', amountPaise: 1, walletId: wallet.id, categoryId: expense.id }),
      400,
    );
    await fails(addTx({ kind: 'expense', amountPaise: 1, walletId: wallet.id, categoryId: MISSING }), 400);
    expect(await txs()).toEqual([]);
  });

  it('refuses a deleted wallet or category', async () => {
    const wallet = await addWallet('W');
    const gone = await addWallet('Gone');
    await h.run(h.alice(), 'finance.wallets.delete', { id: gone.id });
    await fails(addTx({ kind: 'expense', amountPaise: 1, walletId: gone.id }), 400);
    const food = await category('expense');
    await h.run(h.alice(), 'finance.categories.delete', { id: food.id });
    await fails(addTx({ kind: 'expense', amountPaise: 1, walletId: wallet.id, categoryId: food.id }), 400);
  });

  it('lists newest first with filters, text search and paging', async () => {
    const a = await addWallet('A');
    const b = await addWallet('B');
    const food = await category('expense');
    await addTx({ kind: 'expense', amountPaise: 100, walletId: a.id, occurredOn: '2026-01-05', note: '50% off tea', categoryId: food.id });
    await addTx({ kind: 'income', amountPaise: 200, walletId: a.id, occurredOn: '2026-01-10' });
    await addTx({ kind: 'expense', amountPaise: 300, walletId: b.id, occurredOn: '2026-01-10', note: 'Tea_time' });
    await addTx({ kind: 'transfer', amountPaise: 400, walletId: a.id, toWalletId: b.id, occurredOn: '2026-02-01' });
    expect((await txs()).map((t) => t.amountPaise)).toEqual([400, 300, 200, 100]);
    expect((await txs({ kind: 'expense' })).map((t) => t.amountPaise)).toEqual([300, 100]);
    expect((await txs({ walletId: b.id })).map((t) => t.amountPaise)).toEqual([400, 300]);
    expect((await txs({ categoryId: food.id })).map((t) => t.amountPaise)).toEqual([100]);
    expect((await txs({ from: '2026-01-10', to: '2026-01-31' })).map((t) => t.amountPaise)).toEqual([300, 200]);
    expect((await txs({ q: 'TEA' })).map((t) => t.amountPaise)).toEqual([300, 100]);
    // % and _ are searched literally
    expect((await txs({ q: '50%' })).map((t) => t.amountPaise)).toEqual([100]);
    expect((await txs({ q: 'o_f' })).map((t) => t.amountPaise)).toEqual([]);
    expect((await txs({ q: '_' })).map((t) => t.amountPaise)).toEqual([300]);
    expect((await txs({ limit: 2 })).map((t) => t.amountPaise)).toEqual([400, 300]);
    expect((await txs({ limit: 2, offset: 2 })).map((t) => t.amountPaise)).toEqual([200, 100]);
    expect(await txs({}, h.bob())).toEqual([]);
  });

  it('updates, validates the merged shape, and undoes with the old values', async () => {
    const a = await addWallet('A');
    const b = await addWallet('B');
    const created = await addTx({ kind: 'expense', amountPaise: 100, walletId: a.id, note: 'x' });
    const id = created.data.id;
    const changed = await h.run<Tx>(h.alice(), 'finance.transactions.update', {
      id,
      amountPaise: 250,
      occurredOn: '2026-03-04',
      walletId: b.id,
    });
    expect(changed.data).toMatchObject({ amountPaise: 250, occurredOn: '2026-03-04', walletId: b.id });
    await undo(changed);
    expect((await txs())[0]).toMatchObject({ amountPaise: 100, walletId: a.id, occurredOn: today() });
    // Becoming a transfer needs the second wallet
    await fails(h.run(h.alice(), 'finance.transactions.update', { id, kind: 'transfer' }), 400);
    const transfer = await h.run<Tx>(h.alice(), 'finance.transactions.update', {
      id,
      kind: 'transfer',
      toWalletId: b.id,
    });
    expect(transfer.data).toMatchObject({ kind: 'transfer', toWalletId: b.id });
    await undo(transfer);
    expect((await txs())[0]).toMatchObject({ kind: 'expense', toWalletId: null });
    // Changing the kind needs a matching category
    const food = await category('expense');
    await h.run(h.alice(), 'finance.transactions.update', { id, categoryId: food.id });
    await fails(h.run(h.alice(), 'finance.transactions.update', { id, kind: 'income' }), 400);
    expect((await h.run(h.alice(), 'finance.transactions.update', { id, amountPaise: 100 })).undo).toBeNull();
  });

  it('gives 404 to other users and unknown ids, and ZodError for an empty update', async () => {
    const wallet = await addWallet('W');
    const { data } = await addTx({ kind: 'expense', amountPaise: 100, walletId: wallet.id });
    await fails(h.run(h.bob(), 'finance.transactions.update', { id: data.id, amountPaise: 1 }), 404);
    await fails(h.run(h.bob(), 'finance.transactions.delete', { id: data.id }), 404);
    await fails(h.run(h.bob(), 'finance.transactions.restore', { id: data.id }), 404);
    await fails(h.run(h.alice(), 'finance.transactions.update', { id: MISSING, amountPaise: 1 }), 404);
    expect(await failure(h.run(h.alice(), 'finance.transactions.update', { id: data.id }))).toBeInstanceOf(ZodError);
    expect((await txs())[0]?.amountPaise).toBe(100);
  });

  it('deletes softly, restores, and refuses to restore into a deleted wallet', async () => {
    const wallet = await addWallet('W');
    const { data } = await addTx({ kind: 'expense', amountPaise: 100, walletId: wallet.id });
    const deleted = await h.run(h.alice(), 'finance.transactions.delete', { id: data.id });
    expect(deleted.undo).toEqual({ action: 'finance.transactions.restore', input: { id: data.id } });
    await fails(h.run(h.alice(), 'finance.transactions.delete', { id: data.id }), 404);
    await h.run(h.alice(), 'finance.wallets.delete', { id: wallet.id });
    await fails(h.run(h.alice(), 'finance.transactions.restore', { id: data.id }), 400);
    await h.run(h.alice(), 'finance.wallets.restore', { id: wallet.id });
    const restored = await h.run(h.alice(), 'finance.transactions.restore', { id: data.id });
    expect(restored.undo).toEqual({ action: 'finance.transactions.delete', input: { id: data.id } });
    expect((await h.run(h.alice(), 'finance.transactions.restore', { id: data.id })).undo).toBeNull();
  });
});
