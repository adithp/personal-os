import { Button, cx } from '@personal-os/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { useNote } from '../notes-queries';
import { noteKeys } from '../query-keys';
import { useRovingList } from '../right-panel/use-roving-list';
import { useNoteVersions } from '../versions-queries';
import { deltaLabel, groupByDay, REASON_WORD, versionTime } from './format';
import { useVersionPreview, useVersionPreviewStore } from './preview-store';

function Message({ children, live }: { children: string; live?: boolean }) {
  return (
    <p className="px-2 text-body text-fg-muted" role={live ? 'status' : undefined}>
      {children}
    </p>
  );
}

/**
 * The History tab: the saved versions of a note, newest first, one group per India day. Choosing
 * one opens the preview (see `VersionPreviewBar`). The list is read again after every save.
 */
export function HistoryPanel({ noteId }: { noteId: string }) {
  const versions = useNoteVersions(noteId);
  const { versionId: chosen } = useVersionPreview(noteId);
  const open = useVersionPreviewStore((state) => state.open);
  const client = useQueryClient();

  // A save (here or on another device) can add a version: read the list again
  const revision = useNote(noteId).data?.revision;
  const seen = useRef<{ noteId: string; revision: number | undefined }>({ noteId, revision });
  useEffect(() => {
    const before = seen.current;
    seen.current = { noteId, revision };
    if (before.noteId !== noteId || before.revision === undefined || before.revision === revision) {
      return;
    }
    void client.invalidateQueries({ queryKey: noteKeys.versions(noteId) });
  }, [revision, noteId, client]);

  const data = versions.data;
  // "Today" is judged when the tab opens
  const [now] = useState(() => Date.now());
  const groups = useMemo(() => groupByDay(data ?? [], now), [data, now]);
  const roving = useRovingList(data?.length ?? 0);

  if (versions.isPending) return <Message live>Loading versions…</Message>;
  if (versions.isError) {
    return (
      <div className="flex flex-col items-start gap-2 px-2">
        <p className="text-body text-fg-muted" role="alert">
          {versions.error instanceof ApiError
            ? versions.error.message
            : 'Could not load the versions.'}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            void versions.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (groups.length === 0) {
    return <Message>No earlier versions yet. Versions are saved while you edit.</Message>;
  }

  const flat = groups.flatMap((group) => group.versions);
  return (
    <div className="flex flex-col gap-4" {...roving.listProps}>
      {groups.map((group) => (
        <section
          key={group.day}
          aria-labelledby={`history-day-${group.day}`}
          className="flex flex-col gap-1"
        >
          <h3 id={`history-day-${group.day}`} className="px-2 text-small font-medium text-fg-muted">
            {group.heading}
          </h3>
          <ul className="flex flex-col">
            {group.versions.map((version) => {
              const position = flat.indexOf(version);
              const reason = REASON_WORD[version.reason];
              const selected = version.id === chosen;
              return (
                <li key={version.id}>
                  <button
                    type="button"
                    {...roving.itemProps(position)}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => {
                      open(noteId, version.id);
                    }}
                    className={cx(
                      'flex w-full items-baseline gap-2 rounded-chip px-2 py-1.5 text-left text-body focus-ring transition-colors duration-150 ease-out hover:bg-tint motion-reduce:transition-none',
                      selected && 'bg-tint',
                    )}
                  >
                    <span className="font-medium text-fg">{versionTime(version.createdAt)}</span>
                    {reason ? <span className="text-small text-fg-secondary">{reason}</span> : null}
                    <span className="ml-auto shrink-0 text-small text-fg-muted">
                      {deltaLabel(version.wordsDelta)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
