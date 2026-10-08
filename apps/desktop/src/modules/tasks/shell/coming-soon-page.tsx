import { GlassCard } from '@personal-os/ui';

/** Page for a part of Tasks that is built in a later feature (Inbox, Reporting, Goals). */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <GlassCard className="flex max-w-sm flex-col items-center gap-2 py-8 text-center">
        <h1 className="text-page font-semibold text-fg">{title}</h1>
        <p className="text-body text-fg-secondary">Coming soon</p>
      </GlassCard>
    </div>
  );
}
