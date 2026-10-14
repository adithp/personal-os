import { tags, tasks } from '@personal-os/db';
import {
  SEARCH_TYPES,
  searchActions,
  type SearchGroup,
  type SearchHit,
  type SearchType,
} from '@personal-os/shared';
import { and, inArray } from 'drizzle-orm';
import { hasSearchWords, matchEntities, snippets, startsWith } from '../lib/search';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';

/**
 * search.global (read): keyword search over every module (docs/design/research/search.md).
 * One provider per SearchType; adding a type to SEARCH_TYPES fails the type check until its
 * provider exists here. Providers run in parallel; one failing fails the request (D13).
 */
type SearchProvider = (scope: UserScope, text: string, limit: number) => Promise<SearchHit[]>;

/** Done and archived tasks stay findable but rank at half weight (D9). */
const DONE_OR_ARCHIVED_WEIGHT = 0.5;
/** The task provider reads this many times the limit, then re-ranks and cuts (D9). */
const OVERFETCH = 4;

const taskProvider: SearchProvider = async (scope, text, limit) => {
  const matches = await matchEntities(scope, { text, type: 'task', limit: limit * OVERFETCH });
  if (matches.length === 0) return [];

  const rows = await scope.select(tasks, {
    where: and(
      scope.isLive(tasks),
      inArray(
        tasks.id,
        matches.map((match) => match.id),
      ),
    ),
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  // Subtasks are only reachable through their parent: drop them when the parent is deleted.
  const parentIds = [
    ...new Set(rows.flatMap((row) => (row.parentTaskId ? [row.parentTaskId] : []))),
  ];
  const liveParents = new Set(
    parentIds.length === 0
      ? []
      : (
          await scope.select(tasks, {
            where: and(scope.isLive(tasks), inArray(tasks.id, parentIds)),
          })
        ).map((parent) => parent.id),
  );

  const ranked = matches
    .flatMap((match) => {
      const row = byId.get(match.id);
      if (!row) return [];
      if (row.parentTaskId && !liveParents.has(row.parentTaskId)) return [];
      const weight = row.status === 'done' || row.archivedAt ? DONE_OR_ARCHIVED_WEIGHT : 1;
      return [{ row, rank: match.rank * weight, updatedAt: match.updatedAt.getTime() }];
    })
    .sort((a, b) => b.rank - a.rank || b.updatedAt - a.updatedAt)
    .slice(0, limit);

  const excerpts = await snippets(scope, {
    table: tasks,
    titleColumn: tasks.title,
    textColumn: tasks.description,
    ids: ranked.map(({ row }) => row.id),
    text,
  });

  return ranked.map(({ row }) => ({
    type: 'task',
    id: row.id,
    title: row.title,
    snippet: excerpts.get(row.id) ?? null,
    status: row.status,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    dueAllDay: row.dueAllDay,
    archived: row.archivedAt !== null,
    parentTaskId: row.parentTaskId,
  }));
};

/** Tags are found by the start of their name, only for a single typed word (a leading # is ignored). */
const tagProvider: SearchProvider = async (scope, text, limit) => {
  const word = text.trim().replace(/^#/, '');
  if (!word || /\s/.test(word)) return [];
  const rows = await scope.select(tags, {
    where: and(scope.isLive(tags), startsWith(tags.name, word)),
  });
  const lower = word.toLowerCase();
  const exact = (name: string) => (name.toLowerCase() === lower ? 0 : 1);
  return rows
    .sort(
      (a, b) =>
        exact(a.name) - exact(b.name) ||
        a.name.length - b.name.length ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit)
    .map((row) => ({
      type: 'tag',
      id: row.id,
      title: row.name,
      snippet: null,
      color: row.color,
    }));
};

const SEARCH_PROVIDERS: Record<SearchType, SearchProvider> = {
  task: taskProvider,
  tag: tagProvider,
};

export const searchImplementations = [
  implement(searchActions.global, async ({ scope }, { q, types, limit }) => {
    if (!hasSearchWords(q)) return { data: { q, groups: [] } };
    const wanted = SEARCH_TYPES.filter((type) => !types || types.includes(type));
    const found = await Promise.all(
      wanted.map(async (type): Promise<SearchGroup> => ({
        type,
        items: await SEARCH_PROVIDERS[type](scope, q, limit),
      })),
    );
    return { data: { q, groups: found.filter((group) => group.items.length > 0) } };
  }),
];
