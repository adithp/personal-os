import { FAVORITE_NAME_MAX, type Favorite } from '@personal-os/shared';
import { cx, Tooltip } from '@personal-os/ui';
import { IconDots } from '@tabler/icons-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FavoriteSquare } from './favorite-icons';
import { useFavoriteLink } from './use-favorite-link';
import { useRowDrag, type RowDrag } from './use-row-drag';

/** The name of a favorite as a text box: Enter keeps it, Escape leaves the old name, blur keeps it. */
function RenameBox({
  favorite,
  onDone,
}: {
  favorite: Favorite;
  /** The new name, or null when the rename was cancelled. */
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(favorite.name);
  const box = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);

  const finish = (keep: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onDone(keep ? value : null);
  };

  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-2.5 px-2.5">
      <FavoriteSquare color={favorite.color} icon={favorite.icon} />
      <input
        ref={box}
        value={value}
        maxLength={FAVORITE_NAME_MAX}
        aria-label={`Rename ${favorite.name}`}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onBlur={() => {
          finish(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            finish(true);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
          }
        }}
        className="h-6 min-w-0 flex-1 rounded-chip bg-input px-1.5 text-body text-fg focus-ring"
      />
    </div>
  );
}

export interface FavoriteRowProps {
  favorite: Favorite;
  collapsed: boolean;
  active: boolean;
  renaming: boolean;
  /** The link of this row is the anchor of menus; the list opens them. */
  onMenu: (favorite: Favorite, anchor: HTMLElement) => void;
  onRename: (favorite: Favorite) => void;
  onRenamed: (favorite: Favorite, name: string | null) => void;
  onRemove: (favorite: Favorite) => void;
}

function FavoriteRowView(props: FavoriteRowProps & { drag?: RowDrag }) {
  const { drag, favorite, collapsed, active, renaming, onMenu, onRename, onRenamed, onRemove } =
    props;
  const link = useFavoriteLink();

  const anchorOf = (row: HTMLElement) => row.querySelector<HTMLElement>('a') ?? row;

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (renaming || event.target instanceof HTMLInputElement) return;
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      onMenu(favorite, anchorOf(event.currentTarget));
    } else if (event.key === 'F2') {
      event.preventDefault();
      if (!collapsed) onRename(favorite);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      onRemove(favorite);
    }
  };

  const anchor = (
    <a
      ref={drag?.setActivatorNodeRef}
      href={link.hrefOf(favorite.view)}
      draggable={false}
      data-favorite-link={favorite.id}
      aria-label={collapsed ? favorite.name : undefined}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => {
        link.onClick(event, favorite.view);
      }}
      onPointerDown={drag?.onPointerDown}
      onKeyDown={(event) => {
        if (event.code === 'Space') drag?.onSpaceKeyDown?.(event);
      }}
      className={cx(
        'flex h-8 min-w-0 items-center gap-2.5 rounded-chip text-body focus-ring',
        'transition-colors duration-150 ease-out motion-reduce:transition-none',
        collapsed ? 'w-8 justify-center' : 'flex-1 px-2.5 pr-8',
        active ? 'bg-tint font-medium !text-fg' : 'text-fg-secondary hover:bg-tint hover:text-fg',
      )}
    >
      <FavoriteSquare color={favorite.color} icon={favorite.icon} />
      {collapsed ? null : (
        <span className="truncate" title={favorite.name}>
          {favorite.name}
        </span>
      )}
    </a>
  );

  return (
    <li
      ref={drag?.setNodeRef}
      data-favorite-id={favorite.id}
      onKeyDown={onKeyDown}
      style={drag?.style}
      className={cx(
        'group relative flex',
        collapsed && 'justify-center',
        drag?.dragging && 'z-10 opacity-80',
      )}
    >
      {renaming ? (
        <RenameBox
          favorite={favorite}
          onDone={(name) => {
            onRenamed(favorite, name);
          }}
        />
      ) : collapsed ? (
        <Tooltip label={favorite.name}>{anchor}</Tooltip>
      ) : (
        anchor
      )}
      {collapsed || renaming ? null : (
        <button
          type="button"
          tabIndex={-1}
          data-menu-trigger
          aria-haspopup="menu"
          aria-label={`More options for ${favorite.name}`}
          onClick={(event) => {
            onMenu(favorite, anchorOf(event.currentTarget.parentElement ?? event.currentTarget));
          }}
          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-chip text-fg-muted opacity-0 focus-ring group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg"
        >
          <IconDots size={14} stroke={1.5} aria-hidden />
        </button>
      )}
    </li>
  );
}

/** One favorite: a link (square and name), a hover "more" button, and drag to reorder. */
export function FavoriteRow(props: FavoriteRowProps) {
  const drag = useRowDrag(props.favorite.id);
  return <FavoriteRowView {...props} drag={drag} />;
}
