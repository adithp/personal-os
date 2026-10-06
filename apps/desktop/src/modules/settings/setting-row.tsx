import { GlassCard } from '@personal-os/ui';
import type { ReactNode } from 'react';
import { useId } from 'react';

export interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

/** One glass card with a section title and a list of setting rows. */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <GlassCard className="flex flex-col gap-1 p-4">
        <h2 id={headingId} className="pb-2 text-section font-semibold text-fg">
          {title}
        </h2>
        <div className="flex flex-col divide-y-[0.5px] divide-glass-border">{children}</div>
      </GlassCard>
    </section>
  );
}

export interface SettingRowProps {
  label: string;
  description?: string;
  /** Receives the id of the visible label so the control can name itself with aria-labelledby. */
  children: (labelId: string) => ReactNode;
}

/** Label and description on the left, the control on the right. */
export function SettingRow({ label, description, children }: SettingRowProps) {
  const labelId = useId();
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p id={labelId} className="text-card font-medium text-fg">
          {label}
        </p>
        {description && <p className="text-small text-fg-muted">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children(labelId)}</div>
    </div>
  );
}
