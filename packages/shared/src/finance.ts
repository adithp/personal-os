import { z } from 'zod';
import { defineAction } from './actions';
import type { WEEKDAYS } from './recurrence';
import { parseRecurrence, recurrenceRuleSchema } from './recurrence';

/**
 * Money module, Finance and Wallet part (docs/features/money.md, finance.md, wallet.md; research
 * memo docs/design/research/money.md). All amounts are integer paise. Dates of transactions are
 * India calendar days written YYYY-MM-DD ("day strings"): a transaction happens on a day, not at
 * an instant, so a day string avoids every time zone shift. Created/updated times are real UTC
 * instants like everywhere else.
 */

/** Tables of this part that screens show live. */
export const MONEY_REALTIME_TABLES = [
  'wallets',
  'categories',
  'transactions',
  'recurring_transactions',
  'budgets',
  'savings_goals',
] as const;

/* ------------------------------------------------------------------ India day helpers */

const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const utcOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** True for a real calendar day such as 2026-02-28 (not 2026-02-30). */
export function isDayString(value: string): boolean {
  return DAY_PATTERN.test(value) && dayOf(utcOf(value)) === value;
}

/** The day string n days after `day` (n may be negative). */
export function addDays(day: string, n: number): string {
  return dayOf(utcOf(day) + n * DAY_MS);
}

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * n months after `day`, keeping the day of the month when the month is long enough, else the last
 * day of that month (31 January + 1 month = 28 or 29 February). `anchorDay` is the wanted day of
 * the month when `day` was itself clamped.
 */
export function addMonths(day: string, n: number, anchorDay?: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const wanted = Math.min(anchorDay ?? d, daysInMonth(year, month));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(wanted).padStart(2, '0')}`;
}

/** The month (YYYY-MM) of a day string. */
export const monthOf = (day: string): string => day.slice(0, 7);

/** First day of a month: "2026-10" -> "2026-10-01". */
export const monthStart = (month: string): string => `${month}-01`;

/** First day of the next month: the exclusive end of a month. */
export const monthEnd = (month: string): string => addMonths(monthStart(month), 1);

/** The month n months after `month`. */
export const addMonthsToMonth = (month: string, n: number): string =>
  monthOf(addMonths(monthStart(month), n));

const WEEKDAY_NUMBER: Record<(typeof WEEKDAYS)[number], number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 0,
};

/**
 * The first date of a repeat rule (one of the presets of recurrence.ts) strictly after `after`.
 * Null when the rule is not a preset. Pure day arithmetic, so no time zone can shift it.
 * Monthly rules on day 29 to 31 use the last day of short months; yearly keeps month and day
 * (29 February becomes 28 February in other years).
 */
export function nextRuleDay(rule: string, after: string): string | null {
  const recurrence = parseRecurrence(rule);
  if (!recurrence) return null;
  switch (recurrence.freq) {
    case 'daily':
      return addDays(after, 1);
    case 'weekly': {
      const wanted = recurrence.days.map((day) => WEEKDAY_NUMBER[day]);
      for (let step = 1; step <= 7; step += 1) {
        const candidate = addDays(after, step);
        if (wanted.includes(new Date(utcOf(candidate)).getUTCDay())) return candidate;
      }
      return null;
    }
    case 'monthly': {
      const sameMonth = addMonths(`${monthOf(after)}-01`, 0, recurrence.day);
      return sameMonth > after ? sameMonth : addMonths(`${monthOf(after)}-01`, 1, recurrence.day);
    }
    case 'yearly': {
      const anchor = Number(after.slice(8, 10));
      return addMonths(after, 12, anchor);
    }
  }
}

/* ------------------------------------------------------------------ shared field schemas */

/** Largest amount accepted: 10 billion rupees, far below the safe integer range. */
export const MAX_PAISE = 1_000_000_000_000;

export const paiseSchema = z.number().int().min(1, 'Enter an amount above zero').max(MAX_PAISE);
const signedPaise = z.number().int().min(-MAX_PAISE).max(MAX_PAISE);

export const daySchema = z.string().refine(isDayString, { message: 'Use a date like 2026-10-14' });
export const monthSchema = z.string().regex(MONTH_PATTERN, 'Use a month like 2026-10');
const isoTime = z.iso.datetime({ offset: true });
const id = z.uuid();
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a color like #9EE0C8');
const noteText = z.string().trim().max(500);

export const NAME_MAX = 60;
const name = z.string().trim().min(1, 'Name is required').max(NAME_MAX);

export const WALLET_KINDS = ['cash', 'bank', 'card', 'upi', 'other'] as const;
export type WalletKind = (typeof WALLET_KINDS)[number];
export const TRANSACTION_KINDS = ['income', 'expense', 'transfer'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];
export const CATEGORY_KINDS = ['income', 'expense'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/* ------------------------------------------------------------------ wallets */

export const walletSchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(WALLET_KINDS),
  color: z.string(),
  openingBalancePaise: z.number().int(),
  /** Opening balance + income - expenses + transfers in - transfers out (live transactions). */
  balancePaise: z.number().int(),
  archived: z.boolean(),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type Wallet = z.infer<typeof walletSchema>;

export const createWalletInput = z.object({
  name,
  kind: z.enum(WALLET_KINDS).default('bank'),
  color: color.optional(),
  openingBalancePaise: signedPaise.default(0),
});
export type CreateWalletInput = z.input<typeof createWalletInput>;

export const updateWalletInput = z
  .object({
    id,
    name: name.optional(),
    kind: z.enum(WALLET_KINDS).optional(),
    color: color.optional(),
    openingBalancePaise: signedPaise.optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 1, { message: 'Nothing to change' });
export type UpdateWalletInput = z.input<typeof updateWalletInput>;

export const listWalletsInput = z.object({ includeArchived: z.boolean().default(false) });
export const idInput = z.object({ id });

/* ------------------------------------------------------------------ categories */

export const categorySchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(CATEGORY_KINDS),
  color: z.string(),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type Category = z.infer<typeof categorySchema>;

export const createCategoryInput = z.object({
  name,
  kind: z.enum(CATEGORY_KINDS),
  color: color.optional(),
});
export type CreateCategoryInput = z.input<typeof createCategoryInput>;

export const updateCategoryInput = z
  .object({ id, name: name.optional(), color: color.optional() })
  .refine((input) => Object.keys(input).length > 1, { message: 'Nothing to change' });

/** Categories a new user starts with (created by the first finance.categories.list call). */
export const DEFAULT_CATEGORIES: readonly { name: string; kind: CategoryKind; color: string }[] = [
  { name: 'Food', kind: 'expense', color: '#F6A462' },
  { name: 'Transport', kind: 'expense', color: '#93D3F5' },
  { name: 'Shopping', kind: 'expense', color: '#F4A9C4' },
  { name: 'Bills', kind: 'expense', color: '#F7D96B' },
  { name: 'Health', kind: 'expense', color: '#C6E46E' },
  { name: 'Entertainment', kind: 'expense', color: '#C9B4F7' },
  { name: 'Other', kind: 'expense', color: '#C5CCD6' },
  { name: 'Salary', kind: 'income', color: '#9EE0C8' },
  { name: 'Other income', kind: 'income', color: '#B8C4F7' },
];

/* ------------------------------------------------------------------ transactions */

export const transactionSchema = z.object({
  id,
  kind: z.enum(TRANSACTION_KINDS),
  amountPaise: z.number().int().min(1),
  /** India calendar day, YYYY-MM-DD. */
  occurredOn: z.string(),
  walletId: z.uuid(),
  /** Transfers only: the wallet the money goes to. */
  toWalletId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  note: z.string().nullable(),
  /** Set when a repeat rule created it. */
  recurringId: z.uuid().nullable(),
  /** Set when a subscription renewal created it. */
  subscriptionId: z.uuid().nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type Transaction = z.infer<typeof transactionSchema>;

/** The rules that tie kind, wallets and category together. Null when the shape is fine. */
export function transactionShapeError(shape: {
  kind: TransactionKind;
  walletId: string;
  toWalletId?: string | null | undefined;
  categoryId?: string | null | undefined;
}): string | null {
  if (shape.kind === 'transfer') {
    if (!shape.toWalletId) return 'A transfer needs a wallet to send the money to';
    if (shape.toWalletId === shape.walletId) return 'Pick two different wallets';
    if (shape.categoryId) return 'A transfer has no category';
    return null;
  }
  if (shape.toWalletId) return 'Only a transfer has a second wallet';
  return null;
}

const transactionFields = {
  kind: z.enum(TRANSACTION_KINDS),
  amountPaise: paiseSchema,
  walletId: id,
  toWalletId: id.nullish(),
  categoryId: id.nullish(),
  note: noteText.nullish(),
};

export const createTransactionInput = z
  .object({ ...transactionFields, occurredOn: daySchema.optional() })
  .refine((input) => transactionShapeError(input) === null, {
    message: 'Check the wallets and category of this transaction',
  });
export type CreateTransactionInput = z.input<typeof createTransactionInput>;

export const updateTransactionInput = z
  .object({
    id,
    kind: z.enum(TRANSACTION_KINDS).optional(),
    amountPaise: paiseSchema.optional(),
    occurredOn: daySchema.optional(),
    walletId: id.optional(),
    toWalletId: id.nullable().optional(),
    categoryId: id.nullable().optional(),
    note: noteText.nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 1, { message: 'Nothing to change' });
export type UpdateTransactionInput = z.input<typeof updateTransactionInput>;

export const TRANSACTIONS_MAX_LIMIT = 500;
export const listTransactionsInput = z.object({
  /** Transactions of this wallet, including transfers into it. */
  walletId: id.optional(),
  categoryId: id.optional(),
  kind: z.enum(TRANSACTION_KINDS).optional(),
  /** First and last day, both included. */
  from: daySchema.optional(),
  to: daySchema.optional(),
  /** Text in the note. */
  q: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(TRANSACTIONS_MAX_LIMIT).default(200),
  offset: z.number().int().min(0).default(0),
});
export type ListTransactionsInput = z.input<typeof listTransactionsInput>;

/* ------------------------------------------------------------------ recurring transactions */

export const recurringTransactionSchema = z.object({
  id,
  kind: z.enum(TRANSACTION_KINDS),
  amountPaise: z.number().int().min(1),
  walletId: z.uuid(),
  toWalletId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  note: z.string().nullable(),
  /** One of the presets of recurrence.ts, e.g. FREQ=MONTHLY;BYMONTHDAY=1. */
  rule: z.string(),
  /** The next day a transaction is due. */
  nextOn: z.string(),
  endsOn: z.string().nullable(),
  active: z.boolean(),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type RecurringTransaction = z.infer<typeof recurringTransactionSchema>;

export const createRecurringInput = z
  .object({
    ...transactionFields,
    rule: recurrenceRuleSchema,
    /** The first day; default today. */
    startOn: daySchema.optional(),
    endsOn: daySchema.nullish(),
  })
  .refine((input) => transactionShapeError(input) === null, {
    message: 'Check the wallets and category of this transaction',
  });
export type CreateRecurringInput = z.input<typeof createRecurringInput>;

export const updateRecurringInput = z
  .object({
    id,
    amountPaise: paiseSchema.optional(),
    walletId: id.optional(),
    toWalletId: id.nullable().optional(),
    categoryId: id.nullable().optional(),
    note: noteText.nullable().optional(),
    rule: recurrenceRuleSchema.optional(),
    nextOn: daySchema.optional(),
    endsOn: daySchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 1, { message: 'Nothing to change' });
export type UpdateRecurringInput = z.input<typeof updateRecurringInput>;

/** What finance.recurring.run answers. */
export const recurringRunResultSchema = z.object({
  created: z.array(transactionSchema),
});
export type RecurringRunResult = z.infer<typeof recurringRunResultSchema>;

/* ------------------------------------------------------------------ budgets */

export const budgetSchema = z.object({
  id,
  categoryId: z.uuid(),
  month: z.string(),
  amountPaise: z.number().int().min(1),
  /** Expenses of the category in the month. */
  spentPaise: z.number().int(),
  /** Whole percent spent (can pass 100). */
  percent: z.number().int().min(0),
});
export type Budget = z.infer<typeof budgetSchema>;

export const listBudgetsInput = z.object({ month: monthSchema.optional() });
export const setBudgetInput = z.object({
  categoryId: id,
  month: monthSchema,
  amountPaise: paiseSchema,
});
export type SetBudgetInput = z.input<typeof setBudgetInput>;

/* ------------------------------------------------------------------ savings goals */

export const savingsGoalSchema = z.object({
  id,
  name: z.string(),
  targetPaise: z.number().int().min(1),
  savedPaise: z.number().int().min(0),
  targetOn: z.string().nullable(),
  color: z.string(),
  percent: z.number().int().min(0),
  achieved: z.boolean(),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type SavingsGoal = z.infer<typeof savingsGoalSchema>;

export const createSavingsGoalInput = z.object({
  name,
  targetPaise: paiseSchema,
  targetOn: daySchema.nullish(),
  color: color.optional(),
  savedPaise: z.number().int().min(0).max(MAX_PAISE).default(0),
});
export type CreateSavingsGoalInput = z.input<typeof createSavingsGoalInput>;

export const updateSavingsGoalInput = z
  .object({
    id,
    name: name.optional(),
    targetPaise: paiseSchema.optional(),
    targetOn: daySchema.nullable().optional(),
    color: color.optional(),
  })
  .refine((input) => Object.keys(input).length > 1, { message: 'Nothing to change' });

/** Add (positive) or take out (negative) money of a goal. The saved amount never goes below 0. */
export const contributeInput = z.object({
  id,
  deltaPaise: signedPaise.refine((value) => value !== 0, { message: 'Enter an amount' }),
});

/* ------------------------------------------------------------------ monthly summary */

export const summaryCategoryRowSchema = z.object({
  categoryId: z.uuid().nullable(),
  kind: z.enum(CATEGORY_KINDS),
  totalPaise: z.number().int(),
});
export const summaryDaySchema = z.object({
  date: z.string(),
  incomePaise: z.number().int(),
  expensePaise: z.number().int(),
});
/** Income, expense and the spread by category and day of one month. Transfers are left out. */
export const monthSummarySchema = z.object({
  month: z.string(),
  incomePaise: z.number().int(),
  expensePaise: z.number().int(),
  netPaise: z.number().int(),
  previousExpensePaise: z.number().int(),
  byCategory: z.array(summaryCategoryRowSchema),
  byDay: z.array(summaryDaySchema),
});
export type MonthSummary = z.infer<typeof monthSummarySchema>;
export const summaryInput = z.object({ month: monthSchema.optional() });

/* ------------------------------------------------------------------ action definitions */

export const financeActions = {
  walletsList: defineAction({
    name: 'finance.wallets.list',
    description: 'List wallets with their current balance in paise.',
    permission: 'read',
    input: listWalletsInput,
  }),
  walletsCreate: defineAction({
    name: 'finance.wallets.create',
    description: 'Add a wallet (cash, bank, card, upi, other) with an opening balance in paise.',
    permission: 'write',
    input: createWalletInput,
  }),
  walletsUpdate: defineAction({
    name: 'finance.wallets.update',
    description: 'Rename, recolor, archive a wallet or change its opening balance.',
    permission: 'write',
    input: updateWalletInput,
  }),
  walletsDelete: defineAction({
    name: 'finance.wallets.delete',
    description: 'Delete a wallet that has no transactions. It can be restored.',
    permission: 'write',
    input: idInput,
  }),
  walletsRestore: defineAction({
    name: 'finance.wallets.restore',
    description: 'Bring back a deleted wallet.',
    permission: 'write',
    input: idInput,
  }),
  categoriesList: defineAction({
    name: 'finance.categories.list',
    description: 'List income and expense categories (the first call creates the defaults).',
    permission: 'read',
    input: z.object({}),
  }),
  categoriesCreate: defineAction({
    name: 'finance.categories.create',
    description: 'Add a category with a color.',
    permission: 'write',
    input: createCategoryInput,
  }),
  categoriesUpdate: defineAction({
    name: 'finance.categories.update',
    description: 'Rename or recolor a category.',
    permission: 'write',
    input: updateCategoryInput,
  }),
  categoriesDelete: defineAction({
    name: 'finance.categories.delete',
    description: 'Delete a category. Its transactions stay and show as uncategorised.',
    permission: 'write',
    input: idInput,
  }),
  categoriesRestore: defineAction({
    name: 'finance.categories.restore',
    description: 'Bring back a deleted category.',
    permission: 'write',
    input: idInput,
  }),
  transactionsList: defineAction({
    name: 'finance.transactions.list',
    description: 'List transactions, newest first, with filters for wallet, category, kind, dates.',
    permission: 'read',
    input: listTransactionsInput,
  }),
  transactionsCreate: defineAction({
    name: 'finance.transactions.create',
    description:
      'Add an income, expense or transfer between two wallets. Amount in paise, date as YYYY-MM-DD India day (default today).',
    permission: 'write',
    input: createTransactionInput,
  }),
  transactionsUpdate: defineAction({
    name: 'finance.transactions.update',
    description: 'Change a transaction.',
    permission: 'write',
    input: updateTransactionInput,
  }),
  transactionsDelete: defineAction({
    name: 'finance.transactions.delete',
    description: 'Delete a transaction. It can be restored.',
    permission: 'write',
    input: idInput,
  }),
  transactionsRestore: defineAction({
    name: 'finance.transactions.restore',
    description: 'Bring back a deleted transaction.',
    permission: 'write',
    input: idInput,
  }),
  recurringList: defineAction({
    name: 'finance.recurring.list',
    description: 'List repeating transactions (rent, salary, ...).',
    permission: 'read',
    input: z.object({}),
  }),
  recurringCreate: defineAction({
    name: 'finance.recurring.create',
    description: 'Add a repeating transaction (daily, weekly, monthly or yearly).',
    permission: 'write',
    input: createRecurringInput,
  }),
  recurringUpdate: defineAction({
    name: 'finance.recurring.update',
    description: 'Change a repeating transaction, or pause it with active false.',
    permission: 'write',
    input: updateRecurringInput,
  }),
  recurringDelete: defineAction({
    name: 'finance.recurring.delete',
    description: 'Delete a repeating transaction. Transactions it made stay. It can be restored.',
    permission: 'write',
    input: idInput,
  }),
  recurringRestore: defineAction({
    name: 'finance.recurring.restore',
    description: 'Bring back a deleted repeating transaction.',
    permission: 'write',
    input: idInput,
  }),
  recurringRun: defineAction({
    name: 'finance.recurring.run',
    description:
      'Create the transactions of repeating rules that are due up to today. Safe to call often.',
    permission: 'write',
    input: z.object({}),
  }),
  budgetsList: defineAction({
    name: 'finance.budgets.list',
    description: 'List the budgets of a month (default this month) with spent and percent.',
    permission: 'read',
    input: listBudgetsInput,
  }),
  budgetsSet: defineAction({
    name: 'finance.budgets.set',
    description: 'Set the budget of an expense category for a month (replaces the old amount).',
    permission: 'write',
    input: setBudgetInput,
  }),
  budgetsDelete: defineAction({
    name: 'finance.budgets.delete',
    description: 'Remove a budget.',
    permission: 'write',
    input: idInput,
  }),
  goalsList: defineAction({
    name: 'finance.goals.list',
    description: 'List savings goals with progress.',
    permission: 'read',
    input: z.object({}),
  }),
  goalsCreate: defineAction({
    name: 'finance.goals.create',
    description: 'Add a savings goal with a target in paise and an optional target day.',
    permission: 'write',
    input: createSavingsGoalInput,
  }),
  goalsUpdate: defineAction({
    name: 'finance.goals.update',
    description: 'Change a savings goal.',
    permission: 'write',
    input: updateSavingsGoalInput,
  }),
  goalsContribute: defineAction({
    name: 'finance.goals.contribute',
    description: 'Add money to a savings goal, or take some out with a negative amount.',
    permission: 'write',
    input: contributeInput,
  }),
  goalsDelete: defineAction({
    name: 'finance.goals.delete',
    description: 'Delete a savings goal. It can be restored.',
    permission: 'write',
    input: idInput,
  }),
  goalsRestore: defineAction({
    name: 'finance.goals.restore',
    description: 'Bring back a deleted savings goal.',
    permission: 'write',
    input: idInput,
  }),
  summary: defineAction({
    name: 'finance.summary',
    description:
      'Income, expense and net of a month (default this month) with the spread by category and day.',
    permission: 'read',
    input: summaryInput,
  }),
} as const;

/** What a write route returns. */
export interface MoneyWriteResult<T> {
  item: T;
  undo: { action: string; input: Record<string, unknown> } | null;
}
