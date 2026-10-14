import type {
  Budget,
  Category,
  CreateCategoryInput,
  CreateRecurringInput,
  CreateSavingsGoalInput,
  CreateSubscriptionInput,
  CreateTransactionInput,
  CreateWalletInput,
  RecurringTransaction,
  RenewResult,
  SavingsGoal,
  SetBudgetInput,
  Subscription,
  Transaction,
  UpdateRecurringInput,
  UpdateSubscriptionInput,
  UpdateTransactionInput,
  UpdateWalletInput,
  Wallet,
} from '@personal-os/shared';
import { formatInr, type MoneyWriteResult } from '@personal-os/shared';
import type { ApiClient } from '../../api/api-client';
import { useMoneyWrite } from './use-money-write';

/** The write hooks of the Money page. Each is a TanStack mutation (see useMoneyWrite). */

const call =
  <I, T>(method: string, path: (input: I) => string, body: boolean) =>
  (api: ApiClient, input: I): Promise<MoneyWriteResult<T>> =>
    api.request<MoneyWriteResult<T>>(method, path(input), body ? { body: input } : undefined);

type WithId<T> = T & { id: string };

export function useWalletActions() {
  const create = useMoneyWrite<CreateWalletInput, Wallet>({
    send: call('POST', () => '/wallets', true),
    message: (_input, wallet) => `Wallet ${wallet.name} added.`,
  });
  const update = useMoneyWrite<UpdateWalletInput, Wallet>({
    send: (api, input) => {
      const { id, ...rest } = input;
      return api.request(`PATCH`, `/wallets/${id}`, { body: rest });
    },
    message: (input, wallet) =>
      input.archived === true
        ? `Wallet ${wallet.name} archived.`
        : input.archived === false
          ? `Wallet ${wallet.name} is back.`
          : `Wallet ${wallet.name} saved.`,
  });
  const remove = useMoneyWrite<string, Wallet>({
    send: (api, id) => api.request('DELETE', `/wallets/${id}`),
    message: 'Wallet deleted.',
  });
  return { create, update, remove };
}

export function useCategoryActions() {
  const create = useMoneyWrite<CreateCategoryInput, Category>({
    send: call('POST', () => '/categories', true),
    message: (_input, category) => `Category ${category.name} added.`,
  });
  const update = useMoneyWrite<WithId<{ name?: string; color?: string }>, Category>({
    send: (api, { id, ...rest }) => api.request('PATCH', `/categories/${id}`, { body: rest }),
    message: 'Category saved.',
  });
  const remove = useMoneyWrite<string, Category>({
    send: (api, id) => api.request('DELETE', `/categories/${id}`),
    message: 'Category deleted.',
  });
  return { create, update, remove };
}

export function useTransactionActions() {
  const create = useMoneyWrite<CreateTransactionInput, Transaction>({
    send: call('POST', () => '/transactions', true),
    message: (input) => `${formatInr(input.amountPaise)} ${input.kind} added.`,
  });
  const update = useMoneyWrite<UpdateTransactionInput, Transaction>({
    send: (api, { id, ...rest }) => api.request('PATCH', `/transactions/${id}`, { body: rest }),
    message: 'Transaction saved.',
  });
  const remove = useMoneyWrite<string, Transaction>({
    send: (api, id) => api.request('DELETE', `/transactions/${id}`),
    message: 'Transaction deleted.',
  });
  return { create, update, remove };
}

export function useRecurringActions() {
  const create = useMoneyWrite<CreateRecurringInput, RecurringTransaction>({
    // A rule that starts today makes its first transaction right away
    send: async (api, input) => {
      const result = await api.request<MoneyWriteResult<RecurringTransaction>>(
        'POST',
        '/recurring-transactions',
        { body: input },
      );
      await api.request('POST', '/recurring-transactions/run').catch(() => undefined);
      return result;
    },
    message: 'Repeat added.',
  });
  const update = useMoneyWrite<UpdateRecurringInput, RecurringTransaction>({
    send: (api, { id, ...rest }) =>
      api.request('PATCH', `/recurring-transactions/${id}`, { body: rest }),
    message: (input) =>
      input.active === false
        ? 'Repeat paused.'
        : input.active === true
          ? 'Repeat resumed.'
          : 'Repeat saved.',
  });
  const remove = useMoneyWrite<string, RecurringTransaction>({
    send: (api, id) => api.request('DELETE', `/recurring-transactions/${id}`),
    message: 'Repeat deleted.',
  });
  return { create, update, remove };
}

export function useBudgetActions() {
  const set = useMoneyWrite<SetBudgetInput, Budget>({
    send: call('PUT', () => '/budgets', true),
    message: 'Budget saved.',
  });
  const remove = useMoneyWrite<string, Budget>({
    send: (api, id) => api.request('DELETE', `/budgets/${id}`),
    message: 'Budget removed.',
  });
  return { set, remove };
}

export function useGoalActions() {
  const create = useMoneyWrite<CreateSavingsGoalInput, SavingsGoal>({
    send: call('POST', () => '/savings-goals', true),
    message: (_input, goal) => `Goal ${goal.name} added.`,
  });
  const update = useMoneyWrite<
    WithId<{ name?: string; targetPaise?: number; targetOn?: string | null; color?: string }>,
    SavingsGoal
  >({
    send: (api, { id, ...rest }) => api.request('PATCH', `/savings-goals/${id}`, { body: rest }),
    message: 'Goal saved.',
  });
  const contribute = useMoneyWrite<{ id: string; deltaPaise: number }, SavingsGoal>({
    send: (api, { id, deltaPaise }) =>
      api.request('POST', `/savings-goals/${id}/contribute`, { body: { deltaPaise } }),
    message: (input) =>
      input.deltaPaise > 0
        ? `${formatInr(input.deltaPaise)} added to the goal.`
        : `${formatInr(-input.deltaPaise)} taken out of the goal.`,
  });
  const remove = useMoneyWrite<string, SavingsGoal>({
    send: (api, id) => api.request('DELETE', `/savings-goals/${id}`),
    message: 'Goal deleted.',
  });
  return { create, update, contribute, remove };
}

export function useSubscriptionActions() {
  const create = useMoneyWrite<CreateSubscriptionInput, Subscription>({
    send: call('POST', () => '/subscriptions', true),
    message: (_input, subscription) => `Subscription ${subscription.name} added.`,
  });
  const update = useMoneyWrite<UpdateSubscriptionInput, Subscription>({
    send: (api, { id, ...rest }) => api.request('PATCH', `/subscriptions/${id}`, { body: rest }),
    message: 'Subscription saved.',
  });
  const remove = useMoneyWrite<string, Subscription>({
    send: (api, id) => api.request('DELETE', `/subscriptions/${id}`),
    message: 'Subscription deleted.',
  });
  /** Mark paid: moves the renewal one cycle on and books the expense. */
  const renew = useMoneyWrite<Subscription, RenewResult>({
    send: (api, subscription) =>
      api.request('POST', `/subscriptions/${subscription.id}/renew`, { body: {} }),
    message: (_input, result) =>
      result.transaction
        ? `${result.subscription.name} marked paid and booked as an expense.`
        : `${result.subscription.name} marked paid.`,
  });
  return { create, update, remove, renew };
}
