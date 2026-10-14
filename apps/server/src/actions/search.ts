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
/** The task provider reads at least this many candidates per page, then re-ranks and cuts (D9). */
const MIN_CANDIDATES = 100;
const CANDIDATE_FACTOR = 10;
/** Extra pages read when too few valid hits were found (done tasks or orphans took the slots). */
const MAX_PAGES = 4;

const taskProvider: SearchProvider = async (scope, text, limit) => {
  const pageSize = Math.max(limit * CANDIDATE_FACTOR, MIN_CANDIDATES);
  const ranked: { row: typeof tasks.$inferSelect; rank: number; updatedAt: number }[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const matches = await matchEntities(scope, {
      text,
      type: 'task',
      limit: pageSize,
      offset: page * pageSize,
    });
    if (matches.length === 0) break;

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
    // Subtasks nest one level only (tasks.create rejects a parent that has a parent), so the
    // parent is the whole ancestor chain. Revisit this check if deeper nesting is ever allowed.
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

    for (const match of matches) {
      const row = byId.get(match.id);
      if (!row) continue;
      if (row.parentTaskId && !liveParents.has(row.parentTaskId)) continue;
      const weight = row.status === 'done' || row.archivedAt ? DONE_OR_ARCHIVED_WEIGHT : 1;
      // Tie-break on tasks.updated_at: the 0010 backfill reset entities.updated_at.
      ranked.push({ row, rank: match.rank * weight, updatedAt: row.updatedAt.getTime() });
    }
    if (ranked.length >= limit || matches.length < pageSize) break;
  }

  ranked.sort((a, b) => b.rank - a.rank || b.updatedAt - a.updatedAt);
  ranked.splice(limit);

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
