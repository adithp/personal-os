/**
 * Which parts of the Notes module are built yet. A part that is false shows as disabled with a
 * "Soon" label. The orchestrator turns each one on when its stage is merged (docs/ROADMAP.md).
 * Stage N3 is built: the side panel now has real Today, Tags and Templates rows.
 */
export const NOTE_FEATURES = {
  /** Notes list, folders, editor, Trash (stage N1). */
  notes: true,
  /** Today's daily note (stage N3). */
  today: true,
  /** Tags used inside notes (stage N3). */
  tags: true,
  /** Templates (stage N3). */
  templates: true,
} as const;
