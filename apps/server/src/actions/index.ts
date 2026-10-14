import { createActionRegistry, type ActionObserver, type ActionRegistry } from './registry';
import { tagImplementations } from './tags';
import { favoriteImplementations } from './favorites';
import { goalImplementations } from './goals';
import { noteLinkImplementations } from './note-link-actions';
import { noteFolderImplementations } from './note-folders';
import { noteDailyImplementations } from './note-daily';
import { noteTemplateImplementations } from './note-templates';
import { noteVersionImplementations } from './note-version-actions';
import { noteImplementations } from './notes';
import { habitImplementations } from './habits';
import { moneyImplementations } from './money-module';
import { projectImplementations } from './projects';
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
      ...noteImplementations,
      ...noteFolderImplementations,
      ...noteLinkImplementations,
      ...noteTemplateImplementations,
      ...noteDailyImplementations,
      ...noteVersionImplementations,
      ...habitImplementations,
      ...moneyImplementations,
      ...projectImplementations,
    ],
    observers,
  );
}
