import { createRootRouteWithContext } from '@tanstack/react-router';
import type { RouterContext } from '../router-context';
import { RootShell } from '../shell/root-shell';

export const Route = createRootRouteWithContext<RouterContext>()({ component: RootShell });
