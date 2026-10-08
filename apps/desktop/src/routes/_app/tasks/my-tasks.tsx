import { createFileRoute } from '@tanstack/react-router';
import { MyTasksPage } from '../../../modules/tasks/my-tasks/my-tasks-page';
import { validateTaskSearch } from '../../../modules/tasks/my-tasks-search';

export const Route = createFileRoute('/_app/tasks/my-tasks')({
  validateSearch: validateTaskSearch,
  component: MyTasksPage,
});
