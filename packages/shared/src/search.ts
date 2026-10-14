import { z } from 'zod';
import { defineAction } from './actions';
import { taskStatusSchema } from './tasks';

/**
 * Global search (research memo docs/design/research/search.md, decisions D7, D8 and D11).
 * Keyword mode: every typed word is a prefix, joined by AND. Modules join through SEARCH_TYPES
 * (in display order); the server has one provider per type.
 */
export const SEARCH_TYPES = ['task', 'tag'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
export const searchTypeSchema = z.enum(SEARCH_TYPES);

export const SEARCH_QUERY_MAX = 100;
export const SEARCH_LIMIT_DEFAULT = 5;
export const SEARCH_LIMIT_MAX = 20;
/** The app asks the server from this many characters (one character only filters commands). */
export const SEARCH_MIN_CHARS = 2;

export const searchGlobalInput = z.object({
  q: z
    .string()
    // Control characters (a NUL byte crashes the query) become spaces
    // eslint-disable-next-line no-control-regex
    .transform((text) => text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim())
    .pipe(z.string().min(1, 'Type something to search').max(SEARCH_QUERY_MAX)),
  types: z.array(searchTypeSchema).min(1).optional(),
  limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).default(SEARCH_LIMIT_DEFAULT),
});
export type SearchGlobalInput = z.input<typeof searchGlobalInput>;

const hitBase = { id: z.uuid(), title: z.string(), snippet: z.string().nullable() };

export const taskHitSchema = z.object({
  type: z.literal('task'),
  ...hitBase,
  status: taskStatusSchema,
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  dueAllDay: z.boolean(),
  archived: z.boolean(),
  parentTaskId: z.uuid().nullable(),
});
export type TaskHit = z.infer<typeof taskHitSchema>;

export const tagHitSchema = z.object({ type: z.literal('tag'), ...hitBase, color: z.string() });
export type TagHit = z.infer<typeof tagHitSchema>;

export const searchHitSchema = z.discriminatedUnion('type', [taskHitSchema, tagHitSchema]);
export type SearchHit = z.infer<typeof searchHitSchema>;

/** Only non-empty groups, in SEARCH_TYPES order. The order of items is the rank. */
export const searchGroupSchema = z.object({
  type: searchTypeSchema,
  items: z.array(searchHitSchema),
});
export type SearchGroup = z.infer<typeof searchGroupSchema>;

export const searchResultSchema = z.object({ q: z.string(), groups: z.array(searchGroupSchema) });
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchActions = {
  global: defineAction({
    name: 'search.global',
    description:
      'Search tasks and tags by the start of their words (title and description). Returns groups of hits, best first.',
    permission: 'read',
    input: searchGlobalInput,
  }),
} as const;
