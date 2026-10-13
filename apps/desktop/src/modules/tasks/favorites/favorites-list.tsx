import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  FAVORITE_NAME_MAX,
  MAX_FAVORITES,
  sameFavoriteView,
  type CreateFavoriteInput,
  type Favorite,
} from '@personal-os/shared';
import { cx, Tooltip } from '@personal-os/ui';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useMatch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { taskAnnouncements, useTaskSensors } from '../drag/dnd';
import { useTasksUi } from '../tasks-ui-store';
import { FavoriteRow } from './favorite-row';
import { AddMenu, RowMenu, StyleMenu } from './favorites-menus';
import { useFavoriteActions, useFavorites } from './favorites-queries';
import { moveTarget } from './reorder';
import { currentFavoriteView } from './view';

type MenuState =
  { kind: 'add'; anchor: HTMLElement } | { kind: 'row' | 'style'; id: string; anchor: HTMLElement };

/** A drag ends with a click on the row it started from; that click must not open the favorite. */
function swallowNextClick() {
  const stop = (event: Event) => {
    event.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => {
    window.removeEventListener('click', stop, { capture: true });
  }, 0);
}

const headerButton =
  'flex size-6 items-center justify-center rounded-chip text-fg-muted focus-ring hover:bg-tint hover:text-fg';

/**
 * The Favorites list of the side panel (docs/design/research/tasks-favorites.md, D2 to D12 and
 * D20): a header with +, the rows, and the empty and error lines. Collapsed, only the squares show.
 */
export function FavoritesList({ collapsed = false }: { collapsed?: boolean }) {
  const favorites = useFavorites();
  const { create, update, move, remove } = useFavoriteActions();
  const sensors = useTaskSensors();
  const sort = useTasksUi((state) => state.sort);
  const group = useTasksUi((state) => state.group);
  const myTasks = useMatch({ from: '/_app/tasks/my-tasks', shouldThrow: false });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /** Who gets the focus after the next render: a favorite id, or "add" for the + button. */
  const pendingFocus = useRef<string | null>(null);

  const items = favorites.data ?? [];
  const ids = items.map((favorite) => favorite.id);
  const full = items.length >= MAX_FAVORITES;
  const currentView = myTasks ? currentFavoriteView(myTasks.search, sort, group) : null;

  const focusFavorite = (id: string) => {
    const target =
      id === 'add'
        ? addButton.current
        : list.current?.querySelector<HTMLElement>(`[data-favorite-link="${id}"]`);
    target?.focus();
  };

  useEffect(() => {
    if (pendingFocus.current === null) return;
    const id = pendingFocus.current;
    pendingFocus.current = null;
    focusFavorite(id);
  });

  const closeMenu = (returnFocus: boolean) => {
    if (returnFocus) menu?.anchor.focus();
    setMenu(null);
  };

  const createFavorite = (input: CreateFavoriteInput) => {
    create.mutate(input, {
      onSuccess: ({ item, undo }) => {
        // A new favorite opens in rename; one that existed is only brought into view
        if (undo && !collapsed) {
          setRenamingId(item.id);
        } else {
          pendingFocus.current = item.id;
        }
      },
    });
  };

  const finishRename = (favorite: Favorite, name: string | null) => {
    const trimmed = name?.trim().slice(0, FAVORITE_NAME_MAX);
    if (trimmed && trimmed !== favorite.name) update.mutate({ id: favorite.id, name: trimmed });
    pendingFocus.current = favorite.id;
    setRenamingId(null);
  };

  const removeFavorite = (favorite: Favorite) => {
    const index = ids.indexOf(favorite.id);
    pendingFocus.current = ids[index + 1] ?? ids[index - 1] ?? 'add';
    remove.mutate(favorite.id);
  };

  const moveBy = (favorite: Favorite, direction: -1 | 1) => {
    const target = moveTarget(ids, favorite.id, ids.indexOf(favorite.id) + direction);
    if (target) move.mutate({ id: favorite.id, ...target });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    swallowNextClick();
    if (!over) return;
    const target = moveTarget(ids, String(active.id), ids.indexOf(String(over.id)));
    if (target) move.mutate({ id: String(active.id), ...target });
  };

  const nameOf = (id: string) => items.find((favorite) => favorite.id === id)?.name ?? 'a favorite';
  const menuFavorite =
    menu && menu.kind !== 'add' ? items.find((favorite) => favorite.id === menu.id) : undefined;

  const plus = (
    <Tooltip label="Add favorite">
      <button
        ref={addButton}
        type="button"
        aria-label="Add favorite"
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'add'}
        onClick={(event) => {
          const anchor = event.currentTarget;
          setMenu((open) => (open?.kind === 'add' ? null : { kind: 'add', anchor }));
        }}
        className={headerButton}
      >
        <IconPlus size={14} stroke={1.75} aria-hidden />
      </button>
    </Tooltip>
  );

  return (
    <div className="flex flex-col gap-0.5">
      {collapsed ? (
        <div className="flex justify-center">{plus}</div>
      ) : (
        <div className="flex items-center justify-between pr-1 pl-2.5">
          <span className="text-small text-fg-muted">Favorites</span>
          {plus}
        </div>
      )}

      {favorites.isError ? (
        collapsed ? (
          <div className="flex justify-center">
            <Tooltip label="Could not load favorites. Retry">
              <button
                type="button"
                aria-label="Could not load favorites. Retry"
                onClick={() => {
                  void favorites.refetch();
                }}
                className={headerButton}
              >
                <IconRefresh size={14} stroke={1.5} aria-hidden />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 pr-1 pl-2.5 text-small text-fg-muted"
          >
            <span>Could not load favorites</span>
            <button
              type="button"
              onClick={() => {
                void favorites.refetch();
              }}
              className="rounded-chip px-1.5 py-0.5 text-fg-secondary focus-ring hover:bg-tint hover:text-fg"
            >
              Retry
            </button>
          </div>
        )
      ) : null}

      {favorites.isSuccess && items.length === 0 && !collapsed ? (
        <p className="pl-2.5 text-small text-fg-muted">Save a view or a tag here</p>
      ) : null}

      {items.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements: taskAnnouncements(nameOf, nameOf), restoreFocus: false }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul
              ref={list}
              aria-label="Favorites"
              className={cx('flex flex-col gap-0.5', collapsed && 'items-center')}
            >
              {items.map((favorite) => (
                <FavoriteRow
                  key={favorite.id}
                  favorite={favorite}
                  collapsed={collapsed}
                  active={currentView !== null && sameFavoriteView(favorite.view, currentView)}
                  renaming={renamingId === favorite.id}
                  onMenu={(row, anchor) => {
                    setMenu({ kind: 'row', id: row.id, anchor });
                  }}
                  onRename={(row) => {
                    setRenamingId(row.id);
                  }}
                  onRenamed={finishRename}
                  onRemove={removeFavorite}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}

      {menu?.kind === 'add' ? (
        <AddMenu
          anchor={menu.anchor}
          view={currentView}
          full={full}
          onCreate={createFavorite}
          onClose={closeMenu}
        />
      ) : null}
      {menu?.kind === 'row' && menuFavorite ? (
        <RowMenu
          anchor={menu.anchor}
          favorite={menuFavorite}
          isFirst={ids[0] === menuFavorite.id}
          isLast={ids.at(-1) === menuFavorite.id}
          canRename={!collapsed}
          onRename={() => {
            setRenamingId(menuFavorite.id);
          }}
          onStyle={() => {
            setMenu({ kind: 'style', id: menuFavorite.id, anchor: menu.anchor });
          }}
          onMove={(direction) => {
            moveBy(menuFavorite, direction);
          }}
          onRemove={() => {
            removeFavorite(menuFavorite);
          }}
          onClose={closeMenu}
        />
      ) : null}
      {menu?.kind === 'style' && menuFavorite ? (
        <StyleMenu
          anchor={menu.anchor}
          favorite={menuFavorite}
          onPick={(patch) => {
            update.mutate({ id: menuFavorite.id, ...patch });
          }}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
}
