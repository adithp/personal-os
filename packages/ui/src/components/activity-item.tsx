import type { ModuleId } from '@personal-os/shared';
import { cx } from '../lib/cx';
import { ModuleAvatar } from './avatar';

export interface ActivityItemProps {
  module: ModuleId;
  title: string;
  description: string;
  className?: string;
}

/** Activity feed entry: glass card, module avatar, bold title, one-line description. */
export function ActivityItem({ module, title, description, className }: ActivityItemProps) {
  return (
    <article className={cx('flex items-start gap-2.5 rounded-card glass p-3', className)}>
      <ModuleAvatar module={module} />
      <div className="min-w-0">
        <h4 className="truncate text-card font-semibold text-fg">{title}</h4>
        <p className="truncate text-small text-fg-secondary">{description}</p>
      </div>
    </article>
  );
}
