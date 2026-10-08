import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeTask } from '../../../test/fake-api';
import { useTasksUi } from '../tasks-ui-store';
import { openMyTasks, resetEverything, restoreEverything } from '../my-tasks/test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

const HINT = 'Sort is not Manual, so reordering is off.';
const handles = () => screen.queryAllByRole('button', { name: /^Drag / });

describe('Board inside My tasks', () => {
  it('shows the "Sort is not Manual" hint once', async () => {
    useTasksUi.setState({ view: 'board', sort: 'title' });
    await openMyTasks(createFakeApi([makeTask({ title: 'One' })]));
    await screen.findByText('One');
    expect(screen.getAllByText(HINT)).toHaveLength(1);
  });

  it('has only one Tab stop among the drag handles', async () => {
    useTasksUi.setState({ view: 'board' });
    await openMyTasks(
      createFakeApi([
        makeTask({ title: 'One' }),
        makeTask({ title: 'Two', status: 'doing' }),
        makeTask({ title: 'Three' }),
      ]),
    );
    await screen.findByText('One');
    expect(handles()).toHaveLength(3);
    expect(handles().filter((handle) => handle.tabIndex === 0)).toHaveLength(1);
  });

  it('leaves the keys of a focused handle to dragging (Delete does not delete the task)', async () => {
    useTasksUi.setState({ view: 'board' });
    const { user, fake } = await openMyTasks(createFakeApi([makeTask({ title: 'Keep me' })]));
    await screen.findByText('Keep me');
    const handle = screen.getByRole('button', { name: 'Drag Keep me' });
    handle.focus();
    await user.keyboard('{Delete}');
    expect(fake.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
    expect(screen.getByText('Keep me')).toBeInTheDocument();
  });

  it('cannot drag cards of the Archived view', async () => {
    useTasksUi.setState({ view: 'board' });
    await openMyTasks(
      createFakeApi([makeTask({ title: 'Shelved', archivedAt: '2025-10-01T00:00:00.000Z' })]),
      '/tasks/my-tasks?archived=true',
    );
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'To do' })).getByText('Shelved'),
      ).toBeVisible();
    });
    expect(handles()).toHaveLength(0);
  });
});
