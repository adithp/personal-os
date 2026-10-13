import {
  entityTags,
  tags,
  tasks,
  type EntityTagRow,
  type TagRow,
  type TaskRow,
} from '@personal-os/db';
import { taskReportActions, type ReportDay, type TaskReport } from '@personal-os/shared';
import { and, eq, gte, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';

/**
 * tasks.report (read): the numbers for the Tasks report page. The formulas are in
 * docs/design/research/tasks-reporting.md (D3 to D6, D13): India calendar days, week = Monday to
 * Sunday, month = the 1st to the last day, previous period up to the same point, done per day with
 * on-time and late, added, overdue now, done by tag (top 5, other tags, no tag), top-level tasks only,
 * deleted tasks never counted, archived tasks count for done and added but not for overdue now.
 * Rows are read through scope.select (no raw SQL outside src/lib) and counted in code. "Now" comes
 * from the clock (new Date()), so tests can set the system time.
 */

const IST_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TAGS = 5;

/** An India calendar day as a whole number of days since 1970-01-01. */
const dayOf = (time: Date) => Math.floor((time.getTime() + IST_MS) / DAY_MS);
/** The instant an India day starts. */
const dayStart = (day: number) => new Date(day * DAY_MS - IST_MS);
/** YYYY-MM-DD of an India day number. */
const dateOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const dayNumber = (year: number, month: number, dayOfMonth: number) =>
  Math.floor(Date.UTC(year, month, dayOfMonth) / DAY_MS);

interface Range {
  start: number;
  end: number;
}

/** The current period and the previous one up to the same point, as day numbers. */
function periods(period: 'week' | 'month', today: number): { current: Range; previous: Range } {
  if (period === 'week') {
    // 1970-01-01 (day 0) was a Thursday, so (day + 3) % 7 is 0 for Monday.
    const start = today - ((today + 3) % 7);
    return {
      current: { start, end: start + 6 },
      previous: { start: start - 7, end: start - 7 + (today - start) },
    };
  }
  const now = new Date(today * DAY_MS);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const dayOfMonth = now.getUTCDate();
  const start = dayNumber(year, month, 1);
  const nextStart = dayNumber(year, month + 1, 1);
  const previousStart = dayNumber(year, month - 1, 1);
  const previousLength = start - previousStart;
  return {
    current: { start, end: nextStart - 1 },
    previous: {
      start: previousStart,
      end: previousStart + Math.min(dayOfMonth, previousLength) - 1,
    },
  };
}

interface Counts {
  done: number;
  onTime: number;
  late: number;
  noDueDate: number;
}

/** Rows read for "overdue now" at most; above this the number is a floor. */
const MAX_OVERDUE_ROWS = 20_000;
const BATCH = 1000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    parts.push(items.slice(index, index + size));
  return parts;
}

const emptyCounts = (): Counts => ({ done: 0, onTime: 0, late: 0, noDueDate: 0 });

function countDone(counts: Counts, row: TaskRow, completedDay: number): void {
  counts.done += 1;
  if (!row.dueAt) counts.noDueDate += 1;
  else if (completedDay <= dayOf(row.dueAt)) counts.onTime += 1;
  else counts.late += 1;
}

const inRange = (day: number, range: Range) => day >= range.start && day <= range.end;

async function buildReport(scope: UserScope, period: 'week' | 'month'): Promise<TaskReport> {
  const today = dayOf(new Date());
  const { current, previous } = periods(period, today);
  const since = dayStart(previous.start);
  const todayStart = dayStart(today);

  const rows = await scope.select(tasks, {
    where: and(
      scope.isLive(tasks),
      isNull(tasks.parentTaskId),
      or(gte(tasks.completedAt, since), gte(tasks.createdAt, since)),
    ),
  });
  // Overdue now is a snapshot with no lower bound: read it apart and cap it, so a very old backlog
  // cannot make every report call load everything (scope.select cannot count or pick columns)
  const overdue = await scope.select(tasks, {
    where: and(
      scope.isLive(tasks),
      isNull(tasks.parentTaskId),
      inArray(tasks.status, ['todo', 'doing']),
      isNull(tasks.archivedAt),
      isNotNull(tasks.dueAt),
      lt(tasks.dueAt, todayStart),
    ),
    limit: MAX_OVERDUE_ROWS,
  });

  const days = new Map<number, Counts>();
  for (let day = current.start; day <= current.end; day += 1) days.set(day, emptyCounts());
  const totals = { ...emptyCounts(), added: 0 };
  const before = { ...emptyCounts(), added: 0 };
  const overdueNow = overdue.length;
  const doneIds: string[] = [];

  for (const row of rows) {
    if (row.status === 'done' && row.completedAt) {
      const completedDay = dayOf(row.completedAt);
      if (inRange(completedDay, current)) {
        countDone(totals, row, completedDay);
        const dayCounts = days.get(completedDay);
        if (dayCounts) countDone(dayCounts, row, completedDay);
        doneIds.push(row.id);
      } else if (inRange(completedDay, previous)) {
        countDone(before, row, completedDay);
      }
    }
    const createdDay = dayOf(row.createdAt);
    if (inRange(createdDay, current)) totals.added += 1;
    else if (inRange(createdDay, previous)) before.added += 1;
  }

  // Has any task ever been completed? (the page shows "No finished tasks yet" only when not)
  let hasEverDone = totals.done > 0 || before.done > 0;
  if (!hasEverDone) {
    const [any] = await scope.select(tasks, {
      where: and(scope.isLive(tasks), eq(tasks.status, 'done'), isNotNull(tasks.completedAt)),
      limit: 1,
    });
    hasEverDone = any !== undefined;
  }

  // Done tasks of this period and their live tags
  const tagsOfTask = new Map<string, string[]>();
  const tagById = new Map<string, { name: string; color: string }>();
  if (doneIds.length > 0) {
    // In batches: one statement can hold at most 65,535 values
    const links: EntityTagRow[] = [];
    for (const batch of chunk(doneIds, BATCH)) {
      links.push(
        ...(await scope.select(entityTags, { where: inArray(entityTags.entityId, batch) })),
      );
    }
    if (links.length > 0) {
      const tagRows: TagRow[] = [];
      for (const batch of chunk([...new Set(links.map((link) => link.tagId))], BATCH)) {
        tagRows.push(
          ...(await scope.select(tags, {
            where: and(scope.isLive(tags), inArray(tags.id, batch)),
          })),
        );
      }
      for (const tag of tagRows) tagById.set(tag.id, { name: tag.name, color: tag.color });
      for (const link of links) {
        if (!tagById.has(link.tagId)) continue;
        tagsOfTask.set(link.entityId, [...(tagsOfTask.get(link.entityId) ?? []), link.tagId]);
      }
    }
  }
  const doneByTag = new Map<string, number>();
  for (const tagIds of tagsOfTask.values()) {
    for (const tagId of tagIds) doneByTag.set(tagId, (doneByTag.get(tagId) ?? 0) + 1);
  }
  const lower = (tagId: string) => (tagById.get(tagId)?.name ?? '').toLowerCase();
  const ranked = [...doneByTag.entries()].sort(
    ([idA, countA], [idB, countB]) =>
      countB - countA ||
      (lower(idA) < lower(idB) ? -1 : lower(idA) > lower(idB) ? 1 : 0) ||
      (idA < idB ? -1 : 1),
  );
  const top = new Set(ranked.slice(0, MAX_TAGS).map(([tagId]) => tagId));
  let otherTagsDone = 0;
  for (const tagIds of tagsOfTask.values()) {
    if (!tagIds.some((tagId) => top.has(tagId))) otherTagsDone += 1;
  }

  const reportDays: ReportDay[] = [...days.entries()].map(([day, counts]) => ({
    date: dateOf(day),
    ...counts,
  }));

  return {
    period,
    timeZone: 'Asia/Kolkata',
    today: dateOf(today),
    start: dateOf(current.start),
    end: dateOf(current.end),
    days: reportDays,
    totals,
    previous: { start: dateOf(previous.start), end: dateOf(previous.end), ...before },
    overdueNow,
    byTag: ranked.slice(0, MAX_TAGS).map(([tagId, done]) => ({
      tagId,
      name: tagById.get(tagId)?.name ?? '',
      color: tagById.get(tagId)?.color ?? '',
      done,
    })),
    otherTagsDone,
    noTagDone: totals.done - tagsOfTask.size,
    hasEverDone,
  };
}

export const taskReportImplementations = [
  implement(taskReportActions.report, async (ctx, input) => ({
    data: await buildReport(ctx.scope, input.period),
    undo: null,
  })),
];
