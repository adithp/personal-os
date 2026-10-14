import { isDayString, type SavingsGoal } from '@personal-os/shared';
import { Button, Input } from '@personal-os/ui';
import { useState } from 'react';
import { useGoalActions } from '../money-actions';
import { parseRupees, rupeesText } from '../money-format';
import { ColorPicker, Field, SWATCHES } from '../ui/fields';
import { FormDialog } from '../ui/form-dialog';

/** Create a savings goal, or edit / delete one. */
export function GoalDialog({ goal, onClose }: { goal?: SavingsGoal; onClose: () => void }) {
  const { create, update, remove } = useGoalActions();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? rupeesText(goal.targetPaise) : '');
  const [saved, setSaved] = useState('');
  const [targetOn, setTargetOn] = useState(goal?.targetOn ?? '');
  const [color, setColor] = useState(goal?.color ?? SWATCHES[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const submit = () => {
    const trimmed = name.trim();
    const targetPaise = parseRupees(target);
    const savedPaise = parseRupees(saved || '0');
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    if (targetPaise === null || targetPaise <= 0) {
      setError('Enter the target in rupees above zero, like 50,000');
      return;
    }
    if (savedPaise === null) {
      setError('Enter the saved amount in rupees, like 1,500.50');
      return;
    }
    if (targetOn && !isDayString(targetOn)) {
      setError('Pick a valid date');
      return;
    }
    setError(null);
    if (goal) {
      update.mutate(
        { id: goal.id, name: trimmed, targetPaise, targetOn: targetOn || null, color },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        { name: trimmed, targetPaise, color, savedPaise, ...(targetOn ? { targetOn } : {}) },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <FormDialog
      title={goal ? 'Edit goal' : 'New goal'}
      submitLabel={goal ? 'Save' : 'Add goal'}
      onSubmit={submit}
      onClose={onClose}
      busy={busy}
      error={error}
      footerStart={
        goal ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              remove.mutate(goal.id, { onSuccess: onClose });
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
          placeholder="Emergency fund, new laptop…"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Field label="Target (₹)">
        <Input
          inputMode="decimal"
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
          }}
        />
      </Field>
      {goal ? null : (
        <Field label="Already saved (₹)">
          <Input
            inputMode="decimal"
            value={saved}
            onChange={(event) => {
              setSaved(event.target.value);
            }}
          />
        </Field>
      )}
      <Field label="Target date (optional)">
        <Input
          type="date"
          value={targetOn}
          onChange={(event) => {
            setTargetOn(event.target.value);
          }}
        />
      </Field>
      <ColorPicker value={color} onChange={setColor} />
    </FormDialog>
  );
}
