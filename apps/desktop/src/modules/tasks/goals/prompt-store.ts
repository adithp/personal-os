import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * "Not yet" on the "Mark as achieved?" prompt (docs/design/research/tasks-goals.md D8): the prompt
 * stays hidden on this device until the number of counted tasks of that goal changes. Saved as goal
 * id to the total that was dismissed.
 */
interface GoalPromptState {
  dismissed: Record<string, number>;
  dismiss: (goalId: string, total: number) => void;
  isDismissed: (goalId: string, total: number) => boolean;
}

export const useGoalPrompts = create<GoalPromptState>()(
  persist(
    (set, get) => ({
      dismissed: {},
      dismiss: (goalId, total) => {
        set((state) => ({ dismissed: { ...state.dismissed, [goalId]: total } }));
      },
      isDismissed: (goalId, total) => get().dismissed[goalId] === total,
    }),
    { name: 'personal-os.tasks-goals', version: 1 },
  ),
);
