import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '../../../modules/tasks/shell/coming-soon-page';

// Built in a later feature; the side panel shows it disabled until then.
export const Route = createFileRoute('/_app/tasks/goals')({
  component: () => <ComingSoonPage title="Goals" />,
});
