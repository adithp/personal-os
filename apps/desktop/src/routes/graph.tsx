import { createFileRoute } from '@tanstack/react-router';
import { ModulePlaceholder } from '../shell/module-placeholder';

export const Route = createFileRoute('/graph')({
  component: () => <ModulePlaceholder module="graph" />,
});
