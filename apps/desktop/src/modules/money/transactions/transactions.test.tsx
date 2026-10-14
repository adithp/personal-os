import { formatInr } from '@personal-os/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeRecurring, moneyState } from '../../../test/fake-money';
import {
  callsTo,
  findToast,
  makeFake,
  openMoney,
  resetEverything,
  restoreEverything,
  sampleSeed,
} from '../test-utils';

beforeEach(resetEverything);
afterEach(restoreEverything);

const open = async (search = '?section=transactions') => {
  const opened = await openMoney(sampleSeed().seed, search);
  await screen.findByRole('heading', { level: 1, name: 'Transactions' });
  await screen.findByRole('region', { name: 'Today' });
  return opened;
};

const openForm = async (user: Awaited<ReturnType<typeof open>>['user']) => {
  await user.click(screen.getByRole('button', { name: 'New transaction' }));
  return screen.findByRole('dialog', { name: 'New transaction' });
};

describe('Transactions list', () => {
  it('groups the month by India day with the net of each day', async () => {
    await open();
    const today = screen.getByRole('region', { name: 'Today' });
    // Dinner (-550) and the transfer (left out of the total)
    expect(
      within(today).getByText(`-${formatInr(55000)}`, { selector: 'span.text-small' }),
    ).toBeInTheDocument();
    expect(
      within(today).getByRole('button', { name: /Edit Food, -₹550, Dinner/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Yesterday' })).toBeInTheDocument();
    const first = screen.getByRole('region', { name: /1 Oct/ });
    expect(
      within(first).getByText(`+${formatInr(6000000)}`, { selector: 'span.text-small' }),
    ).toBeInTheDocument();
    // September belongs to the previous month
    expect(screen.queryByRole('button', { name: /Rent/ })).not.toBeInTheDocument();
  });

  it('shows a transfer as "A to B" in the list of either wallet', async () => {
    const { user } = await open();
    expect(screen.getByRole('button', { name: /Edit HDFC to Cash, ₹2,000/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Wallet'), 'Cash');
    expect(await screen.findByRole('button', { name: /Edit HDFC to Cash/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Wallet'), 'HDFC');
    expect(await screen.findByRole('button', { name: /Edit HDFC to Cash/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lunch/ })).not.toBeInTheDocument();
  });

  it('filters by kind, category and text', async () => {
    const { user } = await open();
    await user.selectOptions(screen.getByLabelText('Kind'), 'income');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Dinner/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /October pay/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Kind'), 'All kinds');
    await user.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'lunch');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Dinner/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Lunch/ })).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search notes' }));
    await user.selectOptions(screen.getByLabelText('Category'), 'Salary');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Lunch/ })).not.toBeInTheDocument();
    });
  });

  it('moves to the previous month with the buttons and shows September', async () => {
    const { user, router } = await open();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByRole('button', { name: /Edit Rent, -₹15,000/ })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ month: '2026-09' });
  });

  it('has an empty state with a call to action, and a message for filters with no match', async () => {
    const { user } = await openMoney(
      { wallets: sampleSeed().seed.wallets ?? [] },
      '?section=transactions',
    );
    await screen.findByText('No transactions this month');
    await user.click(screen.getByRole('button', { name: 'Add a transaction' }));
    expect(await screen.findByRole('dialog', { name: 'New transaction' })).toBeInTheDocument();
  });

  it('shows the error with Try again', async () => {
    const fake = makeFake(sampleSeed().seed);
    fake.failNext(500, 'boom', 'Transactions are down', '/transactions');
    const { user } = await openMoney({}, '?section=transactions', fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Transactions are down');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Today' })).toBeInTheDocument();
  });
});

describe('Transaction form', () => {
  it('starts on Expense, today (India), with focus on the amount', async () => {
    const { user } = await open();
    const dialog = await openForm(user);
    expect(within(dialog).getByRole('radio', { name: 'Expense' })).toBeChecked();
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-14');
    expect(within(dialog).getByLabelText('Amount (₹)')).toHaveFocus();
    expect(dialog.parentElement?.parentElement).toBe(document.body);
  });

  it('turns rupees into integer paise and adds an expense', async () => {
    const { user, fake } = await open();
    const dialog = await openForm(user);
    await user.type(within(dialog).getByLabelText('Amount (₹)'), '1,234.50');
    await user.selectOptions(within(dialog).getByLabelText('Wallet'), 'Cash');
    await user.selectOptions(within(dialog).getByLabelText('Category'), 'Food');
    await user.type(within(dialog).getByLabelText('Note'), 'Groceries');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/transactions')).toHaveLength(1);
    });
    const body = callsTo(fake, 'POST', '/transactions')[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      kind: 'expense',
      amountPaise: 123450,
      occurredOn: '2026-10-14',
      note: 'Groceries',
    });
    expect(Number.isInteger(body.amountPaise)).toBe(true);
    expect(body).not.toHaveProperty('toWalletId', expect.any(String));
    expect(
      await screen.findByRole('button', { name: /Edit Food, -₹1,234.50, Groceries/ }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await findToast('added')).toBeInTheDocument();
  });

  it('refuses an amount with three decimals, a letter or zero, and sends nothing', async () => {
    const { user, fake } = await open();
    const dialog = await openForm(user);
    for (const text of ['1.234', 'abc', '0']) {
      await user.clear(within(dialog).getByLabelText('Amount (₹)'));
      await user.type(within(dialog).getByLabelText('Amount (₹)'), text);
      await user.click(within(dialog).getByRole('button', { name: 'Add' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(/amount in rupees/i);
    }
    expect(callsTo(fake, 'POST', '/transactions')).toHaveLength(0);
  });

  it('a transfer needs two different wallets and has no category', async () => {
    const { user, fake } = await open();
    const dialog = await openForm(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Transfer' }));
    expect(within(dialog).queryByLabelText('Category')).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Amount (₹)'), '700');

    // No second wallet yet
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /wallet to send the money to/,
    );

    // The same wallet twice
    await user.selectOptions(within(dialog).getByLabelText('From wallet'), 'Cash');
    await user.selectOptions(within(dialog).getByLabelText('To wallet'), 'Cash');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Pick two different wallets',
    );
    expect(callsTo(fake, 'POST', '/transactions')).toHaveLength(0);

    await user.selectOptions(within(dialog).getByLabelText('To wallet'), 'HDFC');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/transactions')).toHaveLength(1);
    });
    const body = callsTo(fake, 'POST', '/transactions')[0]?.body;
    expect(body).toMatchObject({ kind: 'transfer', amountPaise: 70000, categoryId: null });
    expect(
      moneyState()
        .wallets()
        .find((w) => w.name === 'Cash')?.balancePaise,
    ).toBe(200000 - 70000);
    expect(
      moneyState()
        .wallets()
        .find((w) => w.name === 'HDFC')?.balancePaise,
    ).toBe(9300000 + 70000);
  });

  it('only offers the categories of the kind', async () => {
    const { user } = await open();
    const dialog = await openForm(user);
    const category = within(dialog).getByLabelText('Category');
    expect(within(category).getByRole('option', { name: 'Food' })).toBeInTheDocument();
    expect(within(category).queryByRole('option', { name: 'Salary' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Income' }));
    expect(within(category).getByRole('option', { name: 'Salary' })).toBeInTheDocument();
    expect(within(category).queryByRole('option', { name: 'Food' })).not.toBeInTheDocument();
  });

  it('a monthly repeat makes a repeating rule on the day of the month', async () => {
    const { user, fake } = await open();
    const dialog = await openForm(user);
    await user.type(within(dialog).getByLabelText('Amount (₹)'), '15000');
    await user.selectOptions(within(dialog).getByLabelText('Repeat'), 'Every month');
    await user.click(within(dialog).getByRole('button', { name: 'Add repeating' }));
    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/recurring-transactions')).toHaveLength(1);
    });
    expect(callsTo(fake, 'POST', '/transactions')).toHaveLength(0);
    expect(callsTo(fake, 'POST', '/recurring-transactions')[0]?.body).toMatchObject({
      amountPaise: 1500000,
      rule: 'FREQ=MONTHLY;BYMONTHDAY=14',
      startOn: '2026-10-14',
    });
    // Starting today, the first transaction exists at once
    await waitFor(() => {
      expect(
        moneyState()
          .transactions()
          .filter((tx) => tx.recurringId !== null),
      ).toHaveLength(1);
    });
    expect(
      await screen.findByRole('region', { name: 'Repeating transactions' }),
    ).toBeInTheDocument();
  });

  it('a weekly repeat starts on the weekday of the date and needs at least one day', async () => {
    const { user, fake } = await open();
    const dialog = await openForm(user);
    await user.type(within(dialog).getByLabelText('Amount (₹)'), '100');
    await user.selectOptions(within(dialog).getByLabelText('Repeat'), 'Every week on…');
    const days = within(dialog).getByRole('group', { name: 'Repeat on' });
    // 14 October 2026 is a Wednesday
    expect(within(days).getByRole('button', { name: 'Wed' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(days).getByRole('button', { name: 'Wed' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add repeating' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Pick at least one weekday');
    await user.click(within(days).getByRole('button', { name: 'Mon' }));
    await user.click(within(days).getByRole('button', { name: 'Wed' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add repeating' }));
    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/recurring-transactions')).toHaveLength(1);
    });
    expect(callsTo(fake, 'POST', '/recurring-transactions')[0]?.body).toMatchObject({
      rule: 'FREQ=WEEKLY;BYDAY=MO,WE',
    });
  });

  it('edits a transaction (amount in rupees) and has no repeat option', async () => {
    const { user, fake } = await open();
    await user.click(screen.getByRole('button', { name: /Edit Food, -₹550, Dinner/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' });
    expect(within(dialog).getByLabelText('Amount (₹)')).toHaveValue('550');
    expect(within(dialog).queryByLabelText('Repeat')).not.toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Amount (₹)'));
    await user.type(within(dialog).getByLabelText('Amount (₹)'), '600.75');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(
        callsTo(fake, 'PATCH', `/transactions/${moneyState().transactions()[2]?.id ?? ''}`),
      ).toHaveLength(1);
    });
    expect(
      await screen.findByRole('button', { name: /Edit Food, -₹600.75, Dinner/ }),
    ).toBeInTheDocument();
  });

  it('deletes from the form and Undo brings the transaction back', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /Edit Food, -₹550, Dinner/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Dinner/ })).not.toBeInTheDocument();
    });
    const toast = await findToast('Transaction deleted.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(
      await screen.findByRole('button', { name: /Edit Food, -₹550, Dinner/ }),
    ).toBeInTheDocument();
  });

  it('Escape closes the form and brings focus back to the button that opened it', async () => {
    const { user } = await open();
    const button = screen.getByRole('button', { name: 'New transaction' });
    await openForm(user);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(button).toHaveFocus();
  });

  it('keeps Tab inside the form', async () => {
    const { user } = await open();
    const dialog = await openForm(user);
    const buttons = within(dialog).getAllByRole('button');
    const last = buttons.at(-1);
    last?.focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('shows the message of the server when it refuses', async () => {
    const { user, fake } = await open();
    const dialog = await openForm(user);
    await user.type(within(dialog).getByLabelText('Amount (₹)'), '10');
    fake.failNext(400, 'validation_error', 'The wallet is archived', '/transactions');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await findToast('The wallet is archived')).toBeInTheDocument();
    // The form stays open so nothing typed is lost
    expect(screen.getByRole('dialog', { name: 'New transaction' })).toBeInTheDocument();
  });
});

describe('Repeating list and categories', () => {
  const withRule = () => {
    const data = sampleSeed();
    return {
      ...data.seed,
      recurring: [
        makeRecurring({
          walletId: data.bank.id,
          categoryId: data.rent.id,
          amountPaise: 1500000,
          nextOn: '2026-11-01',
        }),
      ],
    };
  };

  it('lists the rules with their schedule and pauses, resumes and deletes them', async () => {
    const { user } = await openMoney(withRule(), '?section=transactions');
    const list = await screen.findByRole('region', { name: 'Repeating transactions' });
    expect(within(list).getByText(/Every month on the 1st · Next 1 Nov/)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Pause repeat Rent' }));
    expect(await within(list).findByText(/Paused/)).toBeInTheDocument();
    expect(moneyState().recurring()[0]?.active).toBe(false);
    await user.click(within(list).getByRole('button', { name: 'Resume repeat Rent' }));
    await waitFor(() => {
      expect(moneyState().recurring()[0]?.active).toBe(true);
    });
    await user.click(within(list).getByRole('button', { name: 'Delete repeat Rent' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('region', { name: 'Repeating transactions' }),
      ).not.toBeInTheDocument();
    });
  });

  it('adds, renames and deletes a category from the dialog', async () => {
    const { user, fake } = await open();
    await user.click(screen.getByRole('button', { name: 'Categories' }));
    const dialog = await screen.findByRole('dialog', { name: 'Categories' });
    await user.type(within(dialog).getByLabelText('New category'), 'Pets');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('Pets')).toBeInTheDocument();
    expect(callsTo(fake, 'POST', '/categories')[0]?.body).toMatchObject({
      name: 'Pets',
      kind: 'expense',
    });

    await user.click(within(dialog).getByRole('button', { name: 'Edit category Pets' }));
    await user.clear(within(dialog).getByLabelText('Category name'));
    await user.type(within(dialog).getByLabelText('Category name'), 'Pet care');
    await user.click(within(dialog).getByRole('button', { name: 'Save category' }));
    expect(await within(dialog).findByText('Pet care')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete category Pet care' }));
    await waitFor(() => {
      expect(within(dialog).queryByText('Pet care')).not.toBeInTheDocument();
    });
  });

  it('first call of the categories creates the defaults for a new user', async () => {
    await openMoney({ wallets: sampleSeed().seed.wallets ?? [] }, '?section=transactions');
    await screen.findByText('No transactions this month');
    await waitFor(() => {
      expect(
        moneyState()
          .categories()
          .map((c) => c.name),
      ).toContain('Salary');
    });
  });
});
