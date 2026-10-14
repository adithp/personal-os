import type { BillingCycle } from '@personal-os/shared';

export const CYCLE_NAMES: Record<BillingCycle, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
};
