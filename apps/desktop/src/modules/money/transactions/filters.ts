import type { TransactionKind } from '@personal-os/shared';

export interface Filters {
  categoryId: string;
  kind: TransactionKind | '';
  text: string;
}

export const NO_FILTERS: Filters = { categoryId: '', kind: '', text: '' };
