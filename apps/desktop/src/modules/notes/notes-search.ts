import { DEFAULT_PLACE, type NotesPlace } from './notes-ui-store';

/** The URL search params of /notes: the open note and the place shown in the list. */
export interface NotesSearch {
  /** The id of the open note. */
  note?: string;
  /** 'trash' or a folder id. Left out for All notes. */
  folder?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keeps only valid params, so a bad or old link opens All notes instead of failing. */
export function validateNotesSearch(raw: Record<string, unknown>): NotesSearch {
  const search: NotesSearch = {};
  if (typeof raw.note === 'string' && UUID.test(raw.note)) search.note = raw.note;
  if (typeof raw.folder === 'string' && (raw.folder === 'trash' || UUID.test(raw.folder))) {
    search.folder = raw.folder;
  }
  return search;
}

/** The place a URL points at. */
export const placeOf = (search: NotesSearch): NotesPlace => search.folder ?? DEFAULT_PLACE;

/** The `folder` param for a place (undefined for All notes). */
export const folderParam = (place: NotesPlace): string | undefined =>
  place === DEFAULT_PLACE ? undefined : place;
