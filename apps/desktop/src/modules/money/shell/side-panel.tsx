import { cx, Tooltip } from '@personal-os/ui';
import {
  IconChartBar,
  IconChartPie,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconRepeat,
  IconTarget,
  IconTransfer,
  IconWallet,
  type Icon,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { MoneySection } from '../money-search';
import { MONTH_SECTIONS } from '../money-search';
import { useMoneyUi } from '../money-ui-store';
import { useMoneyNav } from '../use-money-nav';

const ITEMS: readonly { section: MoneySection; label: string; icon: Icon }[] = [
  { section: 'overview', label: 'Overview', icon: IconLayoutDashboard },
  { section: 'transactions', label: 'Transactions', icon: IconTransfer },
  { section: 'wallets', label: 'Wallets', icon: IconWallet },
  { section: 'budgets', label: 'Budgets', icon: IconChartPie },
  { section: 'goals', label: 'Goals', icon: IconTarget },
  { section: 'subscriptions', label: 'Subscriptions', icon: IconRepeat },
  { section: 'reports', label: 'Reports', icon: IconChartBar },
];

const rowClass =
  'flex h-8 items-center gap-2.5 rounded-chip px-2.5 text-body focus-ring transition-colors duration-150 ease-out';

/** The slim, collapsible navigation inside the Money page. The section is in the URL. */
export function MoneySidePanel() {
  const collapsed = useMoneyUi((state) => state.sidePanelCollapsed);
  const toggle = useMoneyUi((state) => state.toggleSidePanel);
  const { section: current, month, thisMonth } = useMoneyNav();
  const label = collapsed ? 'Expand side panel' : 'Collapse side panel';
  const Toggle = collapsed ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse;

  return (
    <aside
      aria-label="Money navigation"
      className={cx(
        'flex h-full min-h-0 shrink-0 flex-col gap-3 overflow-y-auto rounded-card glass p-2 transition-[width] duration-150 ease-out',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className={cx('flex', collapsed ? 'justify-center' : 'justify-between pl-2.5')}>
        {collapsed ? null : <span className="self-center text-small text-fg-muted">Money</span>}
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
      <nav aria-label="Money">
        <ul className="flex flex-col gap-0.5">
          {ITEMS.map(({ section, label: name, icon: Glyph }) => {
            const active = section === current;
            const keepMonth = MONTH_SECTIONS.includes(section) && month !== thisMonth;
            const link = (
              <Link
                to="/money"
                search={{
                  ...(section === 'overview' ? {} : { section }),
                  ...(keepMonth ? { month } : {}),
                }}
                aria-label={collapsed ? name : undefined}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  rowClass,
                  active
                    ? 'bg-tint font-medium text-fg'
                    : 'text-fg-secondary hover:bg-tint hover:text-fg',
                )}
              >
                <Glyph size={18} stroke={1.5} aria-hidden className="shrink-0" />
                {collapsed ? null : <span>{name}</span>}
              </Link>
            );
            return (
              <li key={section}>{collapsed ? <Tooltip label={name}>{link}</Tooltip> : link}</li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
