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
import { modulePath } from '../shell/module-paths';
import { usePalette } from '../store/palette-store';
import { useSettings } from '../store/settings-store';
import { buildCommands, scoreCommand, type Command, type CommandGroup } from './commands';

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

/**
 * Ctrl K opens this. Type to filter, arrow keys to move, Enter to run, Esc to close.
 * It only runs commands for now; searching your data comes in later steps.
 */
export function CommandPalette() {
  const open = usePalette((state) => state.open);
  const setOpen = usePalette((state) => state.setOpen);
  const query = usePalette((state) => state.query);
  const setQuery = usePalette((state) => state.setQuery);
  const navigate = useNavigate();
  const { theme, dockAutoHide, update } = useSettings();

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

  const run = (command: Command) => {
    setOpen(false);
    command.run();
  };

  return (
    <Cmdk.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      filter={(value, search, keywords) => scoreCommand(value, keywords ?? [], search)}
      overlayClassName="fixed inset-0 z-40 bg-black/35"
      contentClassName="fixed top-[14vh] left-1/2 z-50 w-[560px] max-w-[calc(100vw-48px)] -translate-x-1/2 overflow-hidden rounded-card glass-strong"
    >
      <div className="flex items-center gap-3 border-b-[0.5px] border-glass-border px-4">
        <IconSearch size={18} className="shrink-0 text-fg-muted" aria-hidden />
        <Cmdk.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Type a command…"
          className="h-12 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
        />
        <Kbd keys={['Esc']} />
      </div>

      <Cmdk.List className="max-h-[360px] overflow-y-auto p-2">
        <Cmdk.Empty className="px-3 py-8 text-center text-body text-fg-muted">
          No commands found.
        </Cmdk.Empty>

        {GROUP_ORDER.map((group) => (
          <Cmdk.Group
            key={group}
            heading={group}
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-small [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted"
          >
            {commands
              .filter((command) => command.group === group)
              .map((command) => (
                <Cmdk.Item
                  key={command.id}
                  value={command.title}
                  keywords={command.keywords}
                  onSelect={() => {
                    run(command);
                  }}
                  className="flex h-9 cursor-pointer items-center gap-3 rounded-control px-3 text-body text-fg data-[selected=true]:bg-input"
                >
                  <CommandIcon command={command} />
                  <span className="flex-1 truncate">{command.title}</span>
                  {command.hint && <span className="text-small text-fg-muted">{command.hint}</span>}
                  {command.shortcut && <Kbd keys={command.shortcut} />}
                </Cmdk.Item>
              ))}
          </Cmdk.Group>
        ))}
      </Cmdk.List>

      <div className="border-t-[0.5px] border-glass-border px-4 py-2 text-small text-fg-muted">
        ↑ ↓ to move · Enter to run · Esc to close
      </div>
    </Cmdk.Dialog>
  );
}
