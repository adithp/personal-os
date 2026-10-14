import { noteVersionActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import { implement } from './registry';

/**
 * notes.versions, notes.getVersion and notes.restoreVersion (docs/design/research/notes.md D13,
 * D18). Stage N4 contract stubs: they answer 501 until the server agent fills them in. The hook
 * that stores versions is maybeSnapshot in note-versions.ts.
 */
const notBuilt = (): never => {
  throw new HttpError(501, 'not_implemented', 'Version history is not built yet');
};

export const noteVersionImplementations = [
  implement(noteVersionActions.versions, notBuilt),
  implement(noteVersionActions.getVersion, notBuilt),
  implement(noteVersionActions.restoreVersion, notBuilt),
];
