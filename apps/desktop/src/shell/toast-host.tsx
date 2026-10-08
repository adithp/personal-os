import { cx } from '@personal-os/ui';
import { IconX } from '@tabler/icons-react';
import { useEffect } from 'react';
import { TOAST_MS, TOAST_WITH_ACTION_MS, useToasts, type Toast } from '../store/toast-store';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((state) => state.dismiss);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        dismiss(toast.id);
      },
      toast.action ? TOAST_WITH_ACTION_MS : TOAST_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [toast.id, toast.action, dismiss]);

  return (
    <div
      role="status"
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

/** Shows the current toasts above the dock. */
export function ToastHost() {
  const toasts = useToasts((state) => state.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
