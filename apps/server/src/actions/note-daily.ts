import { noteDailyActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import { implement } from './registry';

/**
 * notes.openDaily (docs/design/research/notes.md D12), stage N3. Contract stub: answers 501 until
 * the stage N3 server work fills it in.
 * Rules to build: `date` is an India day, default today (`indiaDay(new Date())`); returns the live
 * note with that `daily_date` or creates it (title YYYY-MM-DD, or `YYYY-MM-DD (daily)` when a normal
 * note has that title; no folder; text from the daily-default template through `applyTemplate`);
 * undo is notes.delete when created, else null.
 */
export const noteDailyImplementations = [
  implement(noteDailyActions.openDaily, () =>
    Promise.reject(new HttpError(501, 'not_implemented', 'Daily notes are not built yet')),
  ),
];
