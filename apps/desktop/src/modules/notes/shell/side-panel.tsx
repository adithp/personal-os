import { cx, Tooltip } from '@personal-os/ui';
import {
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
import { NOTE_FEATURES } from '../features';
import { useNoteFolders } from '../folders-queries';
import { useNotesUi } from '../notes-ui-store';
import { FolderSection } from './folder-section';
import { useNotesNav } from './use-notes-nav';

const rowClass =
  'flex h-8 items-center gap-2.5 rounded-chip px-2.5 text-body focus-ring transition-colors duration-150 ease-out';

const iconOf = (Glyph: Icon) => <Glyph size={18} stroke={1.5} aria-hidden className="shrink-0" />;

/** A part that is not built yet: disabled, with "Soon". */
function SoonRow({ label, icon, collapsed }: { label: string; icon: Icon; collapsed: boolean }) {
  const row = (
    <div
      aria-disabled="true"
      aria-label={collapsed ? `${label}, coming soon` : undefined}
      className={cx(rowClass, 'cursor-default text-fg-muted opacity-60')}
    >
      {iconOf(icon)}
      {collapsed ? null : (
        <>
          <span>{label}</span>
          <span className="ml-auto text-small text-fg-muted">Soon</span>
        </>
      )}
    </div>
  );
  return <li>{collapsed ? <Tooltip label={`${label} (Soon)`}>{row}</Tooltip> : row}</li>;
}

interface SoonItem {
  label: string;
  icon: Icon;
  /** True once its stage is merged: the row then comes from that stage, not from here. */
  built: boolean;
}

const SOON_TOP: readonly SoonItem[] = [
  { label: 'Today', icon: IconCalendarEvent, built: NOTE_FEATURES.today },
];
const SOON_BOTTOM: readonly SoonItem[] = [
  { label: 'Tags', icon: IconTags, built: NOTE_FEATURES.tags },
  { label: 'Templates', icon: IconTemplate, built: NOTE_FEATURES.templates },
];

const soonRows = (items: readonly SoonItem[], collapsed: boolean) =>
  items
    .filter((item) => !item.built)
    .map((item) => (
      <SoonRow key={item.label} label={item.label} icon={item.icon} collapsed={collapsed} />
    ));

/** A link to All notes or Trash. The active one is marked with aria-current. */
function PlaceRow({
  label,
  icon,
  place,
  active,
  collapsed,
}: {
  label: string;
  icon: Icon;
  place: 'all' | 'trash';
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      to="/notes"
      search={(previous) => ({
        ...(previous.note ? { note: previous.note } : {}),
        ...(place === 'trash' ? { folder: 'trash' } : {}),
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
          {soonRows(SOON_TOP, collapsed)}
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
            onRetry={() => {
              void folders.refetch();
            }}
          />
        )}

        <ul className="flex flex-col gap-0.5">
          {soonRows(SOON_BOTTOM, collapsed)}
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
