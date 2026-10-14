import { createFileRoute } from '@tanstack/react-router';
import { validateNotesSearch } from '../../modules/notes/notes-search';
import { NotesLayout } from '../../modules/notes/shell/notes-layout';

// The Notes page: side panel, note list and editor. `note` and `folder` live in the URL.
export const Route = createFileRoute('/_app/notes')({
  validateSearch: validateNotesSearch,
  component: NotesLayout,
});
