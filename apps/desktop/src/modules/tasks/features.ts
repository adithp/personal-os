/**
 * Which parts of the Tasks module are built yet. A part that is false shows as disabled with a
 * "Soon" label. The orchestrator turns each one on when its feature is merged (docs/ROADMAP.md).
 */
export const TASK_FEATURES = {
  /** Board view in My tasks (Feature 2). */
  board: true,
  /** Inbox page (Feature 6). */
  inbox: true,
  /** Reporting page (Feature 7). */
  reporting: true,
  /** Goals page (Feature 8). */
  goals: true,
  /** Favorites: the side panel list and the Overview section (Feature 5). */
  favorites: true,
} as const;
