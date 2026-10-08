import { sql } from 'drizzle-orm';
import { foreignKey, index, pgTable, text, uniqueIndex, unique, uuid } from 'drizzle-orm/pg-core';
import { baseColumns, deletedAtColumn, ownRowsPolicy } from './columns';
import { entities } from './entities';

/**
 * A tag (docs/DATABASE.md). A plain table: a tag has no row in entities. The knowledge graph
 * (Step 7) builds tag nodes from this table.
 */
export const tags = pgTable(
  'tags',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    /** A palette color such as #F7D96B. */
    color: text('color').notNull(),
    ...deletedAtColumn(),
  },
  (table) => [
    // entity_tags points at (id, user_id) so a tag can only be put on the same user's items
    unique('tags_id_user_id_key').on(table.id, table.userId),
    // One live tag per name for a user, ignoring case
    uniqueIndex('tags_user_name_idx')
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
    index('tags_user_id_idx').on(table.userId),
    ownRowsPolicy('tags', table.userId),
  ],
).enableRLS();

/** Which tags an item (a task, later a note) has. */
export const entityTags = pgTable(
  'entity_tags',
  {
    ...baseColumns(),
    entityId: uuid('entity_id').notNull(),
    tagId: uuid('tag_id').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'entity_tags_entity_fk',
      columns: [table.entityId, table.userId],
      foreignColumns: [entities.id, entities.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'entity_tags_tag_fk',
      columns: [table.tagId, table.userId],
      foreignColumns: [tags.id, tags.userId],
    }).onDelete('cascade'),
    unique('entity_tags_entity_tag_key').on(table.entityId, table.tagId),
    index('entity_tags_user_id_idx').on(table.userId),
    index('entity_tags_entity_id_idx').on(table.entityId),
    index('entity_tags_tag_id_idx').on(table.tagId),
    ownRowsPolicy('entity_tags', table.userId),
  ],
).enableRLS();

export type TagRow = typeof tags.$inferSelect;
export type EntityTagRow = typeof entityTags.$inferSelect;
