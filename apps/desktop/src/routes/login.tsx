import { createFileRoute, redirect } from '@tanstack/react-router';
import { LoginPage } from '../auth/login-page';

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    await context.auth.initialize();
    if (context.auth.store.getState().status === 'signedIn') {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: LoginPage,
});
