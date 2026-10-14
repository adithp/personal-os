import { noteFolderActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import { implement } from './registry';

/** Note folders (docs/design/research/notes.md D3, D15). CONTRACT STUBS: the N1 folders server-dev agent owns this file. */
const notBuilt = () => {
  throw new HttpError(501, 'not_implemented', 'Note folders are not built yet');
};

export const noteFolderImplementations = [
  implement(noteFolderActions.list, notBuilt),
  implement(noteFolderActions.create, notBuilt),
  implement(noteFolderActions.update, notBuilt),
  implement(noteFolderActions.delete, notBuilt),
  implement(noteFolderActions.restore, notBuilt),
];
