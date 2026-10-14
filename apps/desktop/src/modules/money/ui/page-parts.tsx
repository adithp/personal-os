import { Button, GlassCard, IconButton } from '@personal-os/ui';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { ApiError } from '../../../api/api-client';
import { monthLabel } from '../money-format';

/** Title, a muted line, and the page's buttons on the right. */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="text-page font-semibold text-fg">{title}</h1>
        <p className="min-h-[15px] text-small text-fg-muted">{subtitle ?? ' '}</p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/** Previous and next month buttons around the month name ([ and ] do the same). */
export function MonthSwitcher({ month, onStep }: { month: string; onStep: (n: number) => void }) {
  return (
    <div role="group" aria-label="Month" className="flex items-center gap-1">
      <IconButton
        aria-label="Previous month"
        icon={<IconChevronLeft size={16} stroke={1.5} aria-hidden />}
        onClick={() => {
          onStep(-1);
        }}
      />
      <span aria-live="polite" className="min-w-[110px] text-center text-body font-medium text-fg">
        {monthLabel(month)}
      </span>
      <IconButton
        aria-label="Next month"
        icon={<IconChevronRight size={16} stroke={1.5} aria-hidden />}
        onClick={() => {
          onStep(1);
        }}
      />
    </div>
  );
}

/** Skeleton while a page loads; the sentence is for screen readers. */
export function LoadingBlock({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      {Array.from({ length: rows }, (_, index) => (
        <GlassCard key={index} className="flex flex-col gap-2" aria-hidden>
          <span className="h-3.5 w-32 rounded-chip bg-input" />
          <span className="h-2.5 w-52 rounded-chip bg-input" />
        </GlassCard>
      ))}
    </div>
  );
}

/** The server's message (or ours) and a Try again button. */
export function ErrorBlock({
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

/** Nothing here yet: one sentence and the way to start. */
export function EmptyBlock({
  title,
  text,
  actionLabel,
  onAction,
}: {
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <GlassCard className="mx-auto mt-6 flex max-w-[420px] flex-col items-center gap-2 py-8 text-center">
      <h2 className="text-section font-semibold text-fg">{title}</h2>
      <p className="text-body text-fg-secondary">{text}</p>
      {actionLabel && onAction ? (
        <Button className="mt-2" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </GlassCard>
  );
}
