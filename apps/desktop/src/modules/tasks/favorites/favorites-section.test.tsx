import type { Favorite, Task } from '@personal-os/shared';
import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../../store/settings-store';
import { createFakeApi, makeFavorite, makeTask } from '../../../test/fake-api';
import { openMyTasks, resetEverything, restoreEverything } from '../my-tasks/test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

// Tuesday 7 October 2025, 15:00 in India
const LATE = '2025-10-05T06:00:00.000Z';
const TODAY = '2025-10-07T12:00:00.000Z';

async function openOverview(favorites: Favorite[], tasks: Task[] = []) {
  const ctx = await openMyTasks(createFakeApi(tasks, [], favorites), '/tasks');
  return ctx;
}

const section = () => screen.findByRole('region', { name: 'Favorites' });
const tile = async (name: string) =>
  within(await section()).findByRole('link', { name: new RegExp(`^${name}`) });

describe('Favorites on Overview errors', () => {
  it('shows the server message with Try again when the task counts cannot load', async () => {
    const fake = createFakeApi(
      [makeTask({ priority: 1 })],
      [],
      [makeFavorite({ name: 'Urgent', view: { priority: [1] } })],
    );
    fake.failNext(500, 'server_error', 'Tasks are down', true);
    const { user } = await openMyTasks(fake, '/tasks');
    const region = await section();
    expect(await within(region).findByText('Tasks are down')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(within(region).queryByText('Tasks are down')).not.toBeInTheDocument();
    });
    expect(await tile('Urgent')).toHaveTextContent('1open');
  });
});

describe('Favorites on Overview', () => {
  it('is hidden when there are no favorites', async () => {
    await openOverview([]);
    await screen.findByRole('region', { name: 'Tasks due soon' });
    expect(screen.queryByRole('region', { name: 'Favorites' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Favorites' })).not.toBeInTheDocument();
  });

  it('shows a tile per favorite with the open tasks of its view and the overdue line', async () => {
    await openOverview(
      [
        makeFavorite({ name: 'Urgent', view: { priority: [1] } }),
        makeFavorite({ name: 'Calm', view: { priority: [3] } }),
      ],
      [
        makeTask({ priority: 1, dueAt: LATE }),
        makeTask({ priority: 1, dueAt: LATE }),
        makeTask({ priority: 1, dueAt: TODAY }),
        makeTask({ priority: 1, dueAt: LATE, status: 'done', completedAt: LATE }),
        makeTask({ priority: 1, dueAt: LATE, archivedAt: LATE }),
        makeTask({ priority: 3 }),
        makeTask({ priority: 2, dueAt: LATE }),
      ],
    );
    expect(
      await within(await section()).findByRole('heading', { name: 'Favorites' }),
    ).toBeVisible();
    const urgent = await tile('Urgent');
    await waitFor(() => {
      expect(urgent).toHaveTextContent('3open2 overdue');
    });
    expect(await tile('Calm')).toHaveTextContent('1openNothing overdue');
  });

  it('leaves out subtasks', async () => {
    const parent = makeTask({ priority: 1 });
    await openOverview(
      [makeFavorite({ name: 'Urgent', view: { priority: [1] } })],
      [parent, makeTask({ priority: 1, parentTaskId: parent.id })],
    );
    await waitFor(async () => {
      expect(await tile('Urgent')).toHaveTextContent('1open');
    });
  });

  it('shows at most 6 tiles, in the order of the side panel', async () => {
    const favorites = Array.from({ length: 8 }, (_, i) =>
      makeFavorite({
        name: `Fav ${String(i + 1)}`,
        position: (i + 1) * 1024,
        view: { sort: 'due' },
      }),
    );
    favorites.forEach((favorite, i) => {
      favorite.view = {
        priority: [1],
        tagIds: [`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`],
      };
    });
    await openOverview(favorites);
    const tiles = within(await section()).getAllByRole('link');
    expect(tiles).toHaveLength(6);
    tiles.forEach((el, i) => {
      expect(el).toHaveTextContent(`Fav ${String(i + 1)}`);
    });
    // The side panel lists all of them
    expect(
      within(screen.getByRole('complementary', { name: 'Tasks navigation' })).getAllByRole('link', {
        name: /^Fav /,
      }),
    ).toHaveLength(8);
  });

  it('opens the saved view when a tile is clicked or Enter is pressed on it', async () => {
    const { router, user } = await openOverview([
      makeFavorite({ name: 'Urgent', view: { priority: [1] } }),
      makeFavorite({ name: 'Soon', view: { due: 'week', sort: 'title' } }),
    ]);
    await user.click(await tile('Urgent'));
    expect(router.state.location.pathname).toBe('/tasks/my-tasks');
    expect(router.state.location.search).toEqual({ priority: [1], group: 'due', sort: 'manual' });

    await router.navigate({ to: '/tasks' });
    (await tile('Soon')).focus();
    await user.keyboard('{Enter}');
    expect(router.state.location.search).toEqual({ due: 'week', sort: 'title', group: 'due' });
  });

  it.each(['dark', 'light'] as const)(
    'draws without hard-coded colors in %s mode',
    async (theme) => {
      useSettings.getState().update({ theme });
      await openOverview([makeFavorite({ name: 'Urgent', color: '#F7D96B' })]);
      await tile('Urgent');
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
    },
  );
});
