import { createFileRoute } from '@tanstack/react-router';
import { ProjectsLayout } from '../../modules/projects/shell/projects-layout';

// The Projects page: inner side panel (All projects, Clients, Time) and the open page. What is
// open lives in the Projects UI store, so this is the only route file.
export const Route = createFileRoute('/_app/projects')({
  component: ProjectsLayout,
});
