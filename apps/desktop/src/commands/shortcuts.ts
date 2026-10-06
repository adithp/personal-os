import type { ModuleId } from '@personal-os/shared';
import { MODULE_IDS } from '@personal-os/shared';

/**
 * The one registry of keyboard shortcuts (docs/DESIGN.md section 9). Every shortcut is Ctrl plus
 * one key. The palette, the key handler, and the hints on screen all read from here.
 */
export type ShortcutAction = { type: 'palette' } | { type: 'module'; module: ModuleId };

export interface Shortcut {
  /** The key (lowercase) pressed together with Ctrl. */
  key: string;
  action: ShortcutAction;
  description: string;
}

/** Key for each module: Ctrl 1–9 and 0 follow the dock order; J is the AI assistant. */
const MODULE_KEYS: Record<ModuleId, string> = {
  dashboard: '1',
  tasks: '2',
  habits: '3',
  notes: '4',
  graph: '5',
  calendar: '6',
  mail: '7',
  drive: '8',
  projects: '9',
  money: '0',
  assistant: 'j',
  settings: ',',
};

export const SHORTCUTS: readonly Shortcut[] = [
  { key: 'k', action: { type: 'palette' }, description: 'Search and commands' },
  ...MODULE_IDS.map((module): Shortcut => ({
    key: MODULE_KEYS[module],
    action: { type: 'module', module },
    description: `Open ${module}`,
  })),
];

/** The parts of a keyboard event that matter here. */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** The action for a key press, or undefined when it is not one of our shortcuts. */
export function actionForKeyPress(event: KeyPress): ShortcutAction | undefined {
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return undefined;
  const key = event.key.toLowerCase();
  return SHORTCUTS.find((shortcut) => shortcut.key === key)?.action;
}

/** Keys to show as a hint, e.g. ['Ctrl', 'K'] or ['Ctrl', '2']. */
export function hintKeys(key: string): string[] {
  return ['Ctrl', key.toUpperCase()];
}

/** Hint for a module's shortcut. */
export function moduleHint(module: ModuleId): string[] {
  return hintKeys(MODULE_KEYS[module]);
}

export const PALETTE_HINT = hintKeys('k');
