import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ProjectsView = 'projects' | 'clients' | 'time';
export const PROJECT_TABS = ['overview', 'tasks', 'notes', 'board', 'timeline', 'time'] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

interface ProjectsUiState {
  /** The page shown in the content area. */
  view: ProjectsView;
  /** The open project (the project page), or null for the list. Not saved. */
  projectId: string | null;
  /** The open client (the client page), or null for the clients list. Not saved. */
  clientId: string | null;
  /** The tab of the project page. Not saved. */
  tab: ProjectTab;
  /** The inner side panel is collapsed to icons. Saved on this device. */
  sidePanelCollapsed: boolean;
  showView: (view: ProjectsView) => void;
  openProject: (id: string) => void;
  closeProject: () => void;
  openClient: (id: string) => void;
  closeClient: () => void;
  setTab: (tab: ProjectTab) => void;
  toggleSidePanel: () => void;
}

const defaults = {
  view: 'projects' as ProjectsView,
  projectId: null as string | null,
  clientId: null as string | null,
  tab: 'overview' as ProjectTab,
  sidePanelCollapsed: false,
};

/** UI state of the Projects module (not server data). */
export const useProjectsUi = create<ProjectsUiState>()(
  persist(
    (set) => ({
      ...defaults,
      showView: (view) => {
        set({ view, projectId: null, clientId: null, tab: 'overview' });
      },
      openProject: (projectId) => {
        set({ view: 'projects', projectId, tab: 'overview' });
      },
      closeProject: () => {
        set({ projectId: null, tab: 'overview' });
      },
      openClient: (clientId) => {
        set({ view: 'clients', clientId, projectId: null });
      },
      closeClient: () => {
        set({ clientId: null });
      },
      setTab: (tab) => {
        set({ tab });
      },
      toggleSidePanel: () => {
        set((state) => ({ sidePanelCollapsed: !state.sidePanelCollapsed }));
      },
    }),
    {
      name: 'personal-os.projects-ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sidePanelCollapsed: state.sidePanelCollapsed }),
    },
  ),
);

/** Back to the defaults (tests and "reset"). */
export function resetProjectsUi(): void {
  useProjectsUi.setState({ ...defaults });
}
