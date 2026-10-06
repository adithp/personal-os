import { createFileRoute } from '@tanstack/react-router';
import { ModulePlaceholder } from '../shell/module-placeholder';

export const Route = createFileRoute('/calendar')({
  component: () => <ModulePlaceholder module="calendar" />,
});
