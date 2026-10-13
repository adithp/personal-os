import { z } from 'zod';
import { defineAction } from './actions';

/**
 * The Tasks report (Feature 7, research memo docs/design/research/tasks-reporting.md decisions D3
 * to D6 and D13). Days are India calendar days (Asia/Kolkata, UTC+05:30), written YYYY-MM-DD.
 * A week is Monday to Sunday and a month is the 1st to the last day of the current India month;
 * "previous" is the period before it, up to the same point (the same weekday, or the same day of
 * the month).
 */
export const REPORT_PERIODS = ['week', 'month'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const taskReportInput = z.object({ period: z.enum(REPORT_PERIODS) });
export type TaskReportInput = z.infer<typeof taskReportInput>;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const count = z.number().int().min(0);

/** Done tasks of one day or one period: how many, and how many were on time or late. */
const doneCounts = z.object({
  done: count,
  /** Done on or before the India day it was due. */
  onTime: count,
  /** Done after the India day it was due. */
  late: count,
  /** Done without a due date (not in the on-time rate). */
  noDueDate: count,
});

export const reportDaySchema = doneCounts.extend({ date });
export type ReportDay = z.infer<typeof reportDaySchema>;

export const taskReportSchema = z.object({
  period: z.enum(REPORT_PERIODS),
  timeZone: z.literal('Asia/Kolkata'),
  today: date,
  start: date,
  end: date,
  /** One entry for every day from start to end; future days have zeros. */
  days: z.array(reportDaySchema),
  totals: doneCounts.extend({ added: count }),
  previous: doneCounts.extend({ start: date, end: date, added: count }),
  /** A snapshot: open, not archived, top-level tasks whose due day is before today. */
  overdueNow: count,
  /** The 5 tags with the most done tasks, most first (ties by name). */
  byTag: z
    .array(z.object({ tagId: z.uuid(), name: z.string(), color: z.string(), done: count }))
    .max(5),
  /** Done tasks whose tags are not among byTag (counted once per task). */
  otherTagsDone: count,
  /** Done tasks without a tag. */
  noTagDone: count,
  /** True when the user has at least one completed task ever (the page shows "No finished tasks yet" only when false). */
  hasEverDone: z.boolean(),
});
export type TaskReport = z.infer<typeof taskReportSchema>;

export const taskReportActions = {
  report: defineAction({
    name: 'tasks.report',
    description:
      'Numbers for the Tasks report: done per day, on-time rate, added, overdue now, and done by tag, for this week or this month (India time).',
    permission: 'read',
    input: taskReportInput,
  }),
} as const;
