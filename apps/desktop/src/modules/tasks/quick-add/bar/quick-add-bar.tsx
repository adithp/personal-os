export interface QuickAddBarProps {
  /** Focus the box when the page opens (the dashboard "New task" button relies on this). */
  autoFocus?: boolean;
}

/**
 * CONTRACT STUB, owned by the Feature 1 "my tasks" ui-dev agent (a title-only bar for now;
 * Feature 4 upgrades it to understand dates, tags, and priority).
 * Pressing Enter creates a task with useTaskActions().create and keeps the box focused.
 */
export function QuickAddBar(_props: QuickAddBarProps) {
  return null;
}
