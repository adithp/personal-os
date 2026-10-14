import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useToasts } from '../../store/toast-store';
import { createFakeApi } from '../../test/fake-api';
import { makeRecurring, moneyState, seedMoney } from '../../test/fake-money';
import { useTransactionActions, useWalletActions } from './money-actions';
import {
  useBudgets,
  useRunRecurring,
  useSubscriptions,
  useSummary,
  useTransactions,
  useWallets,
} from './money-queries';
import { moneyKeys } from './query-keys';
import { hookWrapper, resetEverything, restoreEverything, sampleSeed } from './test-utils';

beforeEach(resetEverything);
afterEach(restoreEverything);

function setup() {
  const data = sampleSeed();
  seedMoney(data.seed);
  const fake = createFakeApi();
  return { ...data, fake, ...hookWrapper(fake) };
}

describe('Money read hooks', () => {
  it('reads wallets with balances computed from the transactions', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useWallets(), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.map((w) => [w.name, w.balancePaise])).toEqual([
      ['Cash', 200000],
      ['HDFC', 9300000],
    ]);
  });

  it('asks for archived wallets only when told to', async () => {
    const { wrapper, fake } = setup();
    const { result } = renderHook(() => useWallets(true), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(fake.calls.at(-1)?.query).toEqual({ includeArchived: true });
  });

  it('filters transactions by month, wallet and text through the query string', async () => {
    const { wrapper, cash } = setup();
    const { result } = renderHook(
      () => useTransactions({ from: '2026-10-01', to: '2026-10-31', walletId: cash.id, q: 'din' }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.map((tx) => tx.note)).toEqual(['Dinner']);
  });

  it('shows a transfer in the lists of both wallets', async () => {
    const { wrapper, cash, bank } = setup();
    const toCash = renderHook(() => useTransactions({ walletId: cash.id, kind: 'transfer' }), {
      wrapper,
    });
    const fromBank = renderHook(() => useTransactions({ walletId: bank.id, kind: 'transfer' }), {
      wrapper,
    });
    await waitFor(() => {
      expect(toCash.result.current.data).toHaveLength(1);
      expect(fromBank.result.current.data).toHaveLength(1);
    });
  });

  it('reads budgets with spent and percent, the summary, and subscriptions with totals', async () => {
    const { wrapper } = setup();
    const budgets = renderHook(() => useBudgets('2026-10'), { wrapper });
    const summary = renderHook(() => useSummary('2026-10'), { wrapper });
    const subs = renderHook(() => useSubscriptions(), { wrapper });
    await waitFor(() => {
      expect(budgets.result.current.isSuccess).toBe(true);
      expect(summary.result.current.isSuccess).toBe(true);
      expect(subs.result.current.isSuccess).toBe(true);
    });
    expect(budgets.result.current.data?.[0]).toMatchObject({ spentPaise: 100000, percent: 100 });
    expect(summary.result.current.data).toMatchObject({
      incomePaise: 6000000,
      expensePaise: 100000,
      previousExpensePaise: 1500000,
    });
    expect(subs.result.current.data?.summary).toEqual({
      activeCount: 2,
      monthlyPaise: 184900,
      yearlyPaise: 2218800,
    });
  });
});

describe('Money write hooks', () => {
  it('adds a transaction, refreshes the lists, and offers Undo that calls POST /undo', async () => {
    const { wrapper, cash, fake } = setup();
    const list = renderHook(() => useTransactions({ walletId: cash.id }), { wrapper });
    const actions = renderHook(() => useTransactionActions(), { wrapper });
    await waitFor(() => {
      expect(list.result.current.data).toHaveLength(3);
    });

    await act(async () => {
      await actions.result.current.create.mutateAsync({
        kind: 'expense',
        amountPaise: 12345,
        walletId: cash.id,
        occurredOn: '2026-10-14',
      });
    });
    await waitFor(() => {
      expect(list.result.current.data).toHaveLength(4);
    });

    const toast = useToasts.getState().toasts.at(-1);
    expect(toast?.action?.label).toBe('Undo');
    act(() => {
      toast?.action?.onClick();
    });
    await waitFor(() => {
      expect(list.result.current.data).toHaveLength(3);
    });
    expect(fake.calls.some((call) => call.method === 'POST' && call.path === '/undo')).toBe(true);
  });

  it("shows the server's message when a write is refused, and keeps the data", async () => {
    const { wrapper, cash } = setup();
    const actions = renderHook(() => useWalletActions(), { wrapper });
    await act(async () => {
      await actions.result.current.remove.mutateAsync(cash.id).catch(() => undefined);
    });
    const toast = useToasts.getState().toasts.at(-1);
    expect(toast).toMatchObject({ tone: 'error' });
    expect(toast?.message).toMatch(/Archive it instead/);
    expect(moneyState().wallets()).toHaveLength(2);
  });

  it('builds cache keys under the one Money key', () => {
    expect(moneyKeys.wallets()[0]).toBe('money');
    expect(moneyKeys.summary('2026-10').slice(0, 2)).toEqual(['money', 'summary']);
    expect(moneyKeys.transactionList({}).slice(0, 2)).toEqual(['money', 'transactions']);
  });
});

describe('useRunRecurring', () => {
  it('runs the due repeats once and refreshes the lists when it made transactions', async () => {
    const { bank } = sampleSeed();
    seedMoney({
      wallets: [bank],
      recurring: [
        makeRecurring({
          walletId: bank.id,
          amountPaise: 30000,
          rule: 'FREQ=DAILY',
          nextOn: '2026-10-13',
        }),
      ],
    });
    const fake = createFakeApi();
    const { wrapper } = hookWrapper(fake);
    const list = renderHook(() => useTransactions({}), { wrapper });
    renderHook(() => useRunRecurring(), { wrapper });
    await waitFor(() => {
      expect(list.result.current.data).toHaveLength(2);
    });
    const runs = fake.calls.filter((call) => call.path === '/recurring-transactions/run');
    expect(runs).toHaveLength(1);
    expect(moneyState().recurring()[0]?.nextOn).toBe('2026-10-15');
  });
});
