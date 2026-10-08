import type { FastifyRequest } from 'fastify';
import type { ActionRegistry } from '../actions';
import { unauthorized } from '../lib/http-error';
import { createUserScope, type Db } from '../lib/user-scope';

export interface ActionRouteOptions {
  db: Db;
  registry: ActionRegistry;
}

/** Runs an action for the signed-in user. A button press counts as the user's confirmation. */
export function actionRunner({ db, registry }: ActionRouteOptions) {
  return (request: FastifyRequest, action: string, input: unknown) => {
    if (!request.user) throw unauthorized();
    const scope = createUserScope(db, request.user.id);
    return registry.run({ scope, source: 'ui', confirmed: true }, action, input);
  };
}
