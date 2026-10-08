import { createFileRoute, redirect } from '@tanstack/react-router';
import { AppLayout } from '../shell/app-layout';

// Every screen except /login needs a signed-in user.
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    await context.auth.initialize();
    if (context.auth.store.getState().status !== 'signedIn') {
      throw redirect({ to: '/login', replace: true });
    }
  },
  component: AppLayout,
});
