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
import { useId, useRef, useState } from 'react';
import { colorName } from '../manage-tags/swatches';
import { useTags } from '../tags-queries';
import { AnchoredMenu, CheckMark, MenuItem } from './anchored-menu';
import { FAVORITE_ICON_COMPONENTS } from './favorite-icons';
import { suggestFavoriteIcon, suggestFavoriteName } from './view';

/** The palette entry for a tag color (compared ignoring case), or undefined for any other color. */
const paletteColor = (color: string) =>
  TAG_PALETTE.find((entry) => entry.toLowerCase() === color.toLowerCase());

const LIMIT_HINT = `${String(MAX_FAVORITES)} favorites is the most. Remove one first.`;
const NO_VIEW_HINT = 'Set a filter on My tasks first';
const OTHER_PAGE_HINT = 'Open My tasks to save a view';
// More tags than this and the menu gets a search field.
const SEARCH_FROM = 8;

export interface AddMenuProps {
  anchor: HTMLElement;
  /** The view My tasks shows now; null when there is nothing to save (or not on My tasks). */
  view: FavoriteView | null;
  /** The page is My tasks (so "Save this view" can work once a filter is set). */
  onMyTasks: boolean;
  full: boolean;
  onCreate: (input: CreateFavoriteInput) => void;
  onClose: (returnFocus: boolean) => void;
}

/** The + menu: save the current view, or pick a tag (decision D2). */
export function AddMenu({ anchor, view, onMyTasks, full, onCreate, onClose }: AddMenuProps) {
  // Tags load when the menu opens, not with the side panel
  const tags = useTags().data ?? [];
  const hintId = useId();
  const tagGroup = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));
  const shown = tags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()));
  const hint = full ? LIMIT_HINT : view ? null : onMyTasks ? NO_VIEW_HINT : OTHER_PAGE_HINT;

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

      <div ref={tagGroup} role="group" aria-label="Tags" className="flex flex-col gap-0.5">
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
            onKeyDown={(event) => {
              // Down from the search goes to the first tag, not back up to "Save this view"
              const first = tagGroup.current?.querySelector<HTMLElement>('[role="menuitem"]');
              if (event.key === 'ArrowDown' && first) {
                event.preventDefault();
                event.stopPropagation();
                first.focus();
              }
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
              const color = paletteColor(tag.color);
              create({
                name: suggestFavoriteName({ tagIds: [tag.id] }, tagNames),
                // Only a palette color; otherwise the server picks the next palette color
                ...(color ? { color } : {}),
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
      <div role="group" aria-label="Color" data-grid="5" className="grid grid-cols-5 gap-1 p-1">
        {TAG_PALETTE.map((color) => {
          const chosen = color.toLowerCase() === favorite.color.toLowerCase();
          return (
            <MenuItem
              key={color}
              role="menuitemradio"
              checked={chosen}
              aria-label={colorName(color)}
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
      <div role="group" aria-label="Icon" data-grid="6" className="grid grid-cols-6 gap-1 p-1">
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
