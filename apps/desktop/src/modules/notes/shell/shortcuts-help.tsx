import { IconButton, Kbd } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { trapTab } from '../../tasks/inbox/trap-tab';

interface Shortcut {
  keys: readonly string[];
  action: string;
}

const NOTES: readonly Shortcut[] = [
  { keys: ['N'], action: 'New note' },
  { keys: ['↑', '↓'], action: 'Move between notes' },
  { keys: ['Enter'], action: 'Open the note and start writing' },
  { keys: ['Delete'], action: 'Move to Trash' },
  { keys: ['Esc'], action: 'From the editor, back to the list' },
  { keys: ['?'], action: 'Show this help' },
];

const TRASH: readonly Shortcut[] = [
  { keys: ['Enter'], action: 'Restore' },
  { keys: ['Delete'], action: 'Delete forever' },
];

function Group({ label, shortcuts }: { label: string; shortcuts: readonly Shortcut[] }) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h3 className="text-small font-medium text-fg-muted">{label}</h3>
      <dl className="flex flex-col gap-2">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.action} className="flex items-center justify-between gap-4">
            <dt className="text-body text-fg-secondary">{shortcut.action}</dt>
            <dd>
              <Kbd keys={shortcut.keys} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The keyboard shortcuts of the Notes page. Escape closes. */
export function NotesShortcutsHelp({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement;
    box.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected && before !== document.body) {
        before.focus();
      }
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    trapTab(event, box.current);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-[340px] max-w-[90vw] flex-col gap-3 rounded-card glass-strong p-4 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-section font-semibold text-fg">Keyboard shortcuts</h2>
          <IconButton aria-label="Close" icon={<IconX size={16} aria-hidden />} onClick={onClose} />
        </div>
        <Group label="Notes" shortcuts={NOTES} />
        <Group label="In Trash" shortcuts={TRASH} />
      </div>
    </div>
  );
}
