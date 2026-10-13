import {
  TASK_PRIORITY_LABELS,
  type Tag,
  type TaskPriority,
  type TaskStatus,
} from '@personal-os/shared';
import {
  hasActiveFilters,
  type DueFilter,
  type GroupKey,
  type SortKey,
  type TaskFilters,
} from '../filters';
import { useManageTags } from '../manage-tags/manage-tags-store';
import { Menu, MenuAction, MenuGroup, MenuItem, MenuSeparator } from './menu';

const SORT_LABELS: Record<SortKey, string> = {
  manual: 'Manual',
  due: 'Due date',
  priority: 'Priority',
  created: 'Created',
  title: 'Title',
};

const GROUP_LABELS: Record<GroupKey, string> = {
  due: 'Due',
  none: 'None',
  tag: 'Tag',
  priority: 'Priority',
};

const STATUS_OPTIONS: readonly { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS: readonly TaskPriority[] = [1, 2, 3, 4];

const DUE_OPTIONS: readonly { value: DueFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'none', label: 'No date' },
];

const toggle = <T,>(list: readonly T[] | undefined, value: T): T[] | undefined => {
  const current = list ?? [];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  return next.length > 0 ? next : undefined;
};

/** Number of filters that are on, for the quiet count on the Filter button. */
function activeFilterCount(filters: TaskFilters): number {
  if (!hasActiveFilters(filters)) return 0;
  return (
    (filters.status?.length ?? 0) +
    (filters.priority?.length ?? 0) +
    (filters.tagIds?.length ?? 0) +
    (filters.due && filters.due !== 'any' ? 1 : 0) +
    (filters.archived ? 1 : 0)
  );
}

export interface FilterMenuProps {
  filters: TaskFilters;
  tags: readonly Tag[];
  onChange: (filters: TaskFilters) => void;
}

/** Filter: status, priority, tag, due range, and archived. Stays open while you pick. */
export function FilterMenu({ filters, tags, onChange }: FilterMenuProps) {
  const count = activeFilterCount(filters);
  const openManageTags = useManageTags((state) => state.openManageTags);
  return (
    <Menu label="Filter" detail={count > 0 ? String(count) : undefined}>
      <MenuGroup label="Status">
        {STATUS_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            kind="checkbox"
            checked={filters.status?.includes(option.value) ?? false}
            onSelect={() => {
              onChange({ ...filters, status: toggle(filters.status, option.value) });
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </MenuGroup>
      <MenuGroup label="Priority">
        {PRIORITY_OPTIONS.map((priority) => (
          <MenuItem
            key={priority}
            kind="checkbox"
            checked={filters.priority?.includes(priority) ?? false}
            onSelect={() => {
              onChange({ ...filters, priority: toggle(filters.priority, priority) });
            }}
          >
            {TASK_PRIORITY_LABELS[priority]}
          </MenuItem>
        ))}
      </MenuGroup>
      <MenuGroup label="Tag">
        {tags.length === 0 ? (
          <p className="px-2 py-1 text-small text-fg-muted">No tags yet</p>
        ) : (
          tags.map((tag) => (
            <MenuItem
              key={tag.id}
              kind="checkbox"
              checked={filters.tagIds?.includes(tag.id) ?? false}
              onSelect={() => {
                onChange({ ...filters, tagIds: toggle(filters.tagIds, tag.id) });
              }}
            >
              {tag.name}
            </MenuItem>
          ))
        )}
        <MenuSeparator />
        <MenuAction onSelect={openManageTags}>Manage tags…</MenuAction>
      </MenuGroup>
      <MenuGroup label="Due">
        {DUE_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            kind="radio"
            checked={(filters.due ?? 'any') === option.value}
            onSelect={() => {
              onChange({ ...filters, due: option.value === 'any' ? undefined : option.value });
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </MenuGroup>
      <MenuGroup label="Archive">
        <MenuItem
          kind="checkbox"
          checked={filters.archived === true}
          onSelect={() => {
            onChange({ ...filters, archived: filters.archived ? undefined : true });
          }}
        >
          Archived
        </MenuItem>
      </MenuGroup>
    </Menu>
  );
}

export interface SortMenuProps {
  value: SortKey;
  onChange: (value: SortKey) => void;
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  return (
    <Menu label="Sort" detail={SORT_LABELS[value]}>
      {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
        <MenuItem
          key={key}
          kind="radio"
          checked={value === key}
          closeOnSelect
          onSelect={() => {
            onChange(key);
          }}
        >
          {SORT_LABELS[key]}
        </MenuItem>
      ))}
    </Menu>
  );
}

export interface GroupMenuProps {
  value: GroupKey;
  onChange: (value: GroupKey) => void;
}

export function GroupMenu({ value, onChange }: GroupMenuProps) {
  return (
    <Menu label="Group" detail={GROUP_LABELS[value]}>
      {(Object.keys(GROUP_LABELS) as GroupKey[]).map((key) => (
        <MenuItem
          key={key}
          kind="radio"
          checked={value === key}
          closeOnSelect
          onSelect={() => {
            onChange(key);
          }}
        >
          {GROUP_LABELS[key]}
        </MenuItem>
      ))}
    </Menu>
  );
}
