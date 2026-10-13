import { createFileRoute } from '@tanstack/react-router';
import { InboxPage } from '../../../modules/tasks/inbox/inbox-page';

export const Route = createFileRoute('/_app/tasks/inbox')({
  component: InboxPage,
});
