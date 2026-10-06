import { useApplyTheme } from '@personal-os/ui';
import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
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

  useEffect(() => {
    // The page itself must be see-through in Transparent mode (see packages/ui styles).
    document.documentElement.dataset.background = background;
  }, [background]);

  useEffect(() => {
    document.documentElement.style.setProperty('--glass-blur', `${String(settings.blurPx)}px`);
  }, [settings.blurPx]);

  return (
    <div className="flex h-full flex-col">
      <Background mode={background} />
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
