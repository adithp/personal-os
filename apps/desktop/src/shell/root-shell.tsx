import { useApplyTheme, useLiquidGlass } from '@personal-os/ui';
import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useWallpaperUrl } from '../modules/settings/use-wallpaper-url';
import { useGlassSupport } from '../store/glass-support-store';
import { useSettings } from '../store/settings-store';
import { Background } from './background';
import { TitleBar } from './title-bar';
import { useBackground } from './use-background';
import { useTauriWindow } from './use-tauri-window';

/** Frame for every screen, including login: background, theme, and the transparent title bar. */
export function RootShell() {
  const settings = useSettings();
  const appWindow = useTauriWindow();

  useApplyTheme(settings.theme);
  const background = useBackground(settings.backgroundMode);
  const glass = useLiquidGlass(settings.glassEffect, settings.liquidStrength);
  const setLiquidUnavailable = useGlassSupport((state) => state.setLiquidUnavailable);

  useEffect(() => {
    setLiquidUnavailable(glass.unavailable);
  }, [glass.unavailable, setLiquidUnavailable]);
  const imageUrl = useWallpaperUrl(
    settings.wallpaperSource === 'custom' ? settings.wallpaperFile : null,
  );

  useEffect(() => {
    // The page itself must be see-through in Transparent mode (see packages/ui styles).
    document.documentElement.dataset.background = background;
  }, [background]);

  useEffect(() => {
    document.documentElement.style.setProperty('--glass-blur', `${String(settings.blurPx)}px`);
  }, [settings.blurPx]);

  return (
    <div
      className="window-frame flex h-full flex-col"
      data-maximized={appWindow.maximized ? 'true' : undefined}
    >
      <Background mode={background} imageUrl={imageUrl} />
      <TitleBar
        maximized={appWindow.maximized}
        onMinimize={appWindow.minimize}
        onToggleMaximize={appWindow.toggleMaximize}
        onClose={appWindow.close}
      />
      <Outlet />
    </div>
  );
}
