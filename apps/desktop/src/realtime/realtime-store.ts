import { create } from 'zustand';

export type RealtimeStatus = 'off' | 'connecting' | 'live' | 'reconnecting';

interface RealtimeStore {
  status: RealtimeStatus;
}

/** Whether live updates are running; shown read-only in Settings → Account. */
export const useRealtimeStore = create<RealtimeStore>(() => ({ status: 'off' }));

export function setRealtimeStatus(status: RealtimeStatus) {
  useRealtimeStore.setState({ status });
}
