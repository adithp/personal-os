import type { ReportPeriod, TaskReport } from '@personal-os/shared';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../api/api-context';
import { TASKS_KEY } from '../tasks-queries';

/**
 * The Tasks report for a period (docs/design/research/tasks-reporting.md D13, D14). The key starts
 * with TASKS_KEY, so every task change that refreshes the task lists refreshes the report too.
 */
export const reportKey = (period: ReportPeriod) => [...TASKS_KEY, 'report', period] as const;

export function useReport(period: ReportPeriod) {
  const api = useApi();
  return useQuery({
    queryKey: reportKey(period),
    queryFn: async () =>
      (await api.request<{ item: TaskReport }>('GET', '/tasks/report', { query: { period } })).item,
    staleTime: 60_000,
    // Switching the period keeps the last picture on screen (at half opacity) until the new one comes
    placeholderData: (previous) => previous,
  });
}
