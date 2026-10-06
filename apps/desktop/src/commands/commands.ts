import type { ModuleId, ThemeMode } from '@personal-os/shared';
import { MODULE_IDS, MODULES } from '@personal-os/shared';
import { moduleHint } from './shortcuts';

/**
 * How well a command matches what was typed (0 = hide). Every typed word must appear as part of
 * a word in the title or keywords, so results are predictable: "night" finds dark theme, not a
 * command whose letters happen to contain n-i-g-h-t. Title matches rank above keyword matches.
 */
export function scoreCommand(title: string, keywords: readonly string[], search: string): number {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const inTitle = title.toLowerCase();
  const inKeywords = keywords.join(' ').toLowerCase();
  if (words.every((word) => inTitle.includes(word))) {
    return inTitle.startsWith(words[0] ?? '') ? 1 : 0.9;
  }
  if (words.every((word) => inTitle.includes(word) || inKeywords.includes(word))) return 0.5;
  return 0;
}

export type CommandGroup = 'Go to' | 'Appearance' | 'Dock';

export interface Command {
  id: string;
  group: CommandGroup;
  title: string;
  /** Extra words that also find the command. */
  keywords: string[];
  /** Module the command opens; its color is used for the icon. */
  module?: ModuleId;
  /** Keys to show as a hint, such as ['Ctrl', '2']. */
  shortcut?: string[];
  /** Short text on the right, such as "On" or "Current". */
  hint?: string;
  run: () => void;
}

/** What the commands need from the app. */
export interface CommandContext {
  openModule: (module: ModuleId) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  dockAutoHide: boolean;
  setDockAutoHide: (enabled: boolean) => void;
}

const THEME_COMMANDS: readonly { theme: ThemeMode; title: string; keywords: string[] }[] = [
  { theme: 'dark', title: 'Switch to dark theme', keywords: ['night', 'black'] },
  { theme: 'light', title: 'Switch to light theme', keywords: ['day', 'bright', 'white'] },
  { theme: 'system', title: 'Follow system theme', keywords: ['windows', 'auto', 'automatic'] },
];

/** Every command in the palette, in the order shown. Opening a module is a command too. */
export function buildCommands(context: CommandContext): Command[] {
  const goTo = MODULE_IDS.map((module): Command => ({
    id: `open-${module}`,
    group: 'Go to',
    title: `Open ${MODULES[module].name}`,
    keywords: ['go', 'navigate', 'show', module],
    module,
    shortcut: moduleHint(module),
    run: () => {
      context.openModule(module);
    },
  }));

  const appearance = THEME_COMMANDS.map(({ theme, title, keywords }): Command => ({
    id: `theme-${theme}`,
    group: 'Appearance',
    title,
    keywords: ['theme', 'appearance', 'mode', ...keywords],
    hint: context.theme === theme ? 'Current' : undefined,
    run: () => {
      context.setTheme(theme);
    },
  }));

  const dock: Command = {
    id: 'dock-auto-hide',
    group: 'Dock',
    title: 'Toggle dock auto-hide',
    keywords: ['dock', 'hide', 'show', 'bottom', 'bar'],
    hint: context.dockAutoHide ? 'On' : 'Off',
    run: () => {
      context.setDockAutoHide(!context.dockAutoHide);
    },
  };

  return [...goTo, ...appearance, dock];
}
