import { Navigate, Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useAuthState } from '../auth/use-auth-state';
import { CommandPalette } from '../commands/command-palette';
import { useShortcuts } from '../commands/use-shortcuts';
import { Dock } from '../dock/dock';
import { useSettings } from '../store/settings-store';
import { moduleFromPath, modulePath } from './module-paths';
import { ToastHost } from './toast-host';

/** Layout for signed-in screens: the page area and the dock. */
export function AppLayout() {
  const { auth } = useRouter().options.context;
  const status = useAuthState(auth, (state) => state.status);
  const settings = useSettings();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useShortcuts();

  // Signing out (or an expired session) while a screen is open goes back to login.
  if (status !== 'signedIn') return <Navigate to="/login" replace />;

  return (
    <>
      {/* 40 px on top clears the transparent title bar; 80 px at the bottom clears the dock */}
      <main className="min-h-0 flex-1 overflow-y-auto pt-10 pb-20">
        <Outlet />
      </main>
      <CommandPalette />
      <ToastHost />
      <Dock
        activeModule={moduleFromPath(pathname)}
        onNavigate={(id) => {
          void navigate({ to: modulePath(id) });
        }}
        iconSize={settings.dockIconSize}
        magnification={settings.dockMagnification}
        autoHide={settings.dockAutoHide}
      />
    </>
  );
}
