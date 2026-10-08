import type { Task } from '@personal-os/shared';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../../../api/api-context';
import { taskKeys, useArchivedTasks, useCompletedTasks, useOpenTasks } from '../tasks-queries';

/** Keeps the first copy of every task id. */
export function dedupe(tasks: readonly Task[]): Task[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

/**
 * Everything My tasks lists, before filters: open tasks plus the last 7 days of completed ones
 * (plus older completed pages after "Show more"), or only the archived ones.
 */
export function useMyTasksData(archived: boolean) {
  const api = useApi();
  const open = useOpenTasks();
  const completed = useCompletedTasks({ enabled: !archived });
  const archive = useArchivedTasks({ enabled: archived });
  // Each "Show more" adds one page: the tasks completed before the oldest one shown so far
  const [befores, setBefores] = useState<string[]>([]);
  const pages = useQueries({
    queries: befores.map((before) => ({
      queryKey: taskKeys.list({ status: 'done', completedBefore: before }),
      queryFn: async () =>
        (
          await api.request<{ items: Task[] }>('GET', '/tasks', {
            query: { status: 'done', completedBefore: before },
          })
        ).items,
    })),
  });

  const older = pages.flatMap((page) => page.data ?? []);
  const doneTasks = dedupe([...(completed.data ?? []), ...older]);
  const tasks = archived
    ? dedupe(archive.data ?? [])
    : dedupe([...(open.data ?? []), ...doneTasks]);

  const doneTimes = doneTasks.flatMap((task) =>
    task.completedAt === null ? [] : [Date.parse(task.completedAt)],
  );
  const oldestDone =
    doneTimes.length > 0 ? new Date(Math.min(...doneTimes)).toISOString() : undefined;
  const lastPage = pages[pages.length - 1];
  const loadingMore = lastPage?.isFetching === true && lastPage.data === undefined;
  // The last page came back empty: there is nothing older
  const exhausted = lastPage?.data?.length === 0;

  const queries = archived ? [open, archive] : [open, completed];
  return {
    tasks,
    openTasks: open.data ?? [],
    isPending: queries.some((query) => query.isPending),
    error: queries.find((query) => query.isError)?.error ?? null,
    isError: queries.some((query) => query.isError),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
    canShowMore: !archived && oldestDone !== undefined && !exhausted,
    loadingMore,
    showMore: () => {
      if (oldestDone !== undefined) setBefores((list) => [...list, oldestDone]);
    },
  };
}
