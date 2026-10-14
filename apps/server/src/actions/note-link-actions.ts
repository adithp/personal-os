import { links, notes } from '@personal-os/db';
import {
  NOTE_CONTEXT_MAX,
  excerptOf,
  markdownToPlainText,
  noteLinkActions,
  parseWikilinks,
  type NoteLinks,
} from '@personal-os/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { HttpError } from '../lib/http-error';
import { resolveTitles } from './note-links';
import { implement } from './registry';

/**
 * notes.titles and notes.links (docs/design/research/notes.md D9, D18). Read only; the links
 * themselves are kept up to date by the hooks in note-links.ts.
 */

/** The line around the first link to `title` outside code fences, as plain text cut to the context length. */
function contextOf(contentMd: string, title: string): string {
  const wanted = title.toLowerCase();
  let inFence = false;
  for (const line of contentMd.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (parseWikilinks(line).some((link) => link.target.toLowerCase() === wanted)) {
      // excerptOf adds the ellipsis after the cut, so leave one character for it
      const plain = markdownToPlainText(line).replace(/\s+/g, ' ').trim();
      return plain.length <= NOTE_CONTEXT_MAX ? plain : excerptOf(plain, NOTE_CONTEXT_MAX - 1);
    }
  }
  return '';
}

export const noteLinkImplementations = [
  implement(noteLinkActions.titles, async ({ scope }) => {
    const rows = await scope.selectFields(
      notes,
      { id: notes.id, title: notes.title },
      { where: scope.isLive(notes), orderBy: [asc(sql`lower(${notes.title})`), asc(notes.id)] },
    );
    return { data: rows.map((row) => ({ id: row.id as string, title: row.title as string })) };
  }),

  implement(noteLinkActions.links, async ({ scope }, { id }) => {
    const [note] = await scope.select(notes, {
      where: and(eq(notes.id, id), scope.isLive(notes)),
      limit: 1,
    });
    if (!note) throw new HttpError(404, 'not_found', 'Note not found');

    const incoming = await scope.selectFields(
      links,
      { sourceId: links.sourceId },
      { where: and(eq(links.targetId, id), eq(links.relation, 'mentions'), scope.isLive(links)) },
    );
    const sourceIds = incoming.map((row) => row.sourceId as string);
    const sources =
      sourceIds.length === 0
        ? []
        : await scope.select(notes, {
            where: and(scope.isLive(notes), inArray(notes.id, sourceIds)),
            orderBy: [asc(sql`lower(${notes.title})`), asc(notes.id)],
          });

    const seen = new Set<string>();
    const targets = parseWikilinks(note.contentMd).filter((link) => {
      const key = link.target.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const resolved = targets.length
      ? await resolveTitles(
          scope,
          targets.map((link) => link.target.toLowerCase()),
        )
      : new Map<string, string>();

    const data: NoteLinks = {
      backlinks: sources.map((source) => ({
        noteId: source.id,
        title: source.title,
        context: contextOf(source.contentMd, note.title),
      })),
      outgoing: targets.map((link) => ({
        target: link.target,
        noteId: resolved.get(link.target.toLowerCase()) ?? null,
      })),
    };
    return { data };
  }),
];
