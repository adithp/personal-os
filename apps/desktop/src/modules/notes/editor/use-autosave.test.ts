import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAllDrafts,
  readDraft,
  useAutosave,
  type SaveFn,
  type SaveOutcome,
} from './use-autosave';

const NOTE = 'note-1';
const DRAFT_KEY = `personal-os.notes-draft.${NOTE}`;

interface Deferred {
  resolve: (outcome: SaveOutcome) => void;
  reject: (error: Error) => void;
}

/** A save function whose answers the test controls. */
function makeSave() {
  const calls: { markdown: string; base: number; force?: boolean }[] = [];
  const pending: Deferred[] = [];
  const save: SaveFn = (markdown, base, options) => {
    calls.push({ markdown, base, force: options?.force });
    return new Promise<SaveOutcome>((resolve, reject) => pending.push({ resolve, reject }));
  };
  return { save, calls, pending };
}

function setup(noteId = NOTE, save: SaveFn, onTakeTheirs = vi.fn(() => Promise.resolve(true))) {
  return renderHook(
    (props: { noteId: string }) =>
      useAutosave({ noteId: props.noteId, baseRevision: 3, save, onTakeTheirs }),
    { initialProps: { noteId } },
  );
}

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`No item ${String(index)}`);
  return item;
}

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const settle = () =>
  act(async () => {
    await Promise.resolve();
  });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useAutosave', () => {
  it('saves one second after the last change, with the base revision', async () => {
    const { save, calls, pending } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.change(() => 'a');
    });
    await tick(900);
    act(() => {
      result.current.change(() => 'ab');
    });
    await tick(900);
    expect(calls).toHaveLength(0);
    await tick(100);
    expect(calls).toEqual([{ markdown: 'ab', base: 3, force: undefined }]);
    expect(result.current.status).toBe('saving');
    at(pending, 0).resolve({ revision: 4 });
    await settle();
    expect(result.current.status).toBe('saved');
  });

  it('saves at most every 10 seconds while the user keeps typing', async () => {
    const { save, calls } = makeSave();
    const { result } = setup(NOTE, save);
    for (let i = 0; i < 12; i++) {
      act(() => {
        result.current.change(() => `text ${String(i)}`);
      });
      await tick(900);
    }
    expect(calls).toHaveLength(1);
    expect(at(calls, 0).markdown).toBe('text 11');
  });

  it('keeps one save in flight and sends the changes made meanwhile in one follow-up', async () => {
    const { save, calls, pending } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.change(() => 'one');
    });
    await tick(1000);
    act(() => {
      result.current.change(() => 'two');
    });
    await tick(1000);
    act(() => {
      result.current.change(() => 'three');
    });
    await tick(1000);
    expect(calls).toHaveLength(1);
    at(pending, 0).resolve({ revision: 4 });
    await settle();
    await settle();
    expect(calls.map((c) => [c.markdown, c.base])).toEqual([
      ['one', 3],
      ['three', 4],
    ]);
    at(pending, 1).resolve({ revision: 5 });
    await settle();
    expect(result.current.status).toBe('saved');
    expect(readDraft(NOTE)).toBeNull();
  });

  it('keeps a draft with the base revision until the server accepts it', async () => {
    const { save, pending } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.change(() => 'draft text');
    });
    await tick(1000);
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')).toEqual({
      markdown: 'draft text',
      baseRevision: 3,
    });
    at(pending, 0).resolve({ revision: 4 });
    await settle();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('shows failed, keeps the draft and retries after 5 seconds', async () => {
    const { save, calls, pending } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.change(() => 'x');
    });
    await tick(1000);
    at(pending, 0).reject(new Error('offline'));
    await settle();
    expect(result.current.status).toBe('failed');
    expect(readDraft(NOTE)?.markdown).toBe('x');
    await tick(4900);
    expect(calls).toHaveLength(1);
    await tick(100);
    expect(calls).toHaveLength(2);
    at(pending, 1).resolve({ revision: 4 });
    await settle();
    expect(result.current.status).toBe('saved');
  });

  it('flush saves at once', async () => {
    const { save, calls, pending } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.change(() => 'now');
    });
    let done = false;
    act(() => {
      void result.current.flush().then(() => {
        done = true;
      });
    });
    expect(calls).toHaveLength(1);
    at(pending, 0).resolve({ revision: 4 });
    await settle();
    await settle();
    expect(done).toBe(true);
  });

  it('flushes when the note switches and when it unmounts', () => {
    const { save, calls } = makeSave();
    const { result, rerender, unmount } = setup('note-1', save);
    act(() => {
      result.current.change(() => 'first');
    });
    rerender({ noteId: 'note-2' });
    expect(calls.map((c) => c.markdown)).toEqual(['first']);
    act(() => {
      result.current.change(() => 'second');
    });
    unmount();
    expect(calls.map((c) => c.markdown)).toEqual(['first', 'second']);
  });

  it('flushes when the page becomes hidden', () => {
    const { save, calls } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.change(() => 'hide me');
    });
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    state.mockRestore();
    expect(calls.map((c) => c.markdown)).toEqual(['hide me']);
  });

  it('uses a higher revision from a rename as the base of the next save', async () => {
    const { save, calls } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.setRevision(4);
    });
    act(() => {
      result.current.setRevision(2);
    });
    act(() => {
      result.current.change(() => 'after rename');
    });
    await tick(1000);
    expect(at(calls, 0).base).toBe(4);
  });

  it('does not save when nothing changed', async () => {
    const { save, calls } = makeSave();
    const { result, unmount } = setup(NOTE, save);
    await act(() => result.current.flush());
    unmount();
    await tick(20_000);
    expect(calls).toHaveLength(0);
  });
});

describe('useAutosave conflicts', () => {
  it('stops saving on a conflict; Keep mine saves again with force', async () => {
    const { save, calls, pending } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.change(() => 'mine');
    });
    await tick(1000);
    at(pending, 0).resolve({ conflict: true, revision: 7 });
    await settle();
    expect(result.current.conflict).toBe(true);
    act(() => {
      result.current.change(() => 'mine more');
    });
    await tick(30_000);
    expect(calls).toHaveLength(1);

    act(() => {
      void result.current.keepMine();
    });
    expect(calls[1]).toEqual({ markdown: 'mine more', base: 7, force: true });
    at(pending, 1).resolve({ revision: 8 });
    await settle();
    expect(result.current.conflict).toBe(false);
    expect(result.current.status).toBe('saved');
  });

  it('Use theirs drops the draft, clears the conflict and tells the caller', async () => {
    const { save, pending } = makeSave();
    const onTakeTheirs = vi.fn(() => Promise.resolve(true));
    const { result } = setup(NOTE, save, onTakeTheirs);
    act(() => {
      result.current.change(() => 'mine');
    });
    await tick(1000);
    at(pending, 0).resolve({ conflict: true });
    await settle();
    await act(async () => {
      await result.current.takeTheirs();
    });
    expect(onTakeTheirs).toHaveBeenCalledOnce();
    expect(result.current.conflict).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('Use theirs stays in the conflict until the server version has been loaded', async () => {
    const { save, pending } = makeSave();
    let finish: (loaded: boolean) => void = () => undefined;
    const onTakeTheirs = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const { result } = setup(NOTE, save, onTakeTheirs);
    act(() => {
      result.current.change(() => 'mine');
    });
    await tick(1000);
    at(pending, 0).resolve({ conflict: true });
    await settle();
    act(() => {
      void result.current.takeTheirs();
    });
    expect(result.current.conflict).toBe(true);
    await act(async () => {
      finish(false);
      await Promise.resolve();
    });
    // The refetch failed: still in the conflict, the draft is kept
    expect(result.current.conflict).toBe(true);
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    act(() => {
      void result.current.takeTheirs();
    });
    await act(async () => {
      finish(true);
      await Promise.resolve();
    });
    expect(result.current.conflict).toBe(false);
  });

  it('a leftover draft with the same revision is saved silently', () => {
    const { save, calls } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.resumeDraft({ markdown: 'old draft', baseRevision: 3 });
    });
    expect(calls).toEqual([{ markdown: 'old draft', base: 3, force: undefined }]);
  });

  it('a leftover draft with another revision opens the conflict state', () => {
    const { save, calls } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.resumeDraft({ markdown: 'old draft', baseRevision: 2 });
    });
    expect(calls).toHaveLength(0);
    expect(result.current.conflict).toBe(true);
  });
});

describe('useAutosave pause, 404 and drafts', () => {
  it('holds the timers while paused and saves after resume', async () => {
    const { save, calls } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.pause();
      result.current.change(() => 'typed during a rename');
    });
    await tick(30_000);
    expect(calls).toHaveLength(0);
    act(() => {
      result.current.resume();
    });
    await tick(1000);
    expect(calls).toEqual([{ markdown: 'typed during a rename', base: 3, force: undefined }]);
  });

  it('does not retry when the note no longer exists', async () => {
    const { save, calls, pending } = makeSave();
    const { result } = setup(NOTE, save);
    act(() => {
      result.current.change(() => 'a');
    });
    await tick(1000);
    at(pending, 0).resolve({ gone: true });
    await settle();
    expect(result.current.gone).toBe(true);
    expect(result.current.status).toBe('failed');
    act(() => {
      result.current.change(() => 'b');
    });
    await tick(60_000);
    expect(calls).toHaveLength(1);
  });

  it('clearAllDrafts removes every draft and nothing else', () => {
    localStorage.setItem('personal-os.notes-draft.a', '{}');
    localStorage.setItem('personal-os.notes-draft.b', '{}');
    localStorage.setItem('personal-os.other', 'keep');
    clearAllDrafts();
    expect(localStorage.getItem('personal-os.notes-draft.a')).toBeNull();
    expect(localStorage.getItem('personal-os.notes-draft.b')).toBeNull();
    expect(localStorage.getItem('personal-os.other')).toBe('keep');
  });
});
