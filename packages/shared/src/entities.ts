import { z } from 'zod';

/** What an entity can be (docs/DATABASE.md section 2). Every item in the app is an entity. */
export const ENTITY_TYPES = [
  'task',
  'note',
  'project',
  'habit',
  'event',
  'email',
  'file',
  'transaction',
  'subscription',
  'person',
  'client',
  'tag',
  'goal',
] as const;

/** How two entities are connected. */
export const LINK_RELATIONS = [
  'mentions',
  'belongs_to',
  'blocks',
  'derived_from',
  'attached',
  'related',
] as const;

export const entityTypeSchema = z.enum(ENTITY_TYPES);
export const linkRelationSchema = z.enum(LINK_RELATIONS);

export type EntityType = z.infer<typeof entityTypeSchema>;
export type LinkRelation = z.infer<typeof linkRelationSchema>;

const timestamps = {
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
};

/** A row of the entities table. */
export const entitySchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  type: entityTypeSchema,
  title: z.string(),
  ...timestamps,
});
export type Entity = z.infer<typeof entitySchema>;

/** What a caller may send to create an entity. The user always comes from the login. */
export const createEntitySchema = z.object({
  id: z.uuid().optional(),
  type: entityTypeSchema,
  title: z.string().trim().min(1, 'Title is required').max(500),
});
export type CreateEntityInput = z.infer<typeof createEntitySchema>;

/** A row of the links table: a connection from one entity to another. */
export const linkSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  sourceId: z.uuid(),
  targetId: z.uuid(),
  relation: linkRelationSchema,
  ...timestamps,
});
export type Link = z.infer<typeof linkSchema>;

/** What a caller may send to create a link. An entity cannot link to itself. */
export const createLinkSchema = z
  .object({
    sourceId: z.uuid(),
    targetId: z.uuid(),
    relation: linkRelationSchema,
  })
  .refine((link) => link.sourceId !== link.targetId, {
    message: 'An item cannot be linked to itself',
    path: ['targetId'],
  });
export type CreateLinkInput = z.infer<typeof createLinkSchema>;
