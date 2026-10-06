import { describe, expect, it } from 'vitest';
import { MAGNIFICATION_MAX, MAGNIFICATION_RADIUS, dockHeight, magnifiedScale } from './dock-math';

describe('magnifiedScale', () => {
  it('is 1.7 right under the cursor', () => {
    expect(MAGNIFICATION_MAX).toBe(1.7);
    expect(magnifiedScale(0)).toBeCloseTo(1.7, 10);
  });

  it('is exactly 1 at 90 px and beyond', () => {
    expect(MAGNIFICATION_RADIUS).toBe(90);
    expect(magnifiedScale(90)).toBe(1);
    expect(magnifiedScale(91)).toBe(1);
    expect(magnifiedScale(500)).toBe(1);
    expect(magnifiedScale(-90)).toBe(1);
  });

  it('is symmetric left and right of the cursor', () => {
    expect(magnifiedScale(-30)).toBeCloseTo(magnifiedScale(30), 10);
  });

  it('falls off steadily with distance', () => {
    let previous = magnifiedScale(0);
    for (let d = 5; d <= 90; d += 5) {
      const scale = magnifiedScale(d);
      expect(scale).toBeLessThan(previous);
      expect(scale).toBeGreaterThanOrEqual(1);
      previous = scale;
    }
  });

  it('is always 1 when magnification is off', () => {
    expect(magnifiedScale(0, false)).toBe(1);
    expect(magnifiedScale(20, false)).toBe(1);
  });

  it('is 1 when the cursor is not over the dock (Infinity)', () => {
    expect(magnifiedScale(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('dockHeight', () => {
  it('is 60 for small and medium icons', () => {
    expect(dockHeight(32)).toBe(60);
    expect(dockHeight(36)).toBe(60);
  });

  it('grows for large icons so they still fit', () => {
    expect(dockHeight(44)).toBe(68);
  });
});
