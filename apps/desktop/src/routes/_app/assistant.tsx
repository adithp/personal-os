import { createFileRoute } from '@tanstack/react-router';
import { ModulePlaceholder } from '../../shell/module-placeholder';

export const Route = createFileRoute('/_app/assistant')({
  component: () => <ModulePlaceholder module="assistant" />,
});
