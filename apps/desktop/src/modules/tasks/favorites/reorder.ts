import { arrayMove } from '@dnd-kit/sortable';

/** Where a moved favorite lands: after the one above it, before the one below it. */
export interface MoveTarget {
  afterId?: string;
  beforeId?: string;
}

/**
 * The neighbours a favorite has after it moves to `toIndex` in the list `ids`. Null when it would
 * not move (same place, unknown id, or outside the list). Used by drag and by Move up and down.
 */
export function moveTarget(
  ids: readonly string[],
  activeId: string,
  toIndex: number,
): MoveTarget | null {
  const from = ids.indexOf(activeId);
  if (from < 0 || toIndex < 0 || toIndex >= ids.length || from === toIndex) return null;
  const moved = arrayMove([...ids], from, toIndex);
  const target: MoveTarget = {};
  const after = moved[toIndex - 1];
  const before = moved[toIndex + 1];
  if (after !== undefined) target.afterId = after;
  if (before !== undefined) target.beforeId = before;
  return target;
}
