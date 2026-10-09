import { createActionRegistry, type ActionObserver, type ActionRegistry } from './registry';
import { tagImplementations } from './tags';
import { recurrenceImplementations } from './recurrence';
import { dependencyImplementations } from './task-dependencies';
import { taskMoveImplementations } from './task-moves';
import { taskImplementations } from './tasks';

export * from './registry';

/** Every action the server can run. Add a module's actions here. */
export function createRegistry(observers: readonly ActionObserver[] = []): ActionRegistry {
  return createActionRegistry(
    [
      ...taskImplementations,
      ...taskMoveImplementations,
      ...dependencyImplementations,
      ...recurrenceImplementations,
      ...tagImplementations,
    ],
    observers,
  );
}
