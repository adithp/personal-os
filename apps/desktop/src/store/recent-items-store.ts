import {
  searchTypeSchema,
  tagHitSchema,
  taskHitSchema,
  type SearchType,
} from '@personal-os/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const RECENT_STORAGE_KEY = 'personal-os.recent-items';
export const RECENT_MAX = 5;

/** An item opened from the palette. The title can be out of date until it is opened again. */
export interface RecentItem {
  type: SearchType;
  id: string;
  title: string;
  /** Tag color. */
  color?: string;
  /** An archived task opens with the archived list on. */
  archived?: boolean;
}

interface RecentState {
  items: RecentItem[];
  add: (item: RecentItem) => void;
  /** Forgets everything, in memory and on this device (used at sign-out). */
  clear: () => void;
}

// Built from the shared hit schemas, so the app needs no zod dependency of its own.
// localStorage can be edited or stale, so every stored item is checked before it is used.
const recentItemSchema = tagHitSchema
  .pick({ id: true })
  .extend({
    type: searchTypeSchema,
    title: tagHitSchema.shape.title.max(200),
    color: tagHitSchema.shape.color.max(32).optional(),
    archived: taskHitSchema.shape.archived.optional(),
  })
  .strict();

/** Keeps the valid items of a stored list (at most 5) and drops the rest. */
export function validRecentItems(stored: unknown): RecentItem[] {
  if (!Array.isArray(stored)) return [];
  const items: RecentItem[] = [];
  for (const candidate of stored as unknown[]) {
    const parsed = recentItemSchema.safeParse(candidate);
    if (parsed.success) items.push(parsed.data);
  }
  return items.slice(0, RECENT_MAX);
}

/** The last 5 items opened from the palette, on this device (search.md D18). */
export const useRecentItems = create<RecentState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) => {
        set((state) => ({
          items: [
            item,
            ...state.items.filter((old) => !(old.type === item.type && old.id === item.id)),
          ].slice(0, RECENT_MAX),
        }));
      },
      clear: () => {
        set({ items: [] });
        localStorage.removeItem(RECENT_STORAGE_KEY);
      },
    }),
    {
      name: RECENT_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ items: state.items }),
      merge: (persisted, current) => ({
        ...current,
        items: validRecentItems((persisted as { items?: unknown } | undefined)?.items),
      }),
    },
  ),
);
