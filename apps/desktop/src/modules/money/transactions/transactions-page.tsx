import {
  TRANSACTIONS_MAX_LIMIT,
  addDays,
  monthEnd,
  monthStart,
  type ListTransactionsInput,
  type Transaction,
} from '@personal-os/shared';
import { Button } from '@personal-os/ui';
import { IconPlus } from '@tabler/icons-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useCategories, useTransactions, useWallets } from '../money-queries';
import { useMoneyKeys } from '../shell/use-money-keys';
import { EmptyBlock, ErrorBlock, LoadingBlock, MonthSwitcher, PageHeader } from '../ui/page-parts';
import { useMoneyNav } from '../use-money-nav';
import { CategoriesDialog } from './categories-dialog';
import { NO_FILTERS, type Filters } from './filters';
import { FiltersBar } from './filters-bar';
import { RepeatsList } from './repeats-list';
import { TransactionForm } from './transaction-form';
import { TransactionList } from './transaction-list';

type Editing = Transaction | 'new' | null;

/** Transactions of a month grouped by day, with filters, the add/edit form, and repeats. */
export function TransactionsPage() {
  const nav = useMoneyNav();
  const { month, walletId, today } = nav;
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [editing, setEditing] = useState<Editing>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const text = useDeferredValue(filters.text.trim());
  useMoneyKeys({
    months: true,
    onNew: () => {
      setEditing('new');
    },
  });

  const query: ListTransactionsInput = {
    from: monthStart(month),
    to: addDays(monthEnd(month), -1),
    limit: TRANSACTIONS_MAX_LIMIT,
    offset: 0,
    ...(walletId ? { walletId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(text ? { q: text } : {}),
  };
  const transactions = useTransactions(query);
  const wallets = useWallets(true);
  const categories = useCategories();

  const walletMap = useMemo(
    () => new Map((wallets.data ?? []).map((w) => [w.id, w])),
    [wallets.data],
  );
  const categoryMap = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );
  const filtered =
    walletId !== null || filters.categoryId !== '' || filters.kind !== '' || text !== '';
  const items = transactions.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-2 pb-6">
      <PageHeader title="Transactions">
        <MonthSwitcher month={month} onStep={nav.stepMonth} />
        <Button
          variant="secondary"
          onClick={() => {
            setCategoriesOpen(true);
          }}
        >
          Categories
        </Button>
        <Button
          onClick={() => {
            setEditing('new');
          }}
        >
          <IconPlus size={16} stroke={1.5} aria-hidden />
          New transaction
        </Button>
      </PageHeader>

      <FiltersBar
        filters={filters}
        onChange={setFilters}
        walletId={walletId}
        onWallet={nav.setWallet}
        wallets={(wallets.data ?? []).filter((w) => !w.archived || w.id === walletId)}
        categories={categories.data ?? []}
      />

      {transactions.isError ? (
        <ErrorBlock
          error={transactions.error}
          fallback="Could not load your transactions."
          onRetry={() => {
            void transactions.refetch();
          }}
        />
      ) : transactions.isPending ? (
        <LoadingBlock label="Loading transactions…" />
      ) : items.length === 0 ? (
        <EmptyBlock
          title={filtered ? 'Nothing matches' : 'No transactions this month'}
          text={
            filtered
              ? 'Try other filters or another month.'
              : 'Add what you earned or spent and it shows up here.'
          }
          actionLabel={filtered ? undefined : 'Add a transaction'}
          onAction={
            filtered
              ? undefined
              : () => {
                  setEditing('new');
                }
          }
        />
      ) : (
        <TransactionList
          items={items}
          wallets={walletMap}
          categories={categoryMap}
          today={today}
          onEdit={setEditing}
        />
      )}

      <RepeatsList wallets={walletMap} categories={categoryMap} />

      {editing ? (
        <TransactionForm
          transaction={editing === 'new' ? undefined : editing}
          walletId={walletId}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      {categoriesOpen ? (
        <CategoriesDialog
          onClose={() => {
            setCategoriesOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
