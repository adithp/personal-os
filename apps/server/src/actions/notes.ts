import { noteActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import { implement } from './registry';

/**
 * Notes, stage N1 (docs/design/research/notes.md D3, D7, D9, D14, D15, D18). CONTRACT STUBS: the
 * N1 server-dev agent implements them and owns this file. A save calls rebuildNoteLinks
 * (note-links.ts), rebuildNoteTags (note-tags.ts) and maybeSnapshot (note-versions.ts) so that
 * later stages never edit this file; content_text is made with markdownToPlainText.
 */
const notBuilt = () => {
  throw new HttpError(501, 'not_implemented', 'Notes are not built yet');
};

export const noteImplementations = [
  implement(noteActions.list, notBuilt),
  implement(noteActions.get, notBuilt),
  implement(noteActions.create, notBuilt),
  implement(noteActions.update, notBuilt),
  implement(noteActions.rename, notBuilt),
  implement(noteActions.delete, notBuilt),
  implement(noteActions.restore, notBuilt),
  implement(noteActions.purge, notBuilt),
  implement(noteActions.emptyTrash, notBuilt),
];
