import { IconButton, Kbd } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { trapTab } from '../../inbox/trap-tab';

interface Shortcut {
  keys: readonly string[];
  action: string;
}

const GOALS: readonly Shortcut[] = [
  { keys: ['N'], action: 'Add a task to this goal' },
  { keys: ['←', '→', '↑', '↓'], action: 'Move between tasks' },
  { keys: ['Space'], action: 'Complete or reopen' },
  { keys: ['Enter'], action: 'Open details' },
  { keys: ['Delete'], action: 'Remove from goal' },
  { keys: ['Esc'], action: 'Close details, then back to Goals' },
  { keys: ['?'], action: 'Show this help' },
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

/** The keyboard shortcuts of the goal page. Escape closes. */
export function GoalShortcutsHelp({ onClose }: { onClose: () => void }) {
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
        <Group label="Goals" shortcuts={GOALS} />
      </div>
    </div>
  );
}
