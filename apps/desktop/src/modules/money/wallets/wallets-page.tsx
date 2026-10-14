import { formatInr, type Wallet } from '@personal-os/shared';
import { Button, GlassCard, IconButton } from '@personal-os/ui';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useWallets } from '../money-queries';
import { useMoneyKeys } from '../shell/use-money-keys';
import { ColorDot } from '../ui/fields';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '../ui/page-parts';
import { useMoneyNav } from '../use-money-nav';
import { KIND_NAMES, WalletDialog } from './wallet-dialog';

type Editing = Wallet | 'new' | null;

function WalletCard({
  wallet,
  onOpen,
  onEdit,
}: {
  wallet: Wallet;
  onOpen: () => void;
  onEdit: () => void;
}) {
  return (
    <GlassCard
      role="listitem"
      className={`flex items-center gap-2 ${wallet.archived ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        aria-label={`Open ${wallet.name} transactions`}
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-chip text-left focus-ring"
      >
        <span className="flex items-center gap-2 text-card font-medium text-fg">
          <ColorDot color={wallet.color} />
          <span className="truncate">{wallet.name}</span>
        </span>
        <span className="text-small text-fg-muted">
          {KIND_NAMES[wallet.kind]}
          {wallet.archived ? ' · Archived' : ''}
        </span>
        <span className="text-section font-semibold text-fg tabular-nums">
          {formatInr(wallet.balancePaise)}
        </span>
      </button>
      <IconButton
        aria-label={`Edit ${wallet.name}`}
        icon={<IconPencil size={16} stroke={1.5} aria-hidden />}
        onClick={onEdit}
      />
    </GlassCard>
  );
}

/** Wallets: a card with the balance of each; a click opens that wallet's transactions. */
export function WalletsPage() {
  const nav = useMoneyNav();
  const [showArchived, setShowArchived] = useState(false);
  const wallets = useWallets(showArchived);
  const [editing, setEditing] = useState<Editing>(null);
  useMoneyKeys({
    onNew: () => {
      setEditing('new');
    },
  });

  const items = wallets.data ?? [];
  const total = items
    .filter((wallet) => !wallet.archived)
    .reduce((sum, w) => sum + w.balancePaise, 0);

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-2 pb-6">
      <PageHeader
        title="Wallets"
        subtitle={wallets.isSuccess ? `Total ${formatInr(total)}` : undefined}
      >
        <Button
          variant="secondary"
          aria-pressed={showArchived}
          onClick={() => {
            setShowArchived((value) => !value);
          }}
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
        <Button
          onClick={() => {
            setEditing('new');
          }}
        >
          <IconPlus size={16} stroke={1.5} aria-hidden />
          New wallet
        </Button>
      </PageHeader>

      {wallets.isError ? (
        <ErrorBlock
          error={wallets.error}
          fallback="Could not load your wallets."
          onRetry={() => {
            void wallets.refetch();
          }}
        />
      ) : wallets.isPending ? (
        <LoadingBlock label="Loading wallets…" />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="No wallets yet"
          text="Add the places your money lives: cash, a bank account, a card."
          actionLabel="Add a wallet"
          onAction={() => {
            setEditing('new');
          }}
        />
      ) : (
        <div role="list" aria-label="Wallets" className="grid grid-cols-2 gap-3">
          {items.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              onOpen={() => {
                nav.showSection('transactions', { wallet: wallet.id });
              }}
              onEdit={() => {
                setEditing(wallet);
              }}
            />
          ))}
        </div>
      )}

      {editing ? (
        <WalletDialog
          wallet={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
