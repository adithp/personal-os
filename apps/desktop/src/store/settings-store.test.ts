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
      wallpaperEnabled: false,
      blurPx: 10,
      dockAutoHide: true,
      dockMagnification: false,
      dockIconSize: 'large',
    };
    expect(sanitizeSettings(saved)).toEqual(saved);
  });

  it('replaces invalid values one by one and clamps blur', () => {
    expect(
      sanitizeSettings({ theme: 'purple', blurPx: 500, dockIconSize: 'huge', dockAutoHide: 'yes' }),
    ).toEqual({ ...DEFAULT_SETTINGS, blurPx: 40 });
  });
});

describe('useSettings', () => {
  it('starts with the defaults from DESIGN.md', () => {
    expect(useSettings.getState()).toMatchObject(DEFAULT_SETTINGS);
  });

  it('updates settings and saves them on this device', () => {
    useSettings.getState().update({ theme: 'dark', dockAutoHide: true });
    expect(useSettings.getState().theme).toBe('dark');

    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state).toMatchObject({ theme: 'dark', dockAutoHide: true });
    expect(saved.state).not.toHaveProperty('update');
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
      JSON.stringify({ state: { theme: 'light', dockIconSize: 'small', blurPx: 5 }, version: 1 }),
    );
    await useSettings.persist.rehydrate();
    expect(useSettings.getState()).toMatchObject({
      ...DEFAULT_SETTINGS,
      theme: 'light',
      dockIconSize: 'small',
      blurPx: 5,
    });
  });

  it('survives corrupt saved data', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: { theme: 42, blurPx: 'wide' }, version: 1 }),
    );
    await useSettings.persist.rehydrate();
    expect(useSettings.getState()).toMatchObject(DEFAULT_SETTINGS);
  });

  it('resets to the defaults', () => {
    useSettings.getState().update({ theme: 'dark', blurPx: 3 });
    useSettings.getState().reset();
    expect(useSettings.getState()).toMatchObject(DEFAULT_SETTINGS);
  });
});
