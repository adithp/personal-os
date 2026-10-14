import type { NoteFolder } from '@personal-os/shared';
import { IconCheck } from '@tabler/icons-react';
import { AnchoredMenu, MenuItem } from '../../tasks/favorites/anchored-menu';
import { allNodes, buildTree, type FolderNode } from './folder-tree';

export interface FolderPickerProps {
  anchor: HTMLElement;
  /** The name of the menu, e.g. "Move note to". */
  label: string;
  folders: readonly NoteFolder[];
  /** The folder the thing is in now (null: the top level / no folder); shows a check. */
  currentId: string | null;
  /** A folder that cannot be chosen (for moving a folder: itself, what is inside it, too deep). */
  isDisabled?: (node: FolderNode) => boolean;
  /** The text of the "no folder" choice. */
  noneLabel: string;
  onPick: (folderId: string | null) => void;
  onClose: (returnFocus: boolean) => void;
}

/** A menu of the folder tree (indented) plus a "no folder" choice. Used to move notes and folders. */
export function FolderPickerMenu({
  anchor,
  label,
  folders,
  currentId,
  isDisabled,
  noneLabel,
  onPick,
  onClose,
}: FolderPickerProps) {
  const nodes = allNodes(buildTree(folders));
  const choose = (folderId: string | null) => {
    onPick(folderId);
    onClose(true);
  };
  return (
    <AnchoredMenu anchor={anchor} label={label} align="end" onClose={onClose}>
      <MenuItem
        role="menuitemradio"
        checked={currentId === null}
        onSelect={() => {
          choose(null);
        }}
      >
        <span className="flex-1">{noneLabel}</span>
        {currentId === null ? <IconCheck size={12} aria-hidden /> : null}
      </MenuItem>
      {nodes.map((node) => (
        <MenuItem
          key={node.folder.id}
          role="menuitemradio"
          checked={currentId === node.folder.id}
          disabled={isDisabled?.(node) === true}
          className={node.depth === 2 ? '!pl-5' : node.depth >= 3 ? '!pl-8' : undefined}
          onSelect={() => {
            choose(node.folder.id);
          }}
        >
          <span className="flex-1 truncate">{node.folder.name}</span>
          {currentId === node.folder.id ? <IconCheck size={12} aria-hidden /> : null}
        </MenuItem>
      ))}
    </AnchoredMenu>
  );
}
