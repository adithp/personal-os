import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePalette } from '../store/palette-store';
import { useRecentItems } from '../store/recent-items-store';
import { useSettings } from '../store/settings-store';
import { createFakeApi, makeTag, makeTask } from '../test/fake-api';
import { signedInAuth } from '../test/fake-auth';
import { renderApp } from '../test/render-app';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  useRecentItems.setState({ items: [] });
  usePalette.setState({ open: false, query: '' });
  vi.stubGlobal(
    'matchMedia',
    // Only the dark-mode query is answered (the theme code asks for it); everything else is off
    vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

const ctrlK = '{Control>}k{/Control}';
const palette = () => screen.getByRole('dialog', { name: 'Command palette' });
const input = () => within(palette()).getByPlaceholderText('Search or type a command…');
const options = () =>
  within(palette())
    .queryAllByRole('option')
    .map((option) => option.textContent);
const selected = () => within(palette()).getByRole('option', { selected: true }).textContent;
const getRow = (text: string) => {
  const row = within(palette())
    .queryAllByRole('option')
    .find((option) => option.textContent.includes(text));
  if (!row) throw new Error(`No result row with "${text}"`);
  return row;
};
const queryRow = (text: string) =>
  within(palette())
    .queryAllByRole('option')
    .find((option) => option.textContent.includes(text)) ?? null;
const findRow = (text: string) => waitFor(() => getRow(text));
const searchCalls = (fake: ReturnType<typeof createFakeApi>) =>
  fake.calls.filter((call) => call.path === '/search');

async function openPalette(fake = createFakeApi()) {
  const { auth } = signedInAuth();
  const router = await renderApp('/', auth, fake.api);
  const user = userEvent.setup();
  await user.keyboard(ctrlK);
  return { fake, router, user };
}

describe('searching data from the palette', () => {
  it('lists matching tasks and tags under the commands, with the typed words marked', async () => {
    const { user } = await openPalette(
      createFakeApi([makeTask({ title: 'Pay rent to Mr. Nair' })], [makeTag({ name: 'paper' })]),
    );
    await user.type(input(), 'pa re');
    // Tag results need one word; the task matches both words
    expect(await within(palette()).findByText('Tasks')).toBeInTheDocument();
    const row = getRow('Pay rent');
    expect([...row.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Pa', 're']);

    await user.clear(input());
    await user.type(input(), 'pap');
    expect(await within(palette()).findByText('Tags')).toBeInTheDocument();
    expect(getRow('paper')).toBeInTheDocument();
  });

  it('opens a task with the arrow keys and Enter, and shows it as Recent next time', async () => {
    const task = makeTask({ title: 'Pay rent' });
    const { user, router } = await openPalette(createFakeApi([task]));
    await user.type(input(), 'pay');
    await findRow('Pay rent');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tasks/my-tasks');
    });
    expect(router.state.location.search).toMatchObject({ task: task.id });
    expect(router.state.location.search).not.toHaveProperty('archived');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
    });

    await user.keyboard(ctrlK);
    expect(within(palette()).getByText('Recent')).toBeInTheDocument();
    expect(options()[0]).toContain('Pay rent');
    expect(options()[1]).toContain('Open Dashboard');
  });

  it('opens an archived task with the archived list on', async () => {
    const task = makeTask({ title: 'Old report', archivedAt: '2025-10-02T00:00:00.000Z' });
    const { user, router } = await openPalette(createFakeApi([task]));
    await user.type(input(), 'old');
    await findRow('Old report');
    expect(within(palette()).getByText('Archived')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ task: task.id, archived: true });
    });
  });

  it('opens a tag filter with Enter on a tag', async () => {
    const tag = makeTag({ name: 'zebra' });
    const { user, router } = await openPalette(
      createFakeApi([makeTask({ title: 'Zebra feeding' })], [tag]),
    );
    await user.type(input(), 'zeb');
    await findRow('zebra');
    await user.keyboard('{ArrowDown}{Enter}'); // the task is first, the tag second
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ tag: [tag.id] });
    });
  });

  it('keeps the selection where it is when results arrive', async () => {
    const fake = createFakeApi([makeTask({ title: 'Tasks review' })]);
    const { user } = await openPalette(fake);
    fake.slow(250);
    await user.type(input(), 'tasks');
    expect(selected()).toContain('Open Tasks');
    expect(options()).toHaveLength(1);

    await findRow('Tasks review');
    expect(selected()).toContain('Open Tasks');
    expect(options()).toHaveLength(2);
  });

  it('dims older results while new ones load', async () => {
    const fake = createFakeApi([makeTask({ title: 'Pay rent' }), makeTask({ title: 'Pay tax' })]);
    const { user } = await openPalette(fake);
    await user.type(input(), 'pay');
    await findRow('Pay tax');
    expect(getRow('Pay tax').closest('.opacity-60')).toBeNull();

    fake.slow(400);
    await user.type(input(), ' t');
    await waitFor(() => {
      expect(getRow('Pay rent').closest('.opacity-60')).not.toBeNull();
    });
    await waitFor(() => {
      expect(queryRow('Pay rent')).not.toBeInTheDocument();
    });
  });

  it('does not open older results while newer ones load, and marks them with their own query', async () => {
    const fake = createFakeApi([makeTask({ title: 'Pay rent' })]);
    const { user, router } = await openPalette(fake);
    await user.type(input(), 'pay');
    await findRow('Pay rent');
    expect(within(palette()).getByRole('listbox')).toHaveAttribute('aria-busy', 'false');

    fake.slow(400);
    await user.type(input(), 'x');
    const list = within(palette()).getByRole('listbox');
    expect(list).toHaveAttribute('aria-busy', 'true');
    // The old row is still shown, marked for "pay", not for "payx", and cannot be chosen
    const row = getRow('Pay rent');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect([...row.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Pay']);

    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(useRecentItems.getState().items).toEqual([]);
  });

  it('does not ask the server for one character, but still filters commands', async () => {
    const fake = createFakeApi([makeTask({ title: 'Pay rent' })]);
    const { user } = await openPalette(fake);
    await user.type(input(), 'p');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(searchCalls(fake)).toHaveLength(0);
    expect(options().some((text) => text.includes('Open Projects'))).toBe(true);
  });

  it('asks the server once after typing stops', async () => {
    const fake = createFakeApi([makeTask({ title: 'Pay rent' })]);
    const { user } = await openPalette(fake);
    await user.type(input(), 'pay re');
    await findRow('Pay rent');
    expect(searchCalls(fake)).toHaveLength(1);
    expect(searchCalls(fake)[0]?.body).toEqual({ q: 'pay re' });
  });

  it('says Searching… when the answer is slow, and Nothing found when there is none', async () => {
    const fake = createFakeApi([]);
    const { user } = await openPalette(fake);
    fake.slow(700);
    await user.type(input(), 'qqzz');
    expect(await within(palette()).findByText('Searching…')).toBeInTheDocument();
    expect(await within(palette()).findByText(/Nothing found for/)).toBeInTheDocument();
    expect(within(palette()).queryByText('Searching…')).not.toBeInTheDocument();
    expect(
      within(palette()).getByText('Search finds tasks, notes and tags by the start of their words.'),
    ).toBeInTheDocument();
  });

  it('announces the number of results in a status region', async () => {
    const { user } = await openPalette(createFakeApi([makeTask({ title: 'Pay rent' })]));
    await user.type(input(), 'pay');
    await waitFor(() => {
      expect(within(palette()).getByRole('status')).toHaveTextContent('1 result');
    });
    await user.type(input(), 'zzz');
    await waitFor(() => {
      expect(within(palette()).getByRole('status')).toHaveTextContent('No results');
    });
  });

  it('keeps the commands when search fails, and says why', async () => {
    const fake = createFakeApi([makeTask({ title: 'Tasks review' })]);
    const { user } = await openPalette(fake);
    fake.failNext(500, 'internal', 'boom', '/search');
    await user.type(input(), 'tasks');
    await waitFor(() => {
      expect(within(palette()).getAllByText('Search is not available right now.')).not.toHaveLength(
        0,
      );
    });
    expect(within(palette()).getByRole('option', { name: /Open Tasks/ })).toBeInTheDocument();
  });

  it('opens a task that has been deleted since without breaking the page', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    useRecentItems.setState({ items: [{ type: 'task', id, title: 'Gone task' }] });
    const { user, router } = await openPalette();
    await user.keyboard('{Enter}'); // the recent item is the first row
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ task: id });
    });
    expect(await screen.findByRole('heading', { name: 'My tasks' })).toBeInTheDocument();
    // The panel asks for the task, gets 404 and closes itself; the list stays usable
    await waitFor(() => {
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'My tasks' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the migration message when the database is behind', async () => {
    const fake = createFakeApi();
    const { user } = await openPalette(fake);
    fake.failNext(503, 'schema_behind', 'Database update needed: run pnpm db:migrate', '/search');
    await user.type(input(), 'tasks');
    await waitFor(() => {
      expect(
        within(palette()).getAllByText('Database update needed: run pnpm db:migrate'),
      ).not.toHaveLength(0);
    });
    expect(within(palette()).getByRole('option', { name: /Open Tasks/ })).toBeInTheDocument();
  });

  it('shows at most five recent items when the field is empty', async () => {
    useRecentItems.setState({
      items: Array.from({ length: 5 }, (_, n) => ({
        type: 'task' as const,
        id: `id-${String(n)}`,
        title: `Recent task ${String(n)}`,
      })),
    });
    await openPalette();
    expect(options().filter((text) => text.startsWith('Recent task'))).toHaveLength(5);
  });

  it.each(['dark', 'light'] as const)('has no hard-coded colors in %s mode', async (theme) => {
    useSettings.getState().update({ theme });
    const { user } = await openPalette(
      createFakeApi([makeTask({ title: 'Zebra feeding' })], [makeTag({ name: 'zebra' })]),
    );
    await user.type(input(), 'zeb');
    await findRow('zebra');
    expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-f]{6}\b/i);
    expect(document.documentElement.dataset.theme).toBe(theme);
  });
});
