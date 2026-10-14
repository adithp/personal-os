import { REALTIME_TABLES, type RealtimeTable } from '@personal-os/shared';
import type { QueryKey } from '@tanstack/react-query';
import { notesRealtimeKeys } from '../modules/notes/realtime-keys';
import { tasksRealtimeKeys } from '../modules/tasks/realtime-keys';

/** What one module contributes: for a table, the query keys to refresh when it changes. */
export type RealtimeKeys = Partial<Record<RealtimeTable, readonly QueryKey[]>>;
export type RealtimeRegistry = Record<RealtimeTable, readonly QueryKey[]>;

/** Merges module entries. A table nobody lists maps to no keys, so its events are ignored. */
export function mergeRealtimeKeys(entries: readonly RealtimeKeys[]): RealtimeRegistry {
  const registry = {} as Record<RealtimeTable, QueryKey[]>;
  for (const table of REALTIME_TABLES) registry[table] = [];
  for (const entry of entries) {
    for (const table of REALTIME_TABLES) registry[table].push(...(entry[table] ?? []));
  }
  return registry;
}

/** A module that shows data from a realtime table adds its entry here. */
export const realtimeRegistry = mergeRealtimeKeys([tasksRealtimeKeys, notesRealtimeKeys]);
