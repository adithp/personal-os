import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_MODES,
  BLUR_RANGE,
  DEFAULT_SETTINGS,
  DOCK_ICON_SIZES,
  MAX_WALLPAPER_BYTES,
  GLASS_EFFECTS,
  LIQUID_STRENGTH_RANGE,
  clampBlur,
  clampLiquidStrength,
  fileExtension,
  isWallpaperExtension,
  isWallpaperFileName,
} from './settings';

describe('default settings (docs/DESIGN.md)', () => {
  it('uses the documented defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      theme: 'system',
      backgroundMode: 'transparent',
      glassEffect: 'liquid',
      liquidStrength: 50,
      blurPx: 24,
      wallpaperSource: 'builtin',
      wallpaperFile: null,
      dockAutoHide: false,
      dockMagnification: true,
      dockIconSize: 'medium',
    });
  });

  it('has the three background modes with Transparent as the default', () => {
    expect(BACKGROUND_MODES).toEqual(['transparent', 'wallpaper', 'solid']);
    expect(DEFAULT_SETTINGS.backgroundMode).toBe('transparent');
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

describe('uploaded wallpaper rules', () => {
  it.each([
    'wallpaper-1.png',
    'wallpaper-1760000000000.jpg',
    'wallpaper-5.jpeg',
    'wallpaper-9.webp',
  ])('accepts the stored name %s', (name) => {
    expect(isWallpaperFileName(name)).toBe(true);
  });

  it.each([
    '../wallpaper-1.png',
    '..\\wallpaper-1.png',
    'wallpapers/wallpaper-1.png',
    'C:\\wallpaper-1.png',
    'wallpaper-1.gif',
    'wallpaper-1.png.exe',
    'wallpaper-.png',
    'photo.png',
    '',
    null,
    42,
  ])('rejects %j', (name) => {
    expect(isWallpaperFileName(name)).toBe(false);
  });

  it('reads file extensions case-insensitively', () => {
    expect(fileExtension('Holiday.PNG')).toBe('png');
    expect(fileExtension('archive.tar.webp')).toBe('webp');
    expect(fileExtension('noextension')).toBeUndefined();
  });

  it('accepts only png, jpg, jpeg and webp', () => {
    for (const ok of ['png', 'jpg', 'jpeg', 'webp']) expect(isWallpaperExtension(ok)).toBe(true);
    for (const bad of ['gif', 'svg', 'bmp', 'exe', undefined]) {
      expect(isWallpaperExtension(bad)).toBe(false);
    }
  });

  it('limits uploads to 20 MB', () => {
    expect(MAX_WALLPAPER_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe('Liquid Glass settings', () => {
  it('has three glass effects with Liquid as the default', () => {
    expect(GLASS_EFFECTS).toEqual(['liquid', 'simple', 'off']);
    expect(DEFAULT_SETTINGS.glassEffect).toBe('liquid');
  });

  it('defaults to medium strength on a 0–100 scale', () => {
    expect(LIQUID_STRENGTH_RANGE).toEqual({ min: 0, max: 100 });
    expect(DEFAULT_SETTINGS.liquidStrength).toBe(50);
  });

  it.each([
    [-10, 0],
    [0, 0],
    [50, 50],
    [49.6, 50],
    [100, 100],
    [250, 100],
  ])('clamps strength %s to %s', (input, expected) => {
    expect(clampLiquidStrength(input)).toBe(expected);
  });

  it('falls back to the default strength for NaN', () => {
    expect(clampLiquidStrength(Number.NaN)).toBe(50);
  });
});
