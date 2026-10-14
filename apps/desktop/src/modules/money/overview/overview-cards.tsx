import { formatInr } from '@personal-os/shared';
import { GlassCard } from '@personal-os/ui';
import type { ReactNode } from 'react';
import { dayHeading, renewalText } from '../money-format';
import {
  useBudgets,
  useCategories,
  useTransactions,
  useUpcoming,
  useWallets,
} from '../money-queries';
import { signedAmount } from '../transactions/transaction-list';
import { ColorDot } from '../ui/fields';
import { MoneyBar } from '../ui/money-bar';

/** Budgets at or above this percent are "close to the limit". */
export const CLOSE_PERCENT = 80;

function Card({
  title,
  onOpen,
  openLabel,
  children,
}: {
  title: string;
  onOpen: () => void;
  openLabel: string;
  children: ReactNode;
}) {
  return (
    <GlassCard role="region" aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-card font-medium text-fg">{title}</h2>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-chip px-2 py-1 text-small text-fg-secondary focus-ring hover:bg-input hover:text-fg"
        >
          {openLabel}
        </button>
      </div>
      {children}
    </GlassCard>
  );
}

const quiet = (text: string) => <p className="text-body text-fg-muted">{text}</p>;

/** Budgets of this month that are at 80% or more (the fullest first). */
export function BudgetsCard({ month, onOpen }: { month: string; onOpen: () => void }) {
  const budgets = useBudgets(month);
  const categories = useCategories();
  const close = (budgets.data ?? [])
    .filter((budget) => budget.percent >= CLOSE_PERCENT)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 4);
  const byId = new Map((categories.data ?? []).map((c) => [c.id, c]));

  return (
    <Card title="Budgets close to the limit" openLabel="All budgets" onOpen={onOpen}>
      {budgets.isError ? (
        quiet('Could not load the budgets.')
      ) : budgets.isPending ? (
        quiet('Loading…')
      ) : close.length === 0 ? (
        quiet('No budget is close to its limit.')
      ) : (
        <ul className="flex flex-col gap-2">
          {close.map((budget) => {
            const name = byId.get(budget.categoryId)?.name ?? 'Category';
            const over = budget.spentPaise > budget.amountPaise;
            return (
              <li key={budget.id} className="flex flex-col gap-1">
                <div className="flex justify-between text-body">
                  <span className="text-fg">{name}</span>
                  <span className={over ? 'text-danger' : 'text-fg-secondary'}>
                    {String(budget.percent)}%
                  </span>
                </div>
                <MoneyBar
                  value={budget.percent}
                  label={`${name} budget`}
                  valueText={`${String(budget.percent)}%`}
                  over={over}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The next renewals (overdue first). */
export function RenewalsCard({ onOpen }: { onOpen: () => void }) {
  const upcoming = useUpcoming(30);
  const items = (upcoming.data ?? []).slice(0, 4);
  return (
    <Card title="Upcoming renewals" openLabel="All subscriptions" onOpen={onOpen}>
      {upcoming.isError ? (
        quiet('Could not load the renewals.')
      ) : upcoming.isPending ? (
        quiet('Loading…')
      ) : items.length === 0 ? (
        quiet('Nothing renews in the next 30 days.')
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((sub) => (
            <li key={sub.id} className="flex items-center gap-2 text-body">
              <ColorDot color={sub.color} />
              <span className="flex-1 truncate text-fg">{sub.name}</span>
              <span className={sub.overdue ? 'text-danger' : 'text-fg-muted'}>
                {renewalText(sub.daysUntilRenewal)}
              </span>
              <span className="text-fg-secondary tabular-nums">{formatInr(sub.amountPaise)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The five latest transactions. */
export function RecentCard({ today, onOpen }: { today: string; onOpen: () => void }) {
  const recent = useTransactions({ limit: 5 });
  const wallets = useWallets(true);
  const categories = useCategories();
  const walletName = new Map((wallets.data ?? []).map((w) => [w.id, w.name]));
  const categoryName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const items = recent.data ?? [];

  return (
    <Card title="Recent transactions" openLabel="All transactions" onOpen={onOpen}>
      {recent.isError ? (
        quiet('Could not load the transactions.')
      ) : recent.isPending ? (
        quiet('Loading…')
      ) : items.length === 0 ? (
        quiet('No transactions yet.')
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 text-body">
              <span className="w-20 text-small text-fg-muted">
                {dayHeading(item.occurredOn, today)}
              </span>
              <span className="flex-1 truncate text-fg">
                {item.kind === 'transfer'
                  ? `${walletName.get(item.walletId) ?? 'Wallet'} to ${walletName.get(item.toWalletId ?? '') ?? 'Wallet'}`
                  : ((item.categoryId ? categoryName.get(item.categoryId) : undefined) ??
                    'Uncategorised')}
              </span>
              <span className="text-fg tabular-nums">
                {signedAmount(item.kind, item.amountPaise)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
