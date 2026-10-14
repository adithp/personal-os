import { noteLinkActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import { implement } from './registry';

/**
 * notes.titles and notes.links (docs/design/research/notes.md D9, D18). CONTRACT STUBS: the N2
 * server-dev agent implements them here and fills the hooks in note-links.ts.
 */
const notBuilt = () => {
  throw new HttpError(501, 'not_implemented', 'Note links are not built yet');
};

export const noteLinkImplementations = [
  implement(noteLinkActions.titles, notBuilt),
  implement(noteLinkActions.links, notBuilt),
];
