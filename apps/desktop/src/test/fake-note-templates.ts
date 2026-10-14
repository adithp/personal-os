import {
  applyTemplate,
  dailyDateSchema,
  indiaDay,
  NOTE_CONTENT_MAX,
  NOTE_TEMPLATE_NAME_MAX,
  type Note,
  type NoteSummary,
  type NoteTemplate,
} from '@personal-os/shared';
import { ApiError, type RequestOptions } from '../api/api-client';
import type { NotesFake } from './fake-notes';

let counter = 800_000;
const idFor = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

/** A template with defaults. */
export function makeTemplate(overrides: Partial<NoteTemplate> = {}): NoteTemplate {
  counter += 1;
  return {
    id: idFor(counter),
    name: `Template ${String(counter)}`,
    contentMd: '',
    isDailyDefault: false,
    createdAt: '2025-10-01T00:00:00.000Z',
    updatedAt: '2025-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const nameTaken = () =>
  new ApiError(409, 'template_name_taken', 'A template with this name exists.');
const notFound = () => new ApiError(404, 'not_found', 'Template not found');

/**
 * In-memory note templates, `POST /notes/daily`, `templateId` on note create and the `dailyOnly`
 * list filter, following the N3 routes (docs/API.md). It sits in front of the Notes fake and passes
 * every other request to it. `handle` answers NOT_NOTES (from the Notes fake) for a route that is not a Notes route.
 */
export function createNoteTemplatesFake(notesFake: NotesFake, initial: NoteTemplate[] = []) {
  const store = new Map<string, NoteTemplate>(initial.map((t) => [t.id, t]));
  const gone = new Set<string>();
  /** Daily note id -> its India day. */
  const dailyOf = new Map<string, string>();

  const live = () => [...store.values()].filter((t) => !gone.has(t.id));
  const find = (id: string) => {
    const found = store.get(id);
    if (!found || gone.has(id)) throw notFound();
    return found;
  };
  const sameName = (name: string, exceptId?: string) =>
    live().some((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase());

  const checkName = (raw: unknown) => {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name === '') throw new ApiError(400, 'validation_error', 'Add a name');
    if (name.length > NOTE_TEMPLATE_NAME_MAX) {
      throw new ApiError(400, 'validation_error', 'The name is too long.');
    }
    return name;
  };
  const checkContent = (raw: unknown) => {
    if (typeof raw === 'string' && raw.length > NOTE_CONTENT_MAX) {
      throw new ApiError(400, 'validation_error', 'The template is too long.');
    }
  };
  const clearDefaultExcept = (id: string) => {
    for (const t of live()) {
      if (t.id !== id && t.isDailyDefault) store.set(t.id, { ...t, isDailyDefault: false });
    }
  };

  const create = (body: Record<string, unknown>) => {
    const name = checkName(body.name);
    if (sameName(name)) throw nameTaken();
    checkContent(body.contentMd);
    const now = new Date().toISOString();
    const template = makeTemplate({
      name,
      contentMd: typeof body.contentMd === 'string' ? body.contentMd : '',
      isDailyDefault: body.isDailyDefault === true,
      createdAt: now,
      updatedAt: now,
    });
    store.set(template.id, template);
    if (template.isDailyDefault) clearDefaultExcept(template.id);
    return { item: template, undo: { action: 'noteTemplates.delete', input: { id: template.id } } };
  };

  const update = (id: string, body: Record<string, unknown>) => {
    const current = find(id);
    if (
      body.name === undefined &&
      body.contentMd === undefined &&
      body.isDailyDefault === undefined
    ) {
      throw new ApiError(400, 'validation_error', 'Nothing to change');
    }
    const next: NoteTemplate = { ...current, updatedAt: new Date().toISOString() };
    if (body.name !== undefined) {
      next.name = checkName(body.name);
      if (sameName(next.name, id)) throw nameTaken();
    }
    if (body.contentMd !== undefined) {
      checkContent(body.contentMd);
      next.contentMd = typeof body.contentMd === 'string' ? body.contentMd : '';
    }
    if (typeof body.isDailyDefault === 'boolean') next.isDailyDefault = body.isDailyDefault;
    store.set(id, next);
    if (next.isDailyDefault) clearDefaultExcept(id);
    return { item: next, undo: null };
  };

  const remove = (id: string) => {
    const current = find(id);
    gone.add(id);
    return { item: current, undo: { action: 'noteTemplates.restore', input: { id } } };
  };

  const restore = (id: string) => {
    const current = store.get(id);
    if (!current || !gone.has(id)) throw notFound();
    if (sameName(current.name)) throw nameTaken();
    gone.delete(id);
    return { item: current, undo: { action: 'noteTemplates.delete', input: { id } } };
  };

  const titleTaken = (title: string) =>
    notesFake.notes().some((n) => n.title.toLowerCase() === title.toLowerCase());
  const nextUntitled = () => {
    if (!titleTaken('Untitled')) return 'Untitled';
    for (let n = 2; ; n += 1)
      if (!titleTaken(`Untitled ${String(n)}`)) return `Untitled ${String(n)}`;
  };

  const createFromTemplate = (body: Record<string, unknown>, options: RequestOptions): unknown => {
    const { templateId, ...rest } = body;
    const template = find(String(templateId));
    const title = typeof rest.title === 'string' ? rest.title.trim() : nextUntitled();
    const contentMd =
      typeof rest.contentMd === 'string'
        ? rest.contentMd
        : applyTemplate(template.contentMd, { title, now: new Date() });
    return notesFake.handle('POST', '/notes', { ...options, body: { ...rest, title, contentMd } });
  };

  const openDaily = (body: Record<string, unknown>, options: RequestOptions): unknown => {
    const parsed = dailyDateSchema.optional().safeParse(body.date);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_error', parsed.error.issues[0]?.message ?? 'Bad date');
    }
    const date = parsed.data ?? indiaDay(new Date());
    const liveNotes = notesFake.notes();
    const existing = liveNotes.find((n) => dailyOf.get(n.id) === date);
    if (existing) return { item: { ...existing, dailyDate: date }, undo: null };

    const title = titleTaken(date) ? `${date} (daily)` : date;
    const template = live().find((t) => t.isDailyDefault);
    const contentMd = template ? applyTemplate(template.contentMd, { title, now: new Date() }) : '';
    const created = notesFake.handle('POST', '/notes', {
      ...options,
      body: { title, contentMd },
    }) as { item: Note; undo: unknown };
    dailyOf.set(created.item.id, date);
    return { item: { ...created.item, dailyDate: date }, undo: created.undo };
  };

  /** Answers a Notes, template or daily route, or NOT_NOTES. */
  const handle = (method: string, path: string, options: RequestOptions): unknown => {
    const body = (options.body ?? {}) as Record<string, unknown>;

    if (path === '/undo') {
      const { action, input } = body as { action?: string; input?: Record<string, unknown> };
      if (action === 'noteTemplates.delete') return { ...remove(String(input?.id)), undo: null };
      if (action === 'noteTemplates.restore') return { ...restore(String(input?.id)), undo: null };
    }
    if (path === '/note-templates') {
      if (method === 'GET') {
        return { items: live().sort((a, b) => a.name.localeCompare(b.name)) };
      }
      if (method === 'POST') return create(body);
    }
    const route = /^\/note-templates\/([^/]+)(?:\/(restore))?$/.exec(path);
    if (route) {
      const [, id = '', verb] = route;
      if (method === 'PATCH' && !verb) return update(id, body);
      if (method === 'DELETE' && !verb) return remove(id);
      if (method === 'POST' && verb === 'restore') return restore(id);
    }
    if (path === '/notes/daily' && method === 'POST') return openDaily(body, options);
    if (path === '/notes' && method === 'POST' && body.templateId !== undefined) {
      return createFromTemplate(body, options);
    }
    if (path === '/notes' && method === 'GET') {
      const answer = notesFake.handle(method, path, options) as { items: NoteSummary[] };
      if (options.query?.dailyOnly !== true && options.query?.dailyOnly !== 'true') return answer;
      return {
        items: answer.items
          .filter((n) => dailyOf.has(n.id))
          .map((n) => ({ ...n, dailyDate: dailyOf.get(n.id) ?? null }))
          .sort((a, b) => (b.dailyDate ?? '').localeCompare(a.dailyDate ?? '')),
      };
    }
    return notesFake.handle(method, path, options);
  };

  return { handle, templates: () => live() };
}
