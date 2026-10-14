import { formatInr, type Subscription } from '@personal-os/shared';
import { Button, GlassCard } from '@personal-os/ui';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useSubscriptionActions } from '../money-actions';
import { useSubscriptions, useUpcoming } from '../money-queries';
import { useMoneyKeys } from '../shell/use-money-keys';
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader } from '../ui/page-parts';
import { SubscriptionDialog } from './subscription-dialog';
import { SubscriptionRow } from './subscription-row';

type Editing = Subscription | 'new' | null;

function Total({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard role="group" aria-label={label} padding="compact" className="flex flex-col gap-0.5">
      <span className="text-small text-fg-muted">{label}</span>
      <span className="text-section font-semibold tabular-nums text-fg">{value}</span>
    </GlassCard>
  );
}

/** Subscriptions: totals, upcoming renewals, every subscription, Mark paid. */
export function SubscriptionsPage() {
  const list = useSubscriptions();
  const upcoming = useUpcoming(30);
  const { renew } = useSubscriptionActions();
  const [editing, setEditing] = useState<Editing>(null);
  useMoneyKeys({
    onNew: () => {
      setEditing('new');
    },
  });

  const items = list.data?.items ?? [];
  const summary = list.data?.summary;
  const soon = upcoming.data ?? [];
  const paid = (subscription: Subscription) => {
    renew.mutate(subscription);
  };

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-2 pb-6">
      <PageHeader
        title="Subscriptions"
        subtitle={summary ? `${String(summary.activeCount)} active` : undefined}
      >
        <Button
          onClick={() => {
            setEditing('new');
          }}
        >
          <IconPlus size={16} stroke={1.5} aria-hidden />
          New subscription
        </Button>
      </PageHeader>

      {list.isError ? (
        <ErrorBlock
          error={list.error}
          fallback="Could not load your subscriptions."
          onRetry={() => {
            void list.refetch();
          }}
        />
      ) : list.isPending ? (
        <LoadingBlock label="Loading subscriptions…" />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="No subscriptions yet"
          text="Add Netflix, rent, insurance: anything that renews, and see what it costs a year."
          actionLabel="Add a subscription"
          onAction={() => {
            setEditing('new');
          }}
        />
      ) : (
        <>
          {summary ? (
            <div className="grid grid-cols-2 gap-3">
              <Total label="Per month" value={formatInr(summary.monthlyPaise)} />
              <Total label="Per year" value={formatInr(summary.yearlyPaise)} />
            </div>
          ) : null}

          {soon.length > 0 ? (
            <GlassCard role="region" aria-label="Upcoming renewals" padding="compact">
              <h2 className="px-2 pb-1 text-card font-medium text-fg">Upcoming renewals</h2>
              <ul className="flex flex-col">
                {soon.map((sub) => (
                  <SubscriptionRow
                    key={sub.id}
                    subscription={sub}
                    detail={false}
                    onPaid={paid}
                    paying={renew.isPending}
                  />
                ))}
              </ul>
            </GlassCard>
          ) : null}

          <GlassCard role="region" aria-label="All subscriptions" padding="compact">
            <h2 className="px-2 pb-1 text-card font-medium text-fg">All subscriptions</h2>
            <ul className="flex flex-col">
              {items.map((sub) => (
                <SubscriptionRow
                  key={sub.id}
                  subscription={sub}
                  onPaid={paid}
                  onEdit={setEditing}
                  paying={renew.isPending}
                />
              ))}
            </ul>
          </GlassCard>
        </>
      )}

      {editing ? (
        <SubscriptionDialog
          subscription={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
