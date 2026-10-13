import type { FavoriteView } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import { doublePrecision, index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { baseColumns, deletedAtColumn, ownRowsPolicy } from './columns';

/**
 * A favorite of the Tasks module (docs/DATABASE.md): a saved My tasks view with a name, a palette
 * color, and an icon. It is a plain table (not an entity). The view is checked by the shared
 * Zod schema favoriteViewSchema before it is saved.
 */
export const taskFavorites = pgTable(
  'task_favorites',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    /** A palette color such as #F7D96B. */
    color: text('color').notNull(),
    /** One of FAVORITE_ICONS. */
    icon: text('icon').notNull(),
    view: jsonb('view').$type<FavoriteView>().notNull(),
    /** Order in the list; a number between its neighbours, like tasks.position. */
    position: doublePrecision('position').notNull().default(0),
    ...deletedAtColumn(),
  },
  (table) => [
    index('task_favorites_user_id_idx').on(table.userId),
    index('task_favorites_user_position_idx')
      .on(table.userId, table.position)
      .where(sql`${table.deletedAt} is null`),
    ownRowsPolicy('task_favorites', table.userId),
  ],
).enableRLS();

export type TaskFavoriteRow = typeof taskFavorites.$inferSelect;
