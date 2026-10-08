import {
  TAG_NAME_MAX,
  TAG_PALETTE,
  TEXT_ON_TILE,
  createTagInput,
  type Tag,
  type TagRef,
} from '@personal-os/shared';
import { Input } from '@personal-os/ui';
import { IconCheck, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { TagChip } from '../shared/tag-chip';
import { useTagActions, useTags } from '../tags-queries';
import { Popover, PopoverItem } from './popover';

export interface TagSectionProps {
  tags: readonly TagRef[];
  /** Replaces the task's set of tags. */
  onChange: (tagIds: string[]) => void;
}

/** The recolor menu of one chip: ten swatches and "Remove from task". */
function ChipMenu({ tag, onRemove }: { tag: TagRef; onRemove: () => void }) {
  const { update } = useTagActions();
  return (
    <Popover
      label={`Tag ${tag.name}`}
      popupLabel={`Tag ${tag.name} options`}
      trigger={<TagChip tag={tag} />}
    >
      {(close) => (
        <>
          <p aria-hidden className="px-2 pt-1 text-small font-medium text-fg-muted">
            Color
          </p>
          <div role="group" aria-label="Color" className="grid grid-cols-5 gap-1 p-1">
            {TAG_PALETTE.map((color, index) => (
              <PopoverItem
                key={color}
                role="menuitemradio"
                checked={color.toLowerCase() === tag.color.toLowerCase()}
                aria-label={`Color ${String(index + 1)}`}
                className="size-7 justify-center px-0"
                onSelect={() => {
                  if (color.toLowerCase() !== tag.color.toLowerCase()) {
                    update.mutate({ id: tag.id, color });
                  }
                  close();
                }}
              >
                <span
                  className="flex size-6 items-center justify-center rounded-full"
                  style={{ backgroundColor: color, color: TEXT_ON_TILE }}
                >
                  {color.toLowerCase() === tag.color.toLowerCase() ? (
                    <IconCheck size={12} aria-hidden />
                  ) : null}
                </span>
              </PopoverItem>
            ))}
          </div>
          <PopoverItem
            role="menuitem"
            onSelect={() => {
              onRemove();
              close();
            }}
          >
            Remove from task
          </PopoverItem>
        </>
      )}
    </Popover>
  );
}

/** The pick-or-create menu: the user's tags with checks, and a box that creates a new tag. */
function AddTagMenu({ tags, onChange }: TagSectionProps) {
  const { data: allTags = [] } = useTags();
  const { create } = useTagActions();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ids = tags.map((tag) => tag.id);

  const toggle = (tag: Tag) => {
    onChange(ids.includes(tag.id) ? ids.filter((id) => id !== tag.id) : [...ids, tag.id]);
  };

  const add = async () => {
    const parsed = createTagInput.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'That name does not work.');
      return;
    }
    setError(null);
    try {
      const { item } = await create.mutateAsync({ name: parsed.data.name });
      setName('');
      if (!ids.includes(item.id)) onChange([...ids, item.id]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not create the tag.');
    }
  };

  return (
    <Popover
      label="Add tag"
      popupLabel="Tags"
      triggerClassName="inline-flex h-5 items-center gap-1 px-2 text-small text-fg-secondary hover:text-fg"
      trigger={
        <>
          <IconPlus size={12} aria-hidden />
          <span aria-hidden>Add tag</span>
        </>
      }
    >
      {() => (
        <>
          {allTags.length === 0 ? (
            <p className="px-2 py-1 text-small text-fg-muted">No tags yet.</p>
          ) : null}
          {allTags.map((tag) => {
            const on = ids.includes(tag.id);
            return (
              <PopoverItem
                key={tag.id}
                role="menuitemcheckbox"
                checked={on}
                onSelect={() => {
                  toggle(tag);
                }}
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {on ? <IconCheck size={14} aria-hidden /> : null}
                </span>
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="truncate">{tag.name}</span>
              </PopoverItem>
            );
          })}
          <div className="flex flex-col gap-1 px-1 pt-1">
            <Input
              aria-label="New tag"
              placeholder="New tag"
              value={name}
              maxLength={TAG_NAME_MAX}
              aria-invalid={error !== null}
              aria-describedby={error ? 'new-tag-error' : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void add();
                }
              }}
            />
            {error ? (
              <p id="new-tag-error" role="alert" className="text-small text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </>
      )}
    </Popover>
  );
}

/** All of the task's tags as chips (each with its own menu), and the Add tag control. */
export function TagSection({ tags, onChange }: TagSectionProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <ChipMenu
          key={tag.id}
          tag={tag}
          onRemove={() => {
            onChange(tags.filter((other) => other.id !== tag.id).map((other) => other.id));
          }}
        />
      ))}
      <AddTagMenu tags={tags} onChange={onChange} />
    </div>
  );
}
