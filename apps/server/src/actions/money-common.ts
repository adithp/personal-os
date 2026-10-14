import {
  categories,
  transactions,
  wallets,
  type BudgetRow,
  type CategoryRow,
  type RecurringTransactionRow,
  type SavingsGoalRow,
  type SubscriptionRow,
  type TransactionRow,
  type WalletRow,
} from '@personal-os/db';
import {
  indiaDay,
  monthOf,
  monthlyPaise,
  percentOf,
  transactionShapeError,
  yearlyPaise,
  type BillingCycle,
  type Budget,
  type Category,
  type CategoryKind,
  type RecurringTransaction,
  type SavingsGoal,
  type Subscription,
  type SubscriptionStatus,
  type Transaction,
  type TransactionKind,
  type Wallet,
  type WalletKind,
} from '@personal-os/shared';
import { and, eq, type SQL } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { SoftDeletableTable, UserScope } from '../lib/user-scope';

/** Helpers shared by the Money actions (docs/features/money.md). */

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const invalid = (message: string) => new HttpError(400, 'validation_error', message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

/** Today as an India calendar day. */
export const todayInIndia = (): string => indiaDay(new Date());

/** Whole days from one day string to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The default color of wallets, goals and subscriptions (module mint). */
export const DEFAULT_COLOR = '#9EE0C8';

export const andAll = (first: SQL, ...rest: (SQL | undefined)[]): SQL =>
  and(first, ...rest) ?? first;

export const liveById = (scope: UserScope, table: SoftDeletableTable, id: string): SQL =>
  andAll(eq(table.id, id), scope.isLive(table));

/** The live row with this id of the user, or undefined (foreign and unknown ids look the same). */
export async function findLive<T extends SoftDeletableTable>(
  scope: UserScope,
  table: T,
  id: string,
): Promise<T['$inferSelect'] | undefined> {
  const [row] = await scope.select(table, { where: liveById(scope, table, id), limit: 1 });
  return row;
}

/** The row with this id, deleted or not. */
export async function findAny<T extends SoftDeletableTable>(
  scope: UserScope,
  table: T,
  id: string,
): Promise<T['$inferSelect'] | undefined> {
  const [row] = await scope.select(table, { where: eq(table.id, id), limit: 1 });
  return row;
}

export async function updateLive<T extends SoftDeletableTable>(
  scope: UserScope,
  table: T,
  id: string,
  values: object,
): Promise<T['$inferSelect'] | undefined> {
  const [row] = await scope.update(
    table,
    { ...values, updatedAt: new Date() } as never,
    liveById(scope, table, id),
  );
  return row;
}

export async function undelete<T extends SoftDeletableTable>(
  scope: UserScope,
  table: T,
  id: string,
): Promise<T['$inferSelect'] | undefined> {
  const [row] = await scope.update(
    table,
    { deletedAt: null, updatedAt: new Date() } as never,
    eq(table.id, id),
  );
  return row;
}

export async function softDeleteLive<T extends SoftDeletableTable>(
  scope: UserScope,
  table: T,
  id: string,
): Promise<T['$inferSelect'] | undefined> {
  const [row] = await scope.softDelete(table, liveById(scope, table, id));
  return row;
}

/**
 * The fields of `input` that differ from `current` (`values`) and the current values of those
 * fields (`old`, for the undo).
 */
export function changes(current: object, input: object, keys: readonly string[]) {
  const now = current as Record<string, unknown>;
  const wanted = input as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  const old: Record<string, unknown> = {};
  for (const key of keys) {
    if (wanted[key] !== undefined && wanted[key] !== now[key]) {
      values[key] = wanted[key];
      old[key] = now[key];
    }
  }
  return { values, old };
}

/* ------------------------------------------------------------------ referenced rows */

export async function requireWallet(scope: UserScope, id: string): Promise<void> {
  if (!(await findLive(scope, wallets, id))) throw invalid('Wallet not found');
}

/** The category must be a live category of the user and (when given) of this kind. */
export async function requireCategory(
  scope: UserScope,
  id: string,
  kind: CategoryKind,
): Promise<void> {
  const row = await findLive(scope, categories, id);
  if (!row) throw invalid('Category not found');
  if (row.kind !== kind) throw invalid(`Pick an ${kind} category`);
}

interface Shape {
  kind: TransactionKind;
  walletId: string;
  toWalletId?: string | null | undefined;
  categoryId?: string | null | undefined;
}

/** Checks the kind/wallet/category rules and that the referenced rows are live rows of the user. */
export async function checkShape(
  scope: UserScope,
  shape: Shape,
  only: { wallets: boolean; category: boolean } = { wallets: true, category: true },
): Promise<void> {
  const problem = transactionShapeError(shape);
  if (problem) throw invalid(problem);
  if (only.wallets) {
    await requireWallet(scope, shape.walletId);
    if (shape.toWalletId) await requireWallet(scope, shape.toWalletId);
  }
  if (only.category && shape.categoryId && shape.kind !== 'transfer') {
    await requireCategory(scope, shape.categoryId, shape.kind);
  }
}

/** Money moved by live transactions per wallet: income - expense + transfers in - transfers out. */
export async function walletDeltas(scope: UserScope): Promise<Map<string, number>> {
  const rows = await scope.select(transactions, { where: scope.isLive(transactions) });
  const deltas = new Map<string, number>();
  const add = (id: string, amount: number) => deltas.set(id, (deltas.get(id) ?? 0) + amount);
  for (const row of rows) {
    if (row.kind === 'income') add(row.walletId, row.amountPaise);
    else if (row.kind === 'expense') add(row.walletId, -row.amountPaise);
    else {
      add(row.walletId, -row.amountPaise);
      if (row.toWalletId) add(row.toWalletId, row.amountPaise);
    }
  }
  return deltas;
}

/* ------------------------------------------------------------------ mappers */

export function toWallet(row: WalletRow, deltas: Map<string, number>): Wallet {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as WalletKind,
    color: row.color,
    openingBalancePaise: row.openingBalancePaise,
    balancePaise: row.openingBalancePaise + (deltas.get(row.id) ?? 0),
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CategoryKind,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    kind: row.kind as TransactionKind,
    amountPaise: row.amountPaise,
    occurredOn: row.occurredOn,
    walletId: row.walletId,
    toWalletId: row.toWalletId,
    categoryId: row.categoryId,
    note: row.note,
    recurringId: row.recurringId,
    subscriptionId: row.subscriptionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toRecurring(row: RecurringTransactionRow): RecurringTransaction {
  return {
    id: row.id,
    kind: row.kind as TransactionKind,
    amountPaise: row.amountPaise,
    walletId: row.walletId,
    toWalletId: row.toWalletId,
    categoryId: row.categoryId,
    note: row.note,
    rule: row.rule,
    nextOn: row.nextOn,
    endsOn: row.endsOn,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** `month` is written YYYY-MM (the row stores the first day of the month). */
export function toBudget(row: BudgetRow, spentPaise: number): Budget {
  return {
    id: row.id,
    categoryId: row.categoryId,
    month: monthOf(row.month),
    amountPaise: row.amountPaise,
    spentPaise,
    percent: percentOf(spentPaise, row.amountPaise),
  };
}

export function toGoal(row: SavingsGoalRow): SavingsGoal {
  return {
    id: row.id,
    name: row.name,
    targetPaise: row.targetPaise,
    savedPaise: row.savedPaise,
    targetOn: row.targetOn,
    color: row.color,
    percent: percentOf(row.savedPaise, row.targetPaise),
    achieved: row.savedPaise >= row.targetPaise,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSubscription(row: SubscriptionRow, today: string): Subscription {
  const cycle = row.cycle as BillingCycle;
  const status = row.status as SubscriptionStatus;
  return {
    id: row.id,
    name: row.name,
    amountPaise: row.amountPaise,
    cycle,
    nextRenewalOn: row.nextRenewalOn,
    status,
    walletId: row.walletId,
    categoryId: row.categoryId,
    color: row.color,
    note: row.note,
    monthlyPaise: monthlyPaise(row.amountPaise, cycle),
    yearlyPaise: yearlyPaise(row.amountPaise, cycle),
    daysUntilRenewal: daysBetween(today, row.nextRenewalOn),
    overdue: status === 'active' && row.nextRenewalOn < today,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
