import { cx } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { TOAST_MS, TOAST_WITH_ACTION_MS, useToasts, type Toast } from '../store/toast-store';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((state) => state.dismiss);
  // While the mouse is over a toast or focus is inside it, its timer waits (a keyboard user needs
  // time to reach Undo)
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(
      () => {
        dismiss(toast.id);
      },
      toast.action ? TOAST_WITH_ACTION_MS : TOAST_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [toast.id, toast.action, dismiss, paused]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      onFocus={() => {
        setPaused(true);
      }}
      onBlur={() => {
        setPaused(false);
      }}
      className={cx(
        'pointer-events-auto flex items-center gap-3 rounded-control glass-strong px-4 py-2 text-body',
        toast.tone === 'error' ? 'text-danger' : 'text-fg',
      )}
    >
      <span>{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          className="rounded-[6px] px-1 font-medium text-accent focus-ring hover:underline"
          onClick={() => {
            toast.action?.onClick();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        className="-mr-1 rounded-[6px] p-0.5 text-fg-muted focus-ring hover:text-fg"
        onClick={() => {
          dismiss(toast.id);
        }}
      >
        <IconX size={14} aria-hidden />
      </button>
    </div>
  );
}

/**
 * Shows the current toasts above the dock. The container is always in the page, so screen readers
 * pick up each new toast; errors are alerts.
 */
export function ToastHost() {
  const toasts = useToasts((state) => state.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
