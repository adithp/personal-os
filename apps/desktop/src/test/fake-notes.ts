import {
  excerptOf as excerptOfText,
  FOLDER_DEPTH_MAX,
  markdownToPlainText,
  NOTE_CONTENT_MAX,
  NOTE_LIST_LIMIT_DEFAULT,
  noteTitleSchema,
  type Note,
  type NoteFolder,
  type UndoDescriptor,
} from '@personal-os/shared';
import { ApiError, type RequestOptions } from '../api/api-client';

let counter = 700_000;
const idFor = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A note with sensible defaults; ids look like real uuids. */
export function makeNote(overrides: Partial<Note> = {}): Note {
  counter += 1;
  const contentMd = overrides.contentMd ?? '';
  return {
    id: idFor(counter),
    title: `Note ${String(counter)}`,
    folderId: null,
    pinned: false,
    excerpt: excerptOf(contentMd),
    contentMd,
    revision: 1,
    createdAt: '2025-10-01T00:00:00.000Z',
    updatedAt: '2025-10-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

/** A folder with defaults. `noteCount` is worked out by the mock API. */
export function makeFolder(overrides: Partial<NoteFolder> = {}): NoteFolder {
  counter += 1;
  return {
    id: idFor(counter),
    name: `Folder ${String(counter)}`,
    parentId: null,
    noteCount: 0,
    createdAt: '2025-10-01T00:00:00.000Z',
    updatedAt: '2025-10-01T00:00:00.000Z',
    ...overrides,
  };
}

/** The same excerpt the server builds (plain text of the Markdown, cut at 140). */
const excerptOf = (markdown: string) => excerptOfText(markdownToPlainText(markdown));

const textOf = (value: unknown) => (typeof value === 'string' ? value : '');
const flag = (value: unknown) => value === true || value === 'true';

const FOLDER_NAME = /^[^/\\]{1,80}$/;

/** Returned for a route that is not a Notes route, so the caller keeps looking. */
export const NOT_NOTES = Symbol('not-a-notes-route');

/**
 * In-memory Notes and folders that follow the rules of the real routes (docs/design/research/
 * notes.md D3, D7, D14, D15, D18): titles unique ignoring case among live notes, revision checks
 * (409 note_conflict, skipped with `force`), soft delete to Trash, restore with " (2)" when the
 * title is taken, purge, folders up to 3 levels with unique names per parent, and only empty
 * folders can be deleted.
 */
export function createNotesFake(initialNotes: Note[] = [], initialFolders: NoteFolder[] = []) {
  const noteStore = new Map<string, Note>(initialNotes.map((note) => [note.id, note]));
  const folderStore = new Map<string, NoteFolder>(
    initialFolders.map((folder) => [folder.id, folder]),
  );
  const folderGone = new Set<string>();

  const liveNotes = () => [...noteStore.values()].filter((note) => note.deletedAt === null);
  const liveFolders = () => [...folderStore.values()].filter((f) => !folderGone.has(f.id));

  const missing = () => new ApiError(404, 'not_found', 'Note not found');
  const findLive = (id: string) => {
    const note = noteStore.get(id);
    if (note?.deletedAt !== null) throw missing();
    return note;
  };
  const findFolder = (id: string) => {
    const folder = folderStore.get(id);
    if (!folder || folderGone.has(id)) throw new ApiError(404, 'not_found', 'Folder not found');
    return folder;
  };

  const taken = (title: string, exceptId?: string) =>
    liveNotes().some(
      (note) => note.id !== exceptId && note.title.toLowerCase() === title.toLowerCase(),
    );
  const takenError = () => new ApiError(409, 'note_title_taken', 'A note with this title exists.');

  const checkContent = (raw: unknown) => {
    if (typeof raw === 'string' && raw.length > NOTE_CONTENT_MAX) {
      throw new ApiError(400, 'validation_error', 'The note is too long.');
    }
  };

  const checkTitle = (raw: unknown) => {
    const parsed = noteTitleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_error', parsed.error.issues[0]?.message ?? 'Bad title');
    }
    return parsed.data;
  };

  const summary = (note: Note) => {
    const { contentMd: _content, revision: _revision, ...rest } = note;
    return rest;
  };

  const folderView = (folder: NoteFolder): NoteFolder => ({
    ...folder,
    noteCount: liveNotes().filter((note) => note.folderId === folder.id).length,
  });

  const depthOf = (id: string | null): number => {
    let depth = 0;
    let at = id;
    while (at !== null) {
      depth += 1;
      at = folderStore.get(at)?.parentId ?? null;
    }
    return depth;
  };
  const childrenOf = (id: string) => liveFolders().filter((folder) => folder.parentId === id);
  const heightOf = (id: string): number =>
    1 + Math.max(0, ...childrenOf(id).map((child) => heightOf(child.id)));
  const isInside = (id: string, ancestor: string): boolean => {
    let at: string | null = id;
    while (at !== null) {
      if (at === ancestor) return true;
      at = folderStore.get(at)?.parentId ?? null;
    }
    return false;
  };

  const checkFolderName = (raw: unknown) => {
    const name = textOf(raw).trim();
    if (!FOLDER_NAME.test(name)) {
      throw new ApiError(400, 'validation_error', 'Add a name (no / or \\)');
    }
    return name;
  };
  const checkFolderPlace = (name: string, parentId: string | null, exceptId?: string) => {
    if (
      liveFolders().some(
        (folder) =>
          folder.id !== exceptId &&
          folder.parentId === parentId &&
          folder.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new ApiError(409, 'folder_name_taken', 'A folder with this name exists here.');
    }
  };

  const nextUntitled = () => {
    if (!taken('Untitled')) return 'Untitled';
    for (let n = 2; ; n += 1) if (!taken(`Untitled ${String(n)}`)) return `Untitled ${String(n)}`;
  };

  const createNote = (body: Record<string, unknown>) => {
    const title = body.title === undefined ? nextUntitled() : checkTitle(body.title);
    if (taken(title)) throw takenError();
    const folderId = typeof body.folderId === 'string' ? body.folderId : null;
    if (folderId !== null) findFolder(folderId);
    counter += 1;
    const now = new Date().toISOString();
    checkContent(body.contentMd);
    const contentMd = textOf(body.contentMd);
    const note: Note = {
      id: idFor(counter),
      title,
      folderId,
      pinned: false,
      contentMd,
      excerpt: excerptOf(contentMd),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    noteStore.set(note.id, note);
    return { item: note, undo: { action: 'notes.delete', input: { id: note.id } } };
  };

  const updateNote = (id: string, body: Record<string, unknown>) => {
    const current = findLive(id);
    if (body.contentMd === undefined && body.folderId === undefined && body.pinned === undefined) {
      throw new ApiError(400, 'validation_error', 'Nothing to change');
    }
    checkContent(body.contentMd);
    if (body.force !== true && body.baseRevision !== current.revision) {
      throw new ApiError(409, 'note_conflict', 'This note was changed on another device.');
    }
    const next: Note = { ...current };
    const previous: Record<string, unknown> = {};
    if (typeof body.contentMd === 'string' && body.contentMd !== current.contentMd) {
      next.contentMd = body.contentMd;
      next.excerpt = excerptOf(body.contentMd);
      next.revision = current.revision + 1;
    }
    if (body.folderId !== undefined) {
      const folderId = typeof body.folderId === 'string' ? body.folderId : null;
      if (folderId !== null) findFolder(folderId);
      if (folderId !== current.folderId) previous.folderId = current.folderId;
      next.folderId = folderId;
    }
    if (typeof body.pinned === 'boolean') {
      if (body.pinned !== current.pinned) previous.pinned = current.pinned;
      next.pinned = body.pinned;
    }
    next.updatedAt = new Date().toISOString();
    noteStore.set(id, next);
    const undo: UndoDescriptor | null =
      Object.keys(previous).length > 0
        ? { action: 'notes.update', input: { id, baseRevision: next.revision, ...previous } }
        : null;
    return { item: next, undo };
  };

  const renameNote = (id: string, body: Record<string, unknown>) => {
    const current = findLive(id);
    const title = checkTitle(body.title);
    if (title === current.title) return { item: current, undo: null, updatedNoteIds: [] };
    if (taken(title, id)) throw takenError();
    const next = {
      ...current,
      title,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    noteStore.set(id, next);
    return {
      item: next,
      undo: { action: 'notes.rename', input: { id, title: current.title } },
      updatedNoteIds: [],
    };
  };

  const deleteNote = (id: string) => {
    const current = findLive(id);
    const next = { ...current, deletedAt: new Date().toISOString() };
    noteStore.set(id, next);
    return { item: next, undo: { action: 'notes.restore', input: { id } } };
  };

  const restoreNote = (id: string) => {
    const current = noteStore.get(id);
    if (!current) throw missing();
    // Like the server: a note that is not in the trash is returned as it is
    if (!current.deletedAt) return { item: current, undo: null };
    let title = current.title;
    for (let n = 2; taken(title); n += 1) title = `${current.title} (${String(n)})`;
    const folderId =
      current.folderId !== null && folderGone.has(current.folderId) ? null : current.folderId;
    const next = {
      ...current,
      title,
      folderId,
      deletedAt: null,
      ...(title === current.title ? {} : { revision: current.revision + 1 }),
    };
    noteStore.set(id, next);
    return { item: next, undo: { action: 'notes.delete', input: { id } } };
  };

  const listNotes = (query: RequestOptions['query'] = {}) => {
    const trash = flag(query.trash);
    const folderId = query.folderId === undefined ? undefined : textOf(query.folderId);
    const sort = textOf(query.sort) || 'updated';
    const limit = query.limit === undefined ? NOTE_LIST_LIMIT_DEFAULT : Number(query.limit);
    const offset = query.offset === undefined ? 0 : Number(query.offset);
    return [...noteStore.values()]
      .filter((note) => (note.deletedAt !== null) === trash)
      .filter((note) => {
        if (folderId === undefined) return true;
        return folderId === 'none' ? note.folderId === null : note.folderId === folderId;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (sort === 'title') return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
        const key = sort === 'created' ? 'createdAt' : 'updatedAt';
        return b[key].localeCompare(a[key]);
      })
      .slice(offset, offset + limit)
      .map(summary);
  };

  const createFolder = (body: Record<string, unknown>) => {
    const name = checkFolderName(body.name);
    const parentId = typeof body.parentId === 'string' ? body.parentId : null;
    if (parentId !== null) findFolder(parentId);
    if (depthOf(parentId) + 1 > FOLDER_DEPTH_MAX) {
      throw new ApiError(400, 'folder_too_deep', 'Folders can be at most 3 levels deep.');
    }
    checkFolderPlace(name, parentId);
    counter += 1;
    const now = new Date().toISOString();
    const folder: NoteFolder = {
      id: idFor(counter),
      name,
      parentId,
      noteCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    folderStore.set(folder.id, folder);
    return {
      item: folderView(folder),
      undo: { action: 'noteFolders.delete', input: { id: folder.id } },
    };
  };

  const updateFolder = (id: string, body: Record<string, unknown>) => {
    const current = findFolder(id);
    if (body.name === undefined && body.parentId === undefined) {
      throw new ApiError(400, 'validation_error', 'Nothing to change');
    }
    const name = body.name === undefined ? current.name : checkFolderName(body.name);
    const parentId =
      body.parentId === undefined
        ? current.parentId
        : typeof body.parentId === 'string'
          ? body.parentId
          : null;
    if (parentId !== null) {
      findFolder(parentId);
      if (isInside(parentId, id)) {
        throw new ApiError(400, 'validation_error', 'A folder cannot go inside itself.');
      }
    }
    if (depthOf(parentId) + heightOf(id) > FOLDER_DEPTH_MAX) {
      throw new ApiError(400, 'folder_too_deep', 'Folders can be at most 3 levels deep.');
    }
    checkFolderPlace(name, parentId, id);
    const next = { ...current, name, parentId, updatedAt: new Date().toISOString() };
    folderStore.set(id, next);
    return {
      item: folderView(next),
      undo: {
        action: 'noteFolders.update',
        input: { id, name: current.name, parentId: current.parentId },
      },
    };
  };

  const deleteFolder = (id: string) => {
    const current = findFolder(id);
    const count = liveNotes().filter((note) => note.folderId === id).length;
    if (count > 0) {
      throw new ApiError(
        409,
        'folder_not_empty',
        `Move or delete the ${String(count)} ${count === 1 ? 'note' : 'notes'} in this folder first.`,
      );
    }
    if (childrenOf(id).length > 0) {
      throw new ApiError(409, 'folder_not_empty', 'Move or delete the folders inside first.');
    }
    folderGone.add(id);
    return { item: folderView(current), undo: { action: 'noteFolders.restore', input: { id } } };
  };

  const restoreFolder = (id: string) => {
    const current = folderStore.get(id);
    if (!current || !folderGone.has(id)) throw new ApiError(404, 'not_found', 'Folder not found');
    folderGone.delete(id);
    return { item: folderView(current), undo: { action: 'noteFolders.delete', input: { id } } };
  };

  /** Answers a Notes route, or NOT_NOTES when the path is not one. */
  const handle = (method: string, path: string, options: RequestOptions): unknown => {
    const body = (options.body ?? {}) as Record<string, unknown>;

    if (path === '/undo') {
      const { action, input } = body as { action?: string; input?: Record<string, unknown> };
      if (!action?.startsWith('notes.') && !action?.startsWith('noteFolders.')) return NOT_NOTES;
      const target = String(input?.id);
      switch (action) {
        case 'notes.delete':
          return { ...deleteNote(target), undo: null };
        case 'notes.restore':
          return { ...restoreNote(target), undo: null };
        case 'notes.update':
          return { ...updateNote(target, input ?? {}), undo: null };
        case 'notes.rename':
          return { ...renameNote(target, input ?? {}), undo: null };
        case 'noteFolders.delete':
          return { ...deleteFolder(target), undo: null };
        case 'noteFolders.restore':
          return { ...restoreFolder(target), undo: null };
        case 'noteFolders.update':
          return { ...updateFolder(target, input ?? {}), undo: null };
        default:
          throw new ApiError(404, 'not_found', 'Route not found');
      }
    }

    if (path === '/notes') {
      if (method === 'GET') return { items: listNotes(options.query) };
      if (method === 'POST') return createNote(body);
    }
    if (path === '/notes/trash' && method === 'DELETE') {
      const trashed = [...noteStore.values()].filter((note) => note.deletedAt !== null);
      for (const note of trashed) noteStore.delete(note.id);
      return { item: { deleted: trashed.length }, undo: null };
    }
    const noteRoute = /^\/notes\/([^/]+)(?:\/(rename|restore|forever))?$/.exec(path);
    if (noteRoute) {
      const [, id = '', verb] = noteRoute;
      // Trashed notes can be read too (the Trash view shows them)
      if (method === 'GET' && !verb) {
        const found = noteStore.get(id);
        if (!found) throw missing();
        return { item: found };
      }
      if (method === 'PATCH' && !verb) return updateNote(id, body);
      if (method === 'POST' && verb === 'rename') return renameNote(id, body);
      if (method === 'POST' && verb === 'restore') return restoreNote(id);
      if (method === 'DELETE' && !verb) return deleteNote(id);
      if (method === 'DELETE' && verb === 'forever') {
        const current = noteStore.get(id);
        if (!current) throw missing();
        if (current.deletedAt === null) {
          throw new ApiError(400, 'validation_error', 'Move the note to the trash first.');
        }
        noteStore.delete(id);
        return { item: { id }, undo: null };
      }
    }

    if (path === '/note-folders') {
      if (method === 'GET') return { items: liveFolders().map(folderView) };
      if (method === 'POST') return createFolder(body);
    }
    const folderRoute = /^\/note-folders\/([^/]+)(?:\/(restore))?$/.exec(path);
    if (folderRoute) {
      const [, id = '', verb] = folderRoute;
      if (method === 'PATCH' && !verb) return updateFolder(id, body);
      if (method === 'DELETE' && !verb) return deleteFolder(id);
      if (method === 'POST' && verb === 'restore') return restoreFolder(id);
    }
    return NOT_NOTES;
  };

  return {
    handle,
    /** Live notes (not in Trash), as stored (with text and revision). */
    notes: () => liveNotes(),
    /** Notes in Trash. */
    trashed: () => [...noteStore.values()].filter((note) => note.deletedAt !== null),
    /** Live folders, with their note counts. */
    folders: () => liveFolders().map(folderView),
  };
}

export type NotesFake = ReturnType<typeof createNotesFake>;
