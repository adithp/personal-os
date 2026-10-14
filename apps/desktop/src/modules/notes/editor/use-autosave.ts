import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Autosave for one note (research memo notes.md D14). Pure: it knows nothing about the editor or
 * the API. The caller gives a `save` function and calls `change(getMarkdown)` on every edit; the
 * Markdown is only produced (by `getMarkdown`) when a save starts.
 *
 * - Saves 1 s after the last change, and at most 10 s after the first unsaved change.
 * - Saves at once on `flush()`, when the page is hidden, and when the hook unmounts or the note changes.
 * - One save in flight; changes made meanwhile go out in one follow-up save.
 * - A failed save is retried after 5 s (or sooner when the next change saves). A 404 (`gone`) is not retried.
 * - `pause()` holds the timers (for example while a rename request is out or a version is previewed);
 *   each `pause()` needs its own `resume()`, and the timers restart when the last one is lifted.
 * - Unsent text is kept in localStorage (`personal-os.notes-draft.<id>`) until the server accepts it.
 */

export const SAVE_DELAY_MS = 1000;
export const SAVE_MAX_WAIT_MS = 10_000;
export const SAVE_RETRY_MS = 5000;

export type SaveStatus = 'saved' | 'saving' | 'failed';

/**
 * What `save` answers: the new revision, a conflict (the server answered 409 note_conflict), or
 * `gone` (the server answered 404: the note no longer exists, so there is nothing to retry).
 */
export type SaveOutcome =
  { revision: number } | { conflict: true; revision?: number } | { gone: true };

/** `save` throws for any other failure. `force` is "Keep mine": it skips the revision check. */
export type SaveFn = (
  markdown: string,
  baseRevision: number,
  options?: { force?: boolean },
) => Promise<SaveOutcome>;

export interface NoteDraft {
  markdown: string;
  baseRevision: number;
}

export function readDraft(noteId: string): NoteDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(noteId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<NoteDraft>;
    if (typeof value.markdown === 'string' && typeof value.baseRevision === 'number') {
      return { markdown: value.markdown, baseRevision: value.baseRevision };
    }
  } catch {
    // an unreadable draft is the same as none
  }
  return null;
}

function writeDraft(noteId: string, draft: NoteDraft) {
  try {
    localStorage.setItem(draftKey(noteId), JSON.stringify(draft));
  } catch {
    // storage full or blocked: saving to the server still works
  }
}

const DRAFT_PREFIX = 'personal-os.notes-draft.';
const draftKey = (noteId: string) => `${DRAFT_PREFIX}${noteId}`;

/** Removes every unsent draft (sign-out: nothing of this account stays on the device). */
export function clearAllDrafts() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(DRAFT_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // nothing to clear
  }
}

export function clearDraft(noteId: string) {
  try {
    localStorage.removeItem(draftKey(noteId));
  } catch {
    // nothing to clear
  }
}

interface AutosaveState {
  status: SaveStatus;
  conflict: boolean;
  gone: boolean;
}

interface EngineOptions {
  noteId: string;
  baseRevision: number;
  save: SaveFn;
  onState: (state: AutosaveState) => void;
  /** Loads the server's version into the editor; true when it did (false: stay in the conflict). */
  onTakeTheirs: () => Promise<boolean>;
}

/** A getter returns the current Markdown, or null when there is nothing to read any more. */
type GetMarkdown = () => string | null;

function createEngine(options: EngineOptions) {
  const { noteId, save, onState, onTakeTheirs } = options;
  let revision = options.baseRevision;
  let getMarkdown: GetMarkdown | null = null;
  let changeSeq = 0;
  let savedSeq = 0;
  let status: SaveStatus = 'saved';
  let conflictRevision: number | null | undefined;
  let inConflict = false;
  let gone = false;
  // Counts the holds (a rename, a version preview): the timers run again only when none is left
  let pauses = 0;
  let takingTheirs = false;
  let inFlight: Promise<void> | null = null;
  let deferred = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const publish = () => {
    if (!disposed) onState({ status, conflict: inConflict, gone });
  };
  const setStatus = (next: SaveStatus) => {
    status = next;
    publish();
  };
  const clearTimers = () => {
    clearTimeout(debounceTimer);
    clearTimeout(maxTimer);
    clearTimeout(retryTimer);
    debounceTimer = maxTimer = retryTimer = undefined;
  };
  const dirty = () => changeSeq !== savedSeq;

  /** Runs one save of the current text. Resolves when it is done. */
  const startSave = (force = false): Promise<void> => {
    clearTimers();
    deferred = false;
    const text = getMarkdown?.();
    if (text === null || text === undefined) {
      savedSeq = changeSeq;
      return Promise.resolve();
    }
    const seq = changeSeq;
    const base =
      force && conflictRevision !== null && conflictRevision !== undefined
        ? conflictRevision
        : revision;
    writeDraft(noteId, { markdown: text, baseRevision: base });
    setStatus('saving');
    const run = save(text, base, force ? { force: true } : undefined).then(
      (outcome) => {
        if ('gone' in outcome) {
          gone = true;
          setStatus('failed');
          return;
        }
        if ('conflict' in outcome) {
          inConflict = true;
          conflictRevision = outcome.revision;
          setStatus('failed');
          return;
        }
        revision = outcome.revision;
        savedSeq = seq;
        clearDraft(noteId);
        setStatus('saved');
        if (dirty() && deferred) void startSave();
      },
      () => {
        setStatus('failed');
        retryTimer = setTimeout(() => void trySave(), SAVE_RETRY_MS);
      },
    );
    const tracked: Promise<void> = run.finally(() => {
      if (inFlight === tracked) inFlight = null;
    });
    inFlight = tracked;
    return tracked;
  };

  /** A timer fired: save now, or note that a follow-up is wanted when one is in flight. */
  const trySave = (): Promise<void> => {
    if (inConflict || gone || pauses > 0 || !dirty()) return Promise.resolve();
    if (inFlight) {
      deferred = true;
      return inFlight;
    }
    return startSave();
  };

  const armTimers = () => {
    clearTimeout(debounceTimer);
    clearTimeout(retryTimer);
    debounceTimer = setTimeout(() => void trySave(), SAVE_DELAY_MS);
    maxTimer ??= setTimeout(() => {
      // Reset, so the next unsaved change starts a new 10 s window
      maxTimer = undefined;
      void trySave();
    }, SAVE_MAX_WAIT_MS);
  };

  const flush = async (): Promise<void> => {
    clearTimers();
    deferred = false;
    while (inFlight || (dirty() && !inConflict && !gone)) {
      if (inFlight) {
        await inFlight;
        continue;
      }
      await startSave();
      // A failed save is left to the 5 s retry
      if (status === 'failed') return;
    }
  };

  return {
    change(getter: GetMarkdown) {
      getMarkdown = getter;
      changeSeq += 1;
      if (inConflict || gone || pauses > 0) return;
      armTimers();
    },
    /** Holds the timers (a rename is out). Edits are still counted; `flush()` still saves. */
    pause() {
      pauses += 1;
      clearTimers();
    },
    /** Lifts one hold; the timers restart when the last one is lifted. */
    resume() {
      pauses = Math.max(0, pauses - 1);
      if (pauses === 0 && dirty() && !inConflict && !gone && !inFlight) armTimers();
    },
    flush,
    /** True while there is text not yet accepted by the server (unsaved, in flight or in conflict). */
    hasPending: () => dirty() || inFlight !== null || inConflict,
    /** The server's note changed under unsaved edits: ask Keep mine or Use theirs. */
    markConflict(theirRevision: number) {
      if (inConflict || gone) return;
      clearTimers();
      inConflict = true;
      conflictRevision = theirRevision;
      setStatus('failed');
    },
    /** A revision this editor caused outside autosave (a rename raises it too). Never lowers it. */
    setRevision(next: number) {
      revision = Math.max(revision, next);
    },
    /** Unsent text from an earlier session: save it, or ask when the note moved on since. */
    resumeDraft(draft: NoteDraft) {
      getMarkdown = () => draft.markdown;
      changeSeq += 1;
      if (draft.baseRevision === revision) {
        void startSave();
      } else {
        clearTimers();
        inConflict = true;
        conflictRevision = revision;
        setStatus('failed');
      }
    },
    keepMine() {
      if (!inConflict) return Promise.resolve();
      inConflict = false;
      return startSave(true);
    },
    /** Stays in the conflict until the server's version has been loaded. */
    async takeTheirs() {
      if (takingTheirs) return;
      takingTheirs = true;
      clearTimers();
      try {
        if (!(await onTakeTheirs())) return;
        clearDraft(noteId);
        savedSeq = changeSeq;
        inConflict = false;
        conflictRevision = undefined;
        setStatus('saved');
      } finally {
        takingTheirs = false;
      }
    },
    dispose() {
      const done = flush();
      disposed = true;
      return done;
    },
    hidden() {
      void flush();
    },
  };
}

export type AutosaveEngine = ReturnType<typeof createEngine>;

export interface UseAutosaveOptions {
  noteId: string;
  /** The revision the editor was loaded with. */
  baseRevision: number;
  save: SaveFn;
  /** "Use theirs": the caller loads the server's version into the editor; true when it did. */
  onTakeTheirs: () => Promise<boolean>;
}

export function useAutosave(options: UseAutosaveOptions) {
  const { noteId } = options;
  const latest = useRef(options);
  const engineRef = useRef<AutosaveEngine | null>(null);
  // The state belongs to one note; a state from the note before counts as "saved"
  const [state, setState] = useState<AutosaveState & { noteId: string }>({
    noteId,
    status: 'saved',
    conflict: false,
    gone: false,
  });

  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const engine = createEngine({
      noteId,
      baseRevision: latest.current.baseRevision,
      save: (markdown, base, saveOptions) => latest.current.save(markdown, base, saveOptions),
      onState: (next) => {
        setState({ ...next, noteId });
      },
      onTakeTheirs: () => latest.current.onTakeTheirs(),
    });
    engineRef.current = engine;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') engine.hidden();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void engine.dispose();
      engineRef.current = null;
    };
  }, [noteId]);

  return {
    status: state.noteId === noteId ? state.status : 'saved',
    conflict: state.noteId === noteId && state.conflict,
    /** The server says the note no longer exists. */
    gone: state.noteId === noteId && state.gone,
    /** Call on every edit. `getMarkdown` runs only when a save starts. */
    change: useCallback((getMarkdown: GetMarkdown) => {
      engineRef.current?.change(getMarkdown);
    }, []),
    flush: useCallback(() => engineRef.current?.flush() ?? Promise.resolve(), []),
    setRevision: useCallback((revision: number) => {
      engineRef.current?.setRevision(revision);
    }, []),
    hasPending: useCallback(() => engineRef.current?.hasPending() ?? false, []),
    markConflict: useCallback((theirRevision: number) => {
      engineRef.current?.markConflict(theirRevision);
    }, []),
    resumeDraft: useCallback((draft: NoteDraft) => {
      engineRef.current?.resumeDraft(draft);
    }, []),
    keepMine: useCallback(() => engineRef.current?.keepMine() ?? Promise.resolve(), []),
    takeTheirs: useCallback(() => engineRef.current?.takeTheirs() ?? Promise.resolve(), []),
    pause: useCallback(() => {
      engineRef.current?.pause();
    }, []),
    resume: useCallback(() => {
      engineRef.current?.resume();
    }, []),
  };
}
