import { useStore } from 'zustand';
import type { Auth, AuthState } from './auth';

/** Reads a part of the auth state and re-renders when it changes. */
export function useAuthState<T>(auth: Auth, selector: (state: AuthState) => T): T {
  return useStore(auth.store, selector);
}
