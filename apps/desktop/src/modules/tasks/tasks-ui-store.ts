import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { GroupKey, SortKey } from './filters';
import { DEFAULT_GROUP, DEFAULT_SORT } from './filters';
import type { SectionId } from './sections';

export type ViewMode = 'cards' | 'list' | 'board';

interface TasksUiState {
  /** Cards (default), List, or Board. Saved on this device. */
  view: ViewMode;
  /** The inner side panel is collapsed to icons. Saved on this device. */
  sidePanelCollapsed: boolean;
  /** Sections the user collapsed. Completed starts collapsed. Saved on this device. */
  collapsedSections: Partial<Record<SectionId, boolean>>;
  sort: SortKey;
  group: GroupKey;
  /** The task whose details are open in My tasks. Not saved. */
  selectedTaskId: string | null;
  setView: (view: ViewMode) => void;
  toggleSidePanel: () => void;
  toggleSection: (id: SectionId) => void;
  setSort: (sort: SortKey) => void;
  setGroup: (group: GroupKey) => void;
  select: (id: string | null) => void;
}

const defaults = {
  view: 'cards' as ViewMode,
  sidePanelCollapsed: false,
  collapsedSections: { completed: true } as Partial<Record<SectionId, boolean>>,
  sort: DEFAULT_SORT,
  group: DEFAULT_GROUP,
  selectedTaskId: null as string | null,
};

/** UI state of the Tasks module (not server data). */
export const useTasksUi = create<TasksUiState>()(
  persist(
    (set) => ({
      ...defaults,
      setView: (view) => {
        set({ view });
      },
      toggleSidePanel: () => {
        set((state) => ({ sidePanelCollapsed: !state.sidePanelCollapsed }));
      },
      toggleSection: (id) => {
        set((state) => ({
          collapsedSections: { ...state.collapsedSections, [id]: !state.collapsedSections[id] },
        }));
      },
      setSort: (sort) => {
        set({ sort });
      },
      setGroup: (group) => {
        set({ group });
      },
      select: (selectedTaskId) => {
        set({ selectedTaskId });
      },
    }),
    {
      name: 'personal-os.tasks-ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only these survive a restart; the open task, sort, and group start fresh
      partialize: (state) => ({
        view: state.view,
        sidePanelCollapsed: state.sidePanelCollapsed,
        collapsedSections: state.collapsedSections,
      }),
    },
  ),
);

/** Back to the defaults (tests and "reset"). */
export function resetTasksUi(): void {
  useTasksUi.setState({ ...defaults, collapsedSections: { ...defaults.collapsedSections } });
}
