import type { ReactNode } from 'react';

/** A short, quiet message inside the note list (nothing here yet, nothing matches). */
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
      <h3 className="text-body font-medium text-fg">{title}</h3>
      <p className="text-small text-fg-muted">{text}</p>
      {action}
    </div>
  );
}
