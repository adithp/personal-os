import { categories } from '@personal-os/db';
import { DEFAULT_CATEGORIES, financeActions } from '@personal-os/shared';
import { asc } from 'drizzle-orm';
import { withUserLock } from '../lib/user-lock';
import type { UserScope } from '../lib/user-scope';
import {
  changes,
  conflict,
  findAny,
  findLive,
  notFound,
  softDeleteLive,
  toCategory,
  undelete,
  updateLive,
} from './money-common';
import { implement } from './registry';

/** Categories (docs/features/money.md): names are unique per kind, ignoring case (409 name_taken). */

const OTHER_COLOR = '#C5CCD6';

/** Another live category of this kind already has the name. */
async function assertNameFree(
  scope: UserScope,
  kind: string,
  name: string,
  exceptId?: string,
): Promise<void> {
  const live = await scope.select(categories, { where: scope.isLive(categories) });
  const wanted = name.toLowerCase();
  if (
    live.some(
      (row) => row.id !== exceptId && row.kind === kind && row.name.toLowerCase() === wanted,
    )
  ) {
    throw conflict('name_taken', 'A category with this name already exists');
  }
}

export const categoryImplementations = [
  implement(financeActions.categoriesList, ({ scope }) =>
    withUserLock('money-categories', scope.userId, async () => {
      // Defaults only for a user who never had a category (deleted ones count)
      const [any] = await scope.select(categories, { limit: 1 });
      if (!any) {
        for (const entry of DEFAULT_CATEGORIES) await scope.insert(categories, { ...entry });
      }
      const rows = await scope.select(categories, {
        where: scope.isLive(categories),
        orderBy: [asc(categories.kind), asc(categories.createdAt), asc(categories.id)],
      });
      return { data: rows.map(toCategory) };
    }),
  ),

  implement(financeActions.categoriesCreate, ({ scope }, input) =>
    withUserLock('money-categories', scope.userId, () =>
      scope.transaction(async (tx) => {
        await assertNameFree(tx, input.kind, input.name);
        const [row] = await tx.insert(categories, {
          name: input.name,
          kind: input.kind,
          color: input.color ?? OTHER_COLOR,
        });
        if (!row) throw new Error('Could not create the category');
        return {
          data: toCategory(row),
          undo: { action: 'finance.categories.delete', input: { id: row.id } },
        };
      }),
    ),
  ),

  implement(financeActions.categoriesUpdate, ({ scope }, input) =>
    withUserLock('money-categories', scope.userId, () =>
      scope.transaction(async (tx) => {
        const current = await findLive(tx, categories, input.id);
        if (!current) throw notFound('Category');
        const { values, old } = changes(current, input, ['name', 'color']);
        if (Object.keys(values).length === 0) return { data: toCategory(current), undo: null };
        if (typeof values.name === 'string') {
          await assertNameFree(tx, current.kind, values.name, current.id);
        }
        const updated = await updateLive(tx, categories, input.id, values);
        if (!updated) throw notFound('Category');
        return {
          data: toCategory(updated),
          undo: { action: 'finance.categories.update', input: { id: input.id, ...old } },
        };
      }),
    ),
  ),

  implement(financeActions.categoriesDelete, async ({ scope }, { id }) => {
    const deleted = await softDeleteLive(scope, categories, id);
    if (!deleted) throw notFound('Category');
    return {
      data: toCategory(deleted),
      undo: { action: 'finance.categories.restore', input: { id } },
    };
  }),

  implement(financeActions.categoriesRestore, ({ scope }, { id }) =>
    withUserLock('money-categories', scope.userId, () =>
      scope.transaction(async (tx) => {
        const current = await findAny(tx, categories, id);
        if (!current) throw notFound('Category');
        if (current.deletedAt === null) return { data: toCategory(current), undo: null };
        await assertNameFree(tx, current.kind, current.name);
        const restored = await undelete(tx, categories, id);
        if (!restored) throw notFound('Category');
        return {
          data: toCategory(restored),
          undo: { action: 'finance.categories.delete', input: { id } },
        };
      }),
    ),
  ),
];
