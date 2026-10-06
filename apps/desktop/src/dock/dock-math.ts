/** Largest scale of the icon under the cursor (docs/DESIGN.md section 7). */
export const MAGNIFICATION_MAX = 1.7;

/** Distance in px from the cursor where an icon is back to normal size. */
export const MAGNIFICATION_RADIUS = 90;

/**
 * Scale of a dock icon for a cursor at `distance` px from the icon's center:
 * 1.7 at the cursor, falling off smoothly to 1 at 90 px. Always 1 when magnification is off.
 */
export function magnifiedScale(distance: number, enabled = true): number {
  if (!enabled) return 1;
  const d = Math.abs(distance);
  if (!Number.isFinite(d) || d >= MAGNIFICATION_RADIUS) return 1;
  const t = 1 - d / MAGNIFICATION_RADIUS;
  return 1 + ((MAGNIFICATION_MAX - 1) * (1 - Math.cos(Math.PI * t))) / 2;
}

/** Dock height in px: 60, or taller when large icons need more room. */
export function dockHeight(iconSize: number): number {
  return Math.max(60, iconSize + 24);
}
