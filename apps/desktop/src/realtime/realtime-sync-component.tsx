import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { Auth } from '../auth/auth';
import { realtimeRegistry } from './registry';
import type { RealtimeSource } from './realtime-source';
import { startRealtimeSync } from './realtime-sync';

export interface RealtimeSyncProps {
  source: RealtimeSource;
  auth: Auth;
}

/** Starts live updates while mounted. Renders nothing. */
export function RealtimeSync({ source, auth }: RealtimeSyncProps) {
  const queryClient = useQueryClient();
  useEffect(
    () => startRealtimeSync({ source, auth, queryClient, registry: realtimeRegistry }),
    [source, auth, queryClient],
  );
  return null;
}
