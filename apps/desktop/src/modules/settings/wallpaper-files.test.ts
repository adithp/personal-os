import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isWallpaperFileName } from '@personal-os/shared';
import { chooseWallpaperImage, removeWallpaperFile, wallpaperUrl } from './wallpaper-files';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  copyFile: vi.fn(),
  remove: vi.fn(),
  appDataDir: vi.fn(),
  join: vi.fn(),
  convertFileSrc: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 14 },
  stat: mocks.stat,
  mkdir: mocks.mkdir,
  copyFile: mocks.copyFile,
  remove: mocks.remove,
}));
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: mocks.appDataDir, join: mocks.join }));
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: mocks.convertFileSrc }));

function runInsideTauri() {
  Object.assign(window, { __TAURI_INTERNALS__: {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(1760000000000);
  mocks.stat.mockResolvedValue({ size: 1024 });
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.copyFile.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.appDataDir.mockResolvedValue('C:\\Users\\me\\AppData\\Roaming\\com.personalos.desktop');
  mocks.join.mockImplementation((...parts: string[]) => Promise.resolve(parts.join('\\')));
  mocks.convertFileSrc.mockImplementation((path: string) => `http://asset.localhost/${path}`);
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  vi.restoreAllMocks();
});

describe('chooseWallpaperImage', () => {
  it('is unavailable outside the desktop app', async () => {
    await expect(chooseWallpaperImage()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('asks for one image file of the allowed types only', async () => {
    runInsideTauri();
    mocks.open.mockResolvedValue(null);
    await chooseWallpaperImage();
    expect(mocks.open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
  });

  it('does nothing when the dialog is cancelled', async () => {
    runInsideTauri();
    mocks.open.mockResolvedValue(null);
    await expect(chooseWallpaperImage()).resolves.toEqual({ ok: false, reason: 'cancelled' });
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });

  it('copies the image into the app wallpapers folder under a safe generated name', async () => {
    runInsideTauri();
    mocks.open.mockResolvedValue('C:\\Users\\me\\Pictures\\My Holiday Photo (1).png');

    const result = await chooseWallpaperImage();
    expect(result).toEqual({ ok: true, file: 'wallpaper-1760000000000.png' });
    if (result.ok) expect(isWallpaperFileName(result.file)).toBe(true);

    expect(mocks.mkdir).toHaveBeenCalledWith('wallpapers', { baseDir: 14, recursive: true });
    expect(mocks.copyFile).toHaveBeenCalledWith(
      'C:\\Users\\me\\Pictures\\My Holiday Photo (1).png',
      'wallpapers/wallpaper-1760000000000.png',
      { toPathBaseDir: 14 },
    );
  });

  it('never uses the original file name', async () => {
    runInsideTauri();
    mocks.open.mockResolvedValue('C:\\pics\\..\\..\\evil name.webp');
    const result = await chooseWallpaperImage();
    expect(result).toEqual({ ok: true, file: 'wallpaper-1760000000000.webp' });
  });

  it('lowercases the extension', async () => {
    runInsideTauri();
    mocks.open.mockResolvedValue('C:\\pics\\PHOTO.JPG');
    await expect(chooseWallpaperImage()).resolves.toEqual({
      ok: true,
      file: 'wallpaper-1760000000000.jpg',
    });
  });

  it.each([
    'C:\\pics\\anim.gif',
    'C:\\pics\\logo.svg',
    'C:\\pics\\noextension',
    'C:\\tools\\run.exe',
  ])('rejects %s as the wrong type without copying', async (path) => {
    runInsideTauri();
    mocks.open.mockResolvedValue(path);
    await expect(chooseWallpaperImage()).resolves.toEqual({ ok: false, reason: 'type' });
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });

  it('rejects an image larger than 20 MB', async () => {
    runInsideTauri();
    mocks.open.mockResolvedValue('C:\\pics\\huge.png');
    mocks.stat.mockResolvedValue({ size: 20 * 1024 * 1024 + 1 });
    await expect(chooseWallpaperImage()).resolves.toEqual({ ok: false, reason: 'size' });
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });

  it('accepts an image of exactly 20 MB', async () => {
    runInsideTauri();
    mocks.open.mockResolvedValue('C:\\pics\\big.png');
    mocks.stat.mockResolvedValue({ size: 20 * 1024 * 1024 });
    await expect(chooseWallpaperImage()).resolves.toMatchObject({ ok: true });
  });

  it('reports a failure when the copy fails', async () => {
    runInsideTauri();
    mocks.open.mockResolvedValue('C:\\pics\\a.png');
    mocks.copyFile.mockRejectedValue(new Error('disk full'));
    await expect(chooseWallpaperImage()).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('reports a failure when the dialog itself fails', async () => {
    runInsideTauri();
    mocks.open.mockRejectedValue(new Error('no window'));
    await expect(chooseWallpaperImage()).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});

describe('removeWallpaperFile', () => {
  it('deletes a stored wallpaper from the wallpapers folder', async () => {
    runInsideTauri();
    await removeWallpaperFile('wallpaper-5.png');
    expect(mocks.remove).toHaveBeenCalledWith('wallpapers/wallpaper-5.png', { baseDir: 14 });
  });

  it.each(['../secret.png', 'photo.png', 'wallpapers/wallpaper-5.png', ''])(
    'refuses the unsafe name %j',
    async (name) => {
      runInsideTauri();
      await removeWallpaperFile(name);
      expect(mocks.remove).not.toHaveBeenCalled();
    },
  );

  it('does nothing outside the desktop app', async () => {
    await removeWallpaperFile('wallpaper-5.png');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('does not throw when the file is already gone', async () => {
    runInsideTauri();
    mocks.remove.mockRejectedValue(new Error('not found'));
    await expect(removeWallpaperFile('wallpaper-5.png')).resolves.toBeUndefined();
  });
});

describe('wallpaperUrl', () => {
  it('builds a loadable URL inside the app data wallpapers folder', async () => {
    runInsideTauri();
    const url = await wallpaperUrl('wallpaper-5.png');
    expect(mocks.join).toHaveBeenCalledWith(
      'C:\\Users\\me\\AppData\\Roaming\\com.personalos.desktop',
      'wallpapers',
      'wallpaper-5.png',
    );
    expect(url).toBe(
      'http://asset.localhost/C:\\Users\\me\\AppData\\Roaming\\com.personalos.desktop\\wallpapers\\wallpaper-5.png',
    );
  });

  it('returns null for an unsafe name, outside Tauri, or on failure', async () => {
    await expect(wallpaperUrl('wallpaper-5.png')).resolves.toBeNull();
    runInsideTauri();
    await expect(wallpaperUrl('../../Windows/win.ini')).resolves.toBeNull();
    mocks.appDataDir.mockRejectedValue(new Error('no'));
    await expect(wallpaperUrl('wallpaper-5.png')).resolves.toBeNull();
  });
});
