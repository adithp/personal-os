import { TASK_STATUSES, type TaskStatus } from '@personal-os/shared';
import { SECTION_IDS, type SectionId } from '../sections';
import type { DropTarget } from './resolve-drop';

/**
 * The ids of drop areas in dnd-kit. A task card or row uses its task id; a section (Cards and
 * List) or a column (Board) uses one of these, so a drop can tell where it landed.
 */
export const sectionDropId = (section: SectionId) => `section:${section}`;
export const columnDropId = (status: TaskStatus) => `column:${status}`;

export function parseDropId(id: string): DropTarget | null {
  const [kind, value] = id.split(':');
  const section = SECTION_IDS.find((candidate) => candidate === value);
  if (kind === 'section' && section) return { kind: 'section', section };
  const status = TASK_STATUSES.find((candidate) => candidate === value);
  if (kind === 'column' && status) return { kind: 'column', status };
  return null;
}
