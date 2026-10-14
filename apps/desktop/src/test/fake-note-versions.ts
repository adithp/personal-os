import {
  NOTE_SNAPSHOT_GAP_MINUTES,
  NOTE_VERSIONS_KEEP,
  wordsDelta,
  type NoteVersion,
  type NoteVersionReason,
  type NoteVersionSummary,
} from '@personal-os/shared';
import { ApiError, type RequestOptions } from '../api/api-client';
import type { NotesFake } from './fake-notes';

let counter = 900_000;
const idFor = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** A stored version (newest data model: summary fields are worked out when listing). */
export function makeVersion(
  overrides: Partial<Omit<NoteVersion, 'wordsDelta' | 'words'>> = {},
): Omit<NoteVersion, 'wordsDelta' | 'words'> {
  counter += 1;
  return {
    id: idFor(counter),
    createdAt: '2025-10-01T00:00:00.000Z',
    reason: 'auto',
    title: 'Note',
    contentMd: '',
    ...overrides,
  };
}

type Stored = Omit<NoteVersion, 'wordsDelta' | 'words'>;

const notFound = () => new ApiError(404, 'not_found', 'Version not found');

/**
 * In-memory note versions that follow the N4 routes: a save stores the text as it was before it
 * when the newest version is older than 10 minutes (of fake time) or there is none, never an empty
 * or equal text; a restore stores the current text first (`before_restore`) and its undo restores
 * that version; a forced save over a newer revision stores the server's text as `conflict`; only
 * the newest 50 are kept. It sits in front of the Notes fake and passes everything else on.
 */
export function createNoteVersionsFake(
  notesFake: NotesFake,
  inner: (method: string, path: string, options: RequestOptions) => unknown,
) {
  /** Note id -> its versions, oldest first. */
  const store = new Map<string, Stored[]>();

  const versionsOf = (noteId: string) => store.get(noteId) ?? [];
  const known = (noteId: string) =>
    [...notesFake.notes(), ...notesFake.trashed()].find((note) => note.id === noteId);

  const add = (noteId: string, version: Stored) => {
    const next = [...versionsOf(noteId), version];
    store.set(noteId, next.slice(-NOTE_VERSIONS_KEEP));
  };

  const summaries = (noteId: string): NoteVersionSummary[] => {
    const all = versionsOf(noteId);
    return all
      .map((version, index) => ({
        id: version.id,
        createdAt: version.createdAt,
        reason: version.reason,
        words: countWords(version.contentMd),
        wordsDelta: wordsDelta(all[index - 1]?.contentMd ?? '', version.contentMd),
      }))
      .reverse();
  };

  const full = (noteId: string, versionId: string): NoteVersion => {
    const all = versionsOf(noteId);
    const index = all.findIndex((version) => version.id === versionId);
    const found = all[index];
    if (!found) throw notFound();
    return {
      ...found,
      words: countWords(found.contentMd),
      wordsDelta: wordsDelta(all[index - 1]?.contentMd ?? '', found.contentMd),
    };
  };

  const record = (noteId: string, title: string, contentMd: string, reason: NoteVersionReason) => {
    counter += 1;
    add(noteId, {
      id: idFor(counter),
      createdAt: new Date().toISOString(),
      reason,
      title,
      contentMd,
    });
  };

  /** The snapshot rule, applied with the note as it was before a content save. */
  const maybeSnapshot = (noteId: string, title: string, before: string) => {
    if (before.trim() === '') return;
    const newest = versionsOf(noteId).at(-1);
    if (newest) {
      if (newest.contentMd === before) return;
      const age = Date.now() - Date.parse(newest.createdAt);
      if (age < NOTE_SNAPSHOT_GAP_MINUTES * 60_000) return;
    }
    record(noteId, title, before, 'auto');
  };

  const restore = (noteId: string, versionId: string) => {
    const note = notesFake.notes().find((live) => live.id === noteId);
    if (!note) throw new ApiError(404, 'not_found', 'Note not found');
    const target = full(noteId, versionId);
    if (note.contentMd.trim() !== '') record(noteId, note.title, note.contentMd, 'before_restore');
    const saved = inner('PATCH', `/notes/${noteId}`, {
      body: { baseRevision: note.revision, contentMd: target.contentMd },
    }) as { item: unknown };
    const stored = versionsOf(noteId).at(-1);
    return {
      item: saved.item,
      undo:
        stored?.reason === 'before_restore'
          ? { action: 'notes.restoreVersion', input: { id: noteId, versionId: stored.id } }
          : null,
    };
  };

  const handle = (method: string, path: string, options: RequestOptions): unknown => {
    const body = (options.body ?? {}) as Record<string, unknown>;

    if (path === '/undo') {
      const { action, input } = body as { action?: string; input?: Record<string, unknown> };
      if (action === 'notes.restoreVersion') {
        return { ...restore(String(input?.id), String(input?.versionId)), undo: null };
      }
    }

    const route = /^\/notes\/([^/]+)\/(versions|restore)(?:\/([^/]+))?$/.exec(path);
    if (route) {
      const [, id = '', kind, versionId] = route;
      if (!known(id)) throw new ApiError(404, 'not_found', 'Note not found');
      if (method === 'GET' && kind === 'versions') {
        return versionId ? { item: full(id, versionId) } : { items: summaries(id) };
      }
      if (method === 'POST' && kind === 'restore' && versionId) return restore(id, versionId);
    }

    // A content save keeps the text it replaces (a forced save over a newer revision, as a conflict)
    const save = /^\/notes\/([^/]+)$/.exec(path);
    if (method === 'PATCH' && save && typeof body.contentMd === 'string') {
      const id = save[1] ?? '';
      const before = notesFake.notes().find((note) => note.id === id);
      const answer = inner(method, path, options);
      if (before && body.contentMd !== before.contentMd) {
        if (body.force === true && body.baseRevision !== before.revision) {
          if (before.contentMd.trim() !== '')
            record(id, before.title, before.contentMd, 'conflict');
        } else {
          maybeSnapshot(id, before.title, before.contentMd);
        }
      }
      return answer;
    }
    return inner(method, path, options);
  };

  return {
    handle,
    /** The versions of a note as the list shows them, newest first. */
    versions: (noteId: string) => summaries(noteId),
    /** Puts versions (oldest first) on a note, as the server would have stored them. */
    seed: (noteId: string, versions: Stored[]) => {
      store.set(noteId, versions.slice(-NOTE_VERSIONS_KEEP));
    },
  };
}

export type NoteVersionsFake = ReturnType<typeof createNoteVersionsFake>;
