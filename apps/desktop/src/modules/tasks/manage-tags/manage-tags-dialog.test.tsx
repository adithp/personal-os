import { TAG_PALETTE } from '@personal-os/shared';
import { QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '../../../api/providers';
import { ManageTagsDialog } from './manage-tags-dialog';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useToasts } from '../../../store/toast-store';
import { createFakeApi, makeTag, makeTask, type FakeApi } from '../../../test/fake-api';
import { openMyTasks, resetEverything, restoreEverything, findToast } from '../my-tasks/test-utils';
import { openLoaded } from '../detail/test-utils';
import { useManageTags } from './manage-tags-store';

const ref = (tag: { id: string; name: string; color: string }) => ({
  id: tag.id,
  name: tag.name,
  color: tag.color,
});

const dialog = () => screen.getByRole('dialog', { name: 'Manage tags' });
const rowOf = (name: string) => {
  const row = document.querySelector<HTMLElement>(
    `[data-tag-row="${screen.getByRole('button', { name: `Delete ${name}` }).closest('li')?.dataset.tagRow ?? ''}"]`,
  );
  if (!row) throw new Error(`No row for ${name}`);
  return row;
};

beforeEach(() => {
  resetEverything();
  useManageTags.setState({ open: false });
});
afterEach(restoreEverything);

/** Just the dialog on a fresh cache, so the first load is visible. */
function renderDialogAlone(fake: FakeApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    useManageTags.getState().openManageTags();
  });
  render(
    <AppProviders api={fake.api} queryClient={queryClient}>
      <ManageTagsDialog />
    </AppProviders>,
  );
  return { user: userEvent.setup() };
}

async function openDialog(fake: FakeApi) {
  const opened = await openMyTasks(fake);
  act(() => {
    useManageTags.getState().openManageTags();
  });
  return opened;
}

/** home used by 2 tasks and a favorite-free; house by 1 task; unused by none. */
function setup() {
  const home = makeTag({ name: 'home', color: TAG_PALETTE[1] });
  const house = makeTag({ name: 'house', color: TAG_PALETTE[2] });
  const spare = makeTag({ name: 'spare', color: TAG_PALETTE[3] });
  const tasks = [
    makeTask({ title: 'A', tags: [ref(home)] }),
    makeTask({ title: 'B', tags: [ref(home)] }),
    makeTask({ title: 'C', tags: [ref(house)] }),
  ];
  const fake = createFakeApi(tasks, [spare, house, home]);
  return { home, house, spare, fake };
}

describe('Manage tags dialog', () => {
  it('lists tags A to Z with the count and singular, plural and not used text', async () => {
    const { fake } = setup();
    await openDialog(fake);
    const list = await screen.findByRole('list', { name: 'Tags' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('home2 tasks'),
      expect.stringContaining('house1 task'),
      expect.stringContaining('spareNot used'),
    ]);
    expect(within(dialog()).getByRole('heading', { name: 'Tags 3' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Find a tag' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Deleting a tag removes it from its tasks. The tasks stay.'),
    ).toBeVisible();
  });

  it('shows a search field only with more than 8 tags and filters by it', async () => {
    const tags = Array.from({ length: 9 }, (_, index) => makeTag({ name: `t${String(index)}` }));
    const { user } = await openDialog(createFakeApi([], tags));
    await user.type(await screen.findByRole('textbox', { name: 'Find a tag' }), 't3');
    expect(within(dialog()).getAllByRole('listitem')).toHaveLength(1);
    await user.clear(screen.getByRole('textbox', { name: 'Find a tag' }));
    await user.type(screen.getByRole('textbox', { name: 'Find a tag' }), 'zzz');
    expect(screen.getByText('No tags match.')).toBeInTheDocument();
  });

  it('shows three skeleton rows while loading', async () => {
    const { fake } = setup();
    fake.slow(100);
    renderDialogAlone(fake);
    const loading = screen.getByRole('status', { name: 'Loading tags' });
    expect(loading.children).toHaveLength(3);
    expect(await screen.findByRole('list', { name: 'Tags' })).toBeInTheDocument();
  });

  it('shows a message with Retry when the tags cannot load', async () => {
    const { fake } = setup();
    fake.failNext(500, 'server_error', 'Boom');
    const { user } = renderDialogAlone(fake);
    expect(await screen.findByText('Could not load tags. Try again')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('list', { name: 'Tags' })).toBeInTheDocument();
  });

  it('recolors from the dot with no toast', async () => {
    const { home, fake } = setup();
    const { user } = await openDialog(fake);
    await user.click(await screen.findByRole('button', { name: 'Color of home' }));
    const menu = screen.getByRole('menu', { name: 'Color of home' });
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(10);
    expect(within(menu).getByRole('menuitemradio', { name: 'Color 2' })).toBeChecked();
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Color 5' }));
    await waitFor(() => {
      expect(fake.tags().find((tag) => tag.id === home.id)?.color).toBe(TAG_PALETTE[4]);
    });
    expect(screen.queryByRole('menu', { name: 'Color of home' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Color of home' })).toHaveFocus();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it('renames a tag with Enter and cancels with Escape without closing the dialog', async () => {
    const { spare, fake } = setup();
    const { user } = await openDialog(fake);
    await user.click(await screen.findByRole('button', { name: 'Rename spare' }));
    await user.keyboard('{Escape}');
    expect(dialog()).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Rename spare' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rename spare' }));
    const box = screen.getByRole('textbox', { name: 'Rename spare' });
    await user.clear(box);
    await user.type(box, 'garden{Enter}');
    await waitFor(() => {
      expect(fake.tags().find((tag) => tag.id === spare.id)?.name).toBe('garden');
    });
    expect(await screen.findByRole('button', { name: 'Rename garden' })).toBeInTheDocument();
  });

  it('shows rule errors under the box and does not save', async () => {
    const { fake } = setup();
    const { user } = await openDialog(fake);
    await user.click(await screen.findByRole('button', { name: 'Rename spare' }));
    const box = screen.getByRole('textbox', { name: 'Rename spare' });
    await user.clear(box);
    await user.type(box, 'a b{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('no spaces or #');
    expect(box).toBeInvalid();
    await user.clear(box);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('required');
    expect(fake.calls.some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('asks to merge when the new name is another tag, ignoring capitals', async () => {
    const { house, home, fake } = setup();
    const { user } = await openDialog(fake);
    await user.click(await screen.findByRole('button', { name: 'Rename house' }));
    const box = screen.getByRole('textbox', { name: 'Rename house' });
    await user.clear(box);
    await user.type(box, 'HOME{Enter}');
    expect(
      screen.getByText("'home' already exists. Merge 'house' into it? 1 task will get 'home'."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fake.tags()).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Rename house' }));
    const again = screen.getByRole('textbox', { name: 'Rename house' });
    await user.clear(again);
    await user.type(again, 'home{Enter}');
    await user.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => {
      expect(fake.tags().map((tag) => tag.id)).not.toContain(house.id);
    });
    await findToast('Tags merged.');
    expect(
      fake
        .tasks()
        .find((task) => task.title === 'C')
        ?.tags.map((t) => t.id),
    ).toEqual([home.id]);
  });

  it('deletes an unused tag at once and Undo brings it back', async () => {
    const { fake } = setup();
    const { user } = await openDialog(fake);
    await user.click(await screen.findByRole('button', { name: 'Delete spare' }));
    await waitFor(() => {
      expect(fake.tags().map((tag) => tag.name)).not.toContain('spare');
    });
    const toast = await findToast('Tag deleted.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(fake.tags().map((tag) => tag.name)).toContain('spare');
    });
    expect(await screen.findByRole('button', { name: 'Delete spare' })).toBeInTheDocument();
  });

  it('asks before deleting a used tag, with focus on Cancel, then deletes and undoes', async () => {
    const { fake } = setup();
    const { user } = await openDialog(fake);
    await user.click(await screen.findByRole('button', { name: 'Delete home' }));
    expect(
      screen.getByText("Delete 'home'? It is removed from 2 tasks. The tasks stay."),
    ).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    expect(fake.calls.some((call) => call.method === 'DELETE')).toBe(false);

    await user.keyboard('{Escape}');
    expect(dialog()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete tag' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete home' }));
    await user.click(screen.getByRole('button', { name: 'Delete tag' }));
    await waitFor(() => {
      expect(fake.tags().map((tag) => tag.name)).not.toContain('home');
    });
    const toast = await findToast('Tag deleted.');
    expect(fake.tasks().find((task) => task.title === 'A')?.tags).toEqual([]);
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(fake.tags().map((tag) => tag.name)).toContain('home');
    });
    expect(fake.tasks().find((task) => task.title === 'A')?.tags).toHaveLength(1);
  });

  it('mentions favorites in the delete question', async () => {
    const home = makeTag({ name: 'home' });
    const fake = createFakeApi([], [home]);
    await fake.api.request('POST', '/task-favorites', {
      body: { name: 'Home', view: { tagIds: [home.id] } },
    });
    const { user } = await openDialog(fake);
    await user.click(await screen.findByRole('button', { name: 'Delete home' }));
    expect(screen.getByText("Delete 'home'? It is removed from 1 favorite.")).toBeInTheDocument();
  });

  it('closes with Escape, Done and the close button, and returns focus to the opener', async () => {
    const { fake } = setup();
    const { user } = await openMyTasks(fake);
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Manage tags…' }));
    expect(screen.queryByRole('menu', { name: 'Filter' })).not.toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: 'Manage tags' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter' })).toHaveFocus();

    act(() => {
      useManageTags.getState().openManageTags();
    });
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      useManageTags.getState().openManageTags();
    });
    await user.click(within(dialog()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves with the arrow keys, renames with F2 and starts delete with Delete', async () => {
    const { fake } = setup();
    const { user } = await openDialog(fake);
    await screen.findByRole('list', { name: 'Tags' });
    expect(dialog()).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(rowOf('home')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(rowOf('spare')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(rowOf('house')).toHaveFocus();

    await user.keyboard('{F2}');
    expect(screen.getByRole('textbox', { name: 'Rename house' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(rowOf('house')).toHaveFocus();

    await user.keyboard('{Delete}');
    expect(screen.getByRole('button', { name: 'Delete tag' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(rowOf('house')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Rename house' })).toBeInTheDocument();
  });

  it('keeps Tab inside the dialog and reaches the buttons of the focused row', async () => {
    const { fake } = setup();
    const { user } = await openDialog(fake);
    await screen.findByRole('list', { name: 'Tags' });
    await user.keyboard('{ArrowDown}');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Color of home' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Rename home' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete home' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
    await user.tab();
    expect(within(dialog()).getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('opens from the tag chip menu of a task', async () => {
    const { fake } = setup();
    const task = fake.tasks()[0];
    if (!task) throw new Error('no task');
    const { user } = await openLoaded(fake, task.id);
    await user.click(await screen.findByRole('button', { name: 'Tag home' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Manage tags…' }));
    expect(useManageTags.getState().open).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('uses tokens only, in dark and light', async () => {
    const { fake } = setup();
    await openDialog(fake);
    await screen.findByRole('list', { name: 'Tags' });
    for (const theme of ['dark', 'light']) {
      document.documentElement.dataset.theme = theme;
      expect(
        document.documentElement.innerHTML.replace(/background-color: #[0-9a-f]{6}/gi, ''),
      ).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });
});
