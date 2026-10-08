import type { ModuleId } from '@personal-os/shared';
import { MODULES } from '@personal-os/shared';
import { GlassCard, MODULE_ICONS, moduleColorVar } from '@personal-os/ui';

export interface ModulePlaceholderProps {
  module: ModuleId;
}

/** Temporary page for a module that is built in a later step. */
export function ModulePlaceholder({ module }: ModulePlaceholderProps) {
  const { name, roadmapStep } = MODULES[module];
  const Icon = MODULE_ICONS[module];

  return (
    <div className="flex h-full items-center justify-center p-8">
      <GlassCard className="flex w-full max-w-sm flex-col items-center gap-4 py-10 text-center">
        <span
          data-module={module}
          className="flex size-16 items-center justify-center rounded-tile text-on-tile"
          style={{ backgroundColor: moduleColorVar(module) }}
        >
          <Icon size={32} stroke={1.75} aria-hidden />
        </span>
        <h1 className="text-page font-semibold text-fg">{name}</h1>
        <p className="text-body text-fg-secondary">Coming in step {roadmapStep}</p>
      </GlassCard>
    </div>
  );
}
