import type { ActionDefinition } from '@personal-os/shared';
import type { ActionImplementation } from './registry';

/**
 * Tag actions (tags.list, tags.create, tags.update; definitions in packages/shared/src/tags.ts).
 * CONTRACT STUB: implemented in Feature 1 by the server-dev agent, who owns this file.
 *
 * Rules (docs/DATABASE.md): tags are a plain table (no entity row), unique per user ignoring
 * case among live tags, a new tag without a color takes nextTagColor(count of the user's tags).
 * tags.create returns the existing tag when the name already exists (ignoring case).
 * Rename and recolor return an undo that puts the old values back.
 */
export const tagImplementations: ActionImplementation<ActionDefinition>[] = [];
