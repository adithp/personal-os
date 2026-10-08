import type { Task } from '@personal-os/shared';

export interface BoardViewProps {
  tasks: readonly Task[];
  now: Date;
  /** Sort is Manual: only then can cards be reordered inside a column. */
  manualSort: boolean;
}

/** CONTRACT STUB for Feature 2: columns To do, In progress, Done, with the same card as Cards view. */
export function BoardView(_props: BoardViewProps) {
  return null;
}
