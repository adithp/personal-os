import type * as TauriWindow from '@tauri-apps/api/window';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../store/settings-store';
import { signedInAuth } from '../../test/fake-auth';
import { renderApp } from '../../test/render-app';
import { ActivityCard } from './activity-card';
import { UpcomingCard, type UpcomingEvent } from './upcoming-card';

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
  vi.unstubAllGlobals();
});

function nth<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`No item at index ${String(index)}`);
  return item;
}

describe('MiniCalendar (rendered inside the dashboard)', () => {
  async function openDashboardAt(iso: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
    const router = await renderApp('/', signedInAuth().auth);
    const calendar = screen.getByRole('grid');
    return { router, calendar, user: userEvent.setup() };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the month name with previous and next arrows', async () => {
    await openDashboardAt('2025-10-07T06:00:00Z');
    expect(screen.getByRole('heading', { name: 'October 2025' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });

  it('starts the week on Monday', async () => {
    const { calendar } = await openDashboardAt('2025-10-07T06:00:00Z');
    const headers = within(calendar)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('puts the 1st of October 2025 (a Wednesday) in the third column', async () => {
    const { calendar } = await openDashboardAt('2025-10-07T06:00:00Z');
    // Empty cells are hidden from screen readers, so read them from the DOM directly.
    const cells = Array.from(calendar.querySelectorAll('[role="gridcell"]'));
    expect(nth(cells, 0)).toHaveAttribute('aria-hidden', 'true');
    expect(nth(cells, 1)).toHaveAttribute('aria-hidden', 'true');
    expect(nth(cells, 2)).toHaveTextContent('1');
    expect(nth(cells, 2)).not.toHaveAttribute('aria-hidden');
  });

  it('shows every day of the month', async () => {
    const { calendar } = await openDashboardAt('2025-10-07T06:00:00Z');
    expect(within(calendar).getAllByRole('button')).toHaveLength(31);
  });

  it('highlights today in the lavender accent, and only today', async () => {
    const { calendar } = await openDashboardAt('2025-10-07T06:00:00Z');
    const today = within(calendar).getByRole('button', { name: /^7 October 2025/ });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(today).toHaveClass('bg-accent', 'text-on-tile');
    expect(
      within(calendar)
        .getAllByRole('button')
        .filter((b) => b.hasAttribute('aria-current')),
    ).toHaveLength(1);
    expect(within(calendar).getByRole('button', { name: /^8 October 2025/ })).not.toHaveClass(
      'bg-accent',
    );
  });

  it('uses the India date for today, even when UTC is still the day before', async () => {
    const { calendar } = await openDashboardAt('2025-10-06T23:30:00Z');
    expect(within(calendar).getByRole('button', { name: /^7 October 2025/ })).toHaveAttribute(
      'aria-current',
      'date',
    );
  });

  it('shows a small orange dot under days with events, and says so to screen readers', async () => {
    const { calendar } = await openDashboardAt('2025-10-07T06:00:00Z');
    // Placeholder events: today, +1, +3, +6, +10, +17, +24 days → 7, 8, 10, 13, 17, 24, 31 October
    const withDots = within(calendar)
      .getAllByRole('button')
      .filter((button) => button.querySelector('[data-testid="event-dot"]'));
    expect(withDots.map((b) => b.textContent)).toEqual(['7', '8', '10', '13', '17', '24', '31']);
    for (const button of withDots) {
      expect(button).toHaveAccessibleName(/, has events$/);
      expect(button.querySelector('[data-testid="event-dot"]')).toHaveClass(
        'bg-module-calendar',
        'size-1',
      );
    }
    expect(within(calendar).getByRole('button', { name: /^9 October 2025$/ })).toBeInTheDocument();
  });

  it('moves to the next and previous month and back across the year', async () => {
    const { user } = await openDashboardAt('2025-12-10T06:00:00Z');
    expect(screen.getByRole('heading', { name: 'December 2025' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'January 2026' })).toBeInTheDocument();
    // January 2026 starts on a Thursday: 3 empty cells, then day 1
    const cells = Array.from(screen.getByRole('grid').querySelectorAll('[role="gridcell"]'));
    expect(nth(cells, 2)).toHaveAttribute('aria-hidden', 'true');
    expect(nth(cells, 3)).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'November 2025' })).toBeInTheDocument();
  });

  it('shows no "today" highlight in another month', async () => {
    const { user, calendar } = await openDashboardAt('2025-10-07T06:00:00Z');
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(
      within(screen.getByRole('grid'))
        .queryAllByRole('button')
        .filter((b) => b.hasAttribute('aria-current')),
    ).toHaveLength(0);
    expect(calendar).toBeInTheDocument();
  });

  it('has 28, 29, 30 or 31 days in the month shown', async () => {
    const { user } = await openDashboardAt('2025-01-15T06:00:00Z');
    await user.click(screen.getByRole('button', { name: 'Next month' })); // February 2025
    expect(within(screen.getByRole('grid')).getAllByRole('button')).toHaveLength(28);
  });

  it('opens the Calendar page when a day is clicked', async () => {
    const { user, router, calendar } = await openDashboardAt('2025-10-07T06:00:00Z');
    await user.click(within(calendar).getByRole('button', { name: /^15 October 2025/ }));
    expect(router.state.location.pathname).toBe('/calendar');
    expect(
      within(screen.getByRole('main')).getByRole('heading', { name: 'Calendar' }),
    ).toBeInTheDocument();
  });
});

describe('UpcomingCard', () => {
  const EVENTS: UpcomingEvent[] = [
    { day: 'today', time: '3:00 PM', title: 'Client call', module: 'calendar', minutesUntil: 45 },
    { day: 'today', time: '5:00 PM', title: 'Submit assignment', module: 'tasks' },
    { day: 'tomorrow', time: '10:00 AM', title: 'Project review', module: 'projects' },
    { day: 'tomorrow', time: '4:30 PM', title: 'Gym session', module: 'habits' },
    { day: 'tomorrow', time: '6:00 PM', title: 'Fifth event', module: 'calendar' },
  ];

  it('groups events under Today and Tomorrow', () => {
    render(<UpcomingCard events={EVENTS} />);
    const today = screen.getByRole('region', { name: 'Today' });
    const tomorrow = screen.getByRole('region', { name: 'Tomorrow' });
    expect(within(today).getAllByRole('listitem')).toHaveLength(2);
    expect(within(tomorrow).getAllByRole('listitem')).toHaveLength(2);
    expect(within(today).getByText('Client call')).toBeInTheDocument();
    expect(within(tomorrow).getByText('Project review')).toBeInTheDocument();
  });

  it('shows at most 4 events', () => {
    render(<UpcomingCard events={EVENTS} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText('Fifth event')).not.toBeInTheDocument();
  });

  it('shows the title and time of each event, and "in 45 min" only on the next one', () => {
    render(<UpcomingCard events={EVENTS} />);
    expect(screen.getByText('3:00 PM')).toHaveTextContent('3:00 PM · in 45 min');
    expect(screen.getByText('5:00 PM')).not.toHaveTextContent('in ');
    expect(screen.getAllByText(/in \d+ min/)).toHaveLength(1);
  });

  it("draws a thin bar in each event's module color", () => {
    render(<UpcomingCard events={EVENTS} />);
    const bars = screen.getAllByTestId('event-bar');
    expect(bars.map((bar) => bar.getAttribute('data-module'))).toEqual([
      'calendar',
      'tasks',
      'projects',
      'habits',
    ]);
    for (const bar of bars) {
      expect(bar).toHaveClass('w-[3px]');
      expect(bar).toHaveStyle({
        backgroundColor: `var(--module-${bar.getAttribute('data-module') ?? ''})`,
      });
    }
  });

  it('hides a group that has no events', () => {
    render(<UpcomingCard events={EVENTS.filter((e) => e.day === 'today')} />);
    expect(screen.queryByRole('region', { name: 'Tomorrow' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Today' })).toBeInTheDocument();
  });

  it('says so when nothing is coming up', () => {
    render(<UpcomingCard events={[]} />);
    expect(screen.getByText('Nothing coming up.')).toBeInTheDocument();
  });

  it('is a glass card with a title', () => {
    const { container } = render(<UpcomingCard events={EVENTS} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Upcoming' })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('glass');
  });
});

describe('ActivityCard', () => {
  const ITEMS = [
    { module: 'mail', title: 'One', description: 'a' },
    { module: 'tasks', title: 'Two', description: 'b' },
    { module: 'money', title: 'Three', description: 'c' },
    { module: 'notes', title: 'Four', description: 'd' },
  ] as const;

  it('shows only 3 items', () => {
    render(<ActivityCard items={ITEMS} />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.queryByText('Four')).not.toBeInTheDocument();
  });

  it('has a "View all" link that only says "Coming in a later step"', async () => {
    const user = userEvent.setup();
    const { container } = render(<ActivityCard items={ITEMS} />);
    expect(container.firstElementChild).toHaveClass('glass');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View all' }));
    expect(screen.getByRole('status')).toHaveTextContent('Coming in a later step');
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });
});
