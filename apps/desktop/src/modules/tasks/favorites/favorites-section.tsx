import { TEXT_ON_TILE, type Favorite, type Task } from '@personal-os/shared';
import { IconArrowUpRight } from '@tabler/icons-react';
import { useId } from 'react';
import { useNow } from '../../dashboard/greeting';
import { useOpenTasks } from '../tasks-queries';
import { FAVORITE_ICON_COMPONENTS } from './favorite-icons';
import { useFavorites } from './favorites-queries';
import { useFavoriteLink } from './use-favorite-link';
import { countFavorite } from './count';

/** How many favorites Overview shows (the side panel has them all). */
const OVERVIEW_FAVORITES = 6;

function FavoriteTile({ favorite, tasks, now }: { favorite: Favorite; tasks?: Task[]; now: Date }) {
  const link = useFavoriteLink();
  const Glyph = FAVORITE_ICON_COMPONENTS[favorite.icon];
  const counts = tasks ? countFavorite(favorite, tasks, now) : null;

  return (
    <li>
      <a
        href={link.hrefOf(favorite.view)}
        onClick={(event) => {
          link.onClick(event, favorite.view);
        }}
        style={{ backgroundColor: favorite.color, color: TEXT_ON_TILE }}
        className="flex h-full flex-col gap-2 rounded-tile liquid-tile p-3 focus-ring transition-transform duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="truncate text-tile-title font-medium">{favorite.name}</span>
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-tile-action bg-tile-action"
          >
            <IconArrowUpRight size={14} stroke={2} />
          </span>
        </span>
        <span className="flex items-center gap-2">
          <Glyph size={20} stroke={1.75} aria-hidden />
          <span className="text-[28px] leading-8 font-semibold tabular-nums">
            {counts ? counts.open : '–'}
          </span>
          <span className="text-body">open</span>
        </span>
        <span className="min-h-4 truncate text-small">
          {counts
            ? counts.overdue > 0
              ? `${String(counts.overdue)} overdue`
              : 'Nothing overdue'
            : null}
        </span>
      </a>
    </li>
  );
}

/**
 * Overview: the first favorites as pastel tiles with the number of open tasks in each view.
 * Hidden until the first favorite exists (docs/design/research/tasks-favorites.md, D6 and D7).
 */
export function FavoritesSection() {
  const favorites = useFavorites();
  const tasks = useOpenTasks();
  const now = useNow();
  const headingId = useId();
  const shown = (favorites.data ?? []).slice(0, OVERVIEW_FAVORITES);
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="px-1 text-section font-semibold text-fg">
        Favorites
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {shown.map((favorite) => (
          <FavoriteTile key={favorite.id} favorite={favorite} tasks={tasks.data} now={now} />
        ))}
      </ul>
    </section>
  );
}
