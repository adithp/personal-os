import { createFileRoute } from '@tanstack/react-router';
import { TasksPage } from '../../modules/tasks/tasks-page';

export const Route = createFileRoute('/_app/tasks')({
  component: TasksPage,
});
