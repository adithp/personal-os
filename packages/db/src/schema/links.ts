import { LINK_RELATIONS } from '@personal-os/shared';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgEnum, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { baseColumns, deletedAtColumn, ownRowsPolicy } from './columns';
import { entities } from './entities';

export const linkRelation = pgEnum('link_relation', LINK_RELATIONS);

/** A connection from one entity to another: backlinks, project items, and the knowledge graph. */
export const links = pgTable(
  'links',
  {
    ...baseColumns(),
    sourceId: uuid('source_id').notNull(),
    targetId: uuid('target_id').notNull(),
    relation: linkRelation('relation').notNull(),
    ...deletedAtColumn(),
  },
  (table) => [
    // Both ends must belong to the same user as the link, enforced by the database itself.
    foreignKey({
      name: 'links_source_owner_fk',
      columns: [table.sourceId, table.userId],
      foreignColumns: [entities.id, entities.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'links_target_owner_fk',
      columns: [table.targetId, table.userId],
      foreignColumns: [entities.id, entities.userId],
    }).onDelete('cascade'),
    check('links_no_self_link', sql`${table.sourceId} <> ${table.targetId}`),
    // One live link per pair and relation; a soft-deleted link does not block a new one.
    uniqueIndex('links_unique_active_idx')
      .on(table.userId, table.sourceId, table.targetId, table.relation)
      .where(sql`${table.deletedAt} is null`),
    index('links_user_id_idx').on(table.userId),
    index('links_source_id_idx').on(table.sourceId),
    index('links_target_id_idx').on(table.targetId),
    ownRowsPolicy('links', table.userId),
  ],
).enableRLS();

export type LinkRow = typeof links.$inferSelect;
export type NewLinkRow = typeof links.$inferInsert;
