import type * as TauriWindow from '@tauri-apps/api/window';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeTask } from '../../../test/fake-api';
import { useTasksUi } from '../tasks-ui-store';
import { openMyTasks, resetEverything, restoreEverything } from './test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

// The Board feature is switched on, and its view is a marker that lists the titles it is given
vi.mock('../features', () => ({
  TASK_FEATURES: { board: true, inbox: false, reporting: false, goals: false, favorites: false },
}));
vi.mock('../board/board-view', () => ({
  BoardView: ({ tasks }: { tasks: { title: string }[] }) => (
    <div data-testid="board">{tasks.map((task) => task.title).join(',')}</div>
  ),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

describe('Board once the feature is on', () => {
  it('enables Board and shows the board view with the filtered tasks', async () => {
    const { user } = await openMyTasks(
      createFakeApi([makeTask({ title: 'One' }), makeTask({ title: 'Two' })]),
    );
    await screen.findByText('One');
    await user.click(screen.getByRole('radio', { name: 'Board' }));
    expect(useTasksUi.getState().view).toBe('board');
    expect(screen.getByTestId('board')).toHaveTextContent('One,Two');
    expect(screen.queryByRole('region', { name: 'No date' })).not.toBeInTheDocument();
  });
});
