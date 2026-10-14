import { describeRecurrence, formatInr, type Category, type Wallet } from '@personal-os/shared';
import { Button, GlassCard } from '@personal-os/ui';
import { useRecurringActions } from '../money-actions';
import { shortDay } from '../money-format';
import { useRecurring } from '../money-queries';

/** The repeating transactions (rent, salary, ...): pause, resume or delete each. */
export function RepeatsList({
  wallets,
  categories,
}: {
  wallets: ReadonlyMap<string, Wallet>;
  categories: ReadonlyMap<string, Category>;
}) {
  const rules = useRecurring();
  const { update, remove } = useRecurringActions();
  const items = rules.data ?? [];
  if (items.length === 0) return null;

  return (
    <GlassCard role="region" aria-label="Repeating transactions" padding="compact">
      <h2 className="px-2 pb-1 text-card font-medium text-fg">Repeating</h2>
      <ul className="flex flex-col">
        {items.map((rule) => {
          const title =
            rule.kind === 'transfer'
              ? `${wallets.get(rule.walletId)?.name ?? 'Wallet'} to ${wallets.get(rule.toWalletId ?? '')?.name ?? 'Wallet'}`
              : ((rule.categoryId ? categories.get(rule.categoryId)?.name : undefined) ??
                (rule.note === null || rule.note === '' ? 'Uncategorised' : rule.note));
          return (
            <li
              key={rule.id}
              className={`flex items-center gap-3 px-2 py-1.5 ${rule.active ? '' : 'opacity-60'}`}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body text-fg">{title}</span>
                <span className="truncate text-small text-fg-muted">
                  {describeRecurrence(rule.rule)}
                  {rule.active ? ` · Next ${shortDay(rule.nextOn)}` : ' · Paused'}
                </span>
              </span>
              <span className="text-body font-medium text-fg tabular-nums">
                {formatInr(rule.amountPaise)}
              </span>
              <Button
                variant="secondary"
                aria-label={`${rule.active ? 'Pause' : 'Resume'} repeat ${title}`}
                disabled={update.isPending}
                onClick={() => {
                  update.mutate({ id: rule.id, active: !rule.active });
                }}
              >
                {rule.active ? 'Pause' : 'Resume'}
              </Button>
              <Button
                variant="secondary"
                aria-label={`Delete repeat ${title}`}
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(rule.id);
                }}
              >
                Delete
              </Button>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
