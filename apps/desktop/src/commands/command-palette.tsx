import { SEARCH_MIN_CHARS, type SearchHit, type SearchType } from '@personal-os/shared';
import { Kbd, MODULE_ICONS, moduleColorVar } from '@personal-os/ui';
import type { TablerIcon } from '@tabler/icons-react';
import {
  IconDeviceDesktop,
  IconLayoutBottombar,
  IconMoon,
  IconSearch,
  IconSun,
} from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { Command as Cmdk } from 'cmdk';
import { useEffect, useState } from 'react';
import { ApiError } from '../api/api-client';
import { modulePath } from '../shell/module-paths';
import { usePalette } from '../store/palette-store';
import { useRecentItems, type RecentItem } from '../store/recent-items-store';
import { useSettings } from '../store/settings-store';
import { buildCommands, scoreCommand, type Command, type CommandGroup } from './commands';
import { highlight } from './highlight';
import { SEARCH_KINDS } from './search-kinds';
import { useSearch } from './search-queries';

const GROUP_ORDER: readonly CommandGroup[] = ['Go to', 'Appearance', 'Dock'];

const PLAIN_ICONS: Record<string, TablerIcon> = {
  'theme-dark': IconMoon,
  'theme-light': IconSun,
  'theme-system': IconDeviceDesktop,
  'dock-auto-hide': IconLayoutBottombar,
};

function CommandIcon({ command }: { command: Command }) {
  if (command.module) {
    const Icon = MODULE_ICONS[command.module];
    return (
      <span
        data-module={command.module}
        aria-hidden
        className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] liquid-tile text-on-tile"
        style={{ backgroundColor: moduleColorVar(command.module) }}
      >
        <Icon size={14} stroke={2} />
      </span>
    );
  }
  const Icon = PLAIN_ICONS[command.id] ?? IconSearch;
  return (
    <span
      aria-hidden
      className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] bg-input text-fg-secondary"
    >
      <Icon size={14} stroke={2} />
    </span>
  );
}

const ROW =
  'flex cursor-pointer items-center gap-3 rounded-control px-3 text-body text-fg data-[selected=true]:bg-input';
const GROUP_CLASS =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-small [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted';
/** "Searching…" shows after this long without an answer and without older results on screen. */
const SEARCHING_AFTER_MS = 300;

function Highlighted({ text, query }: { text: string; query: string }) {
  return highlight(text, query).map((part, index) =>
    part.match ? (
      <mark key={index} className="search-mark">
        {part.text}
      </mark>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}

/** The small square at the start of a result row: module color, or a neutral square with a dot. */
function ResultIcon({ type, color }: { type: SearchType; color?: string }) {
  const kind = SEARCH_KINDS[type];
  if (color) {
    return (
      <span
        aria-hidden
        className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] bg-input"
      >
        <span className="size-[10px] rounded-full" style={{ backgroundColor: color }} />
      </span>
    );
  }
  const Icon = kind.Icon;
  return (
    <span
      data-module={kind.module}
      aria-hidden
      className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] liquid-tile text-on-tile"
      style={{ backgroundColor: moduleColorVar(kind.module) }}
    >
      <Icon size={14} stroke={2} />
    </span>
  );
}

/** True once `active` has been true for `ms`. */
function useAfter(active: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      setLate(true);
    }, ms);
    return () => {
      clearTimeout(timer);
      setLate(false);
    };
  }, [active, ms]);
  return active && late;
}

function errorText(error: Error): string {
  return error instanceof ApiError && error.code === 'schema_behind'
    ? error.message
    : 'Search is not available right now.';
}

/**
 * Ctrl K opens this. Type to filter commands and search tasks and tags, arrow keys to move,
 * Enter to open or run, Esc to close. Commands come first (they filter at once), then the groups
 * from the server, so the selection does not jump when results arrive (search.md D14).
 */
export function CommandPalette() {
  const open = usePalette((state) => state.open);
  const setOpen = usePalette((state) => state.setOpen);
  const query = usePalette((state) => state.query);
  const setQuery = usePalette((state) => state.setQuery);
  const navigate = useNavigate();
  const { theme, dockAutoHide, update } = useSettings();
  const recent = useRecentItems((state) => state.items);
  const addRecent = useRecentItems((state) => state.add);

  const typed = query.trim();
  const search = useSearch(open ? query : '');
  const slow = useAfter(search.waiting && !search.result, SEARCHING_AFTER_MS);

  const commands = buildCommands({
    openModule: (module) => {
      void navigate({ to: modulePath(module) });
    },
    theme,
    setTheme: (value) => {
      update({ theme: value });
    },
    dockAutoHide,
    setDockAutoHide: (value) => {
      update({ dockAutoHide: value });
    },
  });

  const matching = commands
    .map((command) => ({ command, score: scoreCommand(command.title, command.keywords, typed) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);

  const run = (command: Command) => {
    setOpen(false);
    command.run();
  };

  const openItem = (item: RecentItem) => {
    setOpen(false);
    addRecent(item);
    SEARCH_KINDS[item.type].open(item, navigate);
  };
  const openHit = (hit: SearchHit) => {
    openItem({
      type: hit.type,
      id: hit.id,
      title: hit.title,
      ...(hit.type === 'tag' ? { color: hit.color } : { archived: hit.archived }),
    });
  };

  const groups = typed.length >= SEARCH_MIN_CHARS ? (search.result?.groups ?? []) : [];
  const hitCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const showRecent = typed === '' && recent.length > 0;
  const answered = typed.length < SEARCH_MIN_CHARS || (!search.waiting && !search.error);
  const nothing = matching.length === 0 && hitCount === 0 && !showRecent && answered;
  const now = new Date();

  const announcement = (() => {
    if (typed === '') return '';
    if (search.error) return errorText(search.error);
    if (!answered) return '';
    const total = matching.length + hitCount;
    return total === 0 ? 'No results' : `${String(total)} ${total === 1 ? 'result' : 'results'}`;
  })();

  return (
    <Cmdk.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-40 bg-black/35"
      contentClassName="fixed top-[14vh] left-1/2 z-50 w-[560px] max-w-[calc(100vw-48px)] -translate-x-1/2 overflow-hidden rounded-card glass-strong"
    >
      <div className="flex items-center gap-3 border-b-[0.5px] border-glass-border px-4">
        <IconSearch size={18} className="shrink-0 text-fg-muted" aria-hidden />
        <Cmdk.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search or type a command…"
          className="h-12 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
        />
        <Kbd keys={['Esc']} />
      </div>

      <Cmdk.List className="max-h-[360px] overflow-y-auto p-2">
        {showRecent && (
          <Cmdk.Group heading="Recent" className={GROUP_CLASS}>
            {recent.map((item) => (
              <Cmdk.Item
                key={`recent:${item.type}:${item.id}`}
                value={`recent:${item.type}:${item.id}`}
                onSelect={() => {
                  openItem(item);
                }}
                className={`${ROW} h-9`}
              >
                <ResultIcon type={item.type} color={item.color} />
                <span className="flex-1 truncate">{item.title}</span>
              </Cmdk.Item>
            ))}
          </Cmdk.Group>
        )}

        {GROUP_ORDER.map((group) => {
          const inGroup = matching.filter((command) => command.group === group);
          if (inGroup.length === 0) return null;
          return (
            <Cmdk.Group key={group} heading={group} className={GROUP_CLASS}>
              {inGroup.map((command) => (
                <Cmdk.Item
                  key={command.id}
                  value={`cmd:${command.id}`}
                  onSelect={() => {
                    run(command);
                  }}
                  className={`${ROW} h-9`}
                >
                  <CommandIcon command={command} />
                  <span className="flex-1 truncate">{command.title}</span>
                  {command.hint && <span className="text-small text-fg-muted">{command.hint}</span>}
                  {command.shortcut && <Kbd keys={command.shortcut} />}
                </Cmdk.Item>
              ))}
            </Cmdk.Group>
          );
        })}

        <div className={search.stale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {groups.map((group) => {
            const kind = SEARCH_KINDS[group.type];
            return (
              <Cmdk.Group key={group.type} heading={kind.heading} className={GROUP_CLASS}>
                {group.items.map((hit) => {
                  const meta = kind.meta(hit, now);
                  return (
                    <Cmdk.Item
                      key={`${hit.type}:${hit.id}`}
                      value={`${hit.type}:${hit.id}`}
                      onSelect={() => {
                        openHit(hit);
                      }}
                      className={`${ROW} ${hit.snippet ? 'h-12' : 'h-9'}`}
                    >
                      <ResultIcon type={hit.type} color={kind.dotColor?.(hit)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          <Highlighted text={hit.title} query={typed} />
                        </span>
                        {hit.snippet && (
                          <span className="block truncate text-small text-fg-muted">
                            <Highlighted text={hit.snippet} query={typed} />
                          </span>
                        )}
                      </span>
                      {meta && (
                        <span
                          className={`shrink-0 text-small ${meta.danger ? 'text-danger' : 'text-fg-muted'}`}
                        >
                          {meta.text}
                        </span>
                      )}
                    </Cmdk.Item>
                  );
                })}
              </Cmdk.Group>
            );
          })}
        </div>

        {search.error && (
          <p className="px-3 py-2 text-body text-danger">{errorText(search.error)}</p>
        )}
        {slow && <p className="px-3 py-2 text-body text-fg-muted">Searching…</p>}
        {nothing && (
          <div className="px-3 py-8 text-center">
            <p className="text-body text-fg-muted">Nothing found for &ldquo;{typed}&rdquo;.</p>
            <p className="mt-1 text-small text-fg-muted">
              Search finds tasks and tags by the start of their words.
            </p>
          </div>
        )}
      </Cmdk.List>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      <div className="border-t-[0.5px] border-glass-border px-4 py-2 text-small text-fg-muted">
        ↑ ↓ to move · Enter to open · Esc to close
      </div>
    </Cmdk.Dialog>
  );
}
