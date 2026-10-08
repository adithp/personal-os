import type * as TauriWindow from '@tauri-apps/api/window';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../store/settings-store';
import { useWindowEffect } from '../../store/window-effect-store';
import { signedInAuth } from '../../test/fake-auth';
import { renderApp } from '../../test/render-app';
import { chooseWallpaperImage, removeWallpaperFile, wallpaperUrl } from './wallpaper-files';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('./wallpaper-files', () => ({
  chooseWallpaperImage: vi.fn(),
  removeWallpaperFile: vi.fn(() => Promise.resolve()),
  wallpaperUrl: vi.fn(() => Promise.resolve('http://asset.localhost/preview.png')),
}));

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  useWindowEffect.setState({ status: 'pending' });
  vi.clearAllMocks();
  vi.mocked(wallpaperUrl).mockResolvedValue('http://asset.localhost/preview.png');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

async function openSettings(email = 'me@example.com') {
  const fake = signedInAuth(email);
  const router = await renderApp('/settings', fake.auth);
  return { ...fake, router, user: userEvent.setup() };
}

const radio = (group: string, name: string) =>
  within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });

describe('Settings screen', () => {
  it('has Appearance, Dock, and Account sections under a Settings heading', async () => {
    await openSettings();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    for (const name of ['Appearance', 'Dock', 'Account']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(document.querySelector('[data-module="settings"]')).toHaveStyle({
      backgroundColor: 'var(--module-settings)',
    });
  });

  it('keeps the dock, with Settings as the active module', async () => {
    await openSettings();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('Appearance → Theme', () => {
  it('shows the saved theme and switches it live', async () => {
    const { user } = await openSettings();
    expect(radio('Theme', 'System')).toBeChecked();

    await user.click(radio('Theme', 'Light'));
    expect(useSettings.getState().theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(radio('Theme', 'Light')).toBeChecked();

    await user.click(radio('Theme', 'Dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('Appearance → Background', () => {
  it('offers Transparent, Wallpaper, and Solid with Transparent as the default', async () => {
    await openSettings();
    const group = screen.getByRole('radiogroup', { name: 'Background' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Transparent', 'Wallpaper', 'Solid']);
    expect(radio('Background', 'Transparent')).toBeChecked();
  });

  it('shows the blur slider and the image choice only for Wallpaper', async () => {
    const { user } = await openSettings();

    // Transparent (default)
    expect(screen.queryByRole('slider', { name: 'Blur' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Image' })).not.toBeInTheDocument();

    await user.click(radio('Background', 'Wallpaper'));
    expect(screen.getByRole('slider', { name: 'Blur' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Image' })).toBeInTheDocument();

    await user.click(radio('Background', 'Solid'));
    expect(screen.queryByRole('slider', { name: 'Blur' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Image' })).not.toBeInTheDocument();

    await user.click(radio('Background', 'Transparent'));
    expect(screen.queryByRole('slider', { name: 'Blur' })).not.toBeInTheDocument();
  });

  it('changes the real background live and saves the choice', async () => {
    const { user } = await openSettings();
    await user.click(radio('Background', 'Solid'));

    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveAttribute('data-mode', 'solid');
    });
    expect(document.documentElement.dataset.background).toBe('solid');
    expect(useSettings.getState().backgroundMode).toBe('solid');
    expect(localStorage.getItem('personal-os.settings')).toContain('"backgroundMode":"solid"');
  });

  it('explains each mode', async () => {
    const { user } = await openSettings();
    expect(screen.getByText('Your desktop shows through the window, blurred.')).toBeInTheDocument();
    await user.click(radio('Background', 'Wallpaper'));
    expect(screen.getByText('A picture behind the app.')).toBeInTheDocument();
    await user.click(radio('Background', 'Solid'));
    expect(screen.getByText('A plain color.')).toBeInTheDocument();
  });

  it('can be changed with the arrow keys', async () => {
    const { user } = await openSettings();
    radio('Background', 'Transparent').focus();
    await user.keyboard('{ArrowRight}');
    expect(useSettings.getState().backgroundMode).toBe('wallpaper');
    expect(radio('Background', 'Wallpaper')).toHaveFocus();
  });

  it('says when Transparent is not available and the wallpaper is shown instead', async () => {
    await openSettings();
    // Outside the desktop app the see-through effect cannot be applied.
    expect(
      await screen.findByText(
        'Transparent is not available on this computer, so the wallpaper is shown instead.',
      ),
    ).toBeInTheDocument();
    expect(useSettings.getState().backgroundMode).toBe('transparent');
  });

  it('does not show that note when the effect works or another mode is chosen', async () => {
    const { user } = await openSettings();
    const note =
      'Transparent is not available on this computer, so the wallpaper is shown instead.';
    await screen.findByText(note);
    await user.click(radio('Background', 'Solid'));
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });
});

describe('Wallpaper options', () => {
  async function openWallpaper(initial: Partial<ReturnType<typeof useSettings.getState>> = {}) {
    useSettings.getState().update({ backgroundMode: 'wallpaper', ...initial });
    return openSettings();
  }

  it('shows the blur value and changes it between 0 and 40 px', async () => {
    await openWallpaper();
    const slider = screen.getByRole('slider', { name: 'Blur' });
    expect(slider).toHaveValue('24');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '40');
    expect(screen.getByText('24 px')).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: '7' } });
    expect(useSettings.getState().blurPx).toBe(7);
    expect(screen.getByText('7 px')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--glass-blur')).toBe('7px');
  });

  it('offers the built-in gradient or your own image, built-in first', async () => {
    await openWallpaper();
    const group = screen.getByRole('radiogroup', { name: 'Image' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Built-in gradient', 'My image']);
    expect(radio('Image', 'Built-in gradient')).toBeChecked();
    expect(screen.queryByRole('button', { name: /choose image/i })).not.toBeInTheDocument();
  });

  it('asks for an image when My image is chosen and none exists yet', async () => {
    const { user } = await openWallpaper();
    await user.click(radio('Image', 'My image'));
    expect(screen.getByText(/No image chosen yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose image…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove image' })).not.toBeInTheDocument();
    expect(useSettings.getState().wallpaperSource).toBe('custom');
  });

  it('saves a chosen image and shows a preview with Change and Remove', async () => {
    vi.mocked(chooseWallpaperImage).mockResolvedValue({ ok: true, file: 'wallpaper-7.png' });
    const { user } = await openWallpaper({ wallpaperSource: 'custom' });

    await user.click(screen.getByRole('button', { name: 'Choose image…' }));

    await waitFor(() => {
      expect(useSettings.getState().wallpaperFile).toBe('wallpaper-7.png');
    });
    expect(useSettings.getState().wallpaperSource).toBe('custom');
    expect(removeWallpaperFile).not.toHaveBeenCalled();
    expect(await screen.findByAltText('Your wallpaper')).toHaveAttribute(
      'src',
      'http://asset.localhost/preview.png',
    );
    expect(screen.getByRole('button', { name: 'Change image…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove image' })).toBeInTheDocument();
  });

  it('deletes the previous image when a new one replaces it', async () => {
    vi.mocked(chooseWallpaperImage).mockResolvedValue({ ok: true, file: 'wallpaper-9.jpg' });
    const { user } = await openWallpaper({
      wallpaperSource: 'custom',
      wallpaperFile: 'wallpaper-7.png',
    });

    await user.click(screen.getByRole('button', { name: 'Change image…' }));

    await waitFor(() => {
      expect(useSettings.getState().wallpaperFile).toBe('wallpaper-9.jpg');
    });
    expect(removeWallpaperFile).toHaveBeenCalledWith('wallpaper-7.png');
  });

  it('uses the image as the real background', async () => {
    await openWallpaper({ wallpaperSource: 'custom', wallpaperFile: 'wallpaper-7.png' });
    // Wait until the image URL has been resolved
    await screen.findByAltText('Your wallpaper');
    await waitFor(() => {
      expect(screen.getByTestId('background').style.backgroundImage).toContain('preview.png');
    });
    expect(screen.getByTestId('background')).toHaveAttribute('data-image', 'true');
  });

  it('removes the image and goes back to the built-in gradient', async () => {
    const { user } = await openWallpaper({
      wallpaperSource: 'custom',
      wallpaperFile: 'wallpaper-7.png',
    });
    await user.click(screen.getByRole('button', { name: 'Remove image' }));

    expect(useSettings.getState()).toMatchObject({
      wallpaperSource: 'builtin',
      wallpaperFile: null,
    });
    expect(removeWallpaperFile).toHaveBeenCalledWith('wallpaper-7.png');
    expect(radio('Image', 'Built-in gradient')).toBeChecked();
    expect(screen.getByTestId('background')).toHaveAttribute('data-image', 'false');
  });

  it('keeps the uploaded image when switching back to the built-in gradient', async () => {
    const { user } = await openWallpaper({
      wallpaperSource: 'custom',
      wallpaperFile: 'wallpaper-7.png',
    });
    await user.click(radio('Image', 'Built-in gradient'));
    expect(useSettings.getState()).toMatchObject({
      wallpaperSource: 'builtin',
      wallpaperFile: 'wallpaper-7.png',
    });
    expect(removeWallpaperFile).not.toHaveBeenCalled();
  });

  it.each([
    ['type', 'Choose a PNG, JPG, or WebP image.'],
    ['size', 'That image is larger than 20 MB.'],
    ['failed', 'Could not use that image. Try another one.'],
    ['unavailable', 'Choosing an image only works in the desktop app.'],
  ] as const)('shows a clear message when the image is rejected (%s)', async (reason, message) => {
    vi.mocked(chooseWallpaperImage).mockResolvedValue({ ok: false, reason });
    const { user } = await openWallpaper({ wallpaperSource: 'custom' });

    await user.click(screen.getByRole('button', { name: 'Choose image…' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(useSettings.getState().wallpaperFile).toBeNull();
  });

  it('shows nothing when the file dialog is cancelled', async () => {
    vi.mocked(chooseWallpaperImage).mockResolvedValue({ ok: false, reason: 'cancelled' });
    const { user } = await openWallpaper({ wallpaperSource: 'custom' });
    await user.click(screen.getByRole('button', { name: 'Choose image…' }));

    await waitFor(() => {
      expect(chooseWallpaperImage).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears an old error on the next attempt', async () => {
    vi.mocked(chooseWallpaperImage)
      .mockResolvedValueOnce({ ok: false, reason: 'type' })
      .mockResolvedValueOnce({ ok: true, file: 'wallpaper-8.png' });
    const { user } = await openWallpaper({ wallpaperSource: 'custom' });

    await user.click(screen.getByRole('button', { name: 'Choose image…' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Choose image…' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});

describe('Dock settings', () => {
  it('shows the saved values with the documented defaults', async () => {
    await openSettings();
    expect(screen.getByRole('switch', { name: 'Auto-hide' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Magnification' })).toBeChecked();
    expect(radio('Icon size', 'Medium')).toBeChecked();
  });

  it('toggles auto-hide and magnification and saves them', async () => {
    const { user } = await openSettings();
    await user.click(screen.getByRole('switch', { name: 'Auto-hide' }));
    await user.click(screen.getByRole('switch', { name: 'Magnification' }));

    expect(useSettings.getState()).toMatchObject({ dockAutoHide: true, dockMagnification: false });
    expect(screen.getByRole('switch', { name: 'Auto-hide' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Magnification' })).not.toBeChecked();
  });

  it('resizes the real dock icons when the icon size changes', async () => {
    const { user } = await openSettings();
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveStyle({ width: '36px' });

    await user.click(radio('Icon size', 'Large'));
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveStyle({ width: '44px' });

    await user.click(radio('Icon size', 'Small'));
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveStyle({ width: '32px' });
  });
});

describe('Account', () => {
  it('shows who is signed in', async () => {
    await openSettings('adith@example.com');
    expect(screen.getByText('adith@example.com')).toBeInTheDocument();
  });

  it('logs out on this device and returns to the login screen', async () => {
    const { user, mocks, router } = await openSettings();
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Modules' })).not.toBeInTheDocument();
  });

  it('still returns to the login screen if the server call fails', async () => {
    const { user, mocks, router } = await openSettings();
    mocks.signOut.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });
});

describe('persistence', () => {
  it('keeps the changes after a restart', async () => {
    const { user } = await openSettings();
    await user.click(radio('Theme', 'Light'));
    await user.click(radio('Background', 'Solid'));
    await user.click(screen.getByRole('switch', { name: 'Auto-hide' }));

    const saved = localStorage.getItem('personal-os.settings') ?? '';
    expect(saved).toContain('"theme":"light"');

    // Simulate closing and reopening the app: memory is wiped, saved data stays.
    act(() => {
      useSettings.getState().reset();
    });
    localStorage.setItem('personal-os.settings', saved);
    await act(async () => {
      await useSettings.persist.rehydrate();
    });

    expect(useSettings.getState()).toMatchObject({
      theme: 'light',
      backgroundMode: 'solid',
      dockAutoHide: true,
    });
  });
});
