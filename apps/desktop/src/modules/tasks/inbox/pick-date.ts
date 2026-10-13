import { fromIstDate, startOfIstDay } from '../dates';

/** The date typed in the Inbox date box ("2025-10-07", India calendar) must be today or later. */
export function checkPickedDate(
  value: string,
  nowMs: number,
): { dueAt: string } | { error: string } {
  const dueAt = fromIstDate(value);
  if (dueAt === null) return { error: 'Pick a date.' };
  if (dueAt < startOfIstDay(nowMs)) return { error: 'Pick today or a later date.' };
  return { dueAt };
}
