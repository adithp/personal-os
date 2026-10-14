import { noteTemplateActions } from '@personal-os/shared';
import { HttpError } from '../lib/http-error';
import { implement } from './registry';

/**
 * Note templates (docs/design/research/notes.md D3, D11), stage N3. Contract stubs: every action
 * answers 501 until the stage N3 server work fills them in.
 * Rules to build: names 1 to 80, unique among live templates ignoring case (409 template_name_taken);
 * setting `isDailyDefault` clears it on every other template (also on restore); delete is a soft
 * delete and restore is its undo; list is ordered by name.
 */
const notBuilt = () => new HttpError(501, 'not_implemented', 'Note templates are not built yet');

export const noteTemplateImplementations = [
  implement(noteTemplateActions.list, () => Promise.reject(notBuilt())),
  implement(noteTemplateActions.create, () => Promise.reject(notBuilt())),
  implement(noteTemplateActions.update, () => Promise.reject(notBuilt())),
  implement(noteTemplateActions.delete, () => Promise.reject(notBuilt())),
  implement(noteTemplateActions.restore, () => Promise.reject(notBuilt())),
];
