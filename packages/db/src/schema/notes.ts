import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { baseColumns, deletedAtColumn, ownRowsPolicy } from './columns';
import { entities } from './entities';

/**
 * A folder for notes (research memo docs/design/research/notes.md D3). A plain table, not an
 * entity (like tags). The server limits the depth to 3.
 */
export const noteFolders = pgTable(
  'note_folders',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    parentId: uuid('parent_id'),
    ...deletedAtColumn(),
  },
  (table) => [
    unique('note_folders_id_user_id_key').on(table.id, table.userId),
    foreignKey({
      name: 'note_folders_parent_fk',
      columns: [table.parentId, table.userId],
      foreignColumns: [table.id, table.userId],
    }),
    // One live folder per name inside the same parent, ignoring case (two indexes: NULL parents
    // are not equal to each other in a unique index)
    uniqueIndex('note_folders_root_name_idx')
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.parentId} is null and ${table.deletedAt} is null`),
    uniqueIndex('note_folders_child_name_idx')
      .on(table.userId, table.parentId, sql`lower(${table.name})`)
      .where(sql`${table.parentId} is not null and ${table.deletedAt} is null`),
    index('note_folders_user_id_idx').on(table.userId),
    ownRowsPolicy('note_folders', table.userId),
  ],
).enableRLS();

/**
 * A note. Its id is the id of its row in entities (type `note`). `contentMd` is the Markdown source
 * of truth; `contentText` is plain text made by the server on every save (search, excerpts).
 * `revision` goes up by 1 on every content or title change and detects edits from another device.
 */
export const notes = pgTable(
  'notes',
  {
    ...baseColumns(),
    title: text('title').notNull(),
    contentMd: text('content_md').notNull().default(''),
    contentText: text('content_text').notNull().default(''),
    folderId: uuid('folder_id'),
    pinned: boolean('pinned').notNull().default(false),
    revision: integer('revision').notNull().default(1),
    ...deletedAtColumn(),
  },
  (table) => [
    foreignKey({
      name: 'notes_entity_fk',
      columns: [table.id, table.userId],
      foreignColumns: [entities.id, entities.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'notes_folder_fk',
      columns: [table.folderId, table.userId],
      foreignColumns: [noteFolders.id, noteFolders.userId],
    }),
    unique('notes_id_user_id_key').on(table.id, table.userId),
    // Links resolve by title, so a live title is unique per user, ignoring case
    uniqueIndex('notes_user_title_idx')
      .on(table.userId, sql`lower(${table.title})`)
      .where(sql`${table.deletedAt} is null`),
    index('notes_user_updated_idx').on(table.userId, table.updatedAt),
    index('notes_user_folder_idx').on(table.userId, table.folderId),
    ownRowsPolicy('notes', table.userId),
  ],
).enableRLS();

export type NoteRow = typeof notes.$inferSelect;
export type NoteFolderRow = typeof noteFolders.$inferSelect;
