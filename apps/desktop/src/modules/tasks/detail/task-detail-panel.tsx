export interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
}

/**
 * CONTRACT STUB, owned by the Feature 1 "detail panel" ui-dev agent (wave 2).
 * The right-hand panel for one task: title, status, priority, due (date, time, all-day), reminder,
 * tags (pick, create, recolor), subtasks (one level), notes, Archive, Delete. Rows for "Repeat"
 * and "Blocked by" are empty slots for Feature 3. Use useTask, useSubtasks, useTaskActions,
 * useTags, and useTagActions.
 */
export function TaskDetailPanel(_props: TaskDetailPanelProps) {
  return null;
}
