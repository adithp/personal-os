import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { ApiContext } from '../../api/api-context';
import { usePalette } from '../../store/palette-store';
import { useSettings } from '../../store/settings-store';
import { useToasts } from '../../store/toast-store';
import { createFakeApi, type FakeApi } from '../../test/fake-api';
import { signedInAuth } from '../../test/fake-auth';
import {
  makeBudget,
  makeCategory,
  makeGoal,
  makeSubscription,
  makeTransaction,
  makeWallet,
  resetMoneyFake,
  seedMoney,
  type MoneySeed,
} from '../../test/fake-money';
import { renderApp } from '../../test/render-app';
import { resetMoneyUi } from './money-ui-store';

/** 11:00 AM on Wednesday 14 October 2026 in India. */
export const NOW = '2026-10-14T05:30:00.000Z';

export function resetEverything() {
  localStorage.clear();
  resetMoneyUi();
  resetMoneyFake();
  usePalette.setState({ open: false, query: '' });
  useSettings.getState().reset();
  useToasts.getState().clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  // Only the clock is fake, so promises and timers behave normally
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
}

export function restoreEverything() {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

/** A small, fixed set of Money data in October 2026. */
export function sampleSeed() {
  const cash = makeWallet({ name: 'Cash', openingBalancePaise: 100000 });
  const bank = makeWallet({ name: 'HDFC', openingBalancePaise: 5000000 });
  const food = makeCategory({ name: 'Food', color: '#F6A462' });
  const rent = makeCategory({ name: 'Rent', color: '#93D3F5' });
  const salary = makeCategory({ name: 'Salary', kind: 'income', color: '#9EE0C8' });
  const transactions = [
    makeTransaction({
      kind: 'income',
      amountPaise: 6000000,
      walletId: bank.id,
      categoryId: salary.id,
      occurredOn: '2026-10-01',
      note: 'October pay',
    }),
    makeTransaction({
      kind: 'expense',
      amountPaise: 45000,
      walletId: cash.id,
      categoryId: food.id,
      occurredOn: '2026-10-13',
      note: 'Lunch',
    }),
    makeTransaction({
      kind: 'expense',
      amountPaise: 55000,
      walletId: cash.id,
      categoryId: food.id,
      occurredOn: '2026-10-14',
      note: 'Dinner',
    }),
    makeTransaction({
      kind: 'transfer',
      amountPaise: 200000,
      walletId: bank.id,
      toWalletId: cash.id,
      occurredOn: '2026-10-14',
    }),
    makeTransaction({
      kind: 'expense',
      amountPaise: 1500000,
      walletId: bank.id,
      categoryId: rent.id,
      occurredOn: '2026-09-30',
    }),
  ];
  const seed: MoneySeed = {
    wallets: [cash, bank],
    categories: [food, rent, salary],
    transactions,
    budgets: [makeBudget({ categoryId: food.id, month: '2026-10', amountPaise: 100000 })],
    goals: [makeGoal({ name: 'Laptop', targetPaise: 8000000, savedPaise: 2000000 })],
    subscriptions: [
      makeSubscription({
        name: 'Netflix',
        amountPaise: 64900,
        nextRenewalOn: '2026-10-20',
        walletId: bank.id,
        categoryId: food.id,
      }),
      makeSubscription({ name: 'Gym', amountPaise: 120000, nextRenewalOn: '2026-10-10' }),
      makeSubscription({
        name: 'Old paper',
        amountPaise: 20000,
        status: 'cancelled',
        nextRenewalOn: '2026-12-01',
      }),
    ],
  };
  return { seed, cash, bank, food, rent, salary };
}

/** A mock API with Money data, for tests that need to set it up (failNext, slow) before opening. */
export function makeFake(seed: MoneySeed = {}): FakeApi {
  seedMoney(seed);
  return createFakeApi();
}

/** Opens the Money page at a section with seeded data (or on a mock from makeFake). */
export async function openMoney(seed: MoneySeed = {}, search = '', fake: FakeApi | null = null) {
  const api = fake ?? makeFake(seed);
  const router = await renderApp(`/money${search}`, signedInAuth().auth, api.api);
  return { router, fake: api, user: userEvent.setup() };
}

export const callsTo = (fake: FakeApi, method: string, path: string) =>
  fake.calls.filter((call) => call.method === method && call.path === path);

/** The toast with this text. */
export const findToast = (text: string): Promise<HTMLElement> =>
  waitFor(() => {
    const toast = [...screen.queryAllByRole('status'), ...screen.queryAllByRole('alert')].find(
      (el) => el.textContent.includes(text),
    );
    if (!toast) throw new Error(`No toast with "${text}"`);
    return toast;
  });

/** A wrapper with an API and a fresh query cache, for hook tests. */
export function hookWrapper(fake: FakeApi) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiContext.Provider value={fake.api}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
  return { client, wrapper };
}
