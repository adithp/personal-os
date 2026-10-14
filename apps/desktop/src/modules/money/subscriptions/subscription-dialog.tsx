import {
  BILLING_CYCLES,
  SUBSCRIPTION_STATUSES,
  isDayString,
  type BillingCycle,
  type Subscription,
  type SubscriptionStatus,
} from '@personal-os/shared';
import { Button, Input } from '@personal-os/ui';
import { useState } from 'react';
import { useSubscriptionActions } from '../money-actions';
import { parseRupees, rupeesText } from '../money-format';
import { useCategories, useWallets } from '../money-queries';
import { SWATCHES, selectClass } from '../ui/field-styles';
import { ColorPicker, Field } from '../ui/fields';
import { FormDialog } from '../ui/form-dialog';
import { useToday } from '../use-money-nav';
import { CYCLE_NAMES } from './cycle-names';

const STATUS_NAMES: Record<SubscriptionStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

/** Create a subscription, or edit / pause / cancel / delete one. */
export function SubscriptionDialog({
  subscription,
  onClose,
}: {
  subscription?: Subscription;
  onClose: () => void;
}) {
  const today = useToday();
  const { create, update, remove } = useSubscriptionActions();
  const wallets = useWallets();
  const categories = useCategories();
  const [name, setName] = useState(subscription?.name ?? '');
  const [amount, setAmount] = useState(subscription ? rupeesText(subscription.amountPaise) : '');
  const [cycle, setCycle] = useState<BillingCycle>(subscription?.cycle ?? 'monthly');
  const [renewal, setRenewal] = useState(subscription?.nextRenewalOn ?? today);
  const [status, setStatus] = useState<SubscriptionStatus>(subscription?.status ?? 'active');
  const [walletId, setWalletId] = useState(subscription?.walletId ?? '');
  const [categoryId, setCategoryId] = useState(subscription?.categoryId ?? '');
  const [color, setColor] = useState(subscription?.color ?? SWATCHES[0] ?? '');
  const [note, setNote] = useState(subscription?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const submit = () => {
    const amountPaise = parseRupees(amount);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (amountPaise === null || amountPaise <= 0) {
      setError('Enter the price in rupees above zero, like 649');
      return;
    }
    if (!isDayString(renewal)) {
      setError('Pick the next renewal date');
      return;
    }
    setError(null);
    const common = {
      name: name.trim(),
      amountPaise,
      cycle,
      nextRenewalOn: renewal,
      color,
    };
    if (subscription) {
      update.mutate(
        {
          id: subscription.id,
          ...common,
          status,
          walletId: walletId || null,
          categoryId: categoryId || null,
          note: note.trim() || null,
        },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        {
          ...common,
          ...(walletId ? { walletId } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <FormDialog
      title={subscription ? 'Edit subscription' : 'New subscription'}
      submitLabel={subscription ? 'Save' : 'Add subscription'}
      onSubmit={submit}
      onClose={onClose}
      busy={busy}
      error={error}
      footerStart={
        subscription ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              remove.mutate(subscription.id, { onSuccess: onClose });
            }}
          >
            Delete
          </Button>
        ) : undefined
      }
    >
      <Field label="Name">
        <Input
          value={name}
          maxLength={60}
          placeholder="Netflix, iCloud…"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Field label="Price (₹)">
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
          }}
        />
      </Field>
      <Field label="Billed">
        <select
          className={selectClass}
          value={cycle}
          onChange={(event) => {
            setCycle(event.target.value as BillingCycle);
          }}
        >
          {BILLING_CYCLES.map((item) => (
            <option key={item} value={item}>
              {CYCLE_NAMES[item]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Next renewal">
        <Input
          type="date"
          value={renewal}
          onChange={(event) => {
            setRenewal(event.target.value);
          }}
        />
      </Field>
      {subscription ? (
        <Field label="Status">
          <select
            className={selectClass}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as SubscriptionStatus);
            }}
          >
            {SUBSCRIPTION_STATUSES.map((item) => (
              <option key={item} value={item}>
                {STATUS_NAMES[item]}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Paid from" hint="Mark paid books an expense in this wallet.">
        <select
          className={selectClass}
          value={walletId}
          onChange={(event) => {
            setWalletId(event.target.value);
          }}
        >
          <option value="">No wallet</option>
          {(wallets.data ?? []).map((wallet) => (
            <option key={wallet.id} value={wallet.id}>
              {wallet.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Category">
        <select
          className={selectClass}
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
          }}
        >
          <option value="">No category</option>
          {(categories.data ?? [])
            .filter((category) => category.kind === 'expense')
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Note">
        <Input
          value={note}
          maxLength={500}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </Field>
      <ColorPicker value={color} onChange={setColor} />
    </FormDialog>
  );
}
