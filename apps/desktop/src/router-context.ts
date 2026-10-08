import type { Auth } from './auth/auth';

/** Available to every route (guards read the auth state from here). */
export interface RouterContext {
  auth: Auth;
}
