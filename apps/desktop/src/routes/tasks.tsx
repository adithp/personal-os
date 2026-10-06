import { createFileRoute } from '@tanstack/react-router';
import { ModulePlaceholder } from '../shell/module-placeholder';

export const Route = createFileRoute('/tasks')({
  component: () => <ModulePlaceholder module="tasks" />,
});
