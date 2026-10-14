import { IconButton, Kbd } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { trapTab } from '../tasks/inbox/trap-tab';

const SHORTCUTS: readonly { keys: readonly string[]; action: string }[] = [
  { keys: ['N'], action: 'New habit' },
  { keys: ['↑', '↓'], action: 'Move between habits' },
  { keys: ['Space'], action: 'Check today (or add one for a counter)' },
  { keys: ['Enter'], action: 'Open details' },
  { keys: ['E'], action: 'Edit habit' },
  { keys: ['Esc'], action: 'Close details' },
  { keys: ['?'], action: 'Show this help' },
];

/** The keyboard shortcuts of the Habits page. Focus stays inside; Escape closes. */
export function HabitsHelp({ onClose }: { onClose: () => void }) {
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

  return createPortal(
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
        aria-labelledby="habits-help-heading"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-[340px] max-w-[90vw] flex-col gap-3 rounded-card glass-strong p-4 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 id="habits-help-heading" className="text-section font-semibold text-fg">
            Keyboard shortcuts
          </h2>
          <IconButton aria-label="Close" icon={<IconX size={16} aria-hidden />} onClick={onClose} />
        </div>
        <section aria-label="Habits" className="flex flex-col gap-2">
          <h3 className="text-small font-medium text-fg-muted">Habits</h3>
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
        </section>
      </div>
    </div>,
    document.body,
  );
}
