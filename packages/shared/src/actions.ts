import type { z } from 'zod';

/** How careful an action is (docs/AI_SYSTEM.md section 4). */
export const PERMISSION_LEVELS = ['read', 'write', 'external', 'destructive'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

/** Levels that must be confirmed by the user before they run. */
export const CONFIRMATION_LEVELS: readonly PermissionLevel[] = ['external', 'destructive'];

/**
 * What an action is: its name, what it does, how careful it is, and the input it accepts.
 * Defined once here; the backend implements it (apps/server/src/actions) and the app and the
 * AI call it through the same registry.
 */
export interface ActionDefinition<
  Name extends string = string,
  Input extends z.ZodType = z.ZodType,
> {
  name: Name;
  description: string;
  permission: PermissionLevel;
  input: Input;
}

export function defineAction<const Name extends string, Input extends z.ZodType>(
  definition: ActionDefinition<Name, Input>,
): ActionDefinition<Name, Input> {
  return definition;
}

/** How to reverse a write action: another action and the input that puts things back. */
export interface UndoDescriptor {
  action: string;
  input: Record<string, unknown>;
}
