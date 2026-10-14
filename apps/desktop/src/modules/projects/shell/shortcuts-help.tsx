import { Kbd } from '@personal-os/ui';
import { Dialog } from '../components';

interface Shortcut {
  keys: readonly string[];
  action: string;
}

const SHORTCUTS: readonly Shortcut[] = [
  { keys: ['N'], action: 'New project (or new client on the Clients page)' },
  { keys: ['J', 'K'], action: 'Move between cards' },
  { keys: ['Enter'], action: 'Open the focused card' },
  { keys: ['Esc'], action: 'Back to the list' },
  { keys: ['?'], action: 'Show this help' },
];

/** The keyboard shortcuts of the Projects page. Escape closes. */
export function ProjectsShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width={360}>
      <dl className="flex flex-col gap-2">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.action} className="flex items-center justify-between gap-4">
            <dt className="text-body text-fg-secondary">{shortcut.action}</dt>
            <dd>
              <Kbd keys={shortcut.keys} />
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
