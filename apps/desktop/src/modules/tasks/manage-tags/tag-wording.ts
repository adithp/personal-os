const plural = (count: number, word: string) => `${String(count)} ${word}${count === 1 ? '' : 's'}`;

/** The muted usage text of a row: "12 tasks", "1 task", "Not used". */
export function usageLabel(taskCount: number): string {
  return taskCount === 0 ? 'Not used' : plural(taskCount, 'task');
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
export function mergeQuestion(existingName: string, oldName: string, taskCount: number): string {
  const effect =
    taskCount === 0
      ? 'No tasks use it.'
      : `${plural(taskCount, 'task')} will get '${existingName}'.`;
  return `'${existingName}' already exists. Merge '${oldName}' into it? ${effect}`;
}
