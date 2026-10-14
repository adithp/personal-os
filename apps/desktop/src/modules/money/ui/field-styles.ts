import { DEFAULT_CATEGORIES } from '@personal-os/shared';

/** Same look as the Input of packages/ui, for a native select. */
export const selectClass =
  'h-[34px] w-full rounded-control border-[0.5px] border-transparent bg-input px-3 text-body text-fg ' +
  'focus-ring transition-colors duration-150 ease-out focus-visible:border-accent';

/** The colors a user can pick for wallets, categories, goals and subscriptions. */
export const SWATCHES: readonly string[] = [
  ...new Set(DEFAULT_CATEGORIES.map((category) => category.color)),
];
