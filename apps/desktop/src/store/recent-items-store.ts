import type { SearchType } from '@personal-os/shared';
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
    }),
    { name: RECENT_STORAGE_KEY, version: 1, partialize: (state) => ({ items: state.items }) },
  ),
);
