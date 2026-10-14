import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@personal-os/shared';
import { Button, cx, GlassCard, IconButton } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../../api/api-client';
import { trapTab } from '../tasks/inbox/trap-tab';

/** The current time in ms, refreshed every second while `active` (a running timer). */
export function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [active]);
  return now;
}

const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: 'bg-module-projects text-on-tile',
  on_hold: 'bg-input text-fg-secondary',
  done: 'bg-input text-fg-secondary',
  archived: 'bg-input text-fg-muted',
};

/** A small chip with the status of a project. Active uses the Projects pink. */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={cx(
        'inline-flex h-5 items-center rounded-chip px-2 text-small font-medium',
        STATUS_STYLE[status],
      )}
    >
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}

/** The error state of a list or page: the server's message and Try again. */
export function QueryError({
  error,
  fallback,
  onRetry,
}: {
  error: unknown;
  fallback: string;
  onRetry: () => void;
}) {
  return (
    <GlassCard role="alert" className="flex items-center justify-between gap-4">
      <p className="text-body text-fg">{error instanceof ApiError ? error.message : fallback}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </GlassCard>
  );
}

/** A quiet loading line. */
export function Loading({ text }: { text: string }) {
  return (
    <p role="status" className="px-1 text-body text-fg-muted">
      {text}
    </p>
  );
}

/** A labelled form row. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-small font-medium text-fg-muted">
          {label}
        </label>
      ) : (
        <span className="text-small font-medium text-fg-muted">{label}</span>
      )}
      {children}
    </div>
  );
}

/** A native select that looks like the inputs. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cx(
        'h-[34px] w-full rounded-control border-[0.5px] border-transparent bg-input px-3 text-body text-fg focus-ring focus-visible:border-accent',
        className,
      )}
      {...props}
    />
  );
}

/** A multi-line text box that looks like the inputs. */
export function TextArea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cx(
        'min-h-20 w-full resize-y rounded-control border-[0.5px] border-transparent bg-input px-3 py-2 text-body text-fg focus-ring focus-visible:border-accent',
        className,
      )}
      {...props}
    />
  );
}

/**
 * A modal dialog through the body (a glass panel's backdrop filter would trap position: fixed).
 * Escape closes, Tab stays inside, focus starts on the first `data-autofocus` element and returns
 * to where it was. A click outside closes only when `dirty` is false.
 */
export function Dialog({
  title,
  onClose,
  dirty = false,
  width = 440,
  children,
}: {
  title: string;
  onClose: () => void;
  dirty?: boolean;
  width?: number;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    const before = document.activeElement;
    (box.current?.querySelector<HTMLElement>('[data-autofocus]') ?? box.current)?.focus();
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
        if (event.target === event.currentTarget && !dirty) onClose();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ width }}
        className="flex max-h-[90vh] max-w-[92vw] flex-col gap-4 overflow-y-auto rounded-card glass-strong p-4 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 id={headingId} className="text-section font-semibold text-fg">
            {title}
          </h2>
          <IconButton aria-label="Close" icon={<IconX size={16} aria-hidden />} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Confirm a delete (Cancel has focus first). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={title} onClose={onCancel} width={340}>
      <p className="text-body text-fg-secondary">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" data-autofocus onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

/** A 5 px progress bar in the project's own color (the shared bar has no Projects tone). */
export function ProjectBar({
  percent,
  label,
  valueText,
  color,
}: {
  percent: number;
  label: string;
  valueText: string;
  color: string;
}) {
  const value = Math.min(100, Math.max(0, percent));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-valuetext={valueText}
      className="h-[5px] w-full overflow-hidden rounded-full bg-progress-track"
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${String(value)}%`, backgroundColor: color }}
      />
    </div>
  );
}
