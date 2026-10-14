import { cx, Tooltip } from '@personal-os/ui';
import {
  IconCalendar,
  IconCalendarEvent,
  IconFolder,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconNotes,
  IconTags,
  IconTemplate,
  IconTrash,
  type Icon,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { ApiError } from '../../../api/api-client';
import { useNow } from '../../dashboard/greeting';
import { useOpenDaily } from '../daily/use-open-daily';
import { useNoteFolders } from '../folders-queries';
import { DAILY_PLACE, TEMPLATES_PLACE } from '../notes-search';
import { useNotesUi } from '../notes-ui-store';
import { FolderSection } from './folder-section';
import { TagsSection } from './tags-section';
import { useNotesNav } from './use-notes-nav';

const rowClass =
  'flex h-8 items-center gap-2.5 rounded-chip px-2.5 text-body focus-ring transition-colors duration-150 ease-out motion-reduce:transition-none';

const iconOf = (Glyph: Icon) => <Glyph size={18} stroke={1.5} aria-hidden className="shrink-0" />;

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
});

/** Opens (or creates) today's daily note. The India date is a muted hint. */
function TodayRow({ collapsed }: { collapsed: boolean }) {
  const daily = useOpenDaily();
  const hint = dayFormat.format(useNow());
  const button = (
    <button
      type="button"
      aria-label={collapsed ? `Today, ${hint}` : undefined}
      aria-disabled={daily.isPending || undefined}
      onClick={() => {
        if (daily.isPending) return;
        void daily.open();
      }}
      className={cx(
        rowClass,
        'w-full text-fg-secondary hover:bg-tint hover:text-fg',
        daily.isPending && 'opacity-60',
      )}
    >
      {iconOf(IconCalendarEvent)}
      {collapsed ? null : (
        <>
          <span>Today</span>
          <span className="ml-auto text-small text-fg-muted">{hint}</span>
        </>
      )}
    </button>
  );
  return <li>{collapsed ? <Tooltip label={`Today, ${hint}`}>{button}</Tooltip> : button}</li>;
}

/** A link to All notes, Daily notes, Templates or Trash. The active one is marked with aria-current. */
function PlaceRow({
  label,
  icon,
  place,
  active,
  collapsed,
}: {
  label: string;
  icon: Icon;
  place: 'all' | 'trash' | typeof TEMPLATES_PLACE | typeof DAILY_PLACE;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      to="/notes"
      search={(previous) => ({
        ...(previous.note ? { note: previous.note } : {}),
        ...(place === 'all' ? {} : { folder: place }),
      })}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cx(
        rowClass,
        active ? 'bg-tint font-medium text-fg' : 'text-fg-secondary hover:bg-tint hover:text-fg',
      )}
    >
      {iconOf(icon)}
      {collapsed ? null : <span>{label}</span>}
    </Link>
  );
  return <li>{collapsed ? <Tooltip label={label}>{link}</Tooltip> : link}</li>;
}

/** The slim, collapsible navigation inside the Notes page. */
export function NotesSidePanel({ forceCollapsed = false }: { forceCollapsed?: boolean }) {
  // Icons only while the right panel crowds a narrow window (the saved choice is not changed)
  const collapsed = useNotesUi((state) => state.sidePanelCollapsed) || forceCollapsed;
  const toggle = useNotesUi((state) => state.toggleSidePanel);
  const nav = useNotesNav();
  const folders = useNoteFolders();
  const label = collapsed ? 'Expand side panel' : 'Collapse side panel';
  const Toggle = collapsed ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse;

  return (
    <aside
      aria-label="Notes navigation"
      className={cx(
        'flex h-full min-h-0 shrink-0 flex-col gap-3 overflow-y-auto rounded-card glass p-2 transition-[width] duration-150 ease-out motion-reduce:transition-none',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className={cx('flex', collapsed ? 'justify-center' : 'justify-between pl-2.5')}>
        {collapsed ? null : <span className="self-center text-small text-fg-muted">Notes</span>}
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

      <nav aria-label="Notes" className="flex flex-col gap-3">
        <ul className="flex flex-col gap-0.5">
          <PlaceRow
            label="All notes"
            icon={IconNotes}
            place="all"
            active={nav.place === 'all'}
            collapsed={collapsed}
          />
          <TodayRow collapsed={collapsed} />
          <PlaceRow
            label="Daily notes"
            icon={IconCalendar}
            place={DAILY_PLACE}
            active={nav.place === DAILY_PLACE}
            collapsed={collapsed}
          />
        </ul>

        {collapsed ? (
          <ul>
            <li>
              <Tooltip label="Folders">
                <button
                  type="button"
                  aria-label="Folders, expand the side panel to see them"
                  onClick={toggle}
                  className={cx(rowClass, 'w-full text-fg-secondary hover:bg-tint hover:text-fg')}
                >
                  {iconOf(IconFolder)}
                </button>
              </Tooltip>
            </li>
          </ul>
        ) : (
          <FolderSection
            folders={folders.data ?? []}
            isPending={folders.isPending}
            isError={folders.isError}
            errorMessage={folders.error instanceof ApiError ? folders.error.message : null}
            onRetry={() => {
              void folders.refetch();
            }}
          />
        )}

        {collapsed ? (
          <ul>
            <li>
              <Tooltip label="Tags">
                <button
                  type="button"
                  aria-label="Tags, expand the side panel to see them"
                  onClick={toggle}
                  className={cx(rowClass, 'w-full text-fg-secondary hover:bg-tint hover:text-fg')}
                >
                  {iconOf(IconTags)}
                </button>
              </Tooltip>
            </li>
          </ul>
        ) : (
          <TagsSection />
        )}

        <ul className="flex flex-col gap-0.5">
          <PlaceRow
            label="Templates"
            icon={IconTemplate}
            place={TEMPLATES_PLACE}
            active={nav.place === TEMPLATES_PLACE}
            collapsed={collapsed}
          />
          <PlaceRow
            label="Trash"
            icon={IconTrash}
            place="trash"
            active={nav.place === 'trash'}
            collapsed={collapsed}
          />
        </ul>
      </nav>
    </aside>
  );
}
