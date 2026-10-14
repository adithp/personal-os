import { searchActions } from '@personal-os/shared';
import { implement } from './registry';

/**
 * search.global (read). Contract stub: the server-dev agent replaces it with the providers of
 * docs/design/research/search.md (D9, D12, D13).
 */
export const searchImplementations = [
  implement(searchActions.global, (_context, { q }) => Promise.resolve({ data: { q, groups: [] } })),
];
