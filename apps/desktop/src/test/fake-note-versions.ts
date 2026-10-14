import {
  countWords,
  markdownToPlainText,
  NOTE_SNAPSHOT_GAP_MINUTES,
  NOTE_VERSIONS_KEEP,
  type NoteVersion,
  type NoteVersionReason,
  type NoteVersionSummary,
} from '@personal-os/shared';
import { ApiError, type RequestOptions } from '../api/api-client';
import type { NotesFake } from './fake-notes';

let counter = 900_000;
const idFor = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;

/** Words as the server counts them: of the plain text, not the Markdown. */
const wordsOf = (markdown: string) => countWords(markdownToPlainText(markdown));

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
 * In-memory note versions that follow the N4 server (note-versions.ts, note-version-actions.ts):
 * a content save stores the text it replaces as `auto` unless that text is empty or equal to the
 * newest version, or the newest is under 10 minutes old (of fake time) - except when the new text is
 * empty or under 20% of a previous text of 200+ characters, which skips only the 10 minute wait;
 * a forced save always stores the replaced text as `conflict`; a restore stores the current text
 * first (`before_restore`, even when empty), never checks the revision, always raises it unless the
 * text is equal (then nothing changes and there is no undo), and its undo restores that version;
 * only the newest 50 are kept. It sits in front of the Notes fake and passes everything else on.
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
      .map((version, index) => {
        const words = wordsOf(version.contentMd);
        const older = all[index - 1];
        return {
          id: version.id,
          createdAt: version.createdAt,
          reason: version.reason,
          words,
          // Against the next older version (none = empty text)
          wordsDelta: words - (older ? wordsOf(older.contentMd) : 0),
        };
      })
      .reverse();
  };

  const full = (noteId: string, versionId: string): NoteVersion => {
    const all = versionsOf(noteId);
    const index = all.findIndex((version) => version.id === versionId);
    const found = all[index];
    if (!found) throw notFound();
    const older = all[index - 1];
    const words = wordsOf(found.contentMd);
    return { ...found, words, wordsDelta: words - (older ? wordsOf(older.contentMd) : 0) };
  };

  /**
   * The server's snapshotNote: stores `before` unless it equals the newest version (then that
   * one's id is returned). `auto` also skips an empty text and, normally, a newest version under
   * 10 minutes old; `before_restore` and `conflict` are always stored, even when empty.
   */
  const snapshot = (
    noteId: string,
    before: { title: string; contentMd: string },
    reason: NoteVersionReason,
    next?: string,
  ): string | null => {
    const newest = versionsOf(noteId).at(-1);
    if (newest?.contentMd === before.contentMd) return newest.id;
    if (reason === 'auto') {
      if (before.contentMd === '') return null;
      // A big loss of text is kept at once, however recent the last version is
      const shrank =
        next !== undefined &&
        before.contentMd.length >= 200 &&
        (next.trim() === '' || next.length < before.contentMd.length * 0.2);
      if (newest && !shrank) {
        const age = Date.now() - Date.parse(newest.createdAt);
        if (age < NOTE_SNAPSHOT_GAP_MINUTES * 60_000) return null;
      }
    }
    counter += 1;
    const id = idFor(counter);
    // Strictly after the newest version, so "newest" is never a tie
    const now = Date.now();
    const at =
      newest && now <= Date.parse(newest.createdAt) ? Date.parse(newest.createdAt) + 1 : now;
    add(noteId, {
      id,
      createdAt: new Date(at).toISOString(),
      reason,
      title: before.title,
      contentMd: before.contentMd,
    });
    return id;
  };

  const restore = (noteId: string, versionId: string) => {
    const note = notesFake.notes().find((live) => live.id === noteId);
    if (!note) throw new ApiError(404, 'not_found', 'Note not found');
    const target = full(noteId, versionId);
    // Same text: nothing changes (no new revision, no undo)
    if (target.contentMd === note.contentMd) return { item: note, undo: null };
    const undoVersionId = snapshot(noteId, note, 'before_restore');
    // No baseRevision check: the note is written as it is now
    const saved = inner('PATCH', `/notes/${noteId}`, {
      body: { baseRevision: note.revision, contentMd: target.contentMd },
    }) as { item: unknown };
    return {
      item: saved.item,
      undo: undoVersionId
        ? { action: 'notes.restoreVersion', input: { id: noteId, versionId: undoVersionId } }
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

    // A content save keeps the text it replaces (every forced save as a conflict version)
    const save = /^\/notes\/([^/]+)$/.exec(path);
    if (method === 'PATCH' && save && typeof body.contentMd === 'string') {
      const id = save[1] ?? '';
      const before = notesFake.notes().find((note) => note.id === id);
      const answer = inner(method, path, options);
      if (before && body.contentMd !== before.contentMd) {
        snapshot(id, before, body.force === true ? 'conflict' : 'auto', body.contentMd);
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
