import { z } from 'zod';
import { defineAction } from './actions';
import { daySchema, paiseSchema, transactionSchema } from './finance';

/**
 * Money module, Subscriptions part (docs/features/subscriptions.md). Amounts are integer paise,
 * renewal dates are India calendar days (YYYY-MM-DD, see finance.ts).
 */

/** Tables of this part that screens show live. */
export const SUBSCRIPTIONS_REALTIME_TABLES = ['subscriptions'] as const;

export const BILLING_CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export const SUBSCRIPTION_STATUSES = ['active', 'paused', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Months per cycle, for the yearly and monthly cost. Weekly is 12/52 of a month. */
export const CYCLES_PER_YEAR: Record<BillingCycle, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

/** What the subscription costs in a year, in whole paise. */
export const yearlyPaise = (amountPaise: number, cycle: BillingCycle): number =>
  amountPaise * CYCLES_PER_YEAR[cycle];

/** What the subscription costs in an average month, in whole paise (rounded). */
export const monthlyPaise = (amountPaise: number, cycle: BillingCycle): number =>
  Math.round(yearlyPaise(amountPaise, cycle) / 12);

const isoTime = z.iso.datetime({ offset: true });
const id = z.uuid();
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a color like #9EE0C8');
const name = z.string().trim().min(1, 'Name is required').max(60);
const note = z.string().trim().max(500);

export const subscriptionSchema = z.object({
  id,
  name: z.string(),
  amountPaise: z.number().int().min(1),
  cycle: z.enum(BILLING_CYCLES),
  /** The day the next payment is due (India day). */
  nextRenewalOn: z.string(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  walletId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  color: z.string(),
  note: z.string().nullable(),
  monthlyPaise: z.number().int(),
  yearlyPaise: z.number().int(),
  /** Days from today (India) to the renewal; negative when it is overdue. */
  daysUntilRenewal: z.number().int(),
  /** Active and the renewal day is before today. */
  overdue: z.boolean(),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type Subscription = z.infer<typeof subscriptionSchema>;

/** Totals over the active subscriptions. */
export const subscriptionSummarySchema = z.object({
  activeCount: z.number().int(),
  monthlyPaise: z.number().int(),
  yearlyPaise: z.number().int(),
});
export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;

export const listSubscriptionsInput = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
});
export const UPCOMING_DEFAULT_DAYS = 30;
export const upcomingSubscriptionsInput = z.object({
  days: z.number().int().min(1).max(366).default(UPCOMING_DEFAULT_DAYS),
});

export const createSubscriptionInput = z.object({
  name,
  amountPaise: paiseSchema,
  cycle: z.enum(BILLING_CYCLES).default('monthly'),
  nextRenewalOn: daySchema,
  walletId: id.nullish(),
  categoryId: id.nullish(),
  color: color.optional(),
  note: note.nullish(),
});
export type CreateSubscriptionInput = z.input<typeof createSubscriptionInput>;

export const updateSubscriptionInput = z
  .object({
    id,
    name: name.optional(),
    amountPaise: paiseSchema.optional(),
    cycle: z.enum(BILLING_CYCLES).optional(),
    nextRenewalOn: daySchema.optional(),
    status: z.enum(SUBSCRIPTION_STATUSES).optional(),
    walletId: id.nullable().optional(),
    categoryId: id.nullable().optional(),
    color: color.optional(),
    note: note.nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 1, { message: 'Nothing to change' });
export type UpdateSubscriptionInput = z.input<typeof updateSubscriptionInput>;

/** Mark a renewal as paid: moves the renewal day one cycle on and, with a wallet, books an expense. */
export const renewSubscriptionInput = z.object({
  id,
  /** The day it was paid (default today). */
  paidOn: daySchema.optional(),
  /** Book an expense in the wallet of the subscription (default true; ignored without a wallet). */
  createTransaction: z.boolean().default(true),
});
export type RenewSubscriptionInput = z.input<typeof renewSubscriptionInput>;

/** The undo of a renewal: puts the old renewal day back and deletes the expense it booked. */
export const undoRenewInput = z.object({
  id,
  previousRenewalOn: daySchema,
  transactionId: id.nullable(),
});

export const renewResultSchema = z.object({
  subscription: subscriptionSchema,
  transaction: transactionSchema.nullable(),
});
export type RenewResult = z.infer<typeof renewResultSchema>;

export const subscriptionActions = {
  list: defineAction({
    name: 'subscriptions.list',
    description:
      'List subscriptions with monthly and yearly cost, plus totals over the active ones.',
    permission: 'read',
    input: listSubscriptionsInput,
  }),
  upcoming: defineAction({
    name: 'subscriptions.upcoming',
    description:
      'Active subscriptions renewing within the next N days (default 30), overdue ones first.',
    permission: 'read',
    input: upcomingSubscriptionsInput,
  }),
  create: defineAction({
    name: 'subscriptions.create',
    description: 'Add a subscription: name, amount in paise, cycle, next renewal day.',
    permission: 'write',
    input: createSubscriptionInput,
  }),
  update: defineAction({
    name: 'subscriptions.update',
    description: 'Change a subscription, pause it or cancel it.',
    permission: 'write',
    input: updateSubscriptionInput,
  }),
  renew: defineAction({
    name: 'subscriptions.renew',
    description:
      'Mark the current renewal as paid: move the renewal day one cycle on and book the expense.',
    permission: 'write',
    input: renewSubscriptionInput,
  }),
  undoRenew: defineAction({
    name: 'subscriptions.undo_renew',
    description: 'Undo a renewal. Meant as an undo, not for the AI to call on its own.',
    permission: 'write',
    input: undoRenewInput,
  }),
  delete: defineAction({
    name: 'subscriptions.delete',
    description: 'Delete a subscription. It can be restored.',
    permission: 'write',
    input: z.object({ id }),
  }),
  restore: defineAction({
    name: 'subscriptions.restore',
    description: 'Bring back a deleted subscription.',
    permission: 'write',
    input: z.object({ id }),
  }),
} as const;
