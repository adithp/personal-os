import type { ModuleId } from '@personal-os/shared';
import { MODULE_IDS } from '@personal-os/shared';

/** URL path of a module: the dashboard is "/", every other module is "/<id>". */
export function modulePath(id: ModuleId): string {
  return id === 'dashboard' ? '/' : `/${id}`;
}

/** The module shown at a URL path, or undefined for unknown paths. */
export function moduleFromPath(pathname: string): ModuleId | undefined {
  if (pathname === '/' || pathname === '') return 'dashboard';
  const first = pathname.split('/')[1];
  return MODULE_IDS.find((id) => id === first);
}
