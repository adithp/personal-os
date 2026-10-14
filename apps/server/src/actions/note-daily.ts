import { entities, noteTemplates, notes, type NoteRow } from '@personal-os/db';
import {
  applyTemplate,
  excerptOf,
  indiaDay,
  markdownToPlainText,
  noteDailyActions,
  type Note,
  type UndoDescriptor,
} from '@personal-os/shared';
import { and, eq, sql } from 'drizzle-orm';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import { rebuildNoteLinks, reresolveLinksTo } from './note-links';
import { rebuildNoteTags, withTagRetry } from './note-tags';
import { implement } from './registry';
import { isUniqueViolation } from './tags';

/**
 * notes.openDaily (docs/design/research/notes.md D12), stage N3. `date` is an India calendar day
 * (default today). The live note with that `daily_date` is returned, else one is created: title
 * YYYY-MM-DD (YYYY-MM-DD (daily) when a normal note has that title), no folder, text from the daily
 * template. Undo is notes.delete when created, null when the note already existed. The queue of
 * the user (the same one notes.create uses) keeps two calls from creating two notes, and the unique
 * index on (user, daily_date) is the fallback.
 */

const DAILY_INDEX = 'notes_user_daily_date_idx';

const iso = (date: Date) => date.toISOString();

const toNote = (row: NoteRow): Note => ({
  id: row.id,
  title: row.title,
  folderId: row.folderId,
  pinned: row.pinned,
  excerpt: excerptOf(row.contentText),
  dailyDate: row.dailyDate,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  deletedAt: row.deletedAt ? iso(row.deletedAt) : null,
  contentMd: row.contentMd,
  revision: row.revision,
});

async function findDaily(scope: UserScope, date: string): Promise<NoteRow | undefined> {
  const [row] = await scope.select(notes, {
    where: and(eq(notes.dailyDate, date), scope.isLive(notes)),
    limit: 1,
  });
  return row;
}

async function titleTaken(scope: UserScope, title: string): Promise<boolean> {
  const rows = await scope.selectFields(
    notes,
    { id: notes.id },
    { where: and(scope.isLive(notes), sql`lower(${notes.title}) = lower(${title})`), limit: 1 },
  );
  return rows.length > 0;
}

/** YYYY-MM-DD, else "YYYY-MM-DD (daily)", then "(daily 2)", ... the first no live note has. */
async function dailyTitle(scope: UserScope, date: string): Promise<string> {
  if (!(await titleTaken(scope, date))) return date;
  let title = `${date} (daily)`;
  for (let n = 2; await titleTaken(scope, title); n += 1) title = `${date} (daily ${String(n)})`;
  return title;
}

async function createDaily(scope: UserScope, date: string, now: Date): Promise<NoteRow> {
  return withTagRetry(() =>
    scope.transaction(async (tx) => {
      const title = await dailyTitle(tx, date);
      const [template] = await tx.select(noteTemplates, {
        where: and(eq(noteTemplates.isDailyDefault, true), tx.isLive(noteTemplates)),
        limit: 1,
      });
      const contentMd = template ? applyTemplate(template.contentMd, { title, now, date }) : '';
      const [entity] = await tx.insert(entities, { type: 'note', title });
      if (!entity) throw new Error('Could not create the daily note');
      const [created] = await tx.insert(notes, {
        id: entity.id,
        title,
        contentMd,
        contentText: markdownToPlainText(contentMd),
        folderId: null,
        dailyDate: date,
      });
      if (!created) throw new Error('Could not create the daily note');
      if (contentMd) {
        await rebuildNoteLinks(tx, created.id, contentMd);
        await rebuildNoteTags(tx, created.id, contentMd);
      }
      await reresolveLinksTo(tx, title);
      return created;
    }),
  );
}

export const noteDailyImplementations = [
  implement(noteDailyActions.openDaily, ({ scope }, input) =>
    withUserLock('notes', scope.userId, async () => {
      const now = new Date();
      const date = input.date ?? indiaDay(now);
      const existing = await findDaily(scope, date);
      if (existing) return { data: toNote(existing), undo: null };
      try {
        const created = await createDaily(scope, date, now);
        return {
          data: toNote(created),
          undo: { action: 'notes.delete', input: { id: created.id } } satisfies UndoDescriptor,
        };
      } catch (error) {
        // Another server process made the note first: return that one
        if (!isUniqueViolation(error, DAILY_INDEX)) throw error;
        const winner = await findDaily(scope, date);
        if (!winner) throw error;
        return { data: toNote(winner), undo: null };
      }
    }),
  ),
];
