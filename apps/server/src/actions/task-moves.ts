import { taskActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import { implement } from './registry';

/**
 * Moving a task (drag and drop): finds the position between the neighbours (afterId, beforeId),
 * rebalances the positions when they get too close, and changes the status and due date in the
 * same step through applyChange in tasks.ts (so completing, reopening, and the all-day rule behave
 * exactly like tasks.update). The undo is the tasks.update that puts the old values back.
 * CONTRACT STUB: the Feature 2 server-dev agent implements this and owns this file.
 */
export const taskMoveImplementations = [
  implement(taskActions.move, () => {
    throw new HttpError(501, 'not_implemented', 'Moving tasks is not built yet');
  }),
];
