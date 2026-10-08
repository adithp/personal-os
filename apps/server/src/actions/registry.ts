import {
  CONFIRMATION_LEVELS,
  type ActionDefinition,
  type PermissionLevel,
  type UndoDescriptor,
} from '@personal-os/shared';
import type { z } from 'zod';
import { HttpError } from '../lib/http-error';
import type { UserScope } from '../lib/user-scope';

/**
 * The action registry (docs/AI_SYSTEM.md section 3). Every data change goes through here, so the
 * app's buttons and the AI behave the same: the input is checked, the permission is checked, the
 * handler runs, and observers are told. Step 3 adds the ai_action_log by registering an observer.
 */

/** Who is asking and with which rights. */
export interface ActionContext {
  /** Every query goes through this, so it can only touch the signed-in user's rows. */
  scope: UserScope;
  /** Who started the action. */
  source: 'ui' | 'ai';
  /** The user has confirmed (a button they pressed). Needed for external and destructive actions. */
  confirmed: boolean;
}

/** What a handler gives back: the data, and for a write the way to undo it. */
export interface ActionOutcome<Data> {
  data: Data;
  undo?: UndoDescriptor | null;
}

export interface ActionImplementation<Def extends ActionDefinition> {
  definition: Def;
  handler: (ctx: ActionContext, input: z.output<Def['input']>) => Promise<ActionOutcome<unknown>>;
}

/** Helper that ties a definition to the handler that runs it. */
export function implement<Def extends ActionDefinition>(
  definition: Def,
  handler: ActionImplementation<Def>['handler'],
): ActionImplementation<Def> {
  return { definition, handler };
}

/** Told after every action, whether it worked or not. Step 3 writes these to ai_action_log. */
export interface ActionEvent {
  action: string;
  permission: PermissionLevel;
  source: ActionContext['source'];
  userId: string;
  status: 'done' | 'failed';
  input: unknown;
  result?: unknown;
  undo?: UndoDescriptor | null;
  error?: string;
}

export interface ActionObserver {
  onAction: (event: ActionEvent) => void | Promise<void>;
}

export interface ActionRegistry {
  has: (name: string) => boolean;
  permissionOf: (name: string) => PermissionLevel | undefined;
  /** Checks the input, the permission, and runs the action. */
  run: (ctx: ActionContext, name: string, rawInput: unknown) => Promise<ActionOutcome<unknown>>;
}

export function createActionRegistry(
  implementations: readonly ActionImplementation<ActionDefinition>[],
  observers: readonly ActionObserver[] = [],
): ActionRegistry {
  const byName = new Map<string, ActionImplementation<ActionDefinition>>();
  for (const implementation of implementations) {
    const { name } = implementation.definition;
    if (byName.has(name)) throw new Error(`Action ${name} is registered twice`);
    byName.set(name, implementation);
  }

  const tell = async (event: ActionEvent) => {
    for (const observer of observers) {
      try {
        await observer.onAction(event);
      } catch {
        // A broken observer must never break the action itself.
      }
    }
  };

  return {
    has: (name) => byName.has(name),
    permissionOf: (name) => byName.get(name)?.definition.permission,

    run: async (ctx, name, rawInput) => {
      const implementation = byName.get(name);
      if (!implementation) throw new HttpError(404, 'unknown_action', `There is no action ${name}`);
      const { definition, handler } = implementation;

      const input = definition.input.parse(rawInput);

      if (CONFIRMATION_LEVELS.includes(definition.permission) && !ctx.confirmed) {
        throw new HttpError(
          409,
          'confirmation_required',
          `${name} is ${definition.permission} and needs the user's confirmation`,
        );
      }

      const base = {
        action: name,
        permission: definition.permission,
        source: ctx.source,
        userId: ctx.scope.userId,
        input,
      } as const;

      try {
        const outcome = await handler(ctx, input);
        await tell({ ...base, status: 'done', result: outcome.data, undo: outcome.undo ?? null });
        return outcome;
      } catch (error) {
        await tell({
          ...base,
          status: 'failed',
          error: error instanceof Error ? error.message : 'unknown error',
        });
        throw error;
      }
    },
  };
}
