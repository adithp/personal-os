import { createRouter } from '@tanstack/react-router';
import type { RouterContext } from './router-context';
import { routeTree } from './routeTree.gen';

export interface AppRouterOptions extends RouterContext {
  history?: Parameters<typeof createRouter>[0]['history'];
}

export function createAppRouter({ auth, history }: AppRouterOptions) {
  return createRouter({ routeTree, context: { auth }, defaultPreload: 'intent', history });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
