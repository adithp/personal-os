import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * Shared drag and drop setup for Cards, List, and Board. A drag starts after the pointer moves
 * 6 px (so a click still opens the task); the keyboard lifts with Space, moves with the arrows,
 * drops with Space, and cancels with Esc.
 */
export function useTaskSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** What a screen reader hears while a task is dragged. `nameOf` turns a drop id into words. */
export function taskAnnouncements(
  titleOf: (id: string) => string,
  nameOf: (id: string) => string,
): Announcements {
  return {
    onDragStart: ({ active }) => `Picked up ${titleOf(String(active.id))}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(String(active.id))} is over ${nameOf(String(over.id))}.`
        : `${titleOf(String(active.id))} is not over a drop area.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${titleOf(String(active.id))} on ${nameOf(String(over.id))}.`
        : `${titleOf(String(active.id))} was put back.`,
    onDragCancel: ({ active }) => `Dragging ${titleOf(String(active.id))} was cancelled.`,
  };
}
