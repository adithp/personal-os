import { formatInr, type Category, type Transaction, type Wallet } from '@personal-os/shared';
import { GlassCard } from '@personal-os/ui';
import { IconRepeat } from '@tabler/icons-react';
import { dayHeading } from '../money-format';
import { ColorDot } from '../ui/fields';

/** "+₹500", "-₹120" or "₹300" (transfers have no sign). */
export function signedAmount(kind: Transaction['kind'], paise: number): string {
  if (kind === 'income') return `+${formatInr(paise)}`;
  if (kind === 'expense') return `-${formatInr(paise)}`;
  return formatInr(paise);
}

/** Net of a day: income minus expense (transfers move money between wallets, so they are left out). */
export function dayNet(items: readonly Transaction[]): number {
  return items.reduce(
    (sum, item) =>
      item.kind === 'income'
        ? sum + item.amountPaise
        : item.kind === 'expense'
          ? sum - item.amountPaise
          : sum,
    0,
  );
}

function netText(net: number): string {
  if (net === 0) return formatInr(0);
  return `${net > 0 ? '+' : '-'}${formatInr(Math.abs(net))}`;
}

/** Groups transactions by India day, newest day first (the order inside a day is kept). */
export function groupByDay(items: readonly Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>();
  for (const item of items) {
    const list = groups.get(item.occurredOn) ?? [];
    list.push(item);
    groups.set(item.occurredOn, list);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
}

interface RowProps {
  item: Transaction;
  wallets: ReadonlyMap<string, Wallet>;
  categories: ReadonlyMap<string, Category>;
  onEdit: (item: Transaction) => void;
}

function Row({ item, wallets, categories, onEdit }: RowProps) {
  const wallet = wallets.get(item.walletId)?.name ?? 'Wallet';
  const toWallet = item.toWalletId ? (wallets.get(item.toWalletId)?.name ?? 'Wallet') : null;
  const category = item.categoryId ? categories.get(item.categoryId) : undefined;
  const title =
    item.kind === 'transfer'
      ? `${wallet} to ${toWallet ?? 'Wallet'}`
      : (category?.name ?? 'Uncategorised');
  const amount = signedAmount(item.kind, item.amountPaise);

  return (
    <li>
      <button
        type="button"
        aria-label={`Edit ${title}, ${amount}${item.note ? `, ${item.note}` : ''}`}
        onClick={() => {
          onEdit(item);
        }}
        className="flex w-full items-center gap-3 rounded-chip px-2 py-1.5 text-left focus-ring transition-colors duration-150 ease-out hover:bg-tint"
      >
        {category ? <ColorDot color={category.color} /> : <span className="size-2.5 shrink-0" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 truncate text-body text-fg">
            {title}
            {item.recurringId ? (
              <IconRepeat size={12} stroke={1.5} aria-label="Repeating" className="text-fg-muted" />
            ) : null}
          </span>
          <span className="truncate text-small text-fg-muted">
            {item.kind === 'transfer' ? '' : `${wallet}${item.note ? ' · ' : ''}`}
            {item.note ?? ''}
          </span>
        </span>
        <span className="text-body font-medium text-fg tabular-nums">{amount}</span>
      </button>
    </li>
  );
}

/** Transactions grouped by India day, each day with its net total. */
export function TransactionList({
  items,
  wallets,
  categories,
  today,
  onEdit,
}: Omit<RowProps, 'item'> & { items: readonly Transaction[]; today: string }) {
  return (
    <div className="flex flex-col gap-3">
      {groupByDay(items).map(([day, rows]) => (
        <GlassCard key={day} role="region" aria-label={dayHeading(day, today)} padding="compact">
          <div className="flex items-baseline justify-between px-2 pb-1">
            <h2 className="text-card font-medium text-fg">{dayHeading(day, today)}</h2>
            <span className="text-small text-fg-muted tabular-nums">{netText(dayNet(rows))}</span>
          </div>
          <ul className="flex flex-col">
            {rows.map((item) => (
              <Row
                key={item.id}
                item={item}
                wallets={wallets}
                categories={categories}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </GlassCard>
      ))}
    </div>
  );
}
