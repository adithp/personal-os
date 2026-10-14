import { IconButton, Kbd } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { trapTab } from '../../tasks/inbox/trap-tab';

const SHORTCUTS: readonly { keys: readonly string[]; action: string }[] = [
  { keys: ['N'], action: 'Add on this page (transaction, wallet, goal, ...)' },
  { keys: ['['], action: 'Previous month' },
  { keys: [']'], action: 'Next month' },
  { keys: ['Esc'], action: 'Close a dialog' },
  { keys: ['?'], action: 'Show this help' },
];

/**
 * The keyboard shortcuts of the Money page. Escape closes. Rendered through the body, like the
 * other dialogs: a backdrop filter on a parent would trap position: fixed.
 */
export function MoneyShortcutsHelp({ onClose }: { onClose: () => void }) {
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
    </div>,
    document.body,
  );
}
