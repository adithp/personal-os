import type { ModuleId } from '@personal-os/shared';
import { MODULES } from '@personal-os/shared';
import { MODULE_ICONS, moduleColorVar } from '@personal-os/ui';
import { useState } from 'react';

interface QuickAction {
  label: string;
  module: ModuleId;
  /** Start of the "arrive in step N" note, with the right verb for the module name. */
  noteStart: string;
}

const ACTIONS: readonly QuickAction[] = [
  { label: 'New task', module: 'tasks', noteStart: 'Tasks arrive' },
  { label: 'New note', module: 'notes', noteStart: 'Notes arrive' },
  { label: 'Log expense', module: 'money', noteStart: 'Money arrives' },
  { label: 'New event', module: 'calendar', noteStart: 'Calendar arrives' },
];

/** Four shortcuts. Until the modules exist, each says in which step it arrives. */
export function QuickActions() {
  const [note, setNote] = useState<string | undefined>();

  return (
    <section aria-labelledby="quick-actions-title" className="flex flex-col gap-2">
      <h2 id="quick-actions-title" className="text-card font-medium text-fg">
        Quick actions
      </h2>
      <div className="grid grid-cols-4 gap-3">
        {ACTIONS.map(({ label, module, noteStart }) => {
          const Icon = MODULE_ICONS[module];
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setNote(`${noteStart} in step ${String(MODULES[module].roadmapStep)}`);
              }}
              className="flex h-10 items-center gap-2 rounded-control glass px-3 text-body font-medium text-fg focus-ring transition-colors duration-150 ease-out hover:bg-input"
            >
              <span
                data-module={module}
                aria-hidden
                className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] text-on-tile"
                style={{ backgroundColor: moduleColorVar(module) }}
              >
                <Icon size={14} stroke={2} />
              </span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
      {note && (
        <p role="status" className="text-small text-fg-muted">
          {note}
        </p>
      )}
    </section>
  );
}
