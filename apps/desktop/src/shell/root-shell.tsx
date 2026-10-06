import { useApplyTheme } from '@personal-os/ui';
import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useSettings } from '../store/settings-store';
import { TitleBar } from './title-bar';
import { useTauriWindow } from './use-tauri-window';
import { Wallpaper } from './wallpaper';

/** Frame for every screen, including login: wallpaper, theme, and the transparent title bar. */
export function RootShell() {
  const settings = useSettings();
  const appWindow = useTauriWindow();

  useApplyTheme(settings.theme);

  useEffect(() => {
    document.documentElement.style.setProperty('--glass-blur', `${String(settings.blurPx)}px`);
  }, [settings.blurPx]);

  return (
    <div className="flex h-full flex-col">
      <Wallpaper enabled={settings.wallpaperEnabled} />
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
