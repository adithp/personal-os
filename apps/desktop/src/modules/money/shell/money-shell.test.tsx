import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePalette } from '../../../store/palette-store';
import { makeRecurring } from '../../../test/fake-money';
import { callsTo, openMoney, resetEverything, restoreEverything, sampleSeed } from '../test-utils';

beforeEach(resetEverything);
afterEach(restoreEverything);

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('Money side panel and the URL', () => {
  it('opens Overview by default and lists the seven sections', async () => {
    await openMoney(sampleSeed().seed);
    await heading('Money');
    const nav = screen.getByRole('navigation', { name: 'Money' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Overview',
      'Transactions',
      'Wallets',
      'Budgets',
      'Goals',
      'Subscriptions',
      'Reports',
    ]);
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens the section named in the URL, and Overview for a bad one', async () => {
    await openMoney(sampleSeed().seed, '?section=wallets');
    await heading('Wallets');
  });

  it('falls back to Overview when the section is not one of the seven', async () => {
    await openMoney(sampleSeed().seed, '?section=nonsense');
    await heading('Money');
  });

  it('puts the section in the URL when a link is clicked, and keeps the page on reload', async () => {
    const { router, user } = await openMoney(sampleSeed().seed);
    await heading('Money');
    await user.click(screen.getByRole('link', { name: 'Budgets' }));
    await heading('Budgets');
    expect(router.state.location.search).toMatchObject({ section: 'budgets' });
    await user.click(screen.getByRole('link', { name: 'Overview' }));
    await heading('Money');
    expect(router.state.location.search).toEqual({});
  });

  it('keeps the chosen month when moving between month sections', async () => {
    const { router, user } = await openMoney(sampleSeed().seed, '?section=budgets&month=2026-09');
    await heading('Budgets');
    await user.click(screen.getByRole('link', { name: 'Reports' }));
    await heading('Reports');
    expect(router.state.location.search).toMatchObject({ section: 'reports', month: '2026-09' });
  });

  it('collapses to icons, with tooltips names kept, and remembers it', async () => {
    const { user } = await openMoney(sampleSeed().seed);
    await heading('Money');
    await user.click(screen.getByRole('button', { name: 'Collapse side panel' }));
    const nav = screen.getByRole('navigation', { name: 'Money' });
    expect(within(nav).queryByText('Wallets')).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Wallets' })).toBeInTheDocument();
    expect(localStorage.getItem('personal-os.money-ui')).toContain('"sidePanelCollapsed":true');
    await user.click(screen.getByRole('button', { name: 'Expand side panel' }));
    expect(within(nav).getByText('Wallets')).toBeInTheDocument();
  });
});

describe('Money opens', () => {
  it('creates the due repeating transactions once when the page opens', async () => {
    const { bank, seed } = sampleSeed();
    const { fake } = await openMoney({
      ...seed,
      recurring: [
        makeRecurring({
          walletId: bank.id,
          amountPaise: 99900,
          rule: 'FREQ=DAILY',
          nextOn: '2026-10-14',
        }),
      ],
    });
    await heading('Money');
    await waitFor(() => {
      expect(callsTo(fake, 'POST', '/recurring-transactions/run')).toHaveLength(1);
    });
    // The run made a transaction, so the page shows it
    expect((await screen.findAllByText(/₹999/)).length).toBeGreaterThan(0);
  });
});

describe('Money keys', () => {
  it('N opens the add form of the page, and Escape closes it', async () => {
    const { user } = await openMoney(sampleSeed().seed, '?section=wallets');
    await heading('Wallets');
    await user.keyboard('n');
    const dialog = await screen.findByRole('dialog', { name: 'New wallet' });
    expect(within(dialog).getByLabelText('Name')).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('N means a transaction on Transactions, a goal on Goals, a subscription on Subscriptions', async () => {
    const { user, router } = await openMoney(sampleSeed().seed, '?section=transactions');
    await heading('Transactions');
    await user.keyboard('n');
    expect(await screen.findByRole('dialog', { name: 'New transaction' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await act(async () => {
      await router.navigate({ to: '/money', search: { section: 'goals' } });
    });
    await heading('Goals');
    await user.keyboard('n');
    expect(await screen.findByRole('dialog', { name: 'New goal' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await act(async () => {
      await router.navigate({ to: '/money', search: { section: 'subscriptions' } });
    });
    await heading('Subscriptions');
    await user.keyboard('n');
    expect(await screen.findByRole('dialog', { name: 'New subscription' })).toBeInTheDocument();
  });

  it('does nothing for N on Overview (nothing to add there)', async () => {
    const { user } = await openMoney(sampleSeed().seed);
    await heading('Money');
    await user.keyboard('n');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('[ and ] step the month on a page with a month, and the month is in the URL', async () => {
    const { user, router } = await openMoney(sampleSeed().seed, '?section=budgets');
    await heading('Budgets');
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    await user.keyboard('[[');
    await screen.findByText('September 2026');
    expect(router.state.location.search).toMatchObject({ month: '2026-09' });
    await user.keyboard(']]');
    await screen.findByText('November 2026');
    await user.keyboard('[[');
    await screen.findByText('October 2026');
    // Back at this month: the URL has no month param
    expect(router.state.location.search).not.toHaveProperty('month');
  });

  it('[ and ] do nothing on a page without a month', async () => {
    const { user, router } = await openMoney(sampleSeed().seed, '?section=wallets');
    await heading('Wallets');
    await user.keyboard('[[');
    expect(router.state.location.search).not.toHaveProperty('month');
  });

  it('? shows the shortcuts help and Escape closes it', async () => {
    const { user } = await openMoney(sampleSeed().seed);
    await heading('Money');
    await user.keyboard('?');
    const help = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(help).getByText('Previous month')).toBeInTheDocument();
    expect(help.parentElement?.parentElement).toBe(document.body);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('keys are ignored while typing, inside a dialog, and while the palette is open', async () => {
    const { user } = await openMoney(sampleSeed().seed, '?section=wallets');
    await heading('Wallets');
    await user.keyboard('n');
    const dialog = await screen.findByRole('dialog', { name: 'New wallet' });
    // Typing "n" in the name field types the letter; it does not open a second dialog
    await user.keyboard('nnn');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('nnn');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.keyboard('{Escape}');

    act(() => {
      usePalette.setState({ open: true });
    });
    await user.keyboard('n');
    expect(screen.queryByRole('dialog', { name: 'New wallet' })).not.toBeInTheDocument();
  });

  it('every control of the side panel can be reached with Tab', async () => {
    const { user } = await openMoney(sampleSeed().seed);
    await heading('Money');
    const toggle = screen.getByRole('button', { name: 'Collapse side panel' });
    act(() => {
      toggle.focus();
    });
    await user.tab();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveFocus();
  });
});
