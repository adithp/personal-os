import { DEFAULT_SETTINGS } from '@personal-os/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS_STORAGE_KEY, sanitizeSettings, useSettings } from './settings-store';

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
});

describe('sanitizeSettings', () => {
  it('returns the defaults for missing or non-object input', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const saved = {
      theme: 'light',
      backgroundMode: 'wallpaper',
      blurPx: 10,
      wallpaperSource: 'custom',
      wallpaperFile: 'wallpaper-1760000000000.png',
      dockAutoHide: true,
      dockMagnification: false,
      dockIconSize: 'large',
    };
    expect(sanitizeSettings(saved)).toEqual(saved);
  });

  it('replaces invalid values one by one and clamps blur', () => {
    expect(
      sanitizeSettings({
        theme: 'purple',
        backgroundMode: 'glitter',
        blurPx: 500,
        dockIconSize: 'huge',
        dockAutoHide: 'yes',
      }),
    ).toEqual({ ...DEFAULT_SETTINGS, blurPx: 40 });
  });

  describe('migration from the old wallpaper on/off setting', () => {
    it('turns "wallpaper off" into Solid', () => {
      expect(sanitizeSettings({ wallpaperEnabled: false }).backgroundMode).toBe('solid');
    });

    it('turns "wallpaper on" into the new default, Transparent', () => {
      expect(sanitizeSettings({ wallpaperEnabled: true }).backgroundMode).toBe('transparent');
    });

    it('ignores a garbage old value', () => {
      expect(sanitizeSettings({ wallpaperEnabled: 'maybe' }).backgroundMode).toBe('transparent');
    });

    it('prefers the new setting when both exist', () => {
      expect(
        sanitizeSettings({ backgroundMode: 'wallpaper', wallpaperEnabled: false }).backgroundMode,
      ).toBe('wallpaper');
    });

    it('keeps every other old value', () => {
      expect(
        sanitizeSettings({
          wallpaperEnabled: false,
          theme: 'light',
          blurPx: 9,
          dockIconSize: 'small',
        }),
      ).toMatchObject({
        backgroundMode: 'solid',
        theme: 'light',
        blurPx: 9,
        dockIconSize: 'small',
      });
    });
  });
});

describe('uploaded wallpaper settings', () => {
  it('defaults to the built-in gradient with no file', () => {
    expect(sanitizeSettings({})).toMatchObject({ wallpaperSource: 'builtin', wallpaperFile: null });
  });

  it.each(['wallpaper-5.png', 'wallpaper-1760000000000.webp'])(
    'keeps the stored name %s',
    (file) => {
      expect(sanitizeSettings({ wallpaperFile: file }).wallpaperFile).toBe(file);
    },
  );

  it.each([
    '../../Windows/win.ini',
    'C:\\Windows\\win.ini',
    'wallpapers/wallpaper-5.png',
    'photo.png',
    'wallpaper-5.exe',
    42,
    null,
  ])('drops the unsafe saved file %j', (file) => {
    expect(sanitizeSettings({ wallpaperFile: file }).wallpaperFile).toBeNull();
  });

  it('replaces an unknown wallpaper source', () => {
    expect(sanitizeSettings({ wallpaperSource: 'cloud' }).wallpaperSource).toBe('builtin');
  });
});

describe('useSettings', () => {
  it('starts with the defaults from DESIGN.md, Transparent first', () => {
    expect(useSettings.getState()).toMatchObject(DEFAULT_SETTINGS);
    expect(useSettings.getState().backgroundMode).toBe('transparent');
  });

  it('updates settings and saves them on this device', () => {
    useSettings.getState().update({ theme: 'dark', dockAutoHide: true, backgroundMode: 'solid' });
    expect(useSettings.getState().theme).toBe('dark');

    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(saved.version).toBe(2);
    expect(saved.state).toMatchObject({
      theme: 'dark',
      dockAutoHide: true,
      backgroundMode: 'solid',
    });
    expect(saved.state).not.toHaveProperty('update');
    expect(saved.state).not.toHaveProperty('wallpaperEnabled');
  });

  it('keeps blur between 0 and 40', () => {
    useSettings.getState().update({ blurPx: 99 });
    expect(useSettings.getState().blurPx).toBe(40);
    useSettings.getState().update({ blurPx: -3 });
    expect(useSettings.getState().blurPx).toBe(0);
  });

  it('reloads saved settings after a restart', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        state: { theme: 'light', dockIconSize: 'small', blurPx: 5, backgroundMode: 'wallpaper' },
        version: 2,
      }),
    );
    await useSettings.persist.rehydrate();
    expect(useSettings.getState()).toMatchObject({
      ...DEFAULT_SETTINGS,
      theme: 'light',
      dockIconSize: 'small',
      blurPx: 5,
      backgroundMode: 'wallpaper',
    });
  });

  it('migrates settings saved by the first version (wallpaperEnabled: false → Solid)', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: { theme: 'dark', wallpaperEnabled: false, blurPx: 12 }, version: 1 }),
    );
    await useSettings.persist.rehydrate();
    expect(useSettings.getState()).toMatchObject({
      theme: 'dark',
      blurPx: 12,
      backgroundMode: 'solid',
    });
    expect(useSettings.getState()).not.toHaveProperty('wallpaperEnabled');
  });

  it('migrates settings saved by the first version (wallpaperEnabled: true → Transparent)', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: { wallpaperEnabled: true }, version: 1 }),
    );
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().backgroundMode).toBe('transparent');
  });

  it('survives corrupt saved data', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: { theme: 42, blurPx: 'wide' }, version: 2 }),
    );
    await useSettings.persist.rehydrate();
    expect(useSettings.getState()).toMatchObject(DEFAULT_SETTINGS);
  });

  it('resets to the defaults', () => {
    useSettings.getState().update({ theme: 'dark', blurPx: 3, backgroundMode: 'solid' });
    useSettings.getState().reset();
    expect(useSettings.getState()).toMatchObject(DEFAULT_SETTINGS);
  });
});
