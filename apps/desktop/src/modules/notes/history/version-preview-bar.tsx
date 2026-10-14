import { Button, Switch } from '@personal-os/ui';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../../../api/api-client';
import { useNote } from '../notes-queries';
import { useNoteVersion, useRestoreVersion } from '../versions-queries';
import { versionTitle } from './format';
import { closePreview, useVersionPreview, useVersionPreviewStore } from './preview-store';

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
  const { setShowChanges, setVersion } = useVersionPreviewStore.getState();
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
    closePreview(noteId);
  };

  const [now] = useState(() => Date.now());
  const title = version ? versionTitle(version.createdAt, now) : '';
  const trashed = (note.data?.deletedAt ?? null) !== null;

  return (
    <div
      role="region"
      aria-label="Version preview"
      onKeyDown={onKeyDown}
      className="mx-6 mb-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-input px-3 py-2"
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
          <p
            role="status"
            title={title}
            className="min-w-0 flex-1 truncate text-body font-medium text-fg"
          >
            {title}
          </p>
          <span
            id="show-changes-label"
            className="shrink-0 text-body whitespace-nowrap text-fg-secondary"
          >
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
          className="h-7 shrink-0 px-3 whitespace-nowrap"
          onClick={() => {
            void query.refetch();
          }}
        >
          Try again
        </Button>
      ) : (
        <Button
          className="h-7 shrink-0 px-3 whitespace-nowrap"
          disabled={!version || restore.isPending || trashed}
          aria-describedby={trashed ? 'restore-hint' : undefined}
          onClick={() => {
            // The hook closes the preview as soon as the restore is answered
            restore.mutate({ id: noteId, versionId });
          }}
        >
          Restore
        </Button>
      )}
      <Button
        variant="secondary"
        className="h-7 shrink-0 px-3 whitespace-nowrap"
        onClick={() => {
          closePreview(noteId);
        }}
      >
        Close
      </Button>
      {trashed ? (
        <p id="restore-hint" className="basis-full text-small text-fg-muted">
          Restore the note from the trash first.
        </p>
      ) : null}
    </div>
  );
}
