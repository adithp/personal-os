import { Button, Switch } from '@personal-os/ui';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../../../api/api-client';
import { useNote } from '../notes-queries';
import { useNoteVersion, useRestoreVersion } from '../versions-queries';
import { versionTitle } from './format';
import { useVersionPreview, useVersionPreviewStore } from './preview-store';

/**
 * The bar above the editor while a version is previewed: "Version from 13 Oct, 14:32", the
 * Show changes switch, Restore and Close. It renders nothing (and asks for nothing) until a
 * version is chosen in the History tab. Escape closes it.
 */
export function VersionPreviewBar({ noteId }: { noteId: string }) {
  const { versionId } = useVersionPreview(noteId);
  return versionId === null ? null : <Bar noteId={noteId} versionId={versionId} />;
}

function Bar({ noteId, versionId }: { noteId: string; versionId: string }) {
  const { showChanges } = useVersionPreview(noteId);
  const { close, setShowChanges, setVersion } = useVersionPreviewStore.getState();
  const query = useNoteVersion(noteId, versionId);
  const note = useNote(noteId);
  const restore = useRestoreVersion();
  const version = query.data;

  // The editor pane reads the loaded version from the store
  useEffect(() => {
    if (version) setVersion(noteId, version);
  }, [noteId, version, setVersion]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    close(noteId);
  };

  const [now] = useState(() => Date.now());
  const title = version ? versionTitle(version.createdAt, now) : '';
  const trashed = (note.data?.deletedAt ?? null) !== null;

  return (
    <div
      role="region"
      aria-label="Version preview"
      onKeyDown={onKeyDown}
      className="mx-6 mb-2 flex shrink-0 items-center gap-3 rounded-control bg-input px-3 py-2"
    >
      {query.isPending ? (
        <p className="flex-1 text-body text-fg-muted" role="status">
          Loading version…
        </p>
      ) : query.isError || !version ? (
        <p className="flex-1 text-body text-fg" role="alert">
          {query.error instanceof ApiError ? query.error.message : 'Could not load this version.'}
        </p>
      ) : (
        <>
          <p className="min-w-0 flex-1 truncate text-body font-medium text-fg">{title}</p>
          <span id="show-changes-label" className="text-body text-fg-secondary">
            Show changes
          </span>
          <Switch
            aria-labelledby="show-changes-label"
            checked={showChanges}
            onCheckedChange={(next) => {
              setShowChanges(noteId, next);
            }}
          />
        </>
      )}
      {query.isError ? (
        <Button
          variant="secondary"
          className="h-7 px-3"
          onClick={() => {
            void query.refetch();
          }}
        >
          Try again
        </Button>
      ) : (
        <Button
          className="h-7 px-3"
          disabled={!version || restore.isPending || trashed}
          title={trashed ? 'Restore the note from the trash first' : undefined}
          onClick={() => {
            restore.mutate(
              { id: noteId, versionId },
              {
                onSuccess: () => {
                  close(noteId);
                },
              },
            );
          }}
        >
          Restore
        </Button>
      )}
      <Button
        variant="secondary"
        className="h-7 px-3"
        onClick={() => {
          close(noteId);
        }}
      >
        Close
      </Button>
    </div>
  );
}
