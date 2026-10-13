import { IconButton, Kbd } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { trapTab } from '../inbox/trap-tab';

const SHORTCUTS: readonly { keys: readonly string[]; action: string }[] = [
  { keys: ['N'], action: 'New task' },
  { keys: ['←', '→', '↑', '↓'], action: 'Move between tasks' },
  { keys: ['Space'], action: 'Complete or reopen' },
  { keys: ['Enter'], action: 'Open details' },
  { keys: ['Delete'], action: 'Delete' },
  { keys: ['Space'], action: 'Lift or drop (on the drag handle)' },
  { keys: ['←', '→', '↑', '↓'], action: 'Move a lifted task' },
  { keys: ['Esc'], action: 'Cancel a lift' },
  { keys: ['Esc'], action: 'Close' },
  { keys: ['?'], action: 'Show this help' },
];

export interface ShortcutsHelpProps {
  onClose: () => void;
}

/** A small popup listing the keyboard shortcuts of My tasks. Escape closes it. */
export function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement;
    box.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before !== document.body) before.focus();
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
      </div>
    </div>
  );
}
