import {
  CYCLES_PER_YEAR,
  addDays,
  addMonths,
  addMonthsToMonth,
  monthEnd,
  monthOf,
  monthStart,
  monthlyPaise,
  yearlyPaise,
  type BillingCycle,
  type Budget,
  type Category,
  type MonthSummary,
  type RecurringTransaction,
  type SavingsGoal,
  type Subscription,
  type SubscriptionSummary,
  type Transaction,
  type Wallet,
} from '@personal-os/shared';

/** Factories and derived views of the Money mock API (the same maths as the real server). */

let counter = 0;
const idFor = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const nextMoneyId = (): string => {
  counter += 1;
  return idFor(counter);
};

const CREATED = '2026-10-01T00:00:00.000Z';

export function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: nextMoneyId(),
    name: `Wallet ${String(counter)}`,
    kind: 'bank',
    color: '#9EE0C8',
    openingBalancePaise: 0,
    balancePaise: 0,
    archived: false,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: nextMoneyId(),
    name: `Category ${String(counter)}`,
    kind: 'expense',
    color: '#F6A462',
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: nextMoneyId(),
    kind: 'expense',
    amountPaise: 10000,
    occurredOn: '2026-10-14',
    walletId: '',
    toWalletId: null,
    categoryId: null,
    note: null,
    recurringId: null,
    subscriptionId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function makeRecurring(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id: nextMoneyId(),
    kind: 'expense',
    amountPaise: 1500000,
    walletId: '',
    toWalletId: null,
    categoryId: null,
    note: null,
    rule: 'FREQ=MONTHLY;BYMONTHDAY=1',
    nextOn: '2026-11-01',
    endsOn: null,
    active: true,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

/** What the mock stores for a budget (spent and percent are worked out when it is listed). */
export interface StoredBudget {
  id: string;
  categoryId: string;
  month: string;
  amountPaise: number;
}

export function makeBudget(overrides: Partial<StoredBudget> = {}): StoredBudget {
  return {
    id: nextMoneyId(),
    categoryId: '',
    month: '2026-10',
    amountPaise: 500000,
    ...overrides,
  };
}

export function makeGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: nextMoneyId(),
    name: `Goal ${String(counter)}`,
    targetPaise: 5000000,
    savedPaise: 0,
    targetOn: null,
    color: '#C9B4F7',
    percent: 0,
    achieved: false,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: nextMoneyId(),
    name: `Subscription ${String(counter)}`,
    amountPaise: 64900,
    cycle: 'monthly',
    nextRenewalOn: '2026-10-20',
    status: 'active',
    walletId: null,
    categoryId: null,
    color: '#F4A9C4',
    note: null,
    monthlyPaise: 0,
    yearlyPaise: 0,
    daysUntilRenewal: 0,
    overdue: false,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ derived values */

const DAY_MS = 24 * 60 * 60 * 1000;
const utc = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
export const daysBetween = (from: string, to: string): number => Math.round((utc(to) - utc(from)) / DAY_MS);

/** The balance: opening + income - expense + transfers in - transfers out. */
export function balanceOf(wallet: Wallet, live: readonly Transaction[]): number {
  let balance = wallet.openingBalancePaise;
  for (const tx of live) {
    if (tx.kind === 'income' && tx.walletId === wallet.id) balance += tx.amountPaise;
    if (tx.kind === 'expense' && tx.walletId === wallet.id) balance -= tx.amountPaise;
    if (tx.kind === 'transfer') {
      if (tx.walletId === wallet.id) balance -= tx.amountPaise;
      if (tx.toWalletId === wallet.id) balance += tx.amountPaise;
    }
  }
  return balance;
}

export function budgetView(budget: StoredBudget, live: readonly Transaction[]): Budget {
  const spent = live
    .filter(
      (tx) =>
        tx.kind === 'expense' &&
        tx.categoryId === budget.categoryId &&
        monthOf(tx.occurredOn) === budget.month,
    )
    .reduce((sum, tx) => sum + tx.amountPaise, 0);
  return {
    ...budget,
    spentPaise: spent,
    percent: Math.round((spent * 100) / budget.amountPaise),
  };
}

export function goalView(goal: SavingsGoal): SavingsGoal {
  return {
    ...goal,
    percent: Math.round((goal.savedPaise * 100) / goal.targetPaise),
    achieved: goal.savedPaise >= goal.targetPaise,
  };
}

export function subscriptionView(sub: Subscription, today: string): Subscription {
  const days = daysBetween(today, sub.nextRenewalOn);
  return {
    ...sub,
    monthlyPaise: monthlyPaise(sub.amountPaise, sub.cycle),
    yearlyPaise: yearlyPaise(sub.amountPaise, sub.cycle),
    daysUntilRenewal: days,
    overdue: sub.status === 'active' && days < 0,
  };
}

export function subscriptionSummary(views: readonly Subscription[]): SubscriptionSummary {
  const active = views.filter((sub) => sub.status === 'active');
  return {
    activeCount: active.length,
    monthlyPaise: active.reduce((sum, sub) => sum + sub.monthlyPaise, 0),
    yearlyPaise: active.reduce((sum, sub) => sum + sub.yearlyPaise, 0),
  };
}

/** The renewal day one cycle after `day`. */
export function nextRenewal(day: string, cycle: BillingCycle): string {
  if (cycle === 'weekly') return addDays(day, 7);
  return addMonths(day, 12 / CYCLES_PER_YEAR[cycle]);
}

export function summaryOf(month: string, live: readonly Transaction[]): MonthSummary {
  const inMonth = (m: string) =>
    live.filter(
      (tx) =>
        tx.kind !== 'transfer' && tx.occurredOn >= monthStart(m) && tx.occurredOn < monthEnd(m),
    );
  const rows = inMonth(month);
  const sum = (kind: 'income' | 'expense', list: readonly Transaction[]) =>
    list.filter((tx) => tx.kind === kind).reduce((total, tx) => total + tx.amountPaise, 0);
  const income = sum('income', rows);
  const expense = sum('expense', rows);

  const byCategory = new Map<string, MonthSummary['byCategory'][number]>();
  const byDay = new Map<string, MonthSummary['byDay'][number]>();
  for (const tx of rows) {
    const kind = tx.kind as 'income' | 'expense';
    const key = `${kind}:${tx.categoryId ?? ''}`;
    const row = byCategory.get(key) ?? { categoryId: tx.categoryId, kind, totalPaise: 0 };
    row.totalPaise += tx.amountPaise;
    byCategory.set(key, row);
    const day = byDay.get(tx.occurredOn) ?? { date: tx.occurredOn, incomePaise: 0, expensePaise: 0 };
    if (kind === 'income') day.incomePaise += tx.amountPaise;
    else day.expensePaise += tx.amountPaise;
    byDay.set(tx.occurredOn, day);
  }
  return {
    month,
    incomePaise: income,
    expensePaise: expense,
    netPaise: income - expense,
    previousExpensePaise: sum('expense', inMonth(addMonthsToMonth(month, -1))),
    byCategory: [...byCategory.values()],
    byDay: [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}
