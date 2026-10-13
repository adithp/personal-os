import { istDay, istDayStartPlus } from '../dates';

/**
 * The start of the next Monday in India time, as UTC ISO. It is always a later day than today:
 * on a Monday it gives the Monday a week away ("Next week").
 */
export function nextMondayStart(ms: number): string {
  // 1 January 1970 was a Thursday, so day 0 is weekday 4 (Sunday is 0, Monday is 1)
  const weekday = (istDay(ms) + 4) % 7;
  const ahead = (1 - weekday + 7) % 7 || 7;
  return istDayStartPlus(ms, ahead);
}
