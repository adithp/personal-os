/**
 * Edge refraction for Liquid Glass.
 *
 * An SVG feDisplacementMap bends the backdrop using a "map" image: for each pixel the red and
 * green channels say how far to shift the sample (128 = no shift). Here the map is built so the
 * backdrop bends only near the edges of a rounded rectangle, like light passing through the
 * curved rim of a glass pane, and is untouched in the flat middle.
 */

export interface MapSpec {
  width: number;
  height: number;
  /** Corner radius in px (a pill has radius = half its height). */
  radius: number;
  /** How far from the edge the bending reaches, in px. */
  bevel: number;
}

/** Largest shift of the backdrop in px, at strength 100. */
export const MAX_DISPLACEMENT_PX = 36;

/** The shift in px for a strength of 0–100. */
export function displacementPx(strength: number): number {
  if (!Number.isFinite(strength)) return 0;
  return (Math.min(100, Math.max(0, strength)) / 100) * MAX_DISPLACEMENT_PX;
}

/**
 * The `scale` of feDisplacementMap. A channel value moves the sample by (value − 0.5) × scale,
 * and the strongest value is 1, so the largest shift is scale / 2.
 */
export function filterScale(strength: number): number {
  return displacementPx(strength) * 2;
}

/** Rounds to the nearest multiple of `step`, never below `step`. */
export function quantize(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/** A radius that fits inside the box (0 to half of the shorter side). */
export function clampRadius(radius: number, width: number, height: number): number {
  const max = Math.min(width, height) / 2;
  if (!Number.isFinite(radius) || radius < 0) return 0;
  return Math.min(radius, max);
}

/** Width of the bending zone: about a third of the shorter side, between 6 and 28 px. */
export function bevelFor(width: number, height: number): number {
  const shorter = Math.min(width, height);
  return Math.min(28, Math.max(6, Math.round(shorter * 0.3)), shorter / 2);
}

/** A key that is the same for elements that can share one map. */
export function mapKey(spec: MapSpec): string {
  return `${String(spec.width)}x${String(spec.height)}r${String(Math.round(spec.radius))}b${String(Math.round(spec.bevel))}`;
}

/** How strongly the edge bends at a relative depth t (0 = on the edge, 1 = bevel width inside). */
export function profile(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return (1 - clamped) ** 2;
}

/**
 * Builds the displacement map as RGBA pixels (row by row).
 * Near an edge the sample is taken from further inside, so the rim looks like a curved lens.
 */
export function computeDisplacementMap({
  width,
  height,
  radius,
  bevel,
}: MapSpec): Uint8ClampedArray<ArrayBuffer> {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const r = clampRadius(radius, w, h);
  const half = { x: w / 2, y: h / 2 };
  const out = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - half.x;
      const py = y + 0.5 - half.y;
      // Signed distance to the rounded rectangle (negative inside)
      const qx = Math.abs(px) - (half.x - r);
      const qy = Math.abs(py) - (half.y - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const outside = Math.hypot(ox, oy);
      const depth = -(outside + Math.min(Math.max(qx, qy), 0) - r);

      let dx = 0;
      let dy = 0;
      if (depth < bevel) {
        const strength = profile(Math.max(depth, 0) / bevel);
        // Direction pointing out of the shape at this pixel
        let nx: number;
        let ny: number;
        if (outside > 0) {
          nx = (Math.sign(px) * ox) / outside;
          ny = (Math.sign(py) * oy) / outside;
        } else if (qx > qy) {
          nx = Math.sign(px);
          ny = 0;
        } else {
          nx = 0;
          ny = Math.sign(py);
        }
        dx = -nx * strength;
        dy = -ny * strength;
      }

      const i = (y * w + x) * 4;
      out[i] = Math.round(127.5 + 127.5 * dx);
      out[i + 1] = Math.round(127.5 + 127.5 * dy);
      out[i + 2] = 128;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Reads a CSS border-radius value ("16px", "50%", "9999px") as px for a box of this size. */
export function parseRadius(value: string, width: number, height: number): number {
  const first = value.trim().split(/\s+/)[0] ?? '';
  const number = Number.parseFloat(first);
  if (!Number.isFinite(number)) return 0;
  const px = first.endsWith('%') ? (number / 100) * Math.min(width, height) : number;
  return clampRadius(px, width, height);
}
