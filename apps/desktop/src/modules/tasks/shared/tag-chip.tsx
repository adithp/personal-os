import type { TagRef } from '@personal-os/shared';
import { TEXT_ON_TILE } from '@personal-os/shared';
import { cx } from '@personal-os/ui';

export interface TagChipProps {
  tag: TagRef;
  className?: string;
}

/** A small rounded chip in the tag's pastel color, with dark text (docs/DESIGN.md). */
export function TagChip({ tag, className }: TagChipProps) {
  return (
    <span
      data-testid="tag-chip"
      className={cx(
        'inline-flex h-5 max-w-full items-center truncate rounded-[8px] px-2 text-small font-medium',
        className,
      )}
      style={{ backgroundColor: tag.color, color: TEXT_ON_TILE }}
    >
      {tag.name}
    </span>
  );
}

export interface TagChipsProps {
  tags: readonly TagRef[];
  /** How many chips to show before "+N". Cards use 1; the detail panel shows all. */
  max?: number;
  className?: string;
}

/** The first `max` chips and "+N" for the rest. */
export function TagChips({ tags, max = 1, className }: TagChipsProps) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const more = tags.length - shown.length;
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1', className)}>
      {shown.map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
      {more > 0 ? (
        <span className="text-small text-fg-muted" aria-label={`${String(more)} more tags`}>
          +{more}
        </span>
      ) : null}
    </span>
  );
}
