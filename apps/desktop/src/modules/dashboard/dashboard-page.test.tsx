import { MODULES } from '@personal-os/shared';
import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../store/settings-store';
import { signedInAuth } from '../../test/fake-auth';
import { renderApp } from '../../test/render-app';
import { DASHBOARD_DATA, moneyTileText, tasksProgressPercent } from './dashboard-data';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openDashboard() {
  const router = await renderApp('/', signedInAuth().auth);
  return { router, user: userEvent.setup() };
}

const tile = (name: string) => screen.getByRole('region', { name });

describe('Dashboard layout', () => {
  it('is the home screen with the Dashboard dock icon active', async () => {
    await openDashboard();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByText(/Coming in step/)).not.toBeInTheDocument();
  });

  it('shows the greeting and date on the left, and the search bar with Ctrl K on the right', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2025-10-07T06:00:00Z')); // 11:30 in India
    await openDashboard();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning');
    expect(screen.getByText('Tuesday, 7 October')).toBeInTheDocument();

    const search = screen.getByRole('button', { name: 'Search' });
    expect(within(search).getByLabelText('Ctrl K')).toBeInTheDocument();
    expect(search).toHaveClass('glass');
  });

  it('has the assistant card with the summary, the input, and a lavender send button', async () => {
    await openDashboard();
    expect(screen.getByText(DASHBOARD_DATA.summary)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ask or tell me what to do' })).toHaveAttribute(
      'placeholder',
      'Ask or tell me what to do',
    );
    expect(screen.getByRole('button', { name: 'Send' })).toHaveClass('bg-accent');
  });

  it('shows the five tiles: two wide, then three small', async () => {
    await openDashboard();
    const tiles = screen.getAllByRole('region').filter((el) => el.tagName === 'SECTION');
    const titles = tiles
      .map((el) => el.getAttribute('aria-label'))
      .filter((title) => title !== null && title !== 'Today' && title !== 'Tomorrow');
    expect(titles).toEqual(["Today's tasks", 'Important emails', 'Money', 'Streak', 'Projects']);
    expect(tile("Today's tasks").parentElement).toHaveClass('grid-cols-2');
    expect(tile('Money').parentElement).toHaveClass('grid-cols-3');
  });

  it('uses compact tiles so the whole left column fits a short window', async () => {
    await openDashboard();
    for (const title of ["Today's tasks", 'Important emails', 'Money', 'Streak', 'Projects']) {
      expect(tile(title)).toHaveClass('p-3', 'gap-2');
    }
  });

  it('no longer has the Next event tile', async () => {
    await openDashboard();
    expect(screen.queryByRole('region', { name: 'Next event' })).not.toBeInTheDocument();
  });

  it('keeps the page area clear of the title bar (40 px) and the dock (80 px)', async () => {
    await openDashboard();
    expect(screen.getByRole('main')).toHaveClass('pb-20', 'pt-10');
  });
});

describe('Dashboard columns', () => {
  it('has a wide right column (280 px) with the calendar, upcoming, and activity cards in order', async () => {
    await openDashboard();
    const column = screen.getByTestId('right-column');
    expect(column).toHaveClass('w-[280px]');

    const headings = within(column)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(headings[0]).toMatch(/^[A-Z][a-z]+ \d{4}$/); // "October 2025"
    expect(headings.slice(1)).toEqual(['Upcoming', 'Activity']);
  });

  it('scrolls the main column and the right column independently', async () => {
    await openDashboard();
    for (const id of ['main-column', 'right-column']) {
      const column = screen.getByTestId(id);
      expect(column).toHaveClass('overflow-y-auto', 'min-h-0');
    }
    // The page fills the area exactly, so the columns (not the whole page) scroll
    expect(screen.getByTestId('main-column').parentElement).toHaveClass('h-full');
  });

  it('shows only 3 items in the activity card', async () => {
    await openDashboard();
    const column = screen.getByTestId('right-column');
    expect(within(column).getAllByRole('article')).toHaveLength(3);
    expect(DASHBOARD_DATA.activity.length).toBeGreaterThan(3);
  });
});

describe('Dashboard tiles use the module colors', () => {
  it.each([
    ["Today's tasks", 'tasks'],
    ['Important emails', 'mail'],
    ['Money', 'money'],
    ['Streak', 'habits'],
    ['Projects', 'projects'],
  ] as const)('%s is %s colored with dark text', async (title, module) => {
    await openDashboard();
    expect(tile(title)).toHaveStyle({ backgroundColor: `var(--module-${module})` });
    expect(tile(title)).toHaveClass('text-on-tile');
  });

  it('colors every activity avatar with its module color', async () => {
    await openDashboard();
    const column = screen.getByTestId('right-column');
    for (const item of DASHBOARD_DATA.activity.slice(0, 3)) {
      const row = within(column).getByRole('heading', { name: item.title }).closest('article');
      expect(row?.querySelector(`[data-module="${item.module}"]`)).toHaveStyle({
        backgroundColor: `var(--module-${item.module})`,
      });
    }
  });
});

describe('Dashboard content', () => {
  it("shows today's tasks with progress", async () => {
    await openDashboard();
    const el = tile("Today's tasks");
    expect(within(el).getByText('3')).toBeInTheDocument();
    expect(within(el).getByText('of 7 done')).toBeInTheDocument();
    expect(within(el).getByText(/Next: Submit DBMS assignment · 5:00 PM/)).toBeInTheDocument();
    expect(within(el).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '43');
    expect(tasksProgressPercent()).toBe(43);
  });

  it('shows the Important emails tile in Mail blue with the count and the top two subjects', async () => {
    await openDashboard();
    const el = tile('Important emails');
    expect(el).toHaveStyle({ backgroundColor: 'var(--module-mail)' });
    expect(MODULES.mail.color).toBe('#93D3F5');
    expect(within(el).getByText('3')).toBeInTheDocument();
    expect(within(el).getByText('need a reply')).toBeInTheDocument();
    expect(within(el).getByText('Website feedback – need your reply')).toBeInTheDocument();
    expect(within(el).getByText('Invoice #204 question')).toBeInTheDocument();
    // The mail icon (Tabler "mail") sits next to the number
    expect(el.querySelector('svg.tabler-icon-mail')).not.toBeNull();
  });

  it('formats money from integer paise in Indian rupees', async () => {
    await openDashboard();
    expect(DASHBOARD_DATA.money.spentPaise).toBe(1_245_000);
    expect(Number.isInteger(DASHBOARD_DATA.money.budgetPaise)).toBe(true);

    const el = tile('Money');
    expect(within(el).getByText('₹12,450')).toBeInTheDocument();
    expect(within(el).getByText('62% of ₹20,000 budget')).toBeInTheDocument();
    expect(within(el).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '62');
    expect(moneyTileText()).toEqual({
      spent: '₹12,450',
      percent: 62,
      line: '62% of ₹20,000 budget',
    });
  });

  it('shows the streak and the projects', async () => {
    await openDashboard();
    expect(within(tile('Streak')).getByText('12')).toBeInTheDocument();
    expect(within(tile('Streak')).getByText('Morning workout')).toBeInTheDocument();
    expect(within(tile('Projects')).getByText('4')).toBeInTheDocument();
    expect(within(tile('Projects')).getByText('Website redesign · 70%')).toBeInTheDocument();
    expect(within(tile('Projects')).getByText('Mobile app · 35%')).toBeInTheDocument();
  });

  it('formats the money in the activity card too', async () => {
    await openDashboard();
    expect(screen.getByText('₹450 · Food · UPI')).toBeInTheDocument();
  });
});

describe('Dashboard greeting follows India time', () => {
  it.each([
    ['2025-10-06T23:30:00Z', 'Good morning', 'Tuesday, 7 October'],
    ['2025-10-07T07:00:00Z', 'Good afternoon', 'Tuesday, 7 October'],
    ['2025-10-07T12:00:00Z', 'Good evening', 'Tuesday, 7 October'],
  ])('at %s: %s, %s', async (iso, greeting, date) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
    await openDashboard();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(greeting);
    expect(screen.getByText(date)).toBeInTheDocument();
  });
});

describe('Dashboard tile buttons open the module', () => {
  it.each([
    ["Today's tasks", 'Tasks', '/tasks'],
    ['Important emails', 'Mail', '/mail'],
    ['Money', 'Money', '/money'],
    ['Streak', 'Habits', '/habits'],
    ['Projects', 'Projects', '/projects'],
  ] as const)('%s → %s', async (title, moduleName, path) => {
    const { router, user } = await openDashboard();
    await user.click(within(tile(title)).getByRole('button', { name: `Open ${moduleName}` }));

    expect(router.state.location.pathname).toBe(path);
    expect(
      within(screen.getByRole('main')).getByRole('heading', { name: moduleName }),
    ).toBeInTheDocument();
    expect(MODULES[path.slice(1) as keyof typeof MODULES].name).toBe(moduleName);
  });
});

describe('Assistant card (assistant arrives in step 3)', () => {
  it('keeps Send disabled until something is typed', async () => {
    const { user } = await openDashboard();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Ask or tell me what to do' }), 'hi');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('says honestly that the assistant is not ready yet', async () => {
    const { user } = await openDashboard();
    await user.type(
      screen.getByRole('textbox', { name: 'Ask or tell me what to do' }),
      'plan my day{Enter}',
    );
    expect(screen.getByRole('status')).toHaveTextContent('The assistant arrives in step 3.');
  });

  it('ignores a blank message', async () => {
    const { user } = await openDashboard();
    await user.type(
      screen.getByRole('textbox', { name: 'Ask or tell me what to do' }),
      '   {Enter}',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Quick actions row', () => {
  const section = () => screen.getByRole('region', { name: 'Quick actions' });

  it('is titled "Quick actions" in 13 px type, under the tiles', async () => {
    await openDashboard();
    const heading = within(section()).getByRole('heading', { name: 'Quick actions' });
    expect(heading).toHaveClass('text-card'); // 13 px
    const projects = tile('Projects');
    expect(
      projects.parentElement?.compareDocumentPosition(section()) ??
        0 & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('has four glass buttons in one row, in order', async () => {
    await openDashboard();
    const buttons = within(section()).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'New task',
      'New note',
      'Log expense',
      'New event',
    ]);
    for (const button of buttons) expect(button).toHaveClass('glass');
    expect(buttons[0]?.parentElement).toHaveClass('grid-cols-4');
  });

  it.each([
    ['New task', 'tasks'],
    ['New note', 'notes'],
    ['Log expense', 'money'],
    ['New event', 'calendar'],
  ] as const)(
    '%s has a 22 px rounded %s-colored icon square with a dark icon',
    async (label, module) => {
      await openDashboard();
      const square = within(screen.getByRole('button', { name: label })).getByText('', {
        selector: `[data-module="${module}"]`,
      });
      expect(square).toHaveClass('size-[22px]', 'text-on-tile');
      expect(square).toHaveStyle({ backgroundColor: `var(--module-${module})` });
      expect(square.querySelector('svg')).not.toBeNull();
    },
  );

  it.each([
    ['New task', 'Tasks arrive in step 2'],
    ['New note', 'Notes arrive in step 2'],
    ['Log expense', 'Money arrives in step 6'],
    ['New event', 'Calendar arrives in step 4'],
  ])('clicking %s says "%s"', async (label, note) => {
    const { user } = await openDashboard();
    await user.click(screen.getByRole('button', { name: label }));
    expect(within(section()).getByRole('status')).toHaveTextContent(note);
  });

  it('matches the roadmap steps and replaces the note on the next click', async () => {
    const { user } = await openDashboard();
    expect(MODULES.tasks.roadmapStep).toBe(2);
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await user.click(screen.getByRole('button', { name: 'New event' }));
    expect(within(section()).getAllByRole('status')).toHaveLength(1);
    expect(within(section()).getByRole('status')).toHaveTextContent('Calendar arrives in step 4');
  });
});
