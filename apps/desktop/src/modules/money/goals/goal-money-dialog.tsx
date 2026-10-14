import { formatInr, type SavingsGoal } from '@personal-os/shared';
import { Input } from '@personal-os/ui';
import { useState } from 'react';
import { useGoalActions } from '../money-actions';
import { parseRupees } from '../money-format';
import { Field } from '../ui/fields';
import { FormDialog } from '../ui/form-dialog';

/** Add money to a goal, or take some out. The saved amount never goes below zero. */
export function GoalMoneyDialog({
  goal,
  mode,
  onClose,
}: {
  goal: SavingsGoal;
  mode: 'add' | 'withdraw';
  onClose: () => void;
}) {
  const { contribute } = useGoalActions();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const paise = parseRupees(amount);
    if (paise === null || paise <= 0) {
      setError('Enter an amount in rupees above zero, like 500');
      return;
    }
    if (mode === 'withdraw' && paise > goal.savedPaise) {
      setError(`Only ${formatInr(goal.savedPaise)} is saved in this goal`);
      return;
    }
    setError(null);
    contribute.mutate(
      { id: goal.id, deltaPaise: mode === 'add' ? paise : -paise },
      { onSuccess: onClose },
    );
  };

  return (
    <FormDialog
      title={mode === 'add' ? `Add money to ${goal.name}` : `Take money out of ${goal.name}`}
      submitLabel={mode === 'add' ? 'Add money' : 'Take out'}
      onSubmit={submit}
      onClose={onClose}
      busy={contribute.isPending}
      error={error}
    >
      <p className="text-small text-fg-muted">
        Saved {formatInr(goal.savedPaise)} of {formatInr(goal.targetPaise)}
      </p>
      <Field label="Amount (₹)">
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
