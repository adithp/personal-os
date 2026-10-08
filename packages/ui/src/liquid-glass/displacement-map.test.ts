// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_DISPLACEMENT_PX,
  bevelFor,
  clampRadius,
  computeDisplacementMap,
  displacementPx,
  filterScale,
  mapKey,
  parseRadius,
  profile,
  quantize,
} from './displacement-map';

/** Red and green channel at a pixel of a w-wide map. */
function at(map: Uint8ClampedArray, w: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return { r: map[i] ?? -1, g: map[i + 1] ?? -1, b: map[i + 2] ?? -1, a: map[i + 3] ?? -1 };
}

describe('strength', () => {
  it('maps 0–100 to 0–36 px of shift', () => {
    expect(MAX_DISPLACEMENT_PX).toBe(36);
    expect(displacementPx(0)).toBe(0);
    expect(displacementPx(50)).toBe(18);
    expect(displacementPx(100)).toBe(36);
  });

  it('clamps out-of-range and invalid strengths', () => {
    expect(displacementPx(-20)).toBe(0);
    expect(displacementPx(500)).toBe(36);
    expect(displacementPx(Number.NaN)).toBe(0);
    expect(displacementPx(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('uses twice the shift as the SVG filter scale (the map moves samples by half the scale)', () => {
    expect(filterScale(50)).toBe(36);
    expect(filterScale(0)).toBe(0);
    expect(filterScale(100)).toBe(72);
  });
});

describe('sizes', () => {
  it('quantizes to the nearest step, never below one step', () => {
    expect(quantize(61, 8)).toBe(64);
    expect(quantize(60, 8)).toBe(64);
    expect(quantize(59, 8)).toBe(56);
    expect(quantize(1, 8)).toBe(8);
    expect(quantize(540, 32)).toBe(544);
  });

  it('keeps a radius inside the box', () => {
    expect(clampRadius(16, 200, 100)).toBe(16);
    expect(clampRadius(9999, 200, 60)).toBe(30);
    expect(clampRadius(-5, 200, 100)).toBe(0);
    expect(clampRadius(Number.NaN, 200, 100)).toBe(0);
  });

  it('uses a bevel of about a third of the shorter side, between 6 and 28 px', () => {
    expect(bevelFor(540, 60)).toBe(18);
    expect(bevelFor(800, 600)).toBe(28);
    expect(bevelFor(40, 20)).toBe(6);
    expect(bevelFor(12, 12)).toBe(6);
    expect(bevelFor(8, 8)).toBeLessThanOrEqual(4);
  });

  it('gives the same key to the same shape, and different keys to different shapes', () => {
    const a = { width: 300, height: 160, radius: 16, bevel: 22 };
    expect(mapKey(a)).toBe(mapKey({ ...a }));
    expect(mapKey(a)).not.toBe(mapKey({ ...a, width: 304 }));
    expect(mapKey(a)).not.toBe(mapKey({ ...a, radius: 18 }));
  });
});

describe('parseRadius', () => {
  it.each([
    ['16px', 200, 100, 16],
    ['9999px', 200, 60, 30],
    ['50%', 200, 60, 30],
    ['10%', 200, 100, 10],
    ['0px', 200, 100, 0],
    ['', 200, 100, 0],
    ['abc', 200, 100, 0],
    ['12px 4px', 200, 100, 12],
  ])('reads %j in a %sx%s box as %s', (value, w, h, expected) => {
    expect(parseRadius(value, w, h)).toBe(expected);
  });
});

describe('profile', () => {
  it('is strongest on the edge and fades to nothing at the bevel width', () => {
    expect(profile(0)).toBe(1);
    expect(profile(1)).toBe(0);
    expect(profile(0.5)).toBe(0.25);
  });

  it('only ever decreases going inward, and is clamped outside 0–1', () => {
    let previous = profile(0);
    for (let t = 0.05; t <= 1; t += 0.05) {
      expect(profile(t)).toBeLessThan(previous);
      previous = profile(t);
    }
    expect(profile(-1)).toBe(1);
    expect(profile(5)).toBe(0);
  });
});

describe('computeDisplacementMap', () => {
  const spec = { width: 120, height: 80, radius: 16, bevel: 18 };
  const map = computeDisplacementMap(spec);

  it('has one RGBA pixel for every pixel of the box', () => {
    expect(map).toHaveLength(120 * 80 * 4);
  });

  it('is fully opaque, with a neutral blue channel', () => {
    for (let i = 0; i < map.length; i += 4) {
      expect(map[i + 3]).toBe(255);
      expect(map[i + 2]).toBe(128);
    }
  });

  it('does not bend the backdrop in the flat middle', () => {
    for (const [x, y] of [
      [60, 40],
      [50, 35],
      [70, 45],
      [40, 40],
      [80, 40],
    ] as const) {
      const p = at(map, 120, x, y);
      expect(p.r, `x=${String(x)} y=${String(y)}`).toBe(128);
      expect(p.g).toBe(128);
    }
  });

  it('pulls samples inward at every straight edge', () => {
    // 128 = no shift; above means sample from the right/below, below means from the left/above
    expect(at(map, 120, 0, 40).r).toBeGreaterThan(200); // left edge: from the right
    expect(at(map, 120, 119, 40).r).toBeLessThan(60); // right edge: from the left
    expect(at(map, 120, 60, 0).g).toBeGreaterThan(200); // top edge: from below
    expect(at(map, 120, 60, 79).g).toBeLessThan(60); // bottom edge: from above
  });

  it('only shifts along the edge normal on straight edges', () => {
    expect(at(map, 120, 0, 40).g).toBe(128);
    expect(at(map, 120, 60, 0).r).toBe(128);
  });

  it('is mirror-symmetric', () => {
    const left = at(map, 120, 2, 40).r - 128;
    const right = 128 - at(map, 120, 117, 40).r;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    const top = at(map, 120, 60, 2).g - 128;
    const bottom = 128 - at(map, 120, 60, 77).g;
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
  });

  it('fades smoothly from the edge to the middle', () => {
    let previous = 255;
    for (let x = 0; x <= 18; x += 1) {
      const value = at(map, 120, x, 40).r;
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
    expect(at(map, 120, 18, 40).r).toBe(128);
  });

  it('bends diagonally around a rounded corner', () => {
    // Just inside the top-left curve: pulled right and down
    const corner = at(map, 120, 4, 4);
    expect(corner.r).toBeGreaterThan(128);
    expect(corner.g).toBeGreaterThan(128);
  });

  it('handles a pill shape (radius = half the height)', () => {
    const pill = computeDisplacementMap({ width: 120, height: 40, radius: 20, bevel: 12 });
    expect(pill).toHaveLength(120 * 40 * 4);
    expect(at(pill, 120, 60, 20).r).toBe(128);
    expect(at(pill, 120, 0, 20).r).toBeGreaterThan(200);
  });

  it('handles tiny boxes and a bevel wider than the box', () => {
    const tiny = computeDisplacementMap({ width: 2, height: 2, radius: 1, bevel: 50 });
    expect(tiny).toHaveLength(2 * 2 * 4);
    const narrow = computeDisplacementMap({ width: 10, height: 100, radius: 0, bevel: 50 });
    expect(narrow).toHaveLength(10 * 100 * 4);
  });

  it('never leaves the 0–255 range', () => {
    const big = computeDisplacementMap({ width: 60, height: 60, radius: 12, bevel: 22 });
    for (const value of big) expect(value >= 0 && value <= 255).toBe(true);
  });

  it('builds a 540×60 dock-sized map quickly', () => {
    const start = performance.now();
    computeDisplacementMap({ width: 540, height: 60, radius: 18, bevel: 18 });
    expect(performance.now() - start).toBeLessThan(250);
  });
});
