import { taskReportActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import { implement } from './registry';

/**
 * tasks.report (read): the numbers for the Tasks report page. The formulas are in
 * docs/design/research/tasks-reporting.md (D3 to D6, D13): India calendar days, week = Monday to
 * Sunday, month = the 1st to the last day, previous period up to the same point, done per day with
 * on-time and late, added, overdue now, done by tag (top 5, other tags, no tag), top-level tasks only,
 * deleted tasks never counted, archived tasks count for done and added but not for overdue now.
 * Read the rows through scope.select (no raw SQL outside src/lib) and count in code. "Now" comes from
 * the clock (new Date()), so tests can set the system time.
 * CONTRACT STUB: the Feature 7 server-dev agent implements it and owns this file.
 */
export const taskReportImplementations = [
  implement(taskReportActions.report, () => {
    throw new HttpError(501, 'not_implemented', 'The report is not built yet');
  }),
];
