import {
  FAVORITE_ICONS,
  MAX_FAVORITES,
  TAG_PALETTE,
  TEXT_ON_TILE,
  type CreateFavoriteInput,
  type Favorite,
  type FavoriteView,
} from '@personal-os/shared';
import { cx, Input } from '@personal-os/ui';
import { useId, useState } from 'react';
import { useTags } from '../tags-queries';
import { AnchoredMenu, CheckMark, MenuItem } from './anchored-menu';
import { FAVORITE_ICON_COMPONENTS } from './favorite-icons';
import { suggestFavoriteIcon, suggestFavoriteName } from './view';

const LIMIT_HINT = `${String(MAX_FAVORITES)} favorites is the most. Remove one first.`;
const NO_VIEW_HINT = 'Set a filter on My tasks first';
// More tags than this and the menu gets a search field.
const SEARCH_FROM = 8;

export interface AddMenuProps {
  anchor: HTMLElement;
  /** The view My tasks shows now; null when there is nothing to save (or not on My tasks). */
  view: FavoriteView | null;
  full: boolean;
  onCreate: (input: CreateFavoriteInput) => void;
  onClose: (returnFocus: boolean) => void;
}

/** The + menu: save the current view, or pick a tag (decision D2). */
export function AddMenu({ anchor, view, full, onCreate, onClose }: AddMenuProps) {
  // Tags load when the menu opens, not with the side panel
  const tags = useTags().data ?? [];
  const hintId = useId();
  const [query, setQuery] = useState('');
  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));
  const shown = tags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()));
  const hint = full ? LIMIT_HINT : view ? null : NO_VIEW_HINT;

  const create = (input: CreateFavoriteInput) => {
    onCreate(input);
    onClose(false);
  };

  return (
    <AnchoredMenu anchor={anchor} label="Add favorite" align="end" onClose={onClose}>
      <MenuItem
        disabled={full || !view}
        describedBy={hint ? hintId : undefined}
        onSelect={() => {
          if (!view) return;
          create({
            name: suggestFavoriteName(view, tagNames),
            icon: suggestFavoriteIcon(view),
            view,
          });
        }}
      >
        Save this view
      </MenuItem>
      {hint ? (
        <p id={hintId} className="px-2 pb-1 text-small text-fg-muted">
          {hint}
        </p>
      ) : null}

      <div role="group" aria-label="Tags" className="flex flex-col gap-0.5">
        <p aria-hidden className="px-2 pt-1 pb-0.5 text-small font-medium text-fg-muted">
          Tags
        </p>
        {tags.length > SEARCH_FROM ? (
          <Input
            aria-label="Find a tag"
            placeholder="Find a tag"
            value={query}
            className="mb-1 !h-7"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        ) : null}
        {tags.length === 0 ? <p className="px-2 text-small text-fg-muted">No tags yet</p> : null}
        {tags.length > 0 && shown.length === 0 ? (
          <p className="px-2 text-small text-fg-muted">No tag found</p>
        ) : null}
        {shown.map((tag) => (
          <MenuItem
            key={tag.id}
            disabled={full}
            describedBy={full ? hintId : undefined}
            onSelect={() => {
              create({
                name: suggestFavoriteName({ tagIds: [tag.id] }, tagNames),
                color: tag.color,
                icon: 'hash',
                view: { tagIds: [tag.id] },
              });
            }}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            <span className="truncate">{tag.name}</span>
          </MenuItem>
        ))}
      </div>
    </AnchoredMenu>
  );
}

export interface RowMenuProps {
  anchor: HTMLElement;
  favorite: Favorite;
  isFirst: boolean;
  isLast: boolean;
  /** The side panel is collapsed to squares: there is no room to rename in place. */
  canRename: boolean;
  onRename: () => void;
  onStyle: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onClose: (returnFocus: boolean) => void;
}

/** The menu of one favorite row. */
export function RowMenu({
  anchor,
  favorite,
  isFirst,
  isLast,
  canRename,
  onRename,
  onStyle,
  onMove,
  onRemove,
  onClose,
}: RowMenuProps) {
  const run =
    (action: () => void, returnFocus = false) =>
    () => {
      action();
      onClose(returnFocus);
    };
  return (
    <AnchoredMenu anchor={anchor} label={`${favorite.name} options`} onClose={onClose}>
      {canRename ? <MenuItem onSelect={run(onRename)}>Rename</MenuItem> : null}
      <MenuItem onSelect={onStyle}>Color and icon</MenuItem>
      <MenuItem
        disabled={isFirst}
        onSelect={run(() => {
          onMove(-1);
        }, true)}
      >
        Move up
      </MenuItem>
      <MenuItem
        disabled={isLast}
        onSelect={run(() => {
          onMove(1);
        }, true)}
      >
        Move down
      </MenuItem>
      <MenuItem onSelect={run(onRemove)}>Remove from favorites</MenuItem>
    </AnchoredMenu>
  );
}

export interface StyleMenuProps {
  anchor: HTMLElement;
  favorite: Favorite;
  onPick: (patch: { color: string } | { icon: Favorite['icon'] }) => void;
  onClose: (returnFocus: boolean) => void;
}

/** One popover for the color and the icon; every choice is saved at once. */
export function StyleMenu({ anchor, favorite, onPick, onClose }: StyleMenuProps) {
  return (
    <AnchoredMenu anchor={anchor} label={`${favorite.name} color and icon`} onClose={onClose}>
      <p aria-hidden className="px-2 pt-1 text-small font-medium text-fg-muted">
        Color
      </p>
      <div role="group" aria-label="Color" className="grid grid-cols-5 gap-1 p-1">
        {TAG_PALETTE.map((color, index) => {
          const chosen = color.toLowerCase() === favorite.color.toLowerCase();
          return (
            <MenuItem
              key={color}
              role="menuitemradio"
              checked={chosen}
              aria-label={`Color ${String(index + 1)}`}
              className="size-7 justify-center px-0"
              onSelect={() => {
                if (!chosen) onPick({ color });
              }}
            >
              <span
                className="flex size-6 items-center justify-center rounded-full"
                style={{ backgroundColor: color, color: TEXT_ON_TILE }}
              >
                <CheckMark shown={chosen} />
              </span>
            </MenuItem>
          );
        })}
      </div>
      <p aria-hidden className="px-2 pt-1 text-small font-medium text-fg-muted">
        Icon
      </p>
      <div role="group" aria-label="Icon" className="grid grid-cols-6 gap-1 p-1">
        {FAVORITE_ICONS.map((icon) => {
          const Glyph = FAVORITE_ICON_COMPONENTS[icon];
          const chosen = icon === favorite.icon;
          return (
            <MenuItem
              key={icon}
              role="menuitemradio"
              checked={chosen}
              aria-label={`Icon ${icon}`}
              className={cx('size-7 justify-center px-0', chosen && 'bg-input')}
              onSelect={() => {
                if (!chosen) onPick({ icon });
              }}
            >
              <Glyph size={16} stroke={1.5} aria-hidden />
            </MenuItem>
          );
        })}
      </div>
    </AnchoredMenu>
  );
}
