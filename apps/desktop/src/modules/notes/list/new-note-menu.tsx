import type { Note } from '@personal-os/shared';
import { IconButton, Tooltip } from '@personal-os/ui';
import { IconPlus } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { AnchoredMenu, MenuItem } from '../../tasks/favorites/anchored-menu';
import { useCreateNote } from '../notes-queries';
import { useNoteTemplates } from '../templates-queries';

export interface NewNoteMenuProps {
  /** The folder the new note goes into (none: no folder). */
  folderId?: string;
  /** Called with the new note, for example to open it. */
  onCreated: (note: Note) => void;
}

/**
 * The "New note" button. With no templates it creates a blank note at once; with templates it opens
 * a menu: Blank note, then each template (the server fills in {{title}}, {{date}} and {{time}}).
 */
export function NewNoteMenu({ folderId, onCreated }: NewNoteMenuProps) {
  const templates = useNoteTemplates();
  const create = useCreateNote();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const list = templates.data ?? [];
  const button = useRef<HTMLButtonElement>(null);

  const make = async (templateId?: string, from?: HTMLElement | null) => {
    if (create.isPending) return;
    try {
      const note = await create.mutateAsync({
        ...(folderId ? { folderId } : {}),
        ...(templateId ? { templateId } : {}),
      });
      onCreated(note);
    } catch {
      // The hook showed the server's message; keep the keyboard where it was
      from?.focus();
    }
  };

  return (
    <>
      <Tooltip label={list.length > 0 ? 'New note (choose a template)' : 'New note'}>
        <IconButton
          ref={button}
          aria-label="New note"
          aria-haspopup={list.length > 0 ? 'menu' : undefined}
          aria-expanded={list.length > 0 ? anchor !== null : undefined}
          icon={<IconPlus size={16} stroke={1.5} aria-hidden />}
          onClick={(event) => {
            if (list.length === 0) void make(undefined, event.currentTarget);
            else setAnchor(anchor ? null : event.currentTarget);
          }}
        />
      </Tooltip>
      {anchor ? (
        <AnchoredMenu
          anchor={anchor}
          label="New note"
          align="end"
          onClose={(returnFocus) => {
            if (returnFocus) anchor.focus();
            setAnchor(null);
          }}
        >
          <MenuItem
            onSelect={() => {
              setAnchor(null);
              void make(undefined, button.current);
            }}
          >
            Blank note
          </MenuItem>
          {list.map((template) => (
            <MenuItem
              key={template.id}
              onSelect={() => {
                setAnchor(null);
                void make(template.id, button.current);
              }}
            >
              <span className="truncate">{template.name}</span>
            </MenuItem>
          ))}
        </AnchoredMenu>
      ) : null}
    </>
  );
}
