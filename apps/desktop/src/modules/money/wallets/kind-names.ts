import type { WalletKind } from '@personal-os/shared';

export const KIND_NAMES: Record<WalletKind, string> = {
  cash: 'Cash',
  bank: 'Bank account',
  card: 'Card',
  upi: 'UPI',
  other: 'Other',
};
