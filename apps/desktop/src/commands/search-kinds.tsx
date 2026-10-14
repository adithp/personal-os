import type { ModuleId, SearchHit, SearchType } from '@personal-os/shared';
import { MODULE_ICONS } from '@personal-os/ui';
import type { TablerIcon } from '@tabler/icons-react';
import { IconHash } from '@tabler/icons-react';
import type { useNavigate } from '@tanstack/react-router';
import { dueLabel } from '../modules/tasks/dates';

export type Navigate = ReturnType<typeof useNavigate>;

/** What opening a result needs (a search hit or a saved recent item has both). */
export interface OpenTarget {
  id: string;
  archived?: boolean;
}

export interface SearchKind<H extends SearchHit = SearchHit> {
  /** Group heading. */
  heading: string;
  /** Module whose color is on the row icon. */
  module: ModuleId;
  Icon: TablerIcon;
  /** The color of a small dot instead of the module-colored icon square (tags). */
  dotColor?: (hit: H) => string;
  /** The muted text on the right of the row. */
  meta: (hit: H, now: Date) => { text: string; danger?: boolean } | null;
  /** Opens the item in its module. */
  open: (target: OpenTarget, navigate: Navigate) => void;
}

type HitOf<T extends SearchType> = Extract<SearchHit, { type: T }>;

/** Keeps each kind typed to its own hit, then stores it under the common type. */
function kind<T extends SearchType>(value: SearchKind<HitOf<T>>): SearchKind {
  return value as unknown as SearchKind;
}

/** One entry per searchable type: adding a type to SEARCH_TYPES fails the type check until here. */
export const SEARCH_KINDS: Record<SearchType, SearchKind> = {
  task: kind<'task'>({
    heading: 'Tasks',
    module: 'tasks',
    Icon: MODULE_ICONS.tasks,
    meta: (hit, now) => {
      if (hit.archived) return { text: 'Archived' };
      if (hit.status === 'done') return { text: 'Done' };
      if (hit.dueAt) {
        const due = dueLabel(hit.dueAt, now, false, hit.dueAllDay);
        return { text: due.text, danger: due.overdue || due.timePassed };
      }
      return hit.parentTaskId ? { text: 'Subtask' } : null;
    },
    open: (target, navigate) => {
      void navigate({
        to: '/tasks/my-tasks',
        search: target.archived ? { task: target.id, archived: true } : { task: target.id },
      });
    },
  }),
  note: kind<'note'>({
    heading: 'Notes',
    module: 'notes',
    Icon: MODULE_ICONS.notes,
    meta: (hit) => {
      if (hit.dailyDate) return { text: 'Daily' };
      return hit.pinned ? { text: 'Pinned' } : null;
    },
    open: (target, navigate) => {
      void navigate({ to: '/notes', search: { note: target.id } });
    },
  }),
  tag: kind<'tag'>({
    heading: 'Tags',
    module: 'tasks',
    Icon: IconHash,
    dotColor: (hit) => hit.color,
    meta: () => null,
    open: (target, navigate) => {
      void navigate({ to: '/tasks/my-tasks', search: { tag: [target.id] } });
    },
  }),
};
