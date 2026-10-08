import { createFileRoute } from '@tanstack/react-router';
import { OverviewPage } from '../../../modules/tasks/overview/overview-page';

// /tasks (the dock icon and Ctrl 2) opens the Overview.
export const Route = createFileRoute('/_app/tasks/')({
  component: OverviewPage,
});
