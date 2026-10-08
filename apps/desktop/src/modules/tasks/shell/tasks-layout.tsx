import { Outlet } from '@tanstack/react-router';

/**
 * CONTRACT STUB, owned by the Feature 1 "shell and overview" ui-dev agent.
 * The Tasks module frame: the slim, collapsible inner side panel (Overview, My tasks, Inbox,
 * Reporting, Goals, Portfolios, Favorites) on the left and the page (<Outlet />) on the right.
 * Read TASK_FEATURES (../features) to know which items are disabled ("Soon") and useTasksUi
 * (../tasks-ui-store) for the collapsed state. The Inbox count is inboxTasks(...) from ../sections.
 */
export function TasksLayout() {
  return <Outlet />;
}
