import { useApplyTheme } from '@personal-os/ui';
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Dock } from '../dock/dock';
import { useSettings } from '../store/settings-store';
import { moduleFromPath, modulePath } from './module-paths';
import { TitleBar } from './title-bar';
import { useTauriWindow } from './use-tauri-window';
import { Wallpaper } from './wallpaper';

/** Window frame shared by every screen: wallpaper, title bar, page area, and the dock. */
export function AppShell() {
  const settings = useSettings();
  const appWindow = useTauriWindow();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

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
      {/* 40 px on top clears the transparent title bar; 80 px at the bottom clears the dock */}
      <main className="min-h-0 flex-1 overflow-y-auto pt-10 pb-20">
        <Outlet />
      </main>
      <Dock
        activeModule={moduleFromPath(pathname)}
        onNavigate={(id) => {
          void navigate({ to: modulePath(id) });
        }}
        iconSize={settings.dockIconSize}
        magnification={settings.dockMagnification}
        autoHide={settings.dockAutoHide}
      />
    </div>
  );
}
