/**
 * Tables the app listens to for live updates (Supabase Realtime, Postgres Changes; research memo
 * docs/design/research/realtime.md D2). The migration that adds them to the `supabase_realtime`
 * publication and grants SELECT to `authenticated` uses the same names (packages/db tests check it).
 * A module that adds a table the screens show adds it here, in the same feature.
 */
export const REALTIME_TABLES = [
  'tasks',
  'tags',
  'entity_tags',
  'task_favorites',
  'links',
  'goals',
  'notes',
  'note_folders',
] as const;
export type RealtimeTable = (typeof REALTIME_TABLES)[number];
