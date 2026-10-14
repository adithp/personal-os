import { entities, noteFolders, notes, type NoteRow } from '@personal-os/db';
import {
  NOTE_TITLE_MAX,
  excerptOf,
  markdownToPlainText,
  noteActions,
  type Note,
  type NoteSummary,
  type UndoDescriptor,
} from '@personal-os/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import { rebuildNoteLinks, reresolveLinksTo, rewriteLinksOnRename } from './note-links';
import { rebuildNoteTags } from './note-tags';
import { maybeSnapshot } from './note-versions';
import { implement } from './registry';
import { isUniqueViolation } from './tags';

/**
 * Notes, stage N1 (docs/design/research/notes.md D3, D7, D9, D14, D15, D18). A note is an entity of
 * type `note` (inserted first) plus a row in `notes` with the same id. Titles are unique among live
 * notes ignoring case (409 note_title_taken). `revision` goes up by 1 on every content or title
 * change; notes.update only writes when the caller's baseRevision still matches (409 note_conflict),
 * unless `force`. Delete moves a note and its entity to the trash (soft delete); purge and
 * emptyTrash hard-delete the entity, which cascades to the note, links and tags.
 * The link, tag and version work is done by the hooks in note-links.ts, note-tags.ts and
 * note-versions.ts (later stages fill them in).
 */

const NOTE_TITLE_INDEX = 'notes_user_title_idx';
const DEFAULT_TITLE = 'Untitled';
const BATCH = 1000;

const iso = (date: Date) => date.toISOString();

const notFound = () => new HttpError(404, 'not_found', 'Note not found');
const folderNotFound = () => new HttpError(404, 'not_found', 'Folder not found');
const titleTaken = () =>
  new HttpError(409, 'note_title_taken', 'A note with this title already exists.');
const conflict = () =>
  new HttpError(409, 'note_conflict', 'This note was changed on another device.');

function toSummary(row: NoteRow): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    folderId: row.folderId,
    pinned: row.pinned,
    excerpt: excerptOf(row.contentText),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: row.deletedAt ? iso(row.deletedAt) : null,
  };
}

const toNote = (row: NoteRow): Note => ({
  ...toSummary(row),
  contentMd: row.contentMd,
  revision: row.revision,
});

/** A note of this user: live, or (with includeDeleted) trashed too. */
async function findNote(scope: UserScope, id: string, includeDeleted = false): Promise<NoteRow> {
  const [row] = await scope.select(notes, {
    where: includeDeleted ? eq(notes.id, id) : and(eq(notes.id, id), scope.isLive(notes)),
    limit: 1,
  });
  if (!row) throw notFound();
  return row;
}

/** The folder must be one of this user's live folders (another user's folder is a 404). */
async function assertFolder(scope: UserScope, folderId: string): Promise<void> {
  const [folder] = await scope.select(noteFolders, {
    where: and(eq(noteFolders.id, folderId), scope.isLive(noteFolders)),
    limit: 1,
  });
  if (!folder) throw folderNotFound();
}

/** Is this title used by another live note (ignoring case)? */
async function isTitleTaken(scope: UserScope, title: string, exceptId?: string): Promise<boolean> {
  const rows = await scope.selectFields(
    notes,
    { id: notes.id },
    {
      where: and(
        scope.isLive(notes),
        sql`lower(${notes.title}) = lower(${title})`,
        exceptId ? ne(notes.id, exceptId) : undefined,
      ),
      limit: 1,
    },
  );
  return rows.length > 0;
}

/** "Untitled", then "Untitled 2", "Untitled 3", ... the first one no live note has. */
async function defaultTitle(scope: UserScope): Promise<string> {
  const rows = await scope.selectFields(
    notes,
    { title: notes.title },
    { where: and(scope.isLive(notes), sql`lower(${notes.title}) like 'untitled%'`) },
  );
  const used = new Set(rows.map((row) => String(row.title).toLowerCase()));
  if (!used.has(DEFAULT_TITLE.toLowerCase())) return DEFAULT_TITLE;
  for (let n = 2; ; n += 1) {
    const candidate = `${DEFAULT_TITLE} ${String(n)}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** Runs a write and turns a title-index violation (a race with another save) into a 409. */
async function titleGuard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error, NOTE_TITLE_INDEX)) throw titleTaken();
    throw error;
  }
}

/** `revision + 1` computed by the database, so two writes never get the same number. */
const nextRevision = () => sql`${notes.revision} + 1` as unknown as number;

/** Takes the notes queue of the user when a note is put into a folder (see noteFolders.delete). */
function withFolderLock<T>(
  scope: UserScope,
  folderId: string | null | undefined,
  work: () => Promise<T>,
): Promise<T> {
  return folderId ? withUserLock('notes', scope.userId, work) : work();
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    parts.push(items.slice(index, index + size));
  return parts;
}

/** Hard-deletes the entities (and so the notes, links and tags) of these trashed notes. */
export async function purgeIds(scope: UserScope, ids: readonly string[]): Promise<void> {
  for (const batch of chunk(ids, BATCH)) {
    await scope.delete(
      entities,
      sql`${eq(entities.type, 'note')} and ${inArray(entities.id, batch)} and ${isNotNull(entities.deletedAt)}`,
    );
  }
}

const SORTS = {
  updated: [desc(notes.updatedAt), asc(notes.id)],
  created: [desc(notes.createdAt), asc(notes.id)],
  title: [asc(sql`lower(${notes.title})`), asc(notes.id)],
} as const;

export const noteImplementations = [
  implement(noteActions.list, async ({ scope }, input) => {
    const rows = await scope.selectFields(
      notes,
      {
        id: notes.id,
        title: notes.title,
        folderId: notes.folderId,
        pinned: notes.pinned,
        contentText: notes.contentText,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        deletedAt: notes.deletedAt,
      },
      {
        where: and(
          input.trash ? isNotNull(notes.deletedAt) : isNull(notes.deletedAt),
          input.folderId === 'none'
            ? isNull(notes.folderId)
            : input.folderId
              ? eq(notes.folderId, input.folderId)
              : undefined,
        ),
        orderBy: [desc(notes.pinned), ...SORTS[input.sort]],
        limit: input.limit,
        offset: input.offset,
      },
    );
    return {
      data: rows.map((row): NoteSummary => ({
        id: row.id as string,
        title: row.title as string,
        folderId: row.folderId as string | null,
        pinned: row.pinned as boolean,
        excerpt: excerptOf(row.contentText as string),
        createdAt: iso(row.createdAt as Date),
        updatedAt: iso(row.updatedAt as Date),
        deletedAt: row.deletedAt ? iso(row.deletedAt as Date) : null,
      })),
    };
  }),

  // A trashed note can be read too (the Trash view shows it); only update and rename need it live
  implement(noteActions.get, async ({ scope }, { id }) => ({
    data: toNote(await findNote(scope, id, true)),
  })),

  implement(noteActions.create, ({ scope }, input) =>
    // The queue per user keeps two "Untitled" creates from choosing the same default title
    withUserLock('notes', scope.userId, async () => {
      const row = await titleGuard(() =>
        scope.transaction(async (tx) => {
          if (input.folderId) await assertFolder(tx, input.folderId);
          const title = input.title ?? (await defaultTitle(tx));
          if (input.title && (await isTitleTaken(tx, title))) throw titleTaken();
          const contentMd = input.contentMd ?? '';
          const [entity] = await tx.insert(entities, { type: 'note', title });
          if (!entity) throw new Error('Could not create the note');
          const [created] = await tx.insert(notes, {
            id: entity.id,
            title,
            contentMd,
            contentText: markdownToPlainText(contentMd),
            folderId: input.folderId ?? null,
          });
          if (!created) throw new Error('Could not create the note');
          if (contentMd) {
            await rebuildNoteLinks(tx, created.id, contentMd);
            await rebuildNoteTags(tx, created.id, contentMd);
          }
          await reresolveLinksTo(tx, title);
          return created;
        }),
      );
      return {
        data: toNote(row),
        undo: { action: 'notes.delete', input: { id: row.id } } satisfies UndoDescriptor,
      };
    }),
  ),

  implement(noteActions.update, ({ scope }, input) =>
    // A move into a folder takes the same queue as noteFolders.delete, so the folder cannot be
    // deleted between the check and the write
    withFolderLock(scope, input.folderId, () =>
      scope.transaction(async (tx) => {
        const before = await findNote(tx, input.id);
        // Only a content change is checked against baseRevision; a pin or a move never conflicts
        const checkRevision = input.contentMd !== undefined && !input.force;
        if (checkRevision && before.revision !== input.baseRevision) throw conflict();

        const values: Partial<typeof notes.$inferInsert> = {};
        const undoInput: Record<string, unknown> = {};
        const contentChanged =
          input.contentMd !== undefined && input.contentMd !== before.contentMd;
        if (input.contentMd !== undefined && contentChanged) {
          values.contentMd = input.contentMd;
          values.contentText = markdownToPlainText(input.contentMd);
          values.revision = nextRevision();
          undoInput.contentMd = before.contentMd;
        }
        if (input.folderId !== undefined && input.folderId !== before.folderId) {
          if (input.folderId) await assertFolder(tx, input.folderId);
          values.folderId = input.folderId;
          undoInput.folderId = before.folderId;
        }
        if (input.pinned !== undefined && input.pinned !== before.pinned) {
          values.pinned = input.pinned;
          undoInput.pinned = before.pinned;
        }
        if (Object.keys(values).length === 0) return { data: toNote(before), undo: null };

        if (contentChanged) await maybeSnapshot(tx, before, input.force ? 'conflict' : 'auto');
        // A content save only writes while the revision is still the one read (a save from another
        // device in between finds no row and is a conflict). With force, or without content, any revision.
        const [updated] = await tx.update(
          notes,
          values,
          checkRevision
            ? sql`${eq(notes.id, input.id)} and ${scope.isLive(notes)} and ${eq(notes.revision, input.baseRevision)}`
            : sql`${eq(notes.id, input.id)} and ${scope.isLive(notes)}`,
        );
        if (!updated) throw conflict();
        if (contentChanged) {
          await rebuildNoteLinks(tx, input.id, updated.contentMd);
          await rebuildNoteTags(tx, input.id, updated.contentMd);
        }
        return {
          data: toNote(updated),
          undo: {
            action: 'notes.update',
            input: { id: input.id, baseRevision: updated.revision, ...undoInput },
          } satisfies UndoDescriptor,
        };
      }),
    ),
  ),

  implement(noteActions.rename, ({ scope }, { id, title }) =>
    titleGuard(() =>
      scope.transaction(async (tx) => {
        const before = await findNote(tx, id);
        if (before.title === title) return { data: toNote(before), undo: null };
        if (await isTitleTaken(tx, title, id)) throw titleTaken();
        const [updated] = await tx.update(
          notes,
          { title, revision: nextRevision() },
          eq(notes.id, id),
        );
        if (!updated) throw notFound();
        await tx.update(entities, { title }, eq(entities.id, id));
        const updatedNoteIds = await rewriteLinksOnRename(tx, id, before.title, title);
        return {
          data: { ...toNote(updated), updatedNoteIds },
          undo: {
            action: 'notes.rename',
            input: { id, title: before.title },
          } satisfies UndoDescriptor,
        };
      }),
    ),
  ),

  implement(noteActions.delete, async ({ scope }, { id }) => {
    const row = await scope.transaction(async (tx) => {
      const current = await findNote(tx, id);
      const [deleted] = await tx.softDelete(notes, eq(notes.id, id));
      await tx.softDelete(entities, eq(entities.id, id));
      if (!deleted) throw notFound();
      await reresolveLinksTo(tx, current.title);
      return deleted;
    });
    return {
      data: toNote(row),
      undo: { action: 'notes.restore', input: { id } } satisfies UndoDescriptor,
    };
  }),

  implement(noteActions.restore, ({ scope }, { id }) =>
    titleGuard(() =>
      scope.transaction(async (tx) => {
        const current = await findNote(tx, id, true);
        if (!current.deletedAt) return { data: toNote(current), undo: null };
        // A title taken meanwhile gets " (2)", " (3)", ...
        let title = current.title;
        for (let n = 2; await isTitleTaken(tx, title, id); n += 1) {
          const suffix = ` (${String(n)})`;
          title = `${current.title.slice(0, NOTE_TITLE_MAX - suffix.length)}${suffix}`;
        }
        // The folder may have been deleted while the note was in the trash
        let folderId = current.folderId;
        if (folderId) {
          const [folder] = await tx.select(noteFolders, {
            where: and(eq(noteFolders.id, folderId), tx.isLive(noteFolders)),
            limit: 1,
          });
          if (!folder) folderId = null;
        }
        const [restored] = await tx.update(
          notes,
          {
            deletedAt: null,
            title,
            folderId,
            ...(title === current.title ? {} : { revision: nextRevision() }),
          },
          eq(notes.id, id),
        );
        if (!restored) throw notFound();
        await tx.update(entities, { deletedAt: null, title }, eq(entities.id, id));
        await reresolveLinksTo(tx, title);
        return {
          data: toNote(restored),
          undo: { action: 'notes.delete', input: { id } } satisfies UndoDescriptor,
        };
      }),
    ),
  ),

  implement(noteActions.purge, ({ scope }, { id }) =>
    scope.transaction(async (tx) => {
      const current = await findNote(tx, id, true);
      if (!current.deletedAt) {
        throw new HttpError(400, 'validation_error', 'Move the note to the trash first.');
      }
      await purgeIds(tx, [id]);
      return { data: { id }, undo: null };
    }),
  ),

  implement(noteActions.emptyTrash, ({ scope }) =>
    scope.transaction(async (tx) => {
      const rows = await tx.selectFields(
        notes,
        { id: notes.id },
        { where: isNotNull(notes.deletedAt) },
      );
      const ids = rows.map((row) => row.id as string);
      await purgeIds(tx, ids);
      return { data: { deleted: ids.length }, undo: null };
    }),
  ),
];
