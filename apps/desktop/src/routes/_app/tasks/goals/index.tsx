import { createFileRoute } from '@tanstack/react-router';
import { GoalsListPage } from '../../../../modules/tasks/goals/list/goals-list-page';

export const Route = createFileRoute('/_app/tasks/goals/')({
  component: GoalsListPage,
});
