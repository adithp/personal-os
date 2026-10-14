import {
  isDayString,
  transactionShapeError,
  type Transaction,
  type TransactionKind,
} from '@personal-os/shared';
import { Button, Input, SegmentedControl } from '@personal-os/ui';
import { useState } from 'react';
import { useRecurringActions, useTransactionActions } from '../money-actions';
import { parseRupees, rupeesText } from '../money-format';
import { useCategories, useWallets } from '../money-queries';
import { Field, selectClass } from '../ui/fields';
import { FormDialog } from '../ui/form-dialog';
import { useToday } from '../use-money-nav';
import { RepeatPicker, ruleOf, weekdayOf, type RepeatChoice } from './repeat-picker';

const KINDS = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
] as const;

export interface TransactionFormProps {
  /** The transaction to edit; left out to add one. */
  transaction?: Transaction;
  /** The wallet to start with (the wallet filter of the page). */
  walletId?: string | null;
  onClose: () => void;
}

/** Add or edit a transaction. The amount is typed in rupees and sent as integer paise. */
export function TransactionForm({ transaction, walletId, onClose }: TransactionFormProps) {
  const today = useToday();
  const wallets = useWallets(true);
  const categories = useCategories();
  const actions = useTransactionActions();
  const repeats = useRecurringActions();

  const [kind, setKind] = useState<TransactionKind>(transaction?.kind ?? 'expense');
  const [amount, setAmount] = useState(transaction ? rupeesText(transaction.amountPaise) : '');
  const [day, setDay] = useState(transaction?.occurredOn ?? today);
  const [from, setFrom] = useState(transaction?.walletId ?? walletId ?? '');
  const [to, setTo] = useState(transaction?.toWalletId ?? '');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  const [note, setNote] = useState(transaction?.note ?? '');
  const [repeat, setRepeat] = useState<RepeatChoice>({ kind: 'never', days: [weekdayOf(day)] });
  const [error, setError] = useState<string | null>(null);

  const usable = (wallets.data ?? []).filter(
    (wallet) => !wallet.archived || wallet.id === transaction?.walletId || wallet.id === transaction?.toWalletId,
  );
  // The first wallet is the default when the person has not chosen one
  const fromId = from || usable[0]?.id || '';
  const kindCategories = (categories.data ?? []).filter((category) => category.kind === kind);
  // A deleted category is not in the list: show and send "No category" instead of a stale id
  const shownCategory = kindCategories.some((category) => category.id === categoryId) ? categoryId : '';
  const busy = actions.create.isPending || actions.update.isPending || repeats.create.isPending;

  const changeKind = (next: TransactionKind) => {
    setKind(next);
    if (next === 'transfer') setCategoryId('');
    else if (!(categories.data ?? []).some((c) => c.id === categoryId && c.kind === next)) {
      setCategoryId('');
    }
  };

  const submit = () => {
    const amountPaise = parseRupees(amount);
    if (amountPaise === null || amountPaise <= 0) {
      setError('Enter an amount in rupees above zero, like 1,234.50');
      return;
    }
    if (!isDayString(day)) {
      setError('Pick a date');
      return;
    }
    if (!fromId) {
      setError('Add a wallet first (Wallets page)');
      return;
    }
    const shape = {
      kind,
      walletId: fromId,
      toWalletId: kind === 'transfer' ? to || null : null,
      categoryId: kind === 'transfer' ? null : shownCategory || null,
    };
    const problem = transactionShapeError(shape);
    if (problem) {
      setError(problem);
      return;
    }
    const text = note.trim();
    setError(null);

    if (transaction) {
      actions.update.mutate(
        { id: transaction.id, ...shape, amountPaise, occurredOn: day, note: text || null },
        { onSuccess: onClose },
      );
      return;
    }
    const rule = ruleOf(repeat, day);
    if (repeat.kind === 'weekly' && !rule) {
      setError('Pick at least one weekday');
      return;
    }
    if (rule) {
      repeats.create.mutate(
        { ...shape, amountPaise, note: text || null, rule, startOn: day },
        { onSuccess: onClose },
      );
      return;
    }
    actions.create.mutate(
      { ...shape, amountPaise, occurredOn: day, ...(text ? { note: text } : {}) },
      { onSuccess: onClose },
    );
  };

  const walletOptions = usable.map((wallet) => (
    <option key={wallet.id} value={wallet.id}>
      {wallet.name}
    </option>
  ));

  return (
    <FormDialog
      title={transaction ? 'Edit transaction' : 'New transaction'}
      submitLabel={transaction ? 'Save' : repeat.kind === 'never' ? 'Add' : 'Add repeating'}
      onSubmit={submit}
      onClose={onClose}
      busy={busy}
      error={error}
      footerStart={
        transaction ? (
          <Button
            variant="secondary"
            disabled={busy || actions.remove.isPending}
            onClick={() => {
              actions.remove.mutate(transaction.id, { onSuccess: onClose });
            }}
          >
            Delete
          </Button>
        ) : undefined
      }
    >
      <SegmentedControl label="Kind" value={kind} options={KINDS} onChange={changeKind} />
      <Field label="Amount (₹)">
        <Input
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
          }}
        />
      </Field>
      <Field label="Date">
        <Input
          type="date"
          value={day}
          onChange={(event) => {
            setDay(event.target.value);
          }}
        />
      </Field>
      <Field label={kind === 'transfer' ? 'From wallet' : 'Wallet'}>
        <select
          className={selectClass}
          value={fromId}
          onChange={(event) => {
            setFrom(event.target.value);
          }}
        >
          {walletOptions}
        </select>
      </Field>
      {kind === 'transfer' ? (
        <Field label="To wallet">
          <select
            className={selectClass}
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
            }}
          >
            <option value="">Choose a wallet</option>
            {walletOptions}
          </select>
        </Field>
      ) : (
        <Field label="Category">
          <select
            className={selectClass}
            value={shownCategory}
            onChange={(event) => {
              setCategoryId(event.target.value);
            }}
          >
            <option value="">No category</option>
            {kindCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Note">
        <Input
          value={note}
          maxLength={500}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </Field>
      {transaction ? null : <RepeatPicker value={repeat} firstDay={day} onChange={setRepeat} />}
    </FormDialog>
  );
}
