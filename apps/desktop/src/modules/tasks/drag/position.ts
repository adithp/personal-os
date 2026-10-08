/** Gap between positions when a task goes first or last (the server uses the same step). */
export const POSITION_STEP = 1024;

/**
 * The position for a task that lands between two neighbours in the manual order (smaller is
 * higher). `prev` is the position of the task above it, `next` of the task below it. This is only
 * used to show the move at once; the server works out the real position.
 */
export function positionBetween(prev?: number, next?: number): number {
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + POSITION_STEP;
  if (next !== undefined) return next - POSITION_STEP;
  return POSITION_STEP;
}
