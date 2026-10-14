import { addMonthsToMonth, indiaDay, monthOf } from '@personal-os/shared';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { validateMoneySearch, type MoneySearch, type MoneySection } from './money-search';

/** Today as an India calendar day, fixed while the page is open. */
export function useToday(): string {
  const [today] = useState(() => indiaDay(new Date()));
  return today;
}

/** Reads and changes the section, month and wallet in the URL of the Money page. */
export function useMoneyNav() {
  // Checked again here: a bad link must open Overview, whatever the router handed over
  const search: MoneySearch = validateMoneySearch(useSearch({ from: '/_app/money' }));
  const navigate = useNavigate();
  const today = useToday();
  const thisMonth = monthOf(today);
  const month = search.month ?? thisMonth;

  const go = (next: MoneySearch, replace = false) => {
    void navigate({ to: '/money', search: next, replace });
  };
  const monthParam = (value: string) => (value === thisMonth ? {} : { month: value });
  const keep = {
    ...(search.section ? { section: search.section } : {}),
    ...(search.wallet ? { wallet: search.wallet } : {}),
  };

  return {
    today,
    thisMonth,
    section: search.section ?? 'overview',
    month,
    walletId: search.wallet ?? null,
    /** Show a section; the month stays for the sections that have one. */
    showSection: (section: MoneySection, extra: Pick<MoneySearch, 'wallet'> = {}) => {
      go({
        ...(section === 'overview' ? {} : { section }),
        ...(section === 'overview' || section === 'wallets' ? {} : monthParam(month)),
        ...extra,
      });
    },
    setMonth: (value: string) => {
      go({ ...keep, ...monthParam(value) });
    },
    stepMonth: (n: number) => {
      go({ ...keep, ...monthParam(addMonthsToMonth(month, n)) });
    },
    /** Filter Transactions to one wallet (null: all wallets). */
    setWallet: (walletId: string | null) => {
      go({
        ...(search.section ? { section: search.section } : {}),
        ...(search.month ? { month: search.month } : {}),
        ...(walletId ? { wallet: walletId } : {}),
      });
    },
  };
}
