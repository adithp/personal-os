const plural = (count: number, word: string) => `${String(count)} ${word}${count === 1 ? '' : 's'}`;

/** The muted usage text of a row: "12 tasks", "1 task", "2 tasks · 3 notes", "Not used". */
export function usageLabel(taskCount: number, noteCount = 0): string {
  if (noteCount === 0) return taskCount === 0 ? 'Not used' : plural(taskCount, 'task');
  return taskCount === 0
    ? plural(noteCount, 'note')
    : `${plural(taskCount, 'task')} · ${plural(noteCount, 'note')}`;
}

/** The delete question for a tag that is in use. */
export function deleteQuestion(name: string, taskCount: number, favoriteCount: number): string {
  const parts = [
    taskCount > 0 ? plural(taskCount, 'task') : null,
    favoriteCount > 0 ? plural(favoriteCount, 'favorite') : null,
  ].filter((part) => part !== null);
  const tail = taskCount > 0 ? ' The tasks stay.' : '';
  return `Delete '${name}'? It is removed from ${parts.join(' and ')}.${tail}`;
}

/** The merge question shown when a rename hits another tag's name. */
export function mergeQuestion(
  existingName: string,
  oldName: string,
  taskCount: number,
  favoriteCount = 0,
): string {
  const moving = [
    taskCount > 0 ? plural(taskCount, 'task') : null,
    favoriteCount > 0 ? plural(favoriteCount, 'favorite') : null,
  ].filter((part) => part !== null);
  const effect =
    moving.length === 0
      ? 'No tasks use it.'
      : `${moving.join(' and ')} will move to '${existingName}'.`;
  return `'${existingName}' already exists. Merge '${oldName}' into it? ${effect}`;
}
