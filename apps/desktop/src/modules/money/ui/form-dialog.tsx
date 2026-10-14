import { Button, IconButton } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { trapTab } from '../../tasks/inbox/trap-tab';

export interface FormDialogProps {
  title: string;
  /** Left out for a dialog with no single save (it then has one Done button). */
  submitLabel?: string;
  onSubmit?: () => void;
  onClose: () => void;
  /** True while the write is running: the save button waits. */
  busy?: boolean;
  /** A problem with the input, shown above the buttons. */
  error?: string | null;
  /** Extra buttons on the left of the footer (for example Delete). */
  footerStart?: ReactNode;
  children: ReactNode;
}

const FIRST_FIELD =
  'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)';

/**
 * A form in a glass dialog. Focus starts on the first field, Tab stays inside, Escape closes.
 * Rendered through the body: the glass panels around the pages have a backdrop filter, which
 * would turn position: fixed into "fixed inside the panel".
 */
export function FormDialog({
  title,
  submitLabel,
  onSubmit,
  onClose,
  busy = false,
  error,
  footerStart,
  children,
}: FormDialogProps) {
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const before = document.activeElement;
    (box.current?.querySelector<HTMLElement>(FIRST_FIELD) ?? box.current)?.focus();
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) onSubmit?.();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        noValidate
        onKeyDown={onKeyDown}
        onSubmit={submit}
        className="flex max-h-[90vh] w-[400px] max-w-[92vw] flex-col gap-3 overflow-y-auto rounded-card glass-strong p-4 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-section font-semibold text-fg">{title}</h2>
          <IconButton
            aria-label="Close"
            icon={<IconX size={16} aria-hidden />}
            onClick={onClose}
          />
        </div>
        {children}
        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <div>{footerStart}</div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {submitLabel ? 'Cancel' : 'Done'}
            </Button>
            {submitLabel ? (
              <Button type="submit" disabled={busy}>
                {submitLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}
