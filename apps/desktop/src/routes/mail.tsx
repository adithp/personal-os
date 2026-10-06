import { createFileRoute } from '@tanstack/react-router';
import { ModulePlaceholder } from '../shell/module-placeholder';

export const Route = createFileRoute('/mail')({
  component: () => <ModulePlaceholder module="mail" />,
});
