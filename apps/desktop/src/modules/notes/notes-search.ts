import { DEFAULT_PLACE, type NotesPlace } from './notes-ui-store';

/** The URL search params of /notes: the open note and the place shown in the list. */
export interface NotesSearch {
  /** The id of the open note. */
  note?: string;
  /** 'trash', 'templates', `tag:<id>` or a folder id. Left out for All notes. */
  folder?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The place that shows the templates instead of the list and the editor (stage N3). */
export const TEMPLATES_PLACE = 'templates';
const TAG_PREFIX = 'tag:';

/** The place that lists the notes with one tag (stage N3). */
export const tagPlace = (tagId: string): NotesPlace => `${TAG_PREFIX}${tagId}`;

/** The tag id of a tag place, or null for any other place. */
export const tagIdOf = (place: NotesPlace): string | null =>
  place.startsWith(TAG_PREFIX) ? place.slice(TAG_PREFIX.length) : null;

/** True for a place that is a real folder (not All notes, Trash, Templates or a tag). */
export const isFolderPlace = (place: NotesPlace): boolean =>
  place !== DEFAULT_PLACE &&
  place !== 'trash' &&
  place !== TEMPLATES_PLACE &&
  tagIdOf(place) === null;

/** Keeps only valid params, so a bad or old link opens All notes instead of failing. */
export function validateNotesSearch(raw: Record<string, unknown>): NotesSearch {
  const search: NotesSearch = {};
  if (typeof raw.note === 'string' && UUID.test(raw.note)) search.note = raw.note;
  if (typeof raw.folder === 'string') {
    const tagId = tagIdOf(raw.folder);
    if (
      raw.folder === 'trash' ||
      raw.folder === TEMPLATES_PLACE ||
      UUID.test(raw.folder) ||
      (tagId !== null && UUID.test(tagId))
    ) {
      search.folder = raw.folder;
    }
  }
  return search;
}

/** The place a URL points at. */
export const placeOf = (search: NotesSearch): NotesPlace => search.folder ?? DEFAULT_PLACE;

/** The `folder` param for a place (undefined for All notes). */
export const folderParam = (place: NotesPlace): string | undefined =>
  place === DEFAULT_PLACE ? undefined : place;
