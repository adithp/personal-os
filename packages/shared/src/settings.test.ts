import { describe, expect, it } from 'vitest';
import { BLUR_RANGE, DEFAULT_SETTINGS, DOCK_ICON_SIZES, clampBlur } from './settings';

describe('default settings (docs/DESIGN.md)', () => {
  it('uses the documented defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      theme: 'system',
      wallpaperEnabled: true,
      blurPx: 24,
      dockAutoHide: false,
      dockMagnification: true,
      dockIconSize: 'medium',
    });
  });

  it('has the documented dock icon sizes', () => {
    expect(DOCK_ICON_SIZES).toEqual({ small: 32, medium: 36, large: 44 });
  });
});

describe('clampBlur', () => {
  it.each([
    [-5, 0],
    [0, 0],
    [24, 24],
    [24.6, 25],
    [40, 40],
    [99, 40],
  ])('clamps %s to %s', (input, expected) => {
    expect(clampBlur(input)).toBe(expected);
  });

  it('falls back to the default for NaN', () => {
    expect(clampBlur(Number.NaN)).toBe(24);
  });

  it('keeps the range 0–40', () => {
    expect(BLUR_RANGE).toEqual({ min: 0, max: 40 });
  });
});
