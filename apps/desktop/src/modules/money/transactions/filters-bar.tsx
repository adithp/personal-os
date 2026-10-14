import type { Category, Wallet } from '@personal-os/shared';
import { Input } from '@personal-os/ui';
import { selectClass } from '../ui/field-styles';
import type { Filters } from './filters';

/** Wallet, category and kind filters and a text search over the notes. */
export function FiltersBar({
  filters,
  onChange,
  walletId,
  onWallet,
  wallets,
  categories,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  walletId: string | null;
  onWallet: (walletId: string | null) => void;
  wallets: readonly Wallet[];
  categories: readonly Category[];
}) {
  return (
    <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Wallet"
        className={`${selectClass} w-auto`}
        value={walletId ?? ''}
        onChange={(event) => {
          onWallet(event.target.value || null);
        }}
      >
        <option value="">All wallets</option>
        {wallets.map((wallet) => (
          <option key={wallet.id} value={wallet.id}>
            {wallet.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Category"
        className={`${selectClass} w-auto`}
        value={filters.categoryId}
        onChange={(event) => {
          onChange({ ...filters, categoryId: event.target.value });
        }}
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Kind"
        className={`${selectClass} w-auto`}
        value={filters.kind}
        onChange={(event) => {
          onChange({ ...filters, kind: event.target.value as Filters['kind'] });
        }}
      >
        <option value="">All kinds</option>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
        <option value="transfer">Transfers</option>
      </select>
      <Input
        type="search"
        aria-label="Search notes"
        placeholder="Search notes"
        className="w-48"
        value={filters.text}
        onChange={(event) => {
          onChange({ ...filters, text: event.target.value });
        }}
      />
    </div>
  );
}
