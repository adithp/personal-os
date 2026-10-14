import { sql } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
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
    /** Set on a daily note: its India calendar day (YYYY-MM-DD), stage N3. */
    dailyDate: date('daily_date', { mode: 'string' }),
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
    // One live daily note per India day (NULL dates are never equal, so normal notes are free)
    uniqueIndex('notes_user_daily_date_idx')
      .on(table.userId, table.dailyDate)
      .where(sql`${table.deletedAt} is null`),
    index('notes_user_updated_idx').on(table.userId, table.updatedAt),
    index('notes_user_folder_idx').on(table.userId, table.folderId),
    ownRowsPolicy('notes', table.userId),
  ],
).enableRLS();

/**
 * A note template (memo D3, D11), stage N3. A plain table, not an entity, so templates never show up
 * in links, search or the graph. At most one live template per user is the daily default.
 */
export const noteTemplates = pgTable(
  'note_templates',
  {
    ...baseColumns(),
    name: text('name').notNull(),
    contentMd: text('content_md').notNull().default(''),
    isDailyDefault: boolean('is_daily_default').notNull().default(false),
    ...deletedAtColumn(),
  },
  (table) => [
    uniqueIndex('note_templates_user_name_idx')
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex('note_templates_daily_default_idx')
      .on(table.userId)
      .where(sql`${table.isDailyDefault} and ${table.deletedAt} is null`),
    index('note_templates_user_id_idx').on(table.userId),
    ownRowsPolicy('note_templates', table.userId),
  ],
).enableRLS();

/**
 * A saved version of a note (memo D3, D13), stage N4: the title and text as they were at a moment.
 * Rows are only added and deleted (the newest 50 per note are kept), never changed or soft-deleted,
 * so there are no updated_at and deleted_at columns. They go with the note when it is purged.
 * Not shown live, so the table is not in REALTIME_TABLES.
 */
export const noteVersions = pgTable(
  'note_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id').notNull(),
    title: text('title').notNull(),
    contentMd: text('content_md').notNull(),
    /** `auto` (start of an editing session), `before_restore`, or `conflict` (their text, before "Keep mine"). */
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'note_versions_note_fk',
      columns: [table.noteId, table.userId],
      foreignColumns: [notes.id, notes.userId],
    }).onDelete('cascade'),
    check(
      'note_versions_reason_check',
      sql`${table.reason} in ('auto', 'before_restore', 'conflict')`,
    ),
    index('note_versions_note_created_idx').on(table.noteId, table.createdAt.desc()),
    ownRowsPolicy('note_versions', table.userId),
  ],
).enableRLS();

export type NoteRow = typeof notes.$inferSelect;
export type NoteVersionRow = typeof noteVersions.$inferSelect;
export type NoteTemplateRow = typeof noteTemplates.$inferSelect;
export type NoteFolderRow = typeof noteFolders.$inferSelect;
