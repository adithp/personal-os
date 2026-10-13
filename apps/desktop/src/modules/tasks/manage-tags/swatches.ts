import { MODULES } from '@personal-os/shared';

/** Plain names for the palette colors, so a swatch reads "Peach" and not "Color 3". */
const COLOR_NAMES: Record<string, string> = {
  [MODULES.tasks.color]: 'Yellow',
  [MODULES.mail.color]: 'Sky',
  [MODULES.projects.color]: 'Pink',
  [MODULES.money.color]: 'Mint',
  [MODULES.assistant.color]: 'Lavender',
  [MODULES.calendar.color]: 'Orange',
  [MODULES.habits.color]: 'Lime',
  [MODULES.notes.color]: 'Peach',
  [MODULES.graph.color]: 'Periwinkle',
  [MODULES.drive.color]: 'Grey-blue',
};
const BY_LOWER = new Map(
  Object.entries(COLOR_NAMES).map(([hex, name]) => [hex.toLowerCase(), name]),
);

export function colorName(color: string): string {
  return BY_LOWER.get(color.toLowerCase()) ?? 'Custom';
}

const GRID_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
export const isGridKey = (key: string) => GRID_KEYS.includes(key);

/**
 * Where an arrow key, Home or End moves in a grid of `count` items with `columns` columns: Left and
 * Right by one, Up and Down by a row. Null when the key leads outside the grid.
 */
export function gridTarget(key: string, index: number, columns: number, count: number) {
  const target =
    key === 'ArrowRight'
      ? index + 1
      : key === 'ArrowLeft'
        ? index - 1
        : key === 'ArrowDown'
          ? index + columns
          : key === 'ArrowUp'
            ? index - columns
            : key === 'Home'
              ? 0
              : key === 'End'
                ? count - 1
                : -1;
  return target >= 0 && target < count ? target : null;
}
