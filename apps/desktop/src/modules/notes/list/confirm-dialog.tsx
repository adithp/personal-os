import { Button } from '@personal-os/ui';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { trapTab } from '../../tasks/inbox/trap-tab';

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "Are you sure?" for something that cannot be undone. Focus starts on Cancel; Escape cancels.
 * Rendered through the body: the glass panel around the list has a backdrop filter, which would
 * turn position: fixed into "fixed inside the panel".
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement;
    cancel.current?.focus();
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
      onCancel();
      return;
    }
    trapTab(event, box.current);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-[340px] max-w-[90vw] flex-col gap-3 rounded-card glass-strong p-4 outline-none"
      >
        <h2 className="text-section font-semibold text-fg">{title}</h2>
        <p className="text-body text-fg-secondary">{message}</p>
        <div className="flex justify-end gap-2">
          <Button ref={cancel} variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
