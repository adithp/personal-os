import { formatInr, type Budget, type Category } from '@personal-os/shared';
import { Button, Input } from '@personal-os/ui';
import { useState } from 'react';
import { useBudgetActions } from '../money-actions';
import { monthLabel, parseRupees, rupeesText } from '../money-format';
import { Field, selectClass } from '../ui/fields';
import { FormDialog } from '../ui/form-dialog';

/**
 * Set the budget of an expense category for a month. With `budget` it edits that one (the
 * category is fixed) and can remove it.
 */
export function BudgetDialog({
  month,
  budget,
  categories,
  onClose,
}: {
  month: string;
  budget?: Budget;
  /** Expense categories that can still get a budget. */
  categories: readonly Category[];
  onClose: () => void;
}) {
  const { set, remove } = useBudgetActions();
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? categories[0]?.id ?? '');
  const [amount, setAmount] = useState(budget ? rupeesText(budget.amountPaise) : '');
  const [error, setError] = useState<string | null>(null);
  const busy = set.isPending || remove.isPending;
  const fixed = budget ? categories.find((c) => c.id === budget.categoryId) : undefined;

  const submit = () => {
    const amountPaise = parseRupees(amount);
    if (!categoryId) {
      setError('Pick a category');
      return;
    }
    if (amountPaise === null || amountPaise <= 0) {
      setError('Enter an amount in rupees above zero, like 5,000');
      return;
    }
    setError(null);
    set.mutate({ categoryId, month, amountPaise }, { onSuccess: onClose });
  };

  return (
    <FormDialog
      title={budget ? 'Edit budget' : 'Set a budget'}
      submitLabel="Save"
      onSubmit={submit}
      onClose={onClose}
      busy={busy}
      error={error}
      footerStart={
        budget ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              remove.mutate(budget.id, { onSuccess: onClose });
            }}
          >
            Remove budget
          </Button>
        ) : undefined
      }
    >
      <p className="text-small text-fg-muted">
        {monthLabel(month)}
        {budget ? ` · spent ${formatInr(budget.spentPaise)} so far` : ''}
      </p>
      <Field label="Category">
        <select
          className={selectClass}
          value={categoryId}
          disabled={budget !== undefined}
          onChange={(event) => {
            setCategoryId(event.target.value);
          }}
        >
          {budget && !fixed ? <option value={budget.categoryId}>Category</option> : null}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Budget for the month (₹)">
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}
