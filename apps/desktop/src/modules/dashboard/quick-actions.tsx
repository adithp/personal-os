import type { ModuleId } from '@personal-os/shared';
import { MODULES } from '@personal-os/shared';
import { GlassCard, MODULE_ICONS, moduleColorVar } from '@personal-os/ui';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { modulePath } from '../../shell/module-paths';

interface QuickAction {
  label: string;
  module: ModuleId;
  /** Start of the "arrive in step N" note, with the right verb for the module name. */
  noteStart: string;
  /** Modules that already exist open their page instead of showing the note. */
  opens?: boolean;
}

const ACTIONS: readonly QuickAction[] = [
  { label: 'New task', module: 'tasks', noteStart: 'Tasks arrive', opens: true },
  { label: 'New note', module: 'notes', noteStart: 'Notes arrive' },
  { label: 'Log expense', module: 'money', noteStart: 'Money arrives' },
  { label: 'New event', module: 'calendar', noteStart: 'Calendar arrives' },
];

/**
 * Four shortcuts in a glass card the same size as a tile. New task opens the Tasks page (ready to
 * type). Until the other modules exist, each one says in which step it arrives (the note line
 * always keeps its space so the card never changes size).
 */
export function QuickActions() {
  const [note, setNote] = useState<string | undefined>();
  const navigate = useNavigate();

  return (
    <GlassCard
      role="region"
      aria-labelledby="quick-actions-title"
      padding="compact"
      className="flex flex-col gap-2"
    >
      <h2 id="quick-actions-title" className="text-tile-title font-medium text-fg">
        Quick actions
      </h2>
      <div className="grid flex-1 grid-cols-2 gap-2">
        {ACTIONS.map(({ label, module, noteStart, opens }) => {
          const Icon = MODULE_ICONS[module];
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (opens) {
                  void navigate({ to: modulePath(module) });
                  return;
                }
                setNote(`${noteStart} in step ${String(MODULES[module].roadmapStep)}`);
              }}
              className="flex min-h-9 items-center gap-1.5 rounded-control glass px-2 text-tile-title font-medium text-fg focus-ring transition-colors duration-150 ease-out hover:bg-input"
            >
              <span
                data-module={module}
                aria-hidden
                className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] liquid-tile text-on-tile"
                style={{ backgroundColor: moduleColorVar(module) }}
              >
                <Icon size={14} stroke={2} />
              </span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
      <p role="status" className="h-4 truncate text-small text-fg-muted">
        {note}
      </p>
    </GlassCard>
  );
}
