import { cx, Tooltip } from '@personal-os/ui';
import {
  IconBriefcase,
  IconChartBar,
  IconCircleCheck,
  IconInbox,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconTarget,
  type Icon,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { FavoritesList } from '../favorites/favorites-list';
import { TASK_FEATURES } from '../features';
import { inboxTasks } from '../sections';
import { useOpenTasks } from '../tasks-queries';
import { useTasksUi } from '../tasks-ui-store';

type Route = '/tasks' | '/tasks/my-tasks' | '/tasks/inbox' | '/tasks/reporting' | '/tasks/goals';

interface Item {
  label: string;
  icon: Icon;
  /** The page; null for a part that is not planned yet (Portfolios). */
  to: Route | null;
  /** False while the part is not built: shown disabled with "Soon". */
  enabled: boolean;
  exact?: boolean;
  /** Show the Inbox count. */
  count?: boolean;
}

const ITEMS: readonly Item[] = [
  { label: 'Overview', icon: IconLayoutDashboard, to: '/tasks', enabled: true, exact: true },
  { label: 'My tasks', icon: IconCircleCheck, to: '/tasks/my-tasks', enabled: true },
  {
    label: 'Inbox',
    icon: IconInbox,
    to: '/tasks/inbox',
    enabled: TASK_FEATURES.inbox,
    count: true,
  },
  {
    label: 'Reporting',
    icon: IconChartBar,
    to: '/tasks/reporting',
    enabled: TASK_FEATURES.reporting,
  },
  { label: 'Goals', icon: IconTarget, to: '/tasks/goals', enabled: TASK_FEATURES.goals },
  { label: 'Portfolios', icon: IconBriefcase, to: null, enabled: false },
];

const rowClass =
  'flex h-8 items-center gap-2.5 rounded-chip px-2.5 text-body focus-ring transition-colors duration-150 ease-out';

function InboxCount() {
  const tasks = useOpenTasks();
  if (!tasks.data) return null;
  const count = inboxTasks(tasks.data).length;
  return (
    <span className="ml-auto text-small text-fg-muted" aria-label={`${String(count)} in inbox`}>
      {count}
    </span>
  );
}

function PanelItem({ item, collapsed }: { item: Item; collapsed: boolean }) {
  const Glyph = item.icon;
  const icon = <Glyph size={18} stroke={1.5} aria-hidden className="shrink-0" />;
  const wrap = (node: ReactElement<{ 'aria-describedby'?: string }>, tip: string) =>
    collapsed ? <Tooltip label={tip}>{node}</Tooltip> : node;

  if (!item.enabled || item.to === null) {
    return (
      <li>
        {wrap(
          <div
            aria-disabled="true"
            aria-label={collapsed ? `${item.label}, coming soon` : undefined}
            className={cx(rowClass, 'cursor-default text-fg-muted opacity-60')}
          >
            {icon}
            {collapsed ? null : (
              <>
                <span>{item.label}</span>
                <span className="ml-auto text-small text-fg-muted">Soon</span>
              </>
            )}
          </div>,
          `${item.label} (Soon)`,
        )}
      </li>
    );
  }

  return (
    <li>
      {wrap(
        <Link
          to={item.to}
          activeOptions={{ exact: item.exact === true }}
          aria-label={collapsed ? item.label : undefined}
          className={cx(rowClass, 'text-fg-secondary hover:bg-tint hover:text-fg')}
          activeProps={{ className: 'bg-tint !text-fg font-medium' }}
        >
          {icon}
          {collapsed ? null : <span>{item.label}</span>}
          {item.count && !collapsed ? <InboxCount /> : null}
        </Link>,
        item.label,
      )}
    </li>
  );
}

/** The slim, collapsible navigation inside the Tasks page. */
export function SidePanel() {
  const collapsed = useTasksUi((state) => state.sidePanelCollapsed);
  const toggle = useTasksUi((state) => state.toggleSidePanel);
  const label = collapsed ? 'Expand side panel' : 'Collapse side panel';
  const Toggle = collapsed ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse;

  return (
    <aside
      aria-label="Tasks navigation"
      className={cx(
        'flex h-full min-h-0 shrink-0 flex-col gap-3 overflow-y-auto rounded-card glass p-2 transition-[width] duration-150 ease-out',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className={cx('flex', collapsed ? 'justify-center' : 'justify-between pl-2.5')}>
        {collapsed ? null : <span className="self-center text-small text-fg-muted">Tasks</span>}
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
      <nav aria-label="Tasks">
        <ul className="flex flex-col gap-0.5">
          {ITEMS.map((item) => (
            <PanelItem key={item.label} item={item} collapsed={collapsed} />
          ))}
        </ul>
      </nav>
      <FavoritesList collapsed={collapsed} />
    </aside>
  );
}
