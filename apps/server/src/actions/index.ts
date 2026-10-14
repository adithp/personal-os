import { createActionRegistry, type ActionObserver, type ActionRegistry } from './registry';
import { tagImplementations } from './tags';
import { favoriteImplementations } from './favorites';
import { goalImplementations } from './goals';
import { recurrenceImplementations } from './recurrence';
import { searchImplementations } from './search';
import { tagManagementImplementations } from './tag-management';
import { dependencyImplementations } from './task-dependencies';
import { taskMoveImplementations } from './task-moves';
import { taskReportImplementations } from './task-report';
import { taskImplementations } from './tasks';

export * from './registry';

/** Every action the server can run. Add a module's actions here. */
export function createRegistry(observers: readonly ActionObserver[] = []): ActionRegistry {
  return createActionRegistry(
    [
      ...taskImplementations,
      ...taskMoveImplementations,
      ...taskReportImplementations,
      ...dependencyImplementations,
      ...recurrenceImplementations,
      ...tagImplementations,
      ...tagManagementImplementations,
      ...favoriteImplementations,
      ...goalImplementations,
      ...searchImplementations,
    ],
    observers,
  );
}
