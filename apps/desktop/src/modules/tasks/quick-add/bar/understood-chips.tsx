import { IconCalendar, IconFlag, IconHash, IconRepeat, IconX } from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { partKey, type QuickAddPart, type QuickAddPartKind } from '../parse';

const ICONS: Record<QuickAddPartKind, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  date: IconCalendar,
  priority: IconFlag,
  tag: IconHash,
  repeat: IconRepeat,
};

export interface UnderstoodChipsProps {
  parts: readonly QuickAddPart[];
  /** Called with the part the user switched off. */
  onIgnore: (part: QuickAddPart) => void;
}

/** A quiet row of chips under the bar showing what was understood from the text. */
export function UnderstoodChips({ parts, onIgnore }: UnderstoodChipsProps) {
  return (
    <div
      role="group"
      aria-label="Understood from your text"
      aria-live="polite"
      className="flex flex-wrap items-center gap-1.5 px-2 empty:hidden"
    >
      {parts.map((part) => {
        const Icon = ICONS[part.kind];
        return (
          <span
            key={partKey(part)}
            className="inline-flex h-5 max-w-full items-center gap-1 rounded-[8px] bg-input pr-0.5 pl-2 text-small font-medium text-fg-secondary"
          >
            <Icon size={12} aria-hidden />
            <span className="truncate">{part.label}</span>
            <button
              type="button"
              aria-label={`Ignore ${part.text}`}
              className="flex size-4 shrink-0 items-center justify-center rounded-[6px] text-fg-muted focus-ring hover:text-fg"
              onClick={() => {
                onIgnore(part);
              }}
            >
              <IconX size={10} stroke={2} aria-hidden />
            </button>
          </span>
        );
      })}
    </div>
  );
}
