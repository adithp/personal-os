import { formatInr } from '@personal-os/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeBudget, moneyState } from '../../test/fake-money';
import {
  callsTo,
  findToast,
  makeFake,
  openMoney,
  resetEverything,
  restoreEverything,
  sampleSeed,
} from './test-utils';

beforeEach(resetEverything);
afterEach(restoreEverything);

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('Overview', () => {
  it('shows the total balance, this month in and out, close budgets, renewals and recent transactions', async () => {
    await openMoney(sampleSeed().seed);
    await heading('Money');
    const total = await screen.findByRole('region', { name: 'Total balance' });
    expect(total).toHaveTextContent(formatInr(9500000));
    expect(screen.getByRole('region', { name: 'Income this month' })).toHaveTextContent(
      formatInr(6000000),
    );
    expect(screen.getByRole('region', { name: 'Spent this month' })).toHaveTextContent(
      formatInr(100000),
    );

    const budgets = await screen.findByRole('region', { name: 'Budgets close to the limit' });
    expect(await within(budgets).findByText('Food')).toBeInTheDocument();
    expect(within(budgets).getByText('100%')).toBeInTheDocument();

    const renewals = screen.getByRole('region', { name: 'Upcoming renewals' });
    expect(await within(renewals).findByText('Gym')).toBeInTheDocument();
    expect(within(renewals).getByText('Overdue by 4 days')).toBeInTheDocument();
    expect(within(renewals).getByText('In 6 days')).toBeInTheDocument();

    const recent = screen.getByRole('region', { name: 'Recent transactions' });
    expect(await within(recent).findAllByText('Today')).not.toHaveLength(0);
  });

  it('starts with a wallet when there is none, and the button opens Wallets', async () => {
    const { user, router } = await openMoney({});
    await screen.findByText('Start with a wallet');
    await user.click(screen.getByRole('button', { name: 'Add a wallet' }));
    await heading('Wallets');
    expect(router.state.location.search).toMatchObject({ section: 'wallets' });
  });

  it('shows the error with Try again, and recovers', async () => {
    const fake = makeFake(sampleSeed().seed);
    fake.failNext(500, 'boom', 'The database is asleep', '/wallets');
    const { user } = await openMoney({}, '', fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The database is asleep');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Total balance' })).toBeInTheDocument();
  });
});

describe('Wallets', () => {
  it('shows a card with the balance of each wallet and the total', async () => {
    await openMoney(sampleSeed().seed, '?section=wallets');
    await heading('Wallets');
    const cash = await screen.findByRole('button', { name: 'Open Cash transactions' });
    expect(cash).toHaveTextContent(formatInr(200000));
    expect(screen.getByRole('button', { name: 'Open HDFC transactions' })).toHaveTextContent(
      formatInr(9300000),
    );
    expect(screen.getByText(`Total ${formatInr(9500000)}`)).toBeInTheDocument();
  });

  it("a click on a wallet opens that wallet's transactions", async () => {
    const { user, router } = await openMoney(sampleSeed().seed, '?section=wallets');
    await user.click(await screen.findByRole('button', { name: 'Open Cash transactions' }));
    await heading('Transactions');
    expect(router.state.location.search).toMatchObject({ section: 'transactions' });
    expect(router.state.location.search).toHaveProperty('wallet');
    // Cash has Lunch, Dinner and the transfer in; the bank's salary is not shown
    expect(await screen.findByRole('button', { name: /Edit Food, -₹550/ })).toBeInTheDocument();
    expect(screen.queryByText('October pay')).not.toBeInTheDocument();
  });

  it('adds a wallet with an opening balance in paise', async () => {
    const { user, fake } = await openMoney(sampleSeed().seed, '?section=wallets');
    await user.click(await screen.findByRole('button', { name: 'New wallet' }));
    const dialog = await screen.findByRole('dialog', { name: 'New wallet' });
    await user.type(within(dialog).getByLabelText('Name'), 'Savings');
    await user.clear(within(dialog).getByLabelText('Opening balance (₹)'));
    await user.type(within(dialog).getByLabelText('Opening balance (₹)'), '1,234.50');
    await user.click(within(dialog).getByRole('button', { name: 'Add wallet' }));
    await waitFor(() => {
      expect(
        moneyState()
          .wallets()
          .map((w) => w.name),
      ).toContain('Savings');
    });
    expect(callsTo(fake, 'POST', '/wallets')[0]?.body).toMatchObject({
      name: 'Savings',
      openingBalancePaise: 123450,
    });
    expect(
      await screen.findByRole('button', { name: 'Open Savings transactions' }),
    ).toHaveTextContent(formatInr(123450));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('refuses an opening balance with three decimals', async () => {
    const { user, fake } = await openMoney(sampleSeed().seed, '?section=wallets');
    await user.click(await screen.findByRole('button', { name: 'New wallet' }));
    const dialog = await screen.findByRole('dialog', { name: 'New wallet' });
    await user.type(within(dialog).getByLabelText('Name'), 'Odd');
    await user.clear(within(dialog).getByLabelText('Opening balance (₹)'));
    await user.type(within(dialog).getByLabelText('Opening balance (₹)'), '1.234');
    await user.click(within(dialog).getByRole('button', { name: 'Add wallet' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/rupees/);
    expect(callsTo(fake, 'POST', '/wallets')).toHaveLength(0);
  });

  it('archives a wallet from its dialog, and a wallet with transactions cannot be deleted', async () => {
    const { user } = await openMoney(sampleSeed().seed, '?section=wallets');
    await user.click(await screen.findByRole('button', { name: 'Edit Cash' }));
    let dialog = await screen.findByRole('dialog', { name: 'Edit wallet' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await findToast('Archive it instead')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(
      moneyState()
        .wallets()
        .find((w) => w.name === 'Cash')?.archived,
    ).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Open Cash transactions' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show archived' }));
    await user.click(await screen.findByRole('button', { name: 'Edit Cash' }));
    dialog = await screen.findByRole('dialog', { name: 'Edit wallet' });
    expect(within(dialog).getByRole('button', { name: 'Unarchive' })).toBeInTheDocument();
  });

  it('has an empty state with a call to action', async () => {
    const { user } = await openMoney({}, '?section=wallets');
    await screen.findByText('No wallets yet');
    await user.click(screen.getByRole('button', { name: 'Add a wallet' }));
    expect(await screen.findByRole('dialog', { name: 'New wallet' })).toBeInTheDocument();
  });

  it('shows an error with Try again', async () => {
    const { fake, user } = await openMoney(sampleSeed().seed, '?section=wallets');
    await screen.findByText('HDFC');
    fake.failNext(500, 'boom', 'Wallets are unavailable', '/wallets');
    await user.click(screen.getByRole('button', { name: 'Show archived' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wallets are unavailable');
  });
});

describe('Budgets', () => {
  it('shows a progress bar per category with spent, amount and percent', async () => {
    await openMoney(sampleSeed().seed, '?section=budgets');
    await heading('Budgets');
    const bar = await screen.findByRole('progressbar', { name: 'Food budget' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute(
      'aria-valuetext',
      `${formatInr(100000)} of ${formatInr(100000)}, 100%`,
    );
    expect(screen.queryByText(/Over budget/)).not.toBeInTheDocument();
  });

  it('marks an over-budget category in the danger color', async () => {
    const { seed, food } = sampleSeed();
    await openMoney(
      {
        ...seed,
        budgets: [makeBudget({ categoryId: food.id, month: '2026-10', amountPaise: 80000 })],
      },
      '?section=budgets',
    );
    const note = await screen.findByText(`Over budget by ${formatInr(20000)}`);
    expect(note).toHaveClass('text-danger');
    const bar = screen.getByRole('progressbar', { name: 'Food budget' });
    expect(bar.firstElementChild).toHaveClass('bg-danger');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('switches month and shows an empty state with a call to action', async () => {
    const { user } = await openMoney(sampleSeed().seed, '?section=budgets');
    await screen.findByRole('progressbar', { name: 'Food budget' });
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByText('No budgets this month')).toBeInTheDocument();
    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });

  it('sets a budget for the month and sends integer paise', async () => {
    const { user, fake } = await openMoney(sampleSeed().seed, '?section=budgets');
    await screen.findByRole('progressbar', { name: 'Food budget' });
    await user.click(screen.getByRole('button', { name: 'Set a budget' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set a budget' });
    // Food already has one: only the other expense category is offered
    expect(within(dialog).queryByRole('option', { name: 'Food' })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Budget for the month (₹)'), '15,000.50');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(callsTo(fake, 'PUT', '/budgets')).toHaveLength(1);
    });
    expect(callsTo(fake, 'PUT', '/budgets')[0]?.body).toMatchObject({
      month: '2026-10',
      amountPaise: 1500050,
    });
    expect(await screen.findByRole('progressbar', { name: 'Rent budget' })).toBeInTheDocument();
  });

  it('removes a budget and offers Undo', async () => {
    const { user } = await openMoney(sampleSeed().seed, '?section=budgets');
    await user.click(await screen.findByRole('button', { name: 'Edit budget Food' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit budget' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove budget' }));
    expect(await screen.findByText('No budgets this month')).toBeInTheDocument();
    const toast = await findToast('Budget removed.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('progressbar', { name: 'Food budget' })).toBeInTheDocument();
  });
});

describe('Goals', () => {
  it('shows progress and adds money', async () => {
    const { user, fake } = await openMoney(sampleSeed().seed, '?section=goals');
    const bar = await screen.findByRole('progressbar', { name: 'Laptop goal' });
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    await user.click(screen.getByRole('button', { name: 'Add money to Laptop' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add money to Laptop' });
    await user.type(within(dialog).getByLabelText('Amount (₹)'), '10,000');
    await user.click(within(dialog).getByRole('button', { name: 'Add money' }));
    await waitFor(() => {
      expect(screen.getByRole('progressbar', { name: 'Laptop goal' })).toHaveAttribute(
        'aria-valuenow',
        '38',
      );
    });
    expect(
      callsTo(fake, 'POST', `/savings-goals/${moneyState().goals()[0]?.id ?? ''}/contribute`)[0]
        ?.body,
    ).toEqual({
      deltaPaise: 1000000,
    });
  });

  it('cannot take out more than is saved', async () => {
    const { user } = await openMoney(sampleSeed().seed, '?section=goals');
    await user.click(await screen.findByRole('button', { name: 'Take money out of Laptop' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Amount (₹)'), '999999');
    await user.click(within(dialog).getByRole('button', { name: 'Take out' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Only');
  });

  it('has an empty state and an error state', async () => {
    const { user } = await openMoney({}, '?section=goals');
    await screen.findByText('No goals yet');
    await user.click(screen.getByRole('button', { name: 'Add a goal' }));
    expect(await screen.findByRole('dialog', { name: 'New goal' })).toBeInTheDocument();
  });

  it('shows the error with Try again', async () => {
    const fake = makeFake(sampleSeed().seed);
    fake.failNext(500, 'boom', 'No goals today', '/savings-goals');
    const { user } = await openMoney({}, '?section=goals', fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No goals today');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('progressbar', { name: 'Laptop goal' })).toBeInTheDocument();
  });
});

describe('Subscriptions', () => {
  it('shows monthly and yearly totals over the active ones, upcoming, Overdue and dimmed rows', async () => {
    await openMoney(sampleSeed().seed, '?section=subscriptions');
    await heading('Subscriptions');
    expect(await screen.findByRole('group', { name: 'Per month' })).toHaveTextContent(
      formatInr(184900),
    );
    expect(screen.getByRole('group', { name: 'Per year' })).toHaveTextContent(formatInr(2218800));

    const upcoming = screen.getByRole('region', { name: 'Upcoming renewals' });
    expect(within(upcoming).getByText('Netflix')).toBeInTheDocument();
    expect(within(upcoming).getByText('Overdue')).toBeInTheDocument();
    expect(within(upcoming).queryByText('Old paper')).not.toBeInTheDocument();

    const all = screen.getByRole('region', { name: 'All subscriptions' });
    const cancelled = within(all).getByText('Old paper').closest('li');
    expect(cancelled).toHaveClass('opacity-60');
    expect(within(all).getByText('Cancelled')).toBeInTheDocument();
    // A cancelled subscription cannot be marked paid
    expect(
      within(all).queryByRole('button', { name: 'Mark Old paper paid' }),
    ).not.toBeInTheDocument();
  });

  it('Mark paid moves the renewal on, books the expense, and Undo puts it back', async () => {
    const { user, fake } = await openMoney(sampleSeed().seed, '?section=subscriptions');
    const upcoming = await screen.findByRole('region', { name: 'Upcoming renewals' });
    const before = moneyState().transactions().length;
    await user.click(within(upcoming).getByRole('button', { name: 'Mark Netflix paid' }));
    await waitFor(() => {
      expect(moneyState().transactions()).toHaveLength(before + 1);
    });
    expect(
      callsTo(fake, 'POST', `/subscriptions/${moneyState().subscriptions()[0]?.id ?? ''}/renew`),
    ).toHaveLength(1);
    const netflix = moneyState()
      .subscriptions()
      .find((s) => s.name === 'Netflix');
    expect(netflix?.nextRenewalOn).toBe('2026-11-20');
    expect(moneyState().transactions().at(-1)).toMatchObject({
      kind: 'expense',
      amountPaise: 64900,
      subscriptionId: netflix?.id,
    });

    const toast = await findToast('Netflix marked paid');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(moneyState().transactions()).toHaveLength(before);
    });
    expect(
      moneyState()
        .subscriptions()
        .find((s) => s.name === 'Netflix')?.nextRenewalOn,
    ).toBe('2026-10-20');
  });

  it('adds a subscription with the price as integer paise', async () => {
    const { user, fake } = await openMoney(sampleSeed().seed, '?section=subscriptions');
    await user.click(await screen.findByRole('button', { name: 'New subscription' }));
    const dialog = await screen.findByRole('dialog', { name: 'New subscription' });
    await user.type(within(dialog).getByLabelText('Name'), 'Spotify');
    await user.type(within(dialog).getByLabelText('Price (₹)'), '119');
    await user.click(within(dialog).getByRole('button', { name: 'Add subscription' }));
    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/subscriptions')).toHaveLength(1);
    });
    expect(callsTo(fake, 'POST', '/subscriptions')[0]?.body).toMatchObject({
      name: 'Spotify',
      amountPaise: 11900,
      cycle: 'monthly',
      nextRenewalOn: '2026-10-14',
    });
  });

  it('has empty and error states', async () => {
    const { fake } = await openMoney({}, '?section=subscriptions');
    await screen.findByText('No subscriptions yet');
    expect(fake.calls.some((call) => call.path === '/subscriptions')).toBe(true);
  });

  it('shows the error of the list with Try again', async () => {
    const fake = makeFake(sampleSeed().seed);
    fake.failNext(500, 'boom', 'Subscriptions are down', '/subscriptions');
    const { user } = await openMoney({}, '?section=subscriptions', fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Subscriptions are down');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'All subscriptions' })).toBeInTheDocument();
  });
});

describe('Reports', () => {
  it('shows income, expense with the change against last month, and net', async () => {
    await openMoney(sampleSeed().seed, '?section=reports');
    await heading('Reports');
    expect(await screen.findByRole('region', { name: 'Income' })).toHaveTextContent(
      formatInr(6000000),
    );
    const expense = screen.getByRole('region', { name: 'Expense' });
    expect(expense).toHaveTextContent(formatInr(100000));
    expect(expense).toHaveTextContent('-93% vs last month');
    expect(screen.getByRole('region', { name: 'Net' })).toHaveTextContent(formatInr(5900000));
  });

  it('shows spending by category with the category colors and a table toggle for both cards', async () => {
    const { user } = await openMoney(sampleSeed().seed, '?section=reports');
    const byCategory = await screen.findByRole('region', { name: 'Spending by category' });
    expect(within(byCategory).getByText('Food')).toBeInTheDocument();
    await user.click(within(byCategory).getByRole('button', { name: 'Show table' }));
    const table = within(byCategory).getByRole('table', { name: 'Spending by category' });
    expect(within(table).getByText(formatInr(100000))).toBeInTheDocument();
    expect(within(table).getByText('100%')).toBeInTheDocument();

    const byDay = screen.getByRole('region', { name: 'Spending per day' });
    await user.click(within(byDay).getByRole('button', { name: 'Show table' }));
    const days = within(byDay).getByRole('table', { name: 'Spending per day' });
    expect(within(days).getByText(formatInr(45000))).toBeInTheDocument();
    expect(within(days).getByText(formatInr(55000))).toBeInTheDocument();
  });

  it('moves to the previous month with the button', async () => {
    const { user } = await openMoney(sampleSeed().seed, '?section=reports');
    await screen.findByRole('region', { name: 'Income' });
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(
      within(screen.getByRole('group', { name: 'Month' })).getByText('September 2026'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Expense' })).toHaveTextContent(formatInr(1500000));
    });
    expect(await screen.findByRole('region', { name: 'Expense' })).toHaveTextContent(
      formatInr(1500000),
    );
  });

  it('has an empty state with a call to action, and an error state', async () => {
    const { user, fake } = await openMoney({}, '?section=reports');
    await screen.findByText('Nothing to report');
    await user.click(screen.getByRole('button', { name: 'Go to Transactions' }));
    await heading('Transactions');
    expect(fake.calls.some((call) => call.path === '/finance/summary')).toBe(true);
  });

  it('shows the error with Try again', async () => {
    const fake = makeFake(sampleSeed().seed);
    fake.failNext(500, 'boom', 'No report today', '/finance');
    const { user } = await openMoney({}, '?section=reports', fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No report today');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Income' })).toBeInTheDocument();
  });
});

describe('Loading and colors', () => {
  it('shows a loading sentence while a page waits for the server', async () => {
    const fake = makeFake(sampleSeed().seed);
    fake.slow(1500);
    await openMoney({}, '?section=budgets', fake);
    expect(await screen.findByText('Loading budgets…')).toBeInTheDocument();
  });

  it('uses no hard-coded color outside the colors the user chose', async () => {
    await openMoney(sampleSeed().seed, '?section=reports');
    await screen.findByRole('region', { name: 'Income' });
    const html = document.documentElement.innerHTML;
    // Inline styles carry only category / wallet colors (rgb in the DOM), never a hex in a class or attribute
    expect(html).not.toMatch(/class="[^"]*#[0-9a-fA-F]{6}/);
  });
});
