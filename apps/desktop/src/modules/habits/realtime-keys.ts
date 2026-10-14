import type { RealtimeKeys } from '../../realtime/registry';
import { HABITS_KEY } from './query-keys';

/** Which cached queries go stale when a Habits table changes: a log moves streaks and statistics. */
export const habitsRealtimeKeys: RealtimeKeys = {
  habits: [HABITS_KEY],
  habit_logs: [HABITS_KEY],
};
