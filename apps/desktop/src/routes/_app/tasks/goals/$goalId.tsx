import { createFileRoute } from '@tanstack/react-router';
import { GoalDetailPage } from '../../../../modules/tasks/goals/detail/goal-detail-page';

export const Route = createFileRoute('/_app/tasks/goals/$goalId')({
  component: function GoalRoute() {
    const { goalId } = Route.useParams();
    return <GoalDetailPage goalId={goalId} />;
  },
});
