import { createFileRoute } from '@tanstack/react-router';
import { TasksLayout } from '../../modules/tasks/shell/tasks-layout';

// The Tasks module frame (inner side panel). The pages are the child routes in tasks/.
export const Route = createFileRoute('/_app/tasks')({
  component: TasksLayout,
});
