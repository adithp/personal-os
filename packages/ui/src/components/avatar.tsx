import type { ModuleId } from '@personal-os/shared';
import { cx } from '../lib/cx';
import { MODULE_ICONS, moduleColorVar } from '../module-icons';

export interface ModuleAvatarProps {
  module: ModuleId;
  className?: string;
}

/** 26 px round avatar in the module color with the module icon. */
export function ModuleAvatar({ module, className }: ModuleAvatarProps) {
  const Icon = MODULE_ICONS[module];
  return (
    <span
      data-module={module}
      className={cx(
        'inline-flex size-[26px] shrink-0 items-center justify-center rounded-full text-on-tile',
        className,
      )}
      style={{ backgroundColor: moduleColorVar(module) }}
      aria-hidden
    >
      <Icon size={14} stroke={2} />
    </span>
  );
}
