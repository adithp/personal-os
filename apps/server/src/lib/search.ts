import { entities } from '@personal-os/db';
import type { EntityType } from '@personal-os/shared';
import { and, desc, eq, inArray, isNotNull, isNull, not, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { UserOwnedTable, UserScope } from './user-scope';

/**
 * The only full-text SQL in the server (docs/design/research/search.md, D4, D9, D10, D12).
 * The text is always a bound parameter. Callers outside src/lib use these helpers.
 */

/** The Postgres text-search configuration (decision 42): no stemming, no stop words. */
export const SEARCH_CONFIG = 'simple';
const config = sql.raw(`'${SEARCH_CONFIG}'`);

/** A NUL byte makes Postgres fail (E2); the input schema strips it, this is the second line. */
// eslint-disable-next-line no-control-regex
const withoutNul = (text: string) => text.replace(/\u0000/g, ' ');

/**
 * The text as a prefix query (D4): Postgres splits the words itself, then every word becomes
 * "word:*" joined by AND. Never fails on punctuation; text with no words gives an empty query.
 */
export function prefixQuery(text: string): SQL {
  return sql`(select coalesce(string_agg(quote_literal(lexeme) || ':*', ' & '), '')::tsquery from unnest(to_tsvector(${config}, ${withoutNul(text)}::text)))`;
}

/** True when the text has at least one word (same Unicode rule as the app), so empty searches skip the database. */
export function hasSearchWords(text: string): boolean {
  return /[\p{L}\p{M}\p{N}]/u.test(text);
}

/** lower(column) LIKE lower(prefix) || '%', with %, _ and \ in the prefix escaped. */
export function startsWith(column: AnyPgColumn, prefix: string): SQL {
  const escaped = prefix.replace(/[\\%_]/g, (character) => `\\${character}`);
  return sql`lower(${column}) like lower(${escaped}::text) || '%' escape '\\'`;
}

export interface EntityMatch {
  id: string;
  title: string;
  rank: number;
  updatedAt: Date;
}

/** Live entities of one type whose search_vector matches, best first (rank, then newest). */
export async function matchEntities(
  scope: UserScope,
  input: { text: string; type: EntityType; limit: number },
): Promise<EntityMatch[]> {
  if (!hasSearchWords(input.text)) return [];
  const query = prefixQuery(input.text);
  const rank = sql<number>`ts_rank(${entities.searchVector}, ${query}, 1)`;
  const rows = await scope.selectFields(
    entities,
    { id: entities.id, title: entities.title, rank, updatedAt: entities.updatedAt },
    {
      where: and(
        eq(entities.type, input.type),
        isNull(entities.deletedAt),
        sql`${entities.searchVector} @@ ${query}`,
      ),
      orderBy: [desc(rank), desc(entities.updatedAt)],
      limit: input.limit,
    },
  );
  return rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    rank: Number(row.rank),
    updatedAt: row.updatedAt as Date,
  }));
}

const HEADLINE_OPTIONS = 'StartSel="",StopSel="",MaxWords=14,MinWords=6,ShortWord=0';

/**
 * Plain-text excerpts (D10) of one text column for these row ids, only where the title does not
 * match all the words but the text does. The app highlights; no markup is sent.
 */
export async function snippets(
  scope: UserScope,
  input: {
    table: UserOwnedTable;
    titleColumn: AnyPgColumn;
    textColumn: AnyPgColumn;
    ids: string[];
    text: string;
  },
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (input.ids.length === 0 || !hasSearchWords(input.text)) return result;
  const query = prefixQuery(input.text);
  const rows = await scope.selectFields(
    input.table,
    {
      id: input.table.id,
      snippet: sql<string>`ts_headline(${config}, ${input.textColumn}, ${query}, ${HEADLINE_OPTIONS}::text)`,
    },
    {
      where: and(
        inArray(input.table.id, input.ids),
        isNotNull(input.textColumn),
        not(sql`to_tsvector(${config}, ${input.titleColumn}) @@ ${query}`),
        sql`to_tsvector(${config}, ${input.textColumn}) @@ ${query}`,
      ),
    },
  );
  for (const row of rows) {
    const snippet = (row.snippet as string).replace(/\s+/g, ' ').trim();
    if (snippet) result.set(row.id as string, snippet);
  }
  return result;
}
