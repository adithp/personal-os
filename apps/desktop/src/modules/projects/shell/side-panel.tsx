import { cx, Tooltip } from '@personal-os/ui';
import {
  IconBriefcase,
  IconClock,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import { useProjectsUi, type ProjectsView } from '../projects-ui-store';

const rowClass =
  'flex h-8 w-full items-center gap-2.5 rounded-chip px-2.5 text-body focus-ring transition-colors duration-150 ease-out motion-reduce:transition-none';

const ITEMS: readonly { view: ProjectsView; label: string; icon: Icon }[] = [
  { view: 'projects', label: 'All projects', icon: IconBriefcase },
  { view: 'clients', label: 'Clients', icon: IconUsers },
  { view: 'time', label: 'Time', icon: IconClock },
];

/** The slim, collapsible navigation inside the Projects page. */
export function ProjectsSidePanel() {
  const collapsed = useProjectsUi((state) => state.sidePanelCollapsed);
  const toggle = useProjectsUi((state) => state.toggleSidePanel);
  const view = useProjectsUi((state) => state.view);
  const showView = useProjectsUi((state) => state.showView);
  const label = collapsed ? 'Expand side panel' : 'Collapse side panel';
  const Toggle = collapsed ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse;

  return (
    <aside
      aria-label="Projects navigation"
      className={cx(
        'flex h-full min-h-0 shrink-0 flex-col gap-3 overflow-y-auto rounded-card glass p-2 transition-[width] duration-150 ease-out motion-reduce:transition-none',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className={cx('flex', collapsed ? 'justify-center' : 'justify-between pl-2.5')}>
        {collapsed ? null : <span className="self-center text-small text-fg-muted">Projects</span>}
        <Tooltip label={label}>
          <button
            type="button"
            aria-label={label}
            aria-expanded={!collapsed}
            onClick={toggle}
            className="flex size-8 items-center justify-center rounded-chip text-fg-muted focus-ring hover:bg-tint hover:text-fg"
          >
            <Toggle size={18} stroke={1.5} aria-hidden />
          </button>
        </Tooltip>
      </div>

      <nav aria-label="Projects">
        <ul className="flex flex-col gap-0.5">
          {ITEMS.map((item) => {
            const active = view === item.view;
            const button = (
              <button
                type="button"
                aria-label={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  showView(item.view);
                }}
                className={cx(
                  rowClass,
                  active
                    ? 'bg-tint font-medium text-fg'
                    : 'text-fg-secondary hover:bg-tint hover:text-fg',
                )}
              >
                <item.icon size={18} stroke={1.5} aria-hidden className="shrink-0" />
                {collapsed ? null : <span>{item.label}</span>}
              </button>
            );
            return (
              <li key={item.view}>
                {collapsed ? <Tooltip label={item.label}>{button}</Tooltip> : button}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
