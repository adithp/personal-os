import { FOLDER_DEPTH_MAX, FOLDER_NAME_MAX, type NoteFolder } from '@personal-os/shared';
import { cx, Input, Tooltip } from '@personal-os/ui';
import {
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconFolder,
  IconPlus,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnchoredMenu, MenuItem } from '../../tasks/favorites/anchored-menu';
import { useFolderActions } from '../folders-queries';
import { useNotesUi } from '../notes-ui-store';
import { FolderPickerMenu } from './folder-menus';
import { allNodes, buildTree, idsInside, subtreeHeight, type FolderNode } from './folder-tree';
import { useNotesNav } from './use-notes-nav';

const rowClass =
  'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-chip px-2 text-body focus-ring transition-colors duration-150 ease-out';

/** A text box for a folder name: Enter saves, Escape cancels, leaving it saves what was typed. */
function NameBox({
  initial,
  label,
  depth,
  onDone,
}: {
  initial: string;
  label: string;
  depth: number;
  /** `byKey`: Enter or Escape ended it (a click elsewhere did not, and keeps its own focus). */
  onDone: (name: string | null, byKey: boolean) => Promise<void> | void;
}) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);

  const finish = async (name: string | null, byKey: boolean) => {
    if (finished.current) return;
    finished.current = true;
    try {
      await onDone(name, byKey);
    } catch {
      // The hook showed the server's message; let the person fix the name
      finished.current = false;
    }
  };

  return (
    <li style={{ paddingLeft: (depth - 1) * 12 }} className="flex min-h-8 items-center">
      <Input
        autoFocus
        aria-label={label}
        value={value}
        maxLength={FOLDER_NAME_MAX}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void finish(value.trim() === '' ? null : value.trim(), true);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            void finish(null, true);
          }
        }}
        onBlur={() => {
          void finish(value.trim() === '' ? null : value.trim(), false);
        }}
        className="min-w-0 flex-1"
      />
    </li>
  );
}

interface MenuState {
  id: string;
  anchor: HTMLElement;
  mode: 'actions' | 'move';
}

/** The Folders part of the Notes side panel: a header with +, and the tree up to three levels. */
export function FolderSection({
  folders,
  isPending,
  isError,
  errorMessage = null,
  onRetry,
}: {
  folders: readonly NoteFolder[];
  isPending: boolean;
  isError: boolean;
  /** The server's message for a failed load, when it gave one. */
  errorMessage?: string | null;
  onRetry: () => void;
}) {
  const nav = useNotesNav();
  const collapsed = useNotesUi((state) => state.collapsedFolders);
  const setFolderCollapsed = useNotesUi((state) => state.setFolderCollapsed);
  const { create, rename, move, remove } = useFolderActions();
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const listRoot = useRef<HTMLUListElement>(null);
  // Where the focus goes once the next render has put the rows in place ('add': New folder)
  const focusNext = useRef<string | null>(null);

  const rowLinks = () =>
    Array.from(listRoot.current?.querySelectorAll<HTMLElement>('[data-folder-row]') ?? []);
  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    if (target === 'add') addButton.current?.focus();
    else
      rowLinks()
        .find((link) => link.dataset.folderRow === target)
        ?.focus();
  });

  const tree = buildTree(folders);
  const everyNode = allNodes(tree);
  const nodeOf = (id: string) => everyNode.find((node) => node.folder.id === id);
  const menuNode = menu ? nodeOf(menu.id) : undefined;

  const closeMenu = (returnFocus: boolean) => {
    if (returnFocus) menu?.anchor.focus();
    setMenu(null);
  };

  const startCreate = (parentId: string | null) => {
    if (parentId !== null) setFolderCollapsed(parentId, false);
    setCreating({ parentId });
  };

  const showFolder = (id: string) => {
    nav.showPlace(id);
  };

  const finishCreate = async (name: string | null, byKey: boolean) => {
    const parentId = creating?.parentId ?? null;
    if (name === null) {
      setCreating(null);
      if (byKey) addButton.current?.focus();
      return;
    }
    const folder = await create.mutateAsync({ name, parentId });
    setCreating(null);
    showFolder(folder.id);
  };

  const finishRename = async (node: FolderNode, name: string | null, byKey: boolean) => {
    if (name !== null && name !== node.folder.name) {
      await rename.mutateAsync({ id: node.folder.id, name });
    }
    setRenamingId(null);
    if (byKey) focusNext.current = node.folder.id;
  };

  const deleteFolder = (node: FolderNode) => {
    // The row below, else the one above, else the New folder button
    const links = rowLinks();
    const index = links.findIndex((link) => link.dataset.folderRow === node.folder.id);
    const neighbor = links[index + 1] ?? links[index - 1];
    remove.mutate(node.folder.id, {
      onSuccess: () => {
        focusNext.current = neighbor?.dataset.folderRow ?? 'add';
      },
      onError: () => {
        focusNext.current = node.folder.id;
      },
    });
  };

  const onRowKey = (event: KeyboardEvent<HTMLElement>, node: FolderNode) => {
    const open = collapsed[node.folder.id] !== true;
    if (event.key === 'ArrowRight' && node.children.length > 0 && !open) {
      event.preventDefault();
      setFolderCollapsed(node.folder.id, false);
    } else if (event.key === 'ArrowLeft' && node.children.length > 0 && open) {
      event.preventDefault();
      setFolderCollapsed(node.folder.id, true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const links = rowLinks();
      const index = links.findIndex((link) => link.dataset.folderRow === node.folder.id);
      links[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      const anchor = event.currentTarget.querySelector<HTMLElement>('[data-menu-trigger]');
      if (anchor) setMenu({ id: node.folder.id, anchor, mode: 'actions' });
    }
  };

  const creatorAt = (parentId: string | null, depth: number) =>
    creating?.parentId === parentId ? (
      <NameBox initial="" label="New folder name" depth={depth} onDone={finishCreate} />
    ) : null;

  const renderNodes = (nodes: readonly FolderNode[]) =>
    nodes.map((node) => {
      const { folder } = node;
      const open = collapsed[folder.id] !== true;
      const active = nav.place === folder.id;
      const hasChildren = node.children.length > 0;
      if (renamingId === folder.id) {
        return (
          <NameBox
            key={folder.id}
            initial={folder.name}
            label={`Rename folder ${folder.name}`}
            depth={node.depth}
            onDone={(name, byKey) => finishRename(node, name, byKey)}
          />
        );
      }
      return (
        <li key={folder.id}>
          <div
            onKeyDown={(event) => {
              onRowKey(event, node);
            }}
            style={{ paddingLeft: (node.depth - 1) * 12 }}
            className="group relative flex items-center"
          >
            {hasChildren ? (
              <button
                type="button"
                aria-label={`${open ? 'Fold' : 'Unfold'} ${folder.name}`}
                aria-expanded={open}
                tabIndex={-1}
                onClick={() => {
                  setFolderCollapsed(folder.id, open);
                }}
                className="flex size-5 shrink-0 items-center justify-center rounded-chip text-fg-muted focus-ring hover:text-fg"
              >
                {open ? (
                  <IconChevronDown size={12} aria-hidden />
                ) : (
                  <IconChevronRight size={12} aria-hidden />
                )}
              </button>
            ) : (
              <span aria-hidden className="size-5 shrink-0" />
            )}
            <Link
              to="/notes"
              search={(previous) => ({
                ...(previous.note ? { note: previous.note } : {}),
                folder: folder.id,
              })}
              data-folder-row={folder.id}
              aria-label={`${folder.name}, ${String(folder.noteCount)} ${folder.noteCount === 1 ? 'note' : 'notes'}`}
              aria-current={active ? 'page' : undefined}
              className={cx(
                rowClass,
                'pr-8',
                active
                  ? 'bg-tint font-medium text-fg'
                  : 'text-fg-secondary hover:bg-tint hover:text-fg',
              )}
            >
              <IconFolder size={16} stroke={1.5} aria-hidden className="shrink-0" />
              <span className="truncate">{folder.name}</span>
              <span aria-hidden className="ml-auto shrink-0 text-small text-fg-muted">
                {folder.noteCount}
              </span>
            </Link>
            <button
              type="button"
              data-menu-trigger
              tabIndex={-1}
              aria-haspopup="menu"
              aria-label={`More options for ${folder.name}`}
              onClick={(event) => {
                const anchor = event.currentTarget;
                setMenu((current) =>
                  current?.id === folder.id ? null : { id: folder.id, anchor, mode: 'actions' },
                );
              }}
              className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-chip text-fg-muted opacity-0 focus-ring group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg"
            >
              <IconDots size={14} stroke={1.5} aria-hidden />
            </button>
          </div>
          {hasChildren || creating?.parentId === folder.id ? (
            open ? (
              <ul>
                {renderNodes(node.children)}
                {creatorAt(folder.id, node.depth + 1)}
              </ul>
            ) : null
          ) : null}
        </li>
      );
    });

  return (
    <section aria-label="Folders" className="flex flex-col gap-0.5">
      <div className="flex h-7 items-center justify-between pl-2.5">
        <h2 className="text-small font-medium text-fg-muted">Folders</h2>
        <Tooltip label="New folder">
          <button
            ref={addButton}
            type="button"
            aria-label="New folder"
            onClick={() => {
              startCreate(null);
            }}
            className="flex size-6 items-center justify-center rounded-chip text-fg-muted focus-ring hover:bg-tint hover:text-fg"
          >
            <IconPlus size={14} stroke={1.5} aria-hidden />
          </button>
        </Tooltip>
      </div>

      {isPending ? (
        <p role="status" className="px-2.5 text-small text-fg-muted">
          Loading folders…
        </p>
      ) : null}
      {isError ? (
        <p role="alert" className="flex flex-col items-start gap-1 px-2.5 text-small text-fg-muted">
          {errorMessage ?? 'Could not load folders.'}
          <button
            type="button"
            onClick={onRetry}
            className="rounded-chip text-fg underline focus-ring"
          >
            Try again
          </button>
        </p>
      ) : null}
      {!isPending && !isError && folders.length === 0 && creating === null ? (
        <p className="px-2.5 text-small text-fg-muted">No folders yet.</p>
      ) : null}

      <ul ref={listRoot} aria-label="Folder list">
        {renderNodes(tree)}
        {creatorAt(null, 1)}
      </ul>

      {menu && menuNode && menu.mode === 'actions' ? (
        <AnchoredMenu
          anchor={menu.anchor}
          label={`Folder ${menuNode.folder.name}`}
          align="end"
          onClose={closeMenu}
        >
          <MenuItem
            disabled={menuNode.depth >= FOLDER_DEPTH_MAX}
            onSelect={() => {
              setMenu(null);
              startCreate(menuNode.folder.id);
            }}
          >
            New subfolder
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setMenu(null);
              setRenamingId(menuNode.folder.id);
            }}
          >
            Rename
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setMenu({ ...menu, mode: 'move' });
            }}
          >
            Move to…
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setMenu(null);
              deleteFolder(menuNode);
            }}
          >
            <span className="text-danger">Delete folder</span>
          </MenuItem>
        </AnchoredMenu>
      ) : null}
      {menu && menuNode && menu.mode === 'move' ? (
        <FolderPickerMenu
          anchor={menu.anchor}
          label={`Move ${menuNode.folder.name} to`}
          folders={folders}
          currentId={menuNode.folder.parentId}
          noneLabel="Top level"
          isDisabled={(target) =>
            idsInside(menuNode).has(target.folder.id) ||
            target.depth + subtreeHeight(menuNode) > FOLDER_DEPTH_MAX
          }
          onPick={(parentId) => {
            if (parentId !== menuNode.folder.parentId) {
              move.mutate({ id: menuNode.folder.id, parentId });
            }
          }}
          onClose={closeMenu}
        />
      ) : null}
    </section>
  );
}
