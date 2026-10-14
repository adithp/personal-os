import { noteTemplates, type NoteTemplateRow } from '@personal-os/db';
import {
  NOTE_TEMPLATE_NAME_MAX,
  noteTemplateActions,
  type NoteTemplate,
  type UndoDescriptor,
} from '@personal-os/shared';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';
import { isUniqueViolation } from './tags';

/**
 * Note templates (docs/design/research/notes.md D3, D11), stage N3. Names are unique among live
 * templates ignoring case (409 template_name_taken). At most one live template is the daily
 * default: setting it clears the flag on the others in the same transaction. Delete is a soft
 * delete and restore is its undo (a restore never steals the daily default and a name taken
 * meanwhile gets " (2)"). Template text is stored as written; variables are filled in when a note
 * is created from it.
 */

const NAME_INDEX = 'note_templates_user_name_idx';
const DEFAULT_INDEX = 'note_templates_daily_default_idx';

const iso = (date: Date) => date.toISOString();

const notFound = () => new HttpError(404, 'not_found', 'Template not found');
const nameTaken = () =>
  new HttpError(409, 'template_name_taken', 'A template with this name already exists.');

const toTemplate = (row: NoteTemplateRow): NoteTemplate => ({
  id: row.id,
  name: row.name,
  contentMd: row.contentMd,
  isDailyDefault: row.isDailyDefault,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

async function findTemplate(
  scope: UserScope,
  id: string,
  includeDeleted = false,
): Promise<NoteTemplateRow> {
  const [row] = await scope.select(noteTemplates, {
    where: includeDeleted
      ? eq(noteTemplates.id, id)
      : and(eq(noteTemplates.id, id), scope.isLive(noteTemplates)),
    limit: 1,
  });
  if (!row) throw notFound();
  return row;
}

async function isNameTaken(scope: UserScope, name: string, exceptId?: string): Promise<boolean> {
  const rows = await scope.selectFields(
    noteTemplates,
    { id: noteTemplates.id },
    {
      where: and(
        scope.isLive(noteTemplates),
        sql`lower(${noteTemplates.name}) = lower(${name})`,
        exceptId ? ne(noteTemplates.id, exceptId) : undefined,
      ),
      limit: 1,
    },
  );
  return rows.length > 0;
}

/** Takes the daily-default flag away from every other live template. */
async function clearOtherDefaults(scope: UserScope, exceptId?: string): Promise<void> {
  await scope.update(
    noteTemplates,
    { isDailyDefault: false },
    sql`${scope.isLive(noteTemplates)} and ${eq(noteTemplates.isDailyDefault, true)} and ${
      exceptId ? ne(noteTemplates.id, exceptId) : sql`true`
    }`,
  );
}

/** Serialises the writes of one user and turns an index violation (a race) into the right error. */
async function guarded<T>(scope: UserScope, work: () => Promise<T>): Promise<T> {
  return withUserLock('note-templates', scope.userId, async () => {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error, NAME_INDEX)) throw nameTaken();
      if (isUniqueViolation(error, DEFAULT_INDEX)) {
        throw new HttpError(409, 'conflict', 'The daily template changed. Try again.');
      }
      throw error;
    }
  });
}

export const noteTemplateImplementations = [
  implement(noteTemplateActions.list, async ({ scope }) => {
    const rows = await scope.select(noteTemplates, {
      where: scope.isLive(noteTemplates),
      orderBy: [asc(sql`lower(${noteTemplates.name})`), asc(noteTemplates.id)],
    });
    return { data: rows.map(toTemplate) };
  }),

  implement(noteTemplateActions.create, ({ scope }, input) =>
    guarded(scope, () =>
      scope.transaction(async (tx) => {
        if (await isNameTaken(tx, input.name)) throw nameTaken();
        if (input.isDailyDefault) await clearOtherDefaults(tx);
        const [created] = await tx.insert(noteTemplates, {
          name: input.name,
          contentMd: input.contentMd,
          isDailyDefault: input.isDailyDefault,
        });
        if (!created) throw new Error('Could not create the template');
        return {
          data: toTemplate(created),
          undo: {
            action: 'noteTemplates.delete',
            input: { id: created.id },
          } satisfies UndoDescriptor,
        };
      }),
    ),
  ),

  implement(noteTemplateActions.update, ({ scope }, input) =>
    guarded(scope, () =>
      scope.transaction(async (tx) => {
        const before = await findTemplate(tx, input.id);
        const values: Partial<typeof noteTemplates.$inferInsert> = {};
        const undoInput: Record<string, unknown> = {};
        if (input.name !== undefined && input.name !== before.name) {
          if (await isNameTaken(tx, input.name, input.id)) throw nameTaken();
          values.name = input.name;
          undoInput.name = before.name;
        }
        if (input.contentMd !== undefined && input.contentMd !== before.contentMd) {
          values.contentMd = input.contentMd;
          undoInput.contentMd = before.contentMd;
        }
        if (input.isDailyDefault !== undefined && input.isDailyDefault !== before.isDailyDefault) {
          if (input.isDailyDefault) await clearOtherDefaults(tx, input.id);
          values.isDailyDefault = input.isDailyDefault;
          undoInput.isDailyDefault = before.isDailyDefault;
        }
        if (Object.keys(values).length === 0) return { data: toTemplate(before), undo: null };
        const [updated] = await tx.update(
          noteTemplates,
          { ...values, updatedAt: new Date() },
          sql`${eq(noteTemplates.id, input.id)} and ${tx.isLive(noteTemplates)}`,
        );
        if (!updated) throw notFound();
        return {
          data: toTemplate(updated),
          undo: {
            action: 'noteTemplates.update',
            input: { id: input.id, ...undoInput },
          } satisfies UndoDescriptor,
        };
      }),
    ),
  ),

  implement(noteTemplateActions.delete, ({ scope }, { id }) =>
    guarded(scope, async () => {
      await findTemplate(scope, id);
      const [deleted] = await scope.softDelete(noteTemplates, eq(noteTemplates.id, id));
      if (!deleted) throw notFound();
      return {
        data: toTemplate(deleted),
        undo: { action: 'noteTemplates.restore', input: { id } } satisfies UndoDescriptor,
      };
    }),
  ),

  implement(noteTemplateActions.restore, ({ scope }, { id }) =>
    guarded(scope, () =>
      scope.transaction(async (tx) => {
        const current = await findTemplate(tx, id, true);
        if (!current.deletedAt) return { data: toTemplate(current), undo: null };
        let name = current.name;
        for (let n = 2; await isNameTaken(tx, name, id); n += 1) {
          const suffix = ` (${String(n)})`;
          name = `${current.name.slice(0, NOTE_TEMPLATE_NAME_MAX - suffix.length)}${suffix}`;
        }
        // Another template may have become the daily default while this one was deleted
        let isDailyDefault = current.isDailyDefault;
        if (isDailyDefault) {
          const others = await tx.selectFields(
            noteTemplates,
            { id: noteTemplates.id },
            {
              where: and(
                tx.isLive(noteTemplates),
                eq(noteTemplates.isDailyDefault, true),
                ne(noteTemplates.id, id),
              ),
              limit: 1,
            },
          );
          if (others.length > 0) isDailyDefault = false;
        }
        const [restored] = await tx.update(
          noteTemplates,
          { deletedAt: null, name, isDailyDefault, updatedAt: new Date() },
          eq(noteTemplates.id, id),
        );
        if (!restored) throw notFound();
        return {
          data: toTemplate(restored),
          undo: { action: 'noteTemplates.delete', input: { id } } satisfies UndoDescriptor,
        };
      }),
    ),
  ),
];
