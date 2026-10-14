import { WALLET_KINDS, type Wallet, type WalletKind } from '@personal-os/shared';
import { Button, Input } from '@personal-os/ui';
import { useState } from 'react';
import { useWalletActions } from '../money-actions';
import { parseRupees, rupeesText } from '../money-format';
import { ColorPicker, Field, SWATCHES, selectClass } from '../ui/fields';
import { FormDialog } from '../ui/form-dialog';

const KIND_NAMES: Record<WalletKind, string> = {
  cash: 'Cash',
  bank: 'Bank account',
  card: 'Card',
  upi: 'UPI',
  other: 'Other',
};

/** Add a wallet, or edit / archive / delete one. */
export function WalletDialog({ wallet, onClose }: { wallet?: Wallet; onClose: () => void }) {
  const { create, update, remove } = useWalletActions();
  const [name, setName] = useState(wallet?.name ?? '');
  const [kind, setKind] = useState<WalletKind>(wallet?.kind ?? 'bank');
  const [opening, setOpening] = useState(rupeesText(wallet?.openingBalancePaise ?? 0));
  const [color, setColor] = useState(wallet?.color ?? SWATCHES[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    const openingBalancePaise = parseRupees(opening || '0', { allowNegative: true });
    if (openingBalancePaise === null) {
      setError('Enter the opening balance in rupees, like 1,234.50');
      return;
    }
    setError(null);
    if (wallet) {
      update.mutate(
        { id: wallet.id, name: trimmed, kind, color, openingBalancePaise },
        { onSuccess: onClose },
      );
    } else {
      create.mutate({ name: trimmed, kind, color, openingBalancePaise }, { onSuccess: onClose });
    }
  };

  return (
    <FormDialog
      title={wallet ? 'Edit wallet' : 'New wallet'}
      submitLabel={wallet ? 'Save' : 'Add wallet'}
      onSubmit={submit}
      onClose={onClose}
      busy={busy}
      error={error}
      footerStart={
        wallet ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                update.mutate({ id: wallet.id, archived: !wallet.archived }, { onSuccess: onClose });
              }}
            >
              {wallet.archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                remove.mutate(wallet.id, { onSuccess: onClose });
              }}
            >
              Delete
            </Button>
          </div>
        ) : undefined
      }
    >
      <Field label="Name">
        <Input
          value={name}
          maxLength={60}
          placeholder="Cash, HDFC savings…"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Field label="Type">
        <select
          className={selectClass}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as WalletKind);
          }}
        >
          {WALLET_KINDS.map((item) => (
            <option key={item} value={item}>
              {KIND_NAMES[item]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Opening balance (₹)" hint="What was in it before your first transaction here.">
        <Input
          inputMode="decimal"
          value={opening}
          onChange={(event) => {
            setOpening(event.target.value);
          }}
        />
      </Field>
      <ColorPicker value={color} onChange={setColor} />
    </FormDialog>
  );
}

export { KIND_NAMES };
