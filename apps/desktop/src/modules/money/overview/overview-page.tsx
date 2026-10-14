import { formatInr } from '@personal-os/shared';
import { Tile } from '@personal-os/ui';
import { useMoneyKeys } from '../shell/use-money-keys';
import { useSummary, useWallets } from '../money-queries';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '../ui/page-parts';
import { useMoneyNav } from '../use-money-nav';
import { monthLabel } from '../money-format';
import { BudgetsCard, RecentCard, RenewalsCard } from './overview-cards';

/** Overview: total balance, this month in and out, budgets near the limit, renewals, recent. */
export function OverviewPage() {
  const nav = useMoneyNav();
  const wallets = useWallets();
  const summary = useSummary(nav.thisMonth);
  useMoneyKeys({});

  const items = wallets.data ?? [];
  const total = items.reduce((sum, wallet) => sum + wallet.balancePaise, 0);

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-2 pb-6">
      <PageHeader title="Money" subtitle={monthLabel(nav.thisMonth)} />

      {wallets.isError ? (
        <ErrorBlock
          error={wallets.error}
          fallback="Could not load your money."
          onRetry={() => {
            void wallets.refetch();
          }}
        />
      ) : wallets.isPending ? (
        <LoadingBlock label="Loading overview…" />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="Start with a wallet"
          text="Add cash or a bank account, then your balance, budgets and renewals show up here."
          actionLabel="Add a wallet"
          onAction={() => {
            nav.showSection('wallets');
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile module="money" title="Total balance" value={formatInr(total)} />
            <Tile
              module="money"
              title="Income this month"
              value={summary.data ? formatInr(summary.data.incomePaise) : '…'}
            />
            <Tile
              module="money"
              title="Spent this month"
              value={summary.data ? formatInr(summary.data.expensePaise) : '…'}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BudgetsCard
              month={nav.thisMonth}
              onOpen={() => {
                nav.showSection('budgets');
              }}
            />
            <RenewalsCard
              onOpen={() => {
                nav.showSection('subscriptions');
              }}
            />
          </div>
          <RecentCard
            today={nav.today}
            onOpen={() => {
              nav.showSection('transactions');
            }}
          />
        </>
      )}
    </div>
  );
}
