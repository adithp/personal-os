import { z } from 'zod';
import { defineAction } from './actions';

/**
 * Notes, stage N1 (research memo docs/design/research/notes.md D3, D7, D14, D15, D18, section 4).
 * A note is an entity (type `note`) with a row in notes; its text is Markdown (`contentMd`). Titles
 * are unique per user ignoring case and cannot contain `[`, `]`, `|` or `#` (they would break link
 * syntax). Folders are a plain table, up to 3 levels deep.
 */
export const NOTE_TITLE_MAX = 200;
export const NOTE_CONTENT_MAX = 200_000;
export const FOLDER_NAME_MAX = 80;
export const FOLDER_DEPTH_MAX = 3;
export const NOTE_EXCERPT_MAX = 140;
export const NOTE_LIST_LIMIT_DEFAULT = 500;
export const NOTE_LIST_LIMIT_MAX = 1000;

export const NOTE_SORTS = ['updated', 'title', 'created'] as const;
export type NoteSort = (typeof NOTE_SORTS)[number];
export const noteSortSchema = z.enum(NOTE_SORTS);

const isoTime = z.iso.datetime({ offset: true });
const id = z.uuid();

/** A note title: trimmed, 1 to 200 characters, none of `[ ] | #`. */
export const noteTitleSchema = z
  .string()
  .trim()
  .min(1, 'Add a title')
  .max(NOTE_TITLE_MAX)
  .refine((title) => !/[[\]|#]/.test(title), 'A title cannot contain [ ] | or #');

const folderName = z
  .string()
  .trim()
  .min(1, 'Add a name')
  .max(FOLDER_NAME_MAX)
  .refine((name) => !/[/\\]/.test(name), 'A folder name cannot contain / or \\');

/** A note in the list: no text, only a short excerpt (memo D19). */
export const noteSummarySchema = z.object({
  id,
  title: z.string(),
  folderId: id.nullable(),
  pinned: z.boolean(),
  excerpt: z.string(),
  /** Names of the tags written in the text (`#tag`), N3. Missing means not filled in. */
  tagNames: z.array(z.string()).optional(),
  /** The India day (YYYY-MM-DD) of a daily note, N3. Missing or null for a normal note. */
  dailyDate: z.string().nullable().optional(),
  createdAt: isoTime,
  updatedAt: isoTime,
  deletedAt: isoTime.nullable(),
});
export type NoteSummary = z.infer<typeof noteSummarySchema>;

/** One note with its Markdown text and the revision used to detect edits from elsewhere. */
export const noteSchema = noteSummarySchema.extend({
  contentMd: z.string(),
  revision: z.number().int().min(1),
});
export type Note = z.infer<typeof noteSchema>;

export const noteFolderSchema = z.object({
  id,
  name: z.string(),
  parentId: id.nullable(),
  /** Live notes directly in this folder. */
  noteCount: z.number().int().min(0),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type NoteFolder = z.infer<typeof noteFolderSchema>;

// ---- inputs ----
export const listNotesInput = z.object({
  /** A folder id, or 'none' for notes in no folder. Omit for all notes. */
  folderId: z.union([id, z.literal('none')]).optional(),
  /** Only notes whose text has this tag (N3). */
  tagId: id.optional(),
  /** Only daily notes, newest day first (N3). */
  dailyOnly: z.union([z.boolean(), z.stringbool()]).optional(),
  /** Only trashed notes. */
  trash: z.union([z.boolean(), z.stringbool()]).default(false),
  sort: noteSortSchema.default('updated'),
  limit: z.coerce.number().int().min(1).max(NOTE_LIST_LIMIT_MAX).default(NOTE_LIST_LIMIT_DEFAULT),
  offset: z.coerce.number().int().min(0).default(0),
});
/** What the app sends: the schema also reads query strings, so its own input type is unknown. */
export interface ListNotesInput {
  folderId?: string;
  tagId?: string;
  dailyOnly?: boolean;
  trash?: boolean;
  sort?: NoteSort;
  limit?: number;
  offset?: number;
}

export const noteIdInput = z.object({ id });

export const createNoteInput = z.object({
  /** Omit for "Untitled", "Untitled 2", ... */
  title: noteTitleSchema.optional(),
  folderId: id.nullable().optional(),
  contentMd: z.string().max(NOTE_CONTENT_MAX).optional(),
  /** Start from this template (N3): {{title}}, {{date}} and {{time}} are filled in. Ignored when `contentMd` is given. */
  templateId: id.optional(),
});
export type CreateNoteInput = z.input<typeof createNoteInput>;

/** Content, folder or pin changes. `baseRevision` must match the stored revision unless `force`. */
export const updateNoteInput = z
  .object({
    id,
    baseRevision: z.number().int().min(1),
    contentMd: z.string().max(NOTE_CONTENT_MAX).optional(),
    folderId: id.nullable().optional(),
    pinned: z.boolean().optional(),
    /** "Keep mine": skips the revision check. */
    force: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.contentMd !== undefined || input.folderId !== undefined || input.pinned !== undefined,
    'Nothing to change',
  );
export type UpdateNoteInput = z.input<typeof updateNoteInput>;

export const renameNoteInput = z.object({ id, title: noteTitleSchema });

export const createFolderInput = z.object({ name: folderName, parentId: id.nullable().optional() });
export const updateFolderInput = z
  .object({ id, name: folderName.optional(), parentId: id.nullable().optional() })
  .refine((input) => input.name !== undefined || input.parentId !== undefined, 'Nothing to change');
export const folderIdInput = z.object({ id });

export const noteActions = {
  list: defineAction({
    name: 'notes.list',
    description:
      'List notes (newest edited first by default), optionally of one folder or the trash.',
    permission: 'read',
    input: listNotesInput,
  }),
  get: defineAction({
    name: 'notes.get',
    description: 'Get one note with its Markdown text and revision.',
    permission: 'read',
    input: noteIdInput,
  }),
  create: defineAction({
    name: 'notes.create',
    description: 'Create a note (title optional, default Untitled) in a folder.',
    permission: 'write',
    input: createNoteInput,
  }),
  update: defineAction({
    name: 'notes.update',
    description: 'Change the text, folder or pin of a note. Needs the revision you last saw.',
    permission: 'write',
    input: updateNoteInput,
  }),
  rename: defineAction({
    name: 'notes.rename',
    description: 'Rename a note (titles are unique, ignoring case).',
    permission: 'write',
    input: renameNoteInput,
  }),
  delete: defineAction({
    name: 'notes.delete',
    description: 'Move a note to the trash.',
    permission: 'destructive',
    input: noteIdInput,
  }),
  restore: defineAction({
    name: 'notes.restore',
    description: 'Bring a note back from the trash.',
    permission: 'write',
    input: noteIdInput,
  }),
  purge: defineAction({
    name: 'notes.purge',
    description: 'Delete a trashed note for good. Cannot be undone.',
    permission: 'destructive',
    input: noteIdInput,
  }),
  emptyTrash: defineAction({
    name: 'notes.emptyTrash',
    description: 'Delete every trashed note for good. Cannot be undone.',
    permission: 'destructive',
    input: z.object({}),
  }),
} as const;

export const noteFolderActions = {
  list: defineAction({
    name: 'noteFolders.list',
    description: 'List note folders with the number of notes in each.',
    permission: 'read',
    input: z.object({}),
  }),
  create: defineAction({
    name: 'noteFolders.create',
    description: 'Create a note folder (up to 3 levels deep).',
    permission: 'write',
    input: createFolderInput,
  }),
  update: defineAction({
    name: 'noteFolders.update',
    description: 'Rename a folder or move it into another folder.',
    permission: 'write',
    input: updateFolderInput,
  }),
  delete: defineAction({
    name: 'noteFolders.delete',
    description: 'Delete an empty folder.',
    permission: 'destructive',
    input: folderIdInput,
  }),
  restore: defineAction({
    name: 'noteFolders.restore',
    description: 'Bring a deleted folder back.',
    permission: 'write',
    input: folderIdInput,
  }),
} as const;

// ---- stage N2: links (memo notes.md D6, D8, D9, D18) ----

/** One live note for the `[[` autocomplete: id and title only. */
export const noteTitleItemSchema = z.object({ id, title: z.string() });
export type NoteTitle = z.infer<typeof noteTitleItemSchema>;

export const noteLinksSchema = z.object({
  /** Live notes that link here, with the text around the first link (cut to 160 characters). */
  backlinks: z.array(z.object({ noteId: id, title: z.string(), context: z.string() })),
  /** Links in this note; `noteId` is null when no live note has that title. */
  outgoing: z.array(z.object({ target: z.string(), noteId: id.nullable() })),
});
export type NoteLinks = z.infer<typeof noteLinksSchema>;

export const NOTE_CONTEXT_MAX = 160;

/** The answer of notes.rename: the note plus the ids of other notes whose [[links]] were rewritten. */
export const renamedNoteSchema = noteSchema.extend({ updatedNoteIds: z.array(id) });
export type RenamedNote = z.infer<typeof renamedNoteSchema>;

// ---- stage N3: templates and daily notes (memo notes.md D11, D12, D18) ----

export const NOTE_TEMPLATE_NAME_MAX = 80;

const templateName = z.string().trim().min(1, 'Add a name').max(NOTE_TEMPLATE_NAME_MAX);
const templateContent = z.string().max(NOTE_CONTENT_MAX);

/** A note template. Names are unique among live templates, ignoring case; at most one is the daily default. */
export const noteTemplateSchema = z.object({
  id,
  name: z.string(),
  contentMd: z.string(),
  isDailyDefault: z.boolean(),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type NoteTemplate = z.infer<typeof noteTemplateSchema>;

export const createNoteTemplateInput = z.object({
  name: templateName,
  contentMd: templateContent.default(''),
  /** Setting it clears the flag on every other template. */
  isDailyDefault: z.boolean().default(false),
});
export type CreateNoteTemplateInput = z.input<typeof createNoteTemplateInput>;

export const updateNoteTemplateInput = z
  .object({
    id,
    name: templateName.optional(),
    contentMd: templateContent.optional(),
    isDailyDefault: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.contentMd !== undefined ||
      input.isDailyDefault !== undefined,
    'Nothing to change',
  );
export type UpdateNoteTemplateInput = z.input<typeof updateNoteTemplateInput>;

export const noteTemplateIdInput = z.object({ id });

/** A calendar day written YYYY-MM-DD that exists (2026-02-30 does not). */
export const dailyDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Not a real date');

/** `date` is an India calendar day; missing means today in India. */
export const openDailyInput = z.object({ date: dailyDateSchema.optional() });
export type OpenDailyInput = z.input<typeof openDailyInput>;

export const noteTemplateActions = {
  list: defineAction({
    name: 'noteTemplates.list',
    description: 'List note templates (name order).',
    permission: 'read',
    input: z.object({}),
  }),
  create: defineAction({
    name: 'noteTemplates.create',
    description: 'Create a note template; {{title}}, {{date}} and {{time}} are filled in later.',
    permission: 'write',
    input: createNoteTemplateInput,
  }),
  update: defineAction({
    name: 'noteTemplates.update',
    description: 'Rename a template, change its text, or mark it as the one for daily notes.',
    permission: 'write',
    input: updateNoteTemplateInput,
  }),
  delete: defineAction({
    name: 'noteTemplates.delete',
    description: 'Delete a note template (can be undone).',
    permission: 'write',
    input: noteTemplateIdInput,
  }),
  restore: defineAction({
    name: 'noteTemplates.restore',
    description: 'Bring a deleted note template back.',
    permission: 'write',
    input: noteTemplateIdInput,
  }),
} as const;

export const noteDailyActions = {
  openDaily: defineAction({
    name: 'notes.openDaily',
    description:
      'Open the daily note of a day (default today, India time); creates it from the daily template when missing.',
    permission: 'write',
    input: openDailyInput,
  }),
} as const;

export const noteLinkActions = {
  titles: defineAction({
    name: 'notes.titles',
    description: 'List the id and title of every live note (for link suggestions).',
    permission: 'read',
    input: z.object({}),
  }),
  links: defineAction({
    name: 'notes.links',
    description: 'Backlinks and outgoing links of a note.',
    permission: 'read',
    input: noteIdInput,
  }),
} as const;
