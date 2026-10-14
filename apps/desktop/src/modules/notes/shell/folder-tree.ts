import { FOLDER_DEPTH_MAX, type NoteFolder } from '@personal-os/shared';

export interface FolderNode {
  folder: NoteFolder;
  /** 1 for a top-level folder. */
  depth: number;
  children: FolderNode[];
}

const byName = (a: NoteFolder, b: NoteFolder) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/** The folders as a tree, each level sorted by name. A folder whose parent is missing shows at the top. */
export function buildTree(folders: readonly NoteFolder[]): FolderNode[] {
  const known = new Set(folders.map((folder) => folder.id));
  const grow = (parentId: string | null, depth: number): FolderNode[] =>
    folders
      .filter((folder) =>
        parentId === null
          ? folder.parentId === null || !known.has(folder.parentId)
          : folder.parentId === parentId,
      )
      .sort(byName)
      .map((folder) => ({ folder, depth, children: grow(folder.id, depth + 1) }));
  return grow(null, 1);
}

/** Every node of the tree, folded or not. */
export function allNodes(nodes: readonly FolderNode[]): FolderNode[] {
  return nodes.flatMap((node) => [node, ...allNodes(node.children)]);
}

/** Levels in a subtree: a folder with no children is 1. */
export function subtreeHeight(node: FolderNode): number {
  return 1 + Math.max(0, ...node.children.map(subtreeHeight));
}

/** The ids of a folder and everything inside it. */
export function idsInside(node: FolderNode): Set<string> {
  return new Set(allNodes([node]).map((entry) => entry.folder.id));
}

/** Folder names from the top level down to this folder, e.g. ["Work", "Plans"]. */
export function folderPath(folders: readonly NoteFolder[], id: string | null): string[] {
  const path: string[] = [];
  let at = id === null ? undefined : folders.find((folder) => folder.id === id);
  while (at && path.length < FOLDER_DEPTH_MAX) {
    path.unshift(at.name);
    const parentId: string | null = at.parentId;
    at = parentId === null ? undefined : folders.find((folder) => folder.id === parentId);
  }
  return path;
}
