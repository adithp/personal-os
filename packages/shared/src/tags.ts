import { z } from 'zod';
import { defineAction } from './actions';
import { MODULES } from './modules';

/**
 * Tag colors: the module pastel palette (docs/DESIGN.md section 3). New tags take the next color
 * in this cycle; the color can be changed from the tag chip's menu.
 */
export const TAG_PALETTE = [
  MODULES.tasks.color,
  MODULES.mail.color,
  MODULES.projects.color,
  MODULES.money.color,
  MODULES.assistant.color,
  MODULES.calendar.color,
  MODULES.habits.color,
  MODULES.notes.color,
  MODULES.graph.color,
  MODULES.drive.color,
] as const;

/** The color for the nth tag a user creates (0 for the first), cycling through the palette. */
export function nextTagColor(existingTagCount: number): string {
  const index = ((existingTagCount % TAG_PALETTE.length) + TAG_PALETTE.length) % TAG_PALETTE.length;
  return TAG_PALETTE[index] ?? TAG_PALETTE[0];
}

export const TAG_NAME_MAX = 40;
export const MAX_TAGS_PER_TASK = 20;

export const tagName = z
  .string()
  .trim()
  .min(1, 'Tag name is required')
  .max(TAG_NAME_MAX)
  .refine((name) => !/[\s#]/.test(name), 'A tag name has no spaces or # characters');
const tagColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must look like #F7D96B');

/** A tag as the API returns it. */
export const tagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Tag = z.infer<typeof tagSchema>;

/** What a task carries about each of its tags. */
export const tagRefSchema = z.object({ id: z.uuid(), name: z.string(), color: z.string() });
export type TagRef = z.infer<typeof tagRefSchema>;

/** Create a tag. Names are unique ignoring case; a missing color takes the next palette color. */
export const createTagInput = z.object({ name: tagName, color: tagColor.optional() });
export type CreateTagInput = z.infer<typeof createTagInput>;

export const updateTagInput = z
  .object({ id: z.uuid(), name: tagName.optional(), color: tagColor.optional() })
  .refine((input) => input.name !== undefined || input.color !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateTagInput = z.infer<typeof updateTagInput>;

export const listTagsInput = z.object({});

/** Actions on tags. Implemented in apps/server/src/actions/tags.ts. */
export const tagActions = {
  list: defineAction({
    name: 'tags.list',
    description: 'List all tags, newest last.',
    permission: 'read',
    input: listTagsInput,
  }),
  create: defineAction({
    name: 'tags.create',
    description: 'Create a tag (or return the existing one with the same name, ignoring case).',
    permission: 'write',
    input: createTagInput,
  }),
  update: defineAction({
    name: 'tags.update',
    description: 'Rename a tag or change its color.',
    permission: 'write',
    input: updateTagInput,
  }),
} as const;
