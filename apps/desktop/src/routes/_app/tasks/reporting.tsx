import { createFileRoute } from '@tanstack/react-router';
import { ReportingPage } from '../../../modules/tasks/reporting/reporting-page';

export const Route = createFileRoute('/_app/tasks/reporting')({
  component: ReportingPage,
});
