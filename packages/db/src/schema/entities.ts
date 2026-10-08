import { ENTITY_TYPES } from '@personal-os/shared';
import { customType, index, pgEnum, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { baseColumns, deletedAtColumn, ownRowsPolicy } from './columns';

export const entityType = pgEnum('entity_type', ENTITY_TYPES);

/** Postgres full-text document. A trigger fills it from the title and module text in Step 2. */
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

/** Every item in the app (task, note, project, …) is an entity so any two can be linked. */
export const entities = pgTable(
  'entities',
  {
    ...baseColumns(),
    type: entityType('type').notNull(),
    title: text('title').notNull(),
    searchVector: tsvector('search_vector'),
    ...deletedAtColumn(),
  },
  (table) => [
    // Lets links point at (id, user_id) so a link can never join two different users' items.
    unique('entities_id_user_id_key').on(table.id, table.userId),
    index('entities_user_id_idx').on(table.userId),
    index('entities_user_type_idx').on(table.userId, table.type),
    index('entities_search_vector_idx').using('gin', table.searchVector),
    ownRowsPolicy('entities', table.userId),
  ],
).enableRLS();

export type EntityRow = typeof entities.$inferSelect;
export type NewEntityRow = typeof entities.$inferInsert;
