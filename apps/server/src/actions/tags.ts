import { tags, type TagRow } from '@personal-os/db';
import { nextTagColor, tagActions, type Tag } from '@personal-os/shared';
import { and, asc, eq } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';
import { implement } from './registry';

/**
 * Tag actions (docs/DATABASE.md): tags are a plain table (no entity row), unique per user ignoring
 * case among live tags.
 */

export function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The user's live tags, oldest first. */
function liveTags(scope: UserScope): Promise<TagRow[]> {
  return scope.select(tags, {
    where: scope.isLive(tags),
    orderBy: [asc(tags.createdAt), asc(tags.id)],
  });
}

export const tagImplementations = [
  implement(tagActions.list, async ({ scope }) => ({
    data: (await liveTags(scope)).map(toTag),
  })),

  implement(tagActions.create, async ({ scope }, input) => {
    const row = await scope.transaction(async (tx) => {
      const all = await liveTags(tx);
      const existing = all.find((tag) => sameName(tag.name, input.name));
      if (existing) return { tag: existing, created: false };
      const [created] = await tx.insert(tags, {
        name: input.name,
        color: input.color ?? nextTagColor(all.length),
      });
      if (!created) throw new Error('Could not create the tag');
      return { tag: created, created: true };
    });
    return { data: { ...toTag(row.tag), created: row.created }, undo: null };
  }),

  implement(tagActions.update, async ({ scope }, { id, name, color }) =>
    scope.transaction(async (tx) => {
      const all = await liveTags(tx);
      const current = all.find((tag) => tag.id === id);
      if (!current) throw new HttpError(404, 'not_found', 'Tag not found');
      if (name !== undefined && all.some((tag) => tag.id !== id && sameName(tag.name, name))) {
        throw new HttpError(409, 'conflict', 'A tag with this name already exists');
      }
      const values: Partial<Pick<TagRow, 'name' | 'color'>> = {};
      if (name !== undefined && name !== current.name) values.name = name;
      if (color !== undefined && color !== current.color) values.color = color;
      if (Object.keys(values).length === 0) return { data: toTag(current), undo: null };
      const [updated] = await tx.update(
        tags,
        { ...values, updatedAt: new Date() },
        and(eq(tags.id, id), tx.isLive(tags)) ?? eq(tags.id, id),
      );
      if (!updated) throw new HttpError(404, 'not_found', 'Tag not found');
      return {
        data: toTag(updated),
        undo: {
          action: 'tags.update',
          input: { id, name: current.name, color: current.color },
        },
      };
    }),
  ),
];
