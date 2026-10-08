/** Every module in dock order (docs/DESIGN.md section 7). */
export const MODULE_IDS = [
  'dashboard',
  'tasks',
  'habits',
  'notes',
  'graph',
  'calendar',
  'mail',
  'drive',
  'projects',
  'money',
  'assistant',
  'settings',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleInfo {
  id: ModuleId;
  name: string;
  /** Pastel module color from docs/DESIGN.md section 3. Text on it is always TEXT_ON_TILE. */
  color: string;
  /** Roadmap step where the module is built (docs/ROADMAP.md). */
  roadmapStep: number;
}

export const MODULES: Record<ModuleId, ModuleInfo> = {
  dashboard: { id: 'dashboard', name: 'Dashboard', color: '#E8E8E8', roadmapStep: 1 },
  tasks: { id: 'tasks', name: 'Tasks', color: '#F7D96B', roadmapStep: 2 },
  habits: { id: 'habits', name: 'Habits', color: '#C6E46E', roadmapStep: 5 },
  notes: { id: 'notes', name: 'Notes', color: '#F0C9A0', roadmapStep: 2 },
  graph: { id: 'graph', name: 'Knowledge graph', color: '#B8C4F7', roadmapStep: 7 },
  calendar: { id: 'calendar', name: 'Calendar', color: '#F6A462', roadmapStep: 4 },
  mail: { id: 'mail', name: 'Mail', color: '#93D3F5', roadmapStep: 4 },
  drive: { id: 'drive', name: 'Drive', color: '#C5CCD6', roadmapStep: 4 },
  projects: { id: 'projects', name: 'Projects', color: '#F4A9C4', roadmapStep: 5 },
  money: { id: 'money', name: 'Money', color: '#9EE0C8', roadmapStep: 6 },
  assistant: { id: 'assistant', name: 'AI assistant', color: '#C9B4F7', roadmapStep: 3 },
  settings: { id: 'settings', name: 'Settings', color: '#A9A9A9', roadmapStep: 1 },
};

/** App accent (lavender): primary buttons, active states, focus rings. */
export const ACCENT_COLOR = MODULES.assistant.color;

/** Text and icon color on every module color. */
export const TEXT_ON_TILE = '#1C1C1C';

export const THEME_MODES = ['dark', 'light', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;
