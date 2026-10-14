import { useSyncExternalStore } from 'react';
import type { OutlineItem } from './outline';

/**
 * How the Outline tab and the editor pane talk. The editor pane registers a jump function while it
 * is mounted; the panel calls it with the heading's position among the note's H1 to H3 headings (0
 * is the first). With no editor registered, a jump does nothing. The pane also publishes the
 * headings of its live document, so the list follows typing at once.
 */
export type HeadingJump = (index: number) => void;

let current: HeadingJump | null = null;

/** Called by the editor pane. Returns the function that removes it (use it as the effect cleanup). */
export function registerHeadingJump(jump: HeadingJump): () => void {
  current = jump;
  return () => {
    if (current === jump) current = null;
  };
}

/** Called by the Outline tab. */
export function jumpToHeading(index: number): void {
  current?.(index);
}

interface LiveOutline {
  noteId: string;
  items: OutlineItem[];
}

let live: LiveOutline | null = null;
const listeners = new Set<() => void>();

const same = (a: OutlineItem[], b: OutlineItem[]) =>
  a.length === b.length &&
  a.every((item, i) => item.level === b[i]?.level && item.text === b[i].text);

/** Called by the editor pane with the headings of its document. Returns the cleanup. */
export function publishOutline(noteId: string, items: OutlineItem[]): () => void {
  if (live?.noteId !== noteId || !same(live.items, items)) {
    const mine: LiveOutline = { noteId, items };
    live = mine;
    listeners.forEach((listener) => {
      listener();
    });
  }
  return () => {
    if (live?.noteId !== noteId) return;
    live = null;
    listeners.forEach((listener) => {
      listener();
    });
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The headings the open editor published for this note, or null when no editor has one. */
export function useLiveOutline(noteId: string): OutlineItem[] | null {
  const snapshot = useSyncExternalStore(subscribe, () => live);
  return snapshot?.noteId === noteId ? snapshot.items : null;
}
