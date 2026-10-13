import { TAG_PALETTE, type Favorite, type Tag } from '@personal-os/shared';
import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiClient } from '../../../api/api-client';
import { useSettings } from '../../../store/settings-store';
import { createFakeApi, makeFavorite, makeTag, type FakeApi } from '../../../test/fake-api';
import { signedInAuth } from '../../../test/fake-auth';
import { renderApp } from '../../../test/render-app';
import { findToast, openMyTasks, resetEverything, restoreEverything } from '../my-tasks/test-utils';
import { useTasksUi } from '../tasks-ui-store';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

const panel = () => screen.getByRole('complementary', { name: 'Tasks navigation' });
const names = () =>
  within(panel())
    .queryAllByRole('listitem')
    .filter((li) => li.hasAttribute('data-favorite-id'))
    .map((li) => li.textContent);
const link = (name: string) => within(panel()).getByRole('link', { name });

const three = () => [
  makeFavorite({ name: 'Alpha', position: 1024, view: { priority: [1] } }),
  makeFavorite({ name: 'Beta', position: 2048, view: { priority: [2] } }),
  makeFavorite({ name: 'Gamma', position: 3072, view: { due: 'week' } }),
];

async function open(
  favorites: Favorite[] = three(),
  options: { tags?: Tag[]; path?: string } = {},
) {
  const fake = createFakeApi([], options.tags ?? [], favorites);
  const ctx = await openMyTasks(fake, options.path);
  if (favorites.length > 0) await within(panel()).findByRole('list', { name: 'Favorites' });
  return ctx;
}

const calls = (fake: FakeApi, method: string, path: RegExp | string) =>
  fake.calls.filter(
    (call) =>
      call.method === method &&
      (typeof path === 'string' ? call.path === path : path.test(call.path)),
  );

describe('the Favorites list in the side panel', () => {
  it('always shows the header with a + button and a line when there are none', async () => {
    await open([]);
    expect(await screen.findByText('Save a view or a tag here')).toBeInTheDocument();
    expect(within(panel()).getByText('Favorites')).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Add favorite' })).toBeInTheDocument();
    expect(within(panel()).queryByRole('list', { name: 'Favorites' })).not.toBeInTheDocument();
  });

  it('lists the favorites in their order as links named after them', async () => {
    await open();
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(screen.queryByText('Save a view or a tag here')).not.toBeInTheDocument();
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      expect(link(name)).toHaveAttribute('href', expect.stringContaining('/tasks/my-tasks'));
    }
  });

  it('shows nothing under the header while loading', async () => {
    const fake = createFakeApi([], [], three());
    fake.slow(60);
    await openMyTasks(fake);
    expect(within(panel()).getByText('Favorites')).toBeInTheDocument();
    expect(within(panel()).queryByRole('list', { name: 'Favorites' })).not.toBeInTheDocument();
    expect(screen.queryByText('Save a view or a tag here')).not.toBeInTheDocument();
    expect(await within(panel()).findByRole('list', { name: 'Favorites' })).toBeInTheDocument();
  });

  it('says it could not load and loads again on Retry', async () => {
    const fake = createFakeApi([], [], three());
    let failed = false;
    const api: ApiClient = {
      request: (method: string, path: string, options?: Parameters<ApiClient['request']>[2]) => {
        if (method === 'GET' && path === '/task-favorites' && !failed) {
          failed = true;
          return Promise.reject(new ApiError(500, 'boom', 'Server error'));
        }
        return fake.api.request(method, path, options);
      },
    };
    await renderApp('/tasks/my-tasks', signedInAuth().auth, api);
    expect(await screen.findByText('Could not load favorites')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await within(panel()).findByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.queryByText('Could not load favorites')).not.toBeInTheDocument();
  });

  it('shows only squares with tooltips when the panel is collapsed, and keeps the + button', async () => {
    useTasksUi.setState({ sidePanelCollapsed: true });
    const { user } = await open();
    expect(within(panel()).queryByText('Alpha')).not.toBeInTheDocument();
    expect(within(panel()).queryByText('Favorites')).not.toBeInTheDocument();
    expect(link('Alpha')).toBeInTheDocument();
    expect(within(panel()).getByRole('button', { name: 'Add favorite' })).toBeInTheDocument();
    await user.hover(link('Beta'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Beta');
  });
});

describe('opening a favorite', () => {
  it('goes to My tasks with the saved view when clicked', async () => {
    const { router, user } = await open(three(), { path: '/tasks' });
    await user.click(link('Gamma'));
    expect(router.state.location.pathname).toBe('/tasks/my-tasks');
    expect(router.state.location.search).toEqual({ due: 'week' });
  });

  it('opens with Enter on the focused row', async () => {
    const { router, user } = await open();
    link('Beta').focus();
    await user.keyboard('{Enter}');
    expect(router.state.location.search).toEqual({ priority: [2] });
  });

  it('marks the row whose view is the page view as current', async () => {
    const { user } = await open();
    expect(
      within(panel())
        .queryAllByRole('link', { current: 'page' })
        .map((el) => el.textContent),
    ).not.toContain('Alpha');
    await user.click(link('Alpha'));
    await waitFor(() => {
      expect(link('Alpha')).toHaveAttribute('aria-current', 'page');
    });
    expect(link('Beta')).not.toHaveAttribute('aria-current');
    await user.click(link('Beta'));
    await waitFor(() => {
      expect(link('Beta')).toHaveAttribute('aria-current', 'page');
    });
    expect(link('Alpha')).not.toHaveAttribute('aria-current');
  });
});

describe('the + menu', () => {
  const plus = () => within(panel()).getByRole('button', { name: 'Add favorite' });
  const menu = () => screen.getByRole('menu', { name: 'Add favorite' });

  it('disables Save this view with a hint when no filter is set', async () => {
    const { user } = await open([]);
    await user.click(plus());
    const save = within(menu()).getByRole('menuitem', { name: 'Save this view' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveAccessibleDescription('Set a filter on My tasks first');
    await user.click(save);
    expect(menu()).toBeInTheDocument();
  });

  it('disables Save this view outside of My tasks', async () => {
    const { user } = await open([], { path: '/tasks' });
    await user.click(plus());
    expect(within(menu()).getByRole('menuitem', { name: 'Save this view' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('saves the current view, then lets the name be changed in place', async () => {
    const { fake, user } = await open([], { path: '/tasks/my-tasks?priority=1' });
    await user.click(plus());
    await user.click(within(menu()).getByRole('menuitem', { name: 'Save this view' }));
    expect(menu).toThrow();
    const box = await screen.findByRole('textbox', { name: /^Rename / });
    expect(calls(fake, 'POST', '/task-favorites')[0]?.body).toMatchObject({
      view: { priority: [1] },
      icon: 'flag',
    });
    await user.clear(box);
    await user.type(box, 'My urgent{Enter}');
    await waitFor(() => {
      expect(names()).toEqual(['My urgent']);
    });
    expect(calls(fake, 'PATCH', /^\/task-favorites\//)[0]?.body).toEqual({ name: 'My urgent' });
    expect(link('My urgent')).toHaveFocus();
  });

  it('keeps the suggested name when Escape is pressed in the new name box', async () => {
    const { fake, user } = await open([], { path: '/tasks/my-tasks?priority=1' });
    await user.click(plus());
    await user.click(within(menu()).getByRole('menuitem', { name: 'Save this view' }));
    const box = await screen.findByRole('textbox', { name: /^Rename / });
    const suggested = (box as HTMLInputElement).value;
    await user.type(box, 'zzz{Escape}');
    await waitFor(() => {
      expect(names()).toEqual([suggested]);
    });
    expect(calls(fake, 'PATCH', /^\/task-favorites\//)).toHaveLength(0);
  });

  it('keeps the old name when the new one is emptied', async () => {
    const { fake, user } = await open([], { path: '/tasks/my-tasks?priority=1' });
    await user.click(plus());
    await user.click(within(menu()).getByRole('menuitem', { name: 'Save this view' }));
    const box = await screen.findByRole('textbox', { name: /^Rename / });
    await user.clear(box);
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /^Rename / })).not.toBeInTheDocument();
    });
    expect(calls(fake, 'PATCH', /^\/task-favorites\//)).toHaveLength(0);
  });

  it('lists the tags and saves one as a tag favorite with its color and the hash icon', async () => {
    const tag = makeTag({ name: 'home', color: TAG_PALETTE[3] });
    const { fake, user } = await open([], { tags: [tag, makeTag({ name: 'work' })] });
    await user.click(plus());
    const items = within(menu()).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Save this view', 'home', 'work']);
    expect(within(menu()).queryByRole('textbox', { name: 'Find a tag' })).not.toBeInTheDocument();
    await user.click(within(menu()).getByRole('menuitem', { name: 'home' }));
    expect(await screen.findByRole('textbox', { name: 'Rename home' })).toBeInTheDocument();
    expect(calls(fake, 'POST', '/task-favorites')[0]?.body).toEqual({
      name: 'home',
      color: TAG_PALETTE[3],
      icon: 'hash',
      view: { tagIds: [tag.id] },
    });
  });

  it('adds a search field over 8 tags and filters by it', async () => {
    const tags = Array.from({ length: 9 }, (_, i) => makeTag({ name: `label${String(i)}` }));
    const { user } = await open([], { tags });
    await user.click(plus());
    const search = within(menu()).getByRole('textbox', { name: 'Find a tag' });
    expect(within(menu()).getAllByRole('menuitem')).toHaveLength(10);
    await user.type(search, 'label7');
    expect(
      within(menu())
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Save this view', 'label7']);
    await user.clear(search);
    await user.type(search, 'nothing');
    expect(within(menu()).getByText('No tag found')).toBeInTheDocument();
  });

  it('tells that a tag is already a favorite instead of adding it twice', async () => {
    const tag = makeTag({ name: 'home' });
    const existing = makeFavorite({ name: 'Home stuff', view: { tagIds: [tag.id] } });
    const { user } = await open([existing], { tags: [tag] });
    await user.click(plus());
    await user.click(within(menu()).getByRole('menuitem', { name: 'home' }));
    expect(await findToast('Already in favorites.')).toBeInTheDocument();
    expect(names()).toEqual(['Home stuff']);
    await waitFor(() => {
      expect(link('Home stuff')).toHaveFocus();
    });
  });

  it('disables everything at 12 favorites and says so', async () => {
    const tag = makeTag({ name: 'home' });
    const twelve = Array.from({ length: 12 }, (_, i) =>
      makeFavorite({
        name: `Fav ${String(i)}`,
        view: { priority: [1], sort: 'title' },
        position: i,
      }),
    );
    // Different views, so none of them counts as a copy of another
    twelve.forEach((favorite, i) => {
      favorite.view = { tagIds: [`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`] };
    });
    const { fake, user } = await open(twelve, { tags: [tag], path: '/tasks/my-tasks?priority=1' });
    await user.click(plus());
    const save = within(menu()).getByRole('menuitem', { name: 'Save this view' });
    const home = within(menu()).getByRole('menuitem', { name: 'home' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(home).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveAccessibleDescription('12 favorites is the most. Remove one first.');
    await user.click(save);
    await user.click(home);
    expect(calls(fake, 'POST', '/task-favorites')).toHaveLength(0);
  });

  it('closes with Escape and gives the focus back to the + button', async () => {
    const { user } = await open([]);
    await user.click(plus());
    expect(within(menu()).getByRole('menuitem', { name: 'Save this view' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(plus()).toHaveFocus();
  });
});

describe('the row menu', () => {
  const more = (name: string) => screen.getByRole('button', { name: `More options for ${name}` });
  const menu = (name: string) => screen.getByRole('menu', { name: `${name} options` });

  it('has Rename, Color and icon, Move up, Move down and Remove', async () => {
    const { user } = await open();
    await user.click(more('Beta'));
    expect(
      within(menu('Beta'))
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Rename', 'Color and icon', 'Move up', 'Move down', 'Remove from favorites']);
  });

  it('renames in place', async () => {
    const { fake, user } = await open();
    await user.click(more('Beta'));
    await user.click(within(menu('Beta')).getByRole('menuitem', { name: 'Rename' }));
    const box = screen.getByRole('textbox', { name: 'Rename Beta' });
    expect(box).toHaveFocus();
    await user.clear(box);
    await user.type(box, '  Second  {Enter}');
    await waitFor(() => {
      expect(names()).toEqual(['Alpha', 'Second', 'Gamma']);
    });
    expect(calls(fake, 'PATCH', /^\/task-favorites\//)[0]?.body).toEqual({ name: 'Second' });
  });

  it('changes color and icon at once from one popover', async () => {
    const { fake, user } = await open();
    await user.click(more('Alpha'));
    await user.click(within(menu('Alpha')).getByRole('menuitem', { name: 'Color and icon' }));
    const popover = screen.getByRole('menu', { name: 'Alpha color and icon' });
    expect(within(popover).getAllByRole('menuitemradio', { name: /^Color / })).toHaveLength(10);
    expect(within(popover).getAllByRole('menuitemradio', { name: /^Icon / })).toHaveLength(12);
    expect(within(popover).getByRole('menuitemradio', { name: 'Icon hash' })).toBeChecked();
    await user.click(within(popover).getByRole('menuitemradio', { name: 'Color 4' }));
    await user.click(within(popover).getByRole('menuitemradio', { name: 'Icon star' }));
    const bodies = calls(fake, 'PATCH', /^\/task-favorites\//).map((call) => call.body);
    expect(bodies).toEqual([{ color: TAG_PALETTE[3] }, { icon: 'star' }]);
    await waitFor(() => {
      expect(within(popover).getByRole('menuitemradio', { name: 'Icon star' })).toBeChecked();
    });
  });

  it('moves a favorite up and down, and disables the ends', async () => {
    const list = three();
    const { fake, user } = await open(list);
    await user.click(more('Beta'));
    await user.click(within(menu('Beta')).getByRole('menuitem', { name: 'Move up' }));
    expect(calls(fake, 'POST', /\/move$/)[0]?.body).toEqual({ beforeId: list[0]?.id });
    await waitFor(() => {
      expect(names()).toEqual(['Beta', 'Alpha', 'Gamma']);
    });

    await user.click(more('Beta'));
    expect(within(menu('Beta')).getByRole('menuitem', { name: 'Move up' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(within(menu('Beta')).getByRole('menuitem', { name: 'Move down' }));
    expect(calls(fake, 'POST', /\/move$/)[1]?.body).toEqual({
      afterId: list[0]?.id,
      beforeId: list[2]?.id,
    });
    await waitFor(() => {
      expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    await user.click(more('Gamma'));
    expect(within(menu('Gamma')).getByRole('menuitem', { name: 'Move down' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('removes a favorite with an Undo toast, and Undo brings it back', async () => {
    const { fake, user } = await open();
    await user.click(more('Beta'));
    await user.click(within(menu('Beta')).getByRole('menuitem', { name: 'Remove from favorites' }));
    await waitFor(() => {
      expect(names()).toEqual(['Alpha', 'Gamma']);
    });
    expect(calls(fake, 'DELETE', /^\/task-favorites\//)).toHaveLength(1);
    const toast = await findToast('Favorite removed.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    });
    expect(calls(fake, 'POST', '/undo')).toHaveLength(1);
  });

  it('shows the server message and puts the old name back when a rename is refused', async () => {
    const { fake, user } = await open();
    await user.click(more('Alpha'));
    await user.click(within(menu('Alpha')).getByRole('menuitem', { name: 'Rename' }));
    await user.type(screen.getByRole('textbox', { name: 'Rename Alpha' }), 'X');
    fake.failNext(500, 'boom', 'Server error');
    await user.keyboard('{Enter}');
    expect(await findToast('Server error')).toBeInTheDocument();
    await waitFor(() => {
      expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    });
  });
});

describe('the keyboard', () => {
  it('opens the row menu with Shift F10 and with the Menu key, and Escape returns to the row', async () => {
    const { user } = await open();
    link('Beta').focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menu', { name: 'Beta options' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Color and icon' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(link('Beta')).toHaveFocus();

    await user.keyboard('{ContextMenu}');
    expect(screen.getByRole('menu', { name: 'Beta options' })).toBeInTheDocument();
  });

  it('renames with F2 (the old name is selected): Enter keeps the new name, Escape leaves it', async () => {
    const { fake, user } = await open();
    link('Alpha').focus();
    await user.keyboard('{F2}');
    await user.keyboard('One{Enter}');
    await waitFor(() => {
      expect(names()[0]).toBe('One');
    });
    expect(link('One')).toHaveFocus();
    await user.keyboard('{F2}');
    await user.keyboard('zzz{Escape}');
    expect(names()[0]).toBe('One');
    expect(calls(fake, 'PATCH', /^\/task-favorites\//)).toHaveLength(1);
  });

  it('removes with Delete (with Undo) and moves the focus to the next row', async () => {
    const { user } = await open();
    link('Alpha').focus();
    await user.keyboard('{Delete}');
    await waitFor(() => {
      expect(names()).toEqual(['Beta', 'Gamma']);
    });
    expect(link('Beta')).toHaveFocus();
    expect(await findToast('Favorite removed.')).toBeInTheDocument();
  });

  it('does not remove a favorite when Delete is pressed while renaming', async () => {
    const { user } = await open();
    link('Alpha').focus();
    await user.keyboard('{F2}');
    await user.keyboard('{Delete}{Escape}');
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('keeps Enter for opening the favorite (only Space can lift a row to drag)', async () => {
    const { router, user } = await open();
    link('Alpha').focus();
    await user.keyboard('{Enter}');
    expect(router.state.location.search).toEqual({ priority: [1] });
    expect(document.querySelector('[data-favorite-id]')).not.toHaveAttribute('aria-pressed');
  });
});

describe.each(['dark', 'light'] as const)('in %s mode', (theme) => {
  it('draws without hard-coded colors, including the open menus', async () => {
    useSettings.getState().update({ theme });
    const { user } = await open(three(), { tags: [makeTag({ name: 'home' })] });
    expect(document.documentElement.dataset.theme).toBe(theme);
    await user.click(within(panel()).getByRole('button', { name: 'Add favorite' }));
    expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'More options for Alpha' }));
    await user.click(screen.getByRole('menuitem', { name: 'Color and icon' }));
    expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
