import { Outlet } from '@tanstack/react-router';
import { SidePanel } from './side-panel';

/** The Tasks module frame: the slim inner side panel on the left, the page on the right. */
export function TasksLayout() {
  return (
    <div className="flex h-full min-h-0 gap-3 px-4 pt-4">
      <SidePanel />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
