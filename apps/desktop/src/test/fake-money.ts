import {
  DEFAULT_CATEGORIES,
  addDays,
  createCategoryInput,
  createRecurringInput,
  createSavingsGoalInput,
  createSubscriptionInput,
  createTransactionInput,
  createWalletInput,
  contributeInput,
  indiaDay,
  monthOf,
  nextRuleDay,
  renewSubscriptionInput,
  setBudgetInput,
  updateCategoryInput,
  updateRecurringInput,
  updateSavingsGoalInput,
  updateSubscriptionInput,
  updateTransactionInput,
  updateWalletInput,
  type Category,
  type RecurringTransaction,
  type SavingsGoal,
  type Subscription,
  type Transaction,
  type Wallet,
} from '@personal-os/shared';
import { ApiError, type RequestOptions } from '../api/api-client';
import {
  balanceOf,
  budgetView,
  goalView,
  makeBudget,
  nextMoneyId,
  nextRenewal,
  subscriptionSummary,
  subscriptionView,
  summaryOf,
  type StoredBudget,
} from './fake-money-data';
import { NOT_HANDLED } from './fake-modules';

export {
  makeBudget,
  makeCategory,
  makeGoal,
  makeRecurring,
  makeSubscription,
  makeTransaction,
  makeWallet,
  type StoredBudget,
} from './fake-money-data';

/** What a test puts in the Money mock before createFakeApi() is called. */
export interface MoneySeed {
  wallets?: Wallet[];
  categories?: Category[];
  transactions?: Transaction[];
  recurring?: RecurringTransaction[];
  budgets?: StoredBudget[];
  goals?: SavingsGoal[];
  subscriptions?: Subscription[];
}

let pending: MoneySeed = {};
let latest: ReturnType<typeof build> | null = null;

/** Data for the next createMoneyFake() (so for the next createFakeApi()). */
export function seedMoney(seed: MoneySeed): void {
  pending = seed;
}

/** Forget the seed and the last mock (call in beforeEach). */
export function resetMoneyFake(): void {
  pending = {};
  latest = null;
}

/** The state of the last mock that was created, for assertions. */
export function moneyState() {
  if (!latest) throw new Error('No Money mock was created yet');
  return latest.state;
}

interface Table<T extends { id: string }> {
  rows: Map<string, T>;
  gone: Set<string>;
}
const table = <T extends { id: string }>(items: readonly T[] = []): Table<T> => ({
  rows: new Map(items.map((item) => [item.id, item])),
  gone: new Set(),
});
const live = <T extends { id: string }>(t: Table<T>): T[] =>
  [...t.rows.values()].filter((row) => !t.gone.has(row.id));
const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found`);
const find = <T extends { id: string }>(t: Table<T>, id: string, what: string): T => {
  const row = t.rows.get(id);
  if (!row || t.gone.has(id)) throw notFound(what);
  return row;
};

const now = () => new Date().toISOString();
const bad = (message: string) => new ApiError(400, 'validation_error', message);
interface Parser<T> {
  safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
}
function parse<T>(schema: Parser<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw bad(result.error.issues[0]?.message ?? 'Invalid input');
  return result.data;
}

type Undo = { action: string; input: Record<string, unknown> } | null;
const write = <T>(item: T, undo: Undo) => ({ item, undo });

function build() {
  const wallets = table(pending.wallets);
  const categories = table(pending.categories);
  const transactions = table(pending.transactions);
  const recurring = table(pending.recurring);
  const budgets = table(pending.budgets);
  const goals = table(pending.goals);
  const subscriptions = table(pending.subscriptions);
  const today = () => indiaDay(new Date());

  const walletView = (wallet: Wallet): Wallet => ({
    ...wallet,
    balancePaise: balanceOf(wallet, live(transactions)),
  });
  const subView = (sub: Subscription) => subscriptionView(sub, today());
  const patch = <T extends { id: string; updatedAt?: string }>(
    t: Table<T>,
    id: string,
    what: string,
    changes: Partial<T>,
  ): { next: T; previous: Partial<T> } => {
    const current = find(t, id, what);
    const previous: Partial<T> = {};
    for (const key of Object.keys(changes) as (keyof T)[]) previous[key] = current[key];
    const next = { ...current, ...changes, ...(current.updatedAt ? { updatedAt: now() } : {}) };
    t.rows.set(id, next);
    return { next, previous };
  };
  /** The undo of an update: the same action with the old values. */
  const undoUpdate = (action: string, id: string, previous: object): Undo => ({
    action,
    input: { id, ...previous },
  });

  const addTransaction = (input: Partial<Transaction> & Pick<Transaction, 'kind' | 'amountPaise' | 'walletId'>) => {
    const tx: Transaction = {
      id: nextMoneyId(),
      toWalletId: null,
      categoryId: null,
      note: null,
      recurringId: null,
      subscriptionId: null,
      occurredOn: today(),
      createdAt: now(),
      updatedAt: now(),
      ...input,
    };
    transactions.rows.set(tx.id, tx);
    return tx;
  };

  const ensureCategories = () => {
    if (categories.rows.size > 0) return;
    for (const item of DEFAULT_CATEGORIES) {
      const id = nextMoneyId();
      categories.rows.set(id, { id, ...item, createdAt: now(), updatedAt: now() });
    }
  };

  /* ---------------------------------------------------------------- list helpers */

  const listTransactions = (query: NonNullable<RequestOptions['query']>) => {
    const q = typeof query.q === 'string' ? query.q.toLowerCase() : '';
    const walletId = query.walletId === undefined ? null : String(query.walletId);
    const limit = query.limit === undefined ? 200 : Number(query.limit);
    const offset = query.offset === undefined ? 0 : Number(query.offset);
    return live(transactions)
      .map((tx, index) => ({ tx, index }))
      .filter(({ tx }) => {
        if (walletId && tx.walletId !== walletId && tx.toWalletId !== walletId) return false;
        if (query.categoryId !== undefined && tx.categoryId !== query.categoryId) return false;
        if (query.kind !== undefined && tx.kind !== query.kind) return false;
        if (typeof query.from === 'string' && tx.occurredOn < query.from) return false;
        if (typeof query.to === 'string' && tx.occurredOn > query.to) return false;
        if (q && !(tx.note ?? '').toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) =>
        a.tx.occurredOn === b.tx.occurredOn
          ? b.index - a.index
          : a.tx.occurredOn < b.tx.occurredOn
            ? 1
            : -1,
      )
      .slice(offset, offset + limit)
      .map(({ tx }) => tx);
  };

  const subscriptionViews = (status?: string) =>
    live(subscriptions)
      .map(subView)
      .filter((sub) => !status || sub.status === status)
      .sort((a, b) => (a.nextRenewalOn < b.nextRenewalOn ? -1 : a.nextRenewalOn > b.nextRenewalOn ? 1 : 0));

  /* ---------------------------------------------------------------- undo */

  const undoAction = (action: string, input: Record<string, unknown>): unknown => {
    const id = String(input.id);
    const tables: Record<string, Table<{ id: string }>> = {
      wallets: wallets as Table<{ id: string }>,
      categories: categories as Table<{ id: string }>,
      transactions: transactions as Table<{ id: string }>,
      recurring: recurring as Table<{ id: string }>,
      goals: goals as Table<{ id: string }>,
      subscriptions: subscriptions as Table<{ id: string }>,
    };
    const [, part, verb] = action.startsWith('subscriptions.')
      ? ['', 'subscriptions', action.split('.')[1]]
      : action.split('.');
    if (action === 'subscriptions.undo_renew') {
      const sub = find(subscriptions, id, 'Subscription');
      subscriptions.rows.set(id, { ...sub, nextRenewalOn: String(input.previousRenewalOn) });
      if (input.transactionId) transactions.gone.add(String(input.transactionId));
      return write(null, null);
    }
    if (part === 'budgets') {
      if (verb === 'delete') budgets.rows.delete(id);
      else {
        const stored = parse(setBudgetInput, input);
        const existing = live(budgets).find(
          (b) => b.categoryId === stored.categoryId && b.month === stored.month,
        );
        if (existing) budgets.rows.set(existing.id, { ...existing, amountPaise: stored.amountPaise });
        else {
          const fresh = makeBudget({ ...stored });
          budgets.rows.set(fresh.id, fresh);
        }
      }
      return write(null, null);
    }
    const target = part ? tables[part] : undefined;
    if (!target) throw new ApiError(404, 'not_found', `Unknown undo ${action}`);
    if (verb === 'delete') target.gone.add(id);
    else if (verb === 'restore') target.gone.delete(id);
    else if (verb === 'update') {
      const { id: _id, ...rest } = input;
      target.rows.set(id, { ...find(target, id, 'Item'), ...rest });
    } else if (verb === 'contribute') {
      handle('POST', `/savings-goals/${id}/contribute`, { body: { deltaPaise: input.deltaPaise } });
    }
    return write(null, null);
  };

  /* ---------------------------------------------------------------- routes */

  const handle = (method: string, path: string, options: RequestOptions): unknown => {
    const body = (options.body ?? {}) as Record<string, unknown>;
    const query = options.query ?? {};
    const route = (m: string, pattern: string): RegExpExecArray | null =>
      method === m ? new RegExp(`^${pattern}$`).exec(path) : null;
    let hit: RegExpExecArray | null;

    if (method === 'POST' && path === '/undo') {
      const { action, input } = body as { action: string; input: Record<string, unknown> };
      if (!action.startsWith('finance.') && !action.startsWith('subscriptions.')) return NOT_HANDLED;
      return undoAction(action, input);
    }

    /* wallets */
    if (route('GET', '/wallets')) {
      const archived = String(query.includeArchived) === 'true';
      return { items: live(wallets).filter((w) => archived || !w.archived).map(walletView) };
    }
    if (route('POST', '/wallets')) {
      const input = parse(createWalletInput, body);
      const wallet: Wallet = {
        id: nextMoneyId(),
        name: input.name,
        kind: input.kind,
        color: input.color ?? '#9EE0C8',
        openingBalancePaise: input.openingBalancePaise,
        balancePaise: 0,
        archived: false,
        createdAt: now(),
        updatedAt: now(),
      };
      wallets.rows.set(wallet.id, wallet);
      return write(walletView(wallet), { action: 'finance.wallets.delete', input: { id: wallet.id } });
    }
    if ((hit = route('PATCH', '/wallets/([^/]+)'))) {
      const id = hit[1] ?? '';
      const input = parse(updateWalletInput, { id, ...body });
      const { id: _id, ...changes } = input;
      const { next, previous } = patch(wallets, id, 'Wallet', changes);
      return write(walletView(next), undoUpdate('finance.wallets.update', id, previous));
    }
    if ((hit = route('DELETE', '/wallets/([^/]+)'))) {
      const id = hit[1] ?? '';
      const wallet = find(wallets, id, 'Wallet');
      if (live(transactions).some((tx) => tx.walletId === id || tx.toWalletId === id)) {
        throw new ApiError(409, 'wallet_in_use', 'This wallet has transactions. Archive it instead.');
      }
      wallets.gone.add(id);
      return write(walletView(wallet), { action: 'finance.wallets.restore', input: { id } });
    }
    if ((hit = route('POST', '/wallets/([^/]+)/restore'))) {
      wallets.gone.delete(hit[1] ?? '');
      return write(walletView(find(wallets, hit[1] ?? '', 'Wallet')), null);
    }

    /* categories */
    if (route('GET', '/categories')) {
      ensureCategories();
      return { items: live(categories) };
    }
    if (route('POST', '/categories')) {
      const input = parse(createCategoryInput, body);
      const category: Category = {
        id: nextMoneyId(),
        name: input.name,
        kind: input.kind,
        color: input.color ?? '#C5CCD6',
        createdAt: now(),
        updatedAt: now(),
      };
      categories.rows.set(category.id, category);
      return write(category, { action: 'finance.categories.delete', input: { id: category.id } });
    }
    if ((hit = route('PATCH', '/categories/([^/]+)'))) {
      const id = hit[1] ?? '';
      const { id: _id, ...changes } = parse(updateCategoryInput, { id, ...body });
      const { next, previous } = patch(categories, id, 'Category', changes);
      return write(next, undoUpdate('finance.categories.update', id, previous));
    }
    if ((hit = route('DELETE', '/categories/([^/]+)'))) {
      const id = hit[1] ?? '';
      const category = find(categories, id, 'Category');
      categories.gone.add(id);
      return write(category, { action: 'finance.categories.restore', input: { id } });
    }
    if ((hit = route('POST', '/categories/([^/]+)/restore'))) {
      categories.gone.delete(hit[1] ?? '');
      return write(find(categories, hit[1] ?? '', 'Category'), null);
    }

    /* transactions */
    if (route('GET', '/transactions')) return { items: listTransactions(query) };
    if (route('POST', '/transactions')) {
      const input = parse(createTransactionInput, body);
      const tx = addTransaction({
        kind: input.kind,
        amountPaise: input.amountPaise,
        walletId: input.walletId,
        toWalletId: input.toWalletId ?? null,
        categoryId: input.categoryId ?? null,
        note: input.note || null,
        ...(input.occurredOn ? { occurredOn: input.occurredOn } : {}),
      });
      return write(tx, { action: 'finance.transactions.delete', input: { id: tx.id } });
    }
    if ((hit = route('PATCH', '/transactions/([^/]+)'))) {
      const id = hit[1] ?? '';
      const { id: _id, ...changes } = parse(updateTransactionInput, { id, ...body });
      const { next, previous } = patch(transactions, id, 'Transaction', changes);
      return write(next, undoUpdate('finance.transactions.update', id, previous));
    }
    if ((hit = route('DELETE', '/transactions/([^/]+)'))) {
      const id = hit[1] ?? '';
      const tx = find(transactions, id, 'Transaction');
      transactions.gone.add(id);
      return write(tx, { action: 'finance.transactions.restore', input: { id } });
    }
    if ((hit = route('POST', '/transactions/([^/]+)/restore'))) {
      transactions.gone.delete(hit[1] ?? '');
      return write(find(transactions, hit[1] ?? '', 'Transaction'), null);
    }

    /* recurring transactions */
    if (route('GET', '/recurring-transactions')) return { items: live(recurring) };
    if (route('POST', '/recurring-transactions/run')) {
      const created: Transaction[] = [];
      for (const rule of live(recurring)) {
        let next = rule.nextOn;
        let active = rule.active;
        while (active && next <= today()) {
          if (rule.endsOn && next > rule.endsOn) {
            active = false;
            break;
          }
          created.push(
            addTransaction({
              kind: rule.kind,
              amountPaise: rule.amountPaise,
              walletId: rule.walletId,
              toWalletId: rule.toWalletId,
              categoryId: rule.categoryId,
              note: rule.note,
              occurredOn: next,
              recurringId: rule.id,
            }),
          );
          next = nextRuleDay(rule.rule, next) ?? addDays(today(), 1);
        }
        recurring.rows.set(rule.id, { ...rule, nextOn: next, active });
      }
      return { created };
    }
    if (route('POST', '/recurring-transactions')) {
      const input = parse(createRecurringInput, body);
      const rule: RecurringTransaction = {
        id: nextMoneyId(),
        kind: input.kind,
        amountPaise: input.amountPaise,
        walletId: input.walletId,
        toWalletId: input.toWalletId ?? null,
        categoryId: input.categoryId ?? null,
        note: input.note || null,
        rule: input.rule,
        nextOn: input.startOn ?? today(),
        endsOn: input.endsOn ?? null,
        active: true,
        createdAt: now(),
        updatedAt: now(),
      };
      recurring.rows.set(rule.id, rule);
      return write(rule, { action: 'finance.recurring.delete', input: { id: rule.id } });
    }
    if ((hit = route('PATCH', '/recurring-transactions/([^/]+)'))) {
      const id = hit[1] ?? '';
      const { id: _id, ...changes } = parse(updateRecurringInput, { id, ...body });
      const { next, previous } = patch(recurring, id, 'Repeat', changes);
      return write(next, undoUpdate('finance.recurring.update', id, previous));
    }
    if ((hit = route('DELETE', '/recurring-transactions/([^/]+)'))) {
      const id = hit[1] ?? '';
      const rule = find(recurring, id, 'Repeat');
      recurring.gone.add(id);
      return write(rule, { action: 'finance.recurring.restore', input: { id } });
    }
    if ((hit = route('POST', '/recurring-transactions/([^/]+)/restore'))) {
      recurring.gone.delete(hit[1] ?? '');
      return write(find(recurring, hit[1] ?? '', 'Repeat'), null);
    }

    /* budgets */
    if (route('GET', '/budgets')) {
      const month = typeof query.month === 'string' ? query.month : monthOf(today());
      return {
        items: live(budgets)
          .filter((budget) => budget.month === month)
          .map((budget) => budgetView(budget, live(transactions))),
      };
    }
    if (route('PUT', '/budgets')) {
      const input = parse(setBudgetInput, body);
      const existing = live(budgets).find(
        (b) => b.categoryId === input.categoryId && b.month === input.month,
      );
      const stored: StoredBudget = existing
        ? { ...existing, amountPaise: input.amountPaise }
        : makeBudget({ ...input });
      budgets.rows.set(stored.id, stored);
      return write(
        budgetView(stored, live(transactions)),
        existing
          ? {
              action: 'finance.budgets.set',
              input: { categoryId: input.categoryId, month: input.month, amountPaise: existing.amountPaise },
            }
          : { action: 'finance.budgets.delete', input: { id: stored.id } },
      );
    }
    if ((hit = route('DELETE', '/budgets/([^/]+)'))) {
      const id = hit[1] ?? '';
      const stored = find(budgets, id, 'Budget');
      budgets.rows.delete(id);
      return write(budgetView(stored, live(transactions)), {
        action: 'finance.budgets.set',
        input: { categoryId: stored.categoryId, month: stored.month, amountPaise: stored.amountPaise },
      });
    }

    /* savings goals */
    if (route('GET', '/savings-goals')) return { items: live(goals).map(goalView) };
    if (route('POST', '/savings-goals')) {
      const input = parse(createSavingsGoalInput, body);
      const goal: SavingsGoal = goalView({
        id: nextMoneyId(),
        name: input.name,
        targetPaise: input.targetPaise,
        savedPaise: input.savedPaise,
        targetOn: input.targetOn ?? null,
        color: input.color ?? '#C9B4F7',
        percent: 0,
        achieved: false,
        createdAt: now(),
        updatedAt: now(),
      });
      goals.rows.set(goal.id, goal);
      return write(goal, { action: 'finance.goals.delete', input: { id: goal.id } });
    }
    if ((hit = route('POST', '/savings-goals/([^/]+)/contribute'))) {
      const id = hit[1] ?? '';
      const { deltaPaise } = parse(contributeInput, { id, ...body });
      const goal = find(goals, id, 'Goal');
      const savedPaise = Math.max(0, goal.savedPaise + deltaPaise);
      const next = goalView({ ...goal, savedPaise, updatedAt: now() });
      goals.rows.set(id, next);
      return write(next, {
        action: 'finance.goals.contribute',
        input: { id, deltaPaise: goal.savedPaise - savedPaise },
      });
    }
    if ((hit = route('PATCH', '/savings-goals/([^/]+)'))) {
      const id = hit[1] ?? '';
      const { id: _id, ...changes } = parse(updateSavingsGoalInput, { id, ...body });
      const { next, previous } = patch(goals, id, 'Goal', changes);
      return write(goalView(next), undoUpdate('finance.goals.update', id, previous));
    }
    if ((hit = route('DELETE', '/savings-goals/([^/]+)'))) {
      const id = hit[1] ?? '';
      const goal = find(goals, id, 'Goal');
      goals.gone.add(id);
      return write(goalView(goal), { action: 'finance.goals.restore', input: { id } });
    }
    if ((hit = route('POST', '/savings-goals/([^/]+)/restore'))) {
      goals.gone.delete(hit[1] ?? '');
      return write(goalView(find(goals, hit[1] ?? '', 'Goal')), null);
    }

    /* summary */
    if (route('GET', '/finance/summary')) {
      const month = typeof query.month === 'string' ? query.month : monthOf(today());
      return { summary: summaryOf(month, live(transactions)) };
    }

    /* subscriptions */
    if (route('GET', '/subscriptions')) {
      const status = typeof query.status === 'string' ? query.status : undefined;
      const items = subscriptionViews(status);
      return { items, summary: subscriptionSummary(items) };
    }
    if (route('GET', '/subscriptions/upcoming')) {
      const days = query.days === undefined ? 30 : Number(query.days);
      return {
        items: subscriptionViews().filter(
          (sub) => sub.status === 'active' && sub.daysUntilRenewal <= days,
        ),
      };
    }
    if (route('POST', '/subscriptions')) {
      const input = parse(createSubscriptionInput, body);
      const sub: Subscription = {
        id: nextMoneyId(),
        name: input.name,
        amountPaise: input.amountPaise,
        cycle: input.cycle,
        nextRenewalOn: input.nextRenewalOn,
        status: 'active',
        walletId: input.walletId ?? null,
        categoryId: input.categoryId ?? null,
        color: input.color ?? '#F4A9C4',
        note: input.note || null,
        monthlyPaise: 0,
        yearlyPaise: 0,
        daysUntilRenewal: 0,
        overdue: false,
        createdAt: now(),
        updatedAt: now(),
      };
      subscriptions.rows.set(sub.id, sub);
      return write(subView(sub), { action: 'subscriptions.delete', input: { id: sub.id } });
    }
    if ((hit = route('POST', '/subscriptions/([^/]+)/renew'))) {
      const id = hit[1] ?? '';
      const input = parse(renewSubscriptionInput, { id, ...body });
      const sub = find(subscriptions, id, 'Subscription');
      const paidOn = input.paidOn ?? today();
      const next = { ...sub, nextRenewalOn: nextRenewal(sub.nextRenewalOn, sub.cycle), updatedAt: now() };
      subscriptions.rows.set(id, next);
      const tx =
        sub.walletId && input.createTransaction
          ? addTransaction({
              kind: 'expense',
              amountPaise: sub.amountPaise,
              walletId: sub.walletId,
              categoryId: sub.categoryId,
              note: sub.name,
              occurredOn: paidOn,
              subscriptionId: id,
            })
          : null;
      return write(
        { subscription: subView(next), transaction: tx },
        {
          action: 'subscriptions.undo_renew',
          input: { id, previousRenewalOn: sub.nextRenewalOn, transactionId: tx?.id ?? null },
        },
      );
    }
    if ((hit = route('PATCH', '/subscriptions/([^/]+)'))) {
      const id = hit[1] ?? '';
      const { id: _id, ...changes } = parse(updateSubscriptionInput, { id, ...body });
      const { next, previous } = patch(subscriptions, id, 'Subscription', changes);
      return write(subView(next), undoUpdate('subscriptions.update', id, previous));
    }
    if ((hit = route('DELETE', '/subscriptions/([^/]+)'))) {
      const id = hit[1] ?? '';
      const sub = find(subscriptions, id, 'Subscription');
      subscriptions.gone.add(id);
      return write(subView(sub), { action: 'subscriptions.restore', input: { id } });
    }
    if ((hit = route('POST', '/subscriptions/([^/]+)/restore'))) {
      subscriptions.gone.delete(hit[1] ?? '');
      return write(subView(find(subscriptions, hit[1] ?? '', 'Subscription')), null);
    }

    return NOT_HANDLED;
  };

  const state = {
    wallets: () => live(wallets).map(walletView),
    categories: () => live(categories),
    transactions: () => live(transactions),
    recurring: () => live(recurring),
    budgets: () => live(budgets).map((budget) => budgetView(budget, live(transactions))),
    goals: () => live(goals).map(goalView),
    subscriptions: () => live(subscriptions).map(subView),
  };
  return { handle, state };
}

/** The Money mock API: every route of docs/features/money.md in memory. Other paths are NOT_HANDLED. */
export function createMoneyFake() {
  const fake = build();
  latest = fake;
  return { handle: fake.handle };
}
