import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function createAppRouter(options?: Pick<Parameters<typeof createRouter>[0], 'history'>) {
  return createRouter({ routeTree, defaultPreload: 'intent', ...options });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
