import type { ModuleId } from '@personal-os/shared';
import { MODULES } from '@personal-os/shared';
import type { TablerIcon } from '@tabler/icons-react';
import { IconArrowUpRight } from '@tabler/icons-react';
import { cx } from '../lib/cx';
import { MODULE_ICONS, moduleColorVar } from '../module-icons';
import { ProgressBar } from './progress-bar';

export interface TileProps {
  module: ModuleId;
  title: string;
  value: string | number;
  unit?: string;
  /** One or two short lines at the bottom. */
  lines?: readonly [string] | readonly [string, string];
  /** Optional progress, 0–100. */
  progress?: number;
  /** Defaults to the module icon. */
  icon?: TablerIcon;
  /** Opens the module from the top-right button. */
  onOpen?: () => void;
  className?: string;
}

/** Colored dashboard tile (DESIGN.md section 6). */
export function Tile({
  module,
  title,
  value,
  unit,
  lines,
  progress,
  icon,
  onOpen,
  className,
}: TileProps) {
  const Icon = icon ?? MODULE_ICONS[module];
  const moduleName = MODULES[module].name;

  return (
    <section
      aria-label={title}
      className={cx(
        'flex flex-col gap-3 rounded-tile p-4 text-on-tile',
        'transition-transform duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none',
        className,
      )}
      style={{ backgroundColor: moduleColorVar(module) }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-tile-title font-medium">{title}</h3>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${moduleName}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-tile-action bg-tile-action focus-ring"
          >
            <IconArrowUpRight size={14} stroke={2} aria-hidden />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Icon size={22} stroke={1.75} aria-hidden />
        <span className="text-big font-semibold tabular-nums">{value}</span>
        {unit && <span className="text-body">{unit}</span>}
      </div>

      {(lines !== undefined || progress !== undefined) && (
        <div className="flex flex-col gap-1.5">
          {lines?.map((line, index) => (
            <p key={index} className="truncate text-small">
              {line}
            </p>
          ))}
          {progress !== undefined && <ProgressBar value={progress} label={`${title} progress`} />}
        </div>
      )}
    </section>
  );
}
