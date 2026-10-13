import { describe, expect, it } from 'vitest';
import {
  ENTITY_TYPES,
  LINK_RELATIONS,
  createEntitySchema,
  createLinkSchema,
  entitySchema,
  linkSchema,
} from './entities';

const A = '3f6b2c1e-8d4a-4b7e-9c11-2a5d6e7f8091';
const B = '7a9d4e22-1c3b-4f65-8a0e-b1c2d3e4f506';

describe('entity types and link relations (docs/DATABASE.md)', () => {
  it('has the documented entity types', () => {
    expect(ENTITY_TYPES).toEqual([
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
    ]);
  });

  it('has the documented link relations', () => {
    expect(LINK_RELATIONS).toEqual([
      'mentions',
      'belongs_to',
      'blocks',
      'derived_from',
      'attached',
      'related',
    ]);
  });
});

describe('createEntitySchema', () => {
  it('accepts a type and a title and trims the title', () => {
    expect(createEntitySchema.parse({ type: 'task', title: '  Buy milk ' })).toEqual({
      type: 'task',
      title: 'Buy milk',
    });
  });

  it.each([
    [{ type: 'task', title: '' }],
    [{ type: 'task', title: '   ' }],
    [{ type: 'spaceship', title: 'x' }],
    [{ title: 'x' }],
    [{ type: 'task', title: 'x'.repeat(501) }],
    [{ type: 'task', title: 'x', id: 'not-a-uuid' }],
  ])('rejects %j', (input) => {
    expect(createEntitySchema.safeParse(input).success).toBe(false);
  });

  it('does not let a caller choose the user', () => {
    const parsed = createEntitySchema.parse({ type: 'note', title: 'x', userId: B });
    expect(parsed).not.toHaveProperty('userId');
  });
});

describe('createLinkSchema', () => {
  it('accepts two different items and a relation', () => {
    expect(createLinkSchema.parse({ sourceId: A, targetId: B, relation: 'blocks' })).toEqual({
      sourceId: A,
      targetId: B,
      relation: 'blocks',
    });
  });

  it('rejects linking an item to itself', () => {
    const result = createLinkSchema.safeParse({ sourceId: A, targetId: A, relation: 'related' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('An item cannot be linked to itself');
  });

  it('rejects an unknown relation or a bad id', () => {
    expect(
      createLinkSchema.safeParse({ sourceId: A, targetId: B, relation: 'likes' }).success,
    ).toBe(false);
    expect(
      createLinkSchema.safeParse({ sourceId: 'x', targetId: B, relation: 'related' }).success,
    ).toBe(false);
  });

  it('does not let a caller choose the user', () => {
    const parsed = createLinkSchema.parse({
      sourceId: A,
      targetId: B,
      relation: 'related',
      userId: A,
    });
    expect(parsed).not.toHaveProperty('userId');
  });
});

describe('row schemas', () => {
  const now = new Date();

  it('accept a full entity row and link row', () => {
    expect(
      entitySchema.parse({
        id: A,
        userId: B,
        type: 'note',
        title: 'x',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ).toBeDefined();
    expect(
      linkSchema.parse({
        id: A,
        userId: B,
        sourceId: A,
        targetId: B,
        relation: 'mentions',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ).toBeDefined();
  });
});
