import { formatDuration, type Client } from '@personal-os/shared';
import { Button, GlassCard, IconButton } from '@personal-os/ui';
import { IconClock, IconPlus, IconTrash, IconUser } from '@tabler/icons-react';
import { useState } from 'react';
import { ConfirmDialog, Loading, QueryError } from '../components';
import { ClientDialog } from '../dialogs/client-dialog';
import { useClientActions, useClients } from '../projects-queries';
import { useProjectsUi } from '../projects-ui-store';
import { ClientPage } from './client-page';

/** Create-client dialog wired to the action. */
export function NewClientDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: (client: Client) => void;
}) {
  const { create } = useClientActions();
  return (
    <ClientDialog
      onClose={onClose}
      onSave={async (values) => {
        const { item } = await create.mutateAsync(values);
        onSaved?.(item);
        onClose();
      }}
    />
  );
}

/** The Clients page: a list of clients (open one for its page), add and delete. */
export function ClientsPage({ onNew, onHelp }: { onNew: () => void; onHelp: () => void }) {
  const clientId = useProjectsUi((state) => state.clientId);
  const openClient = useProjectsUi((state) => state.openClient);
  const clients = useClients();
  const { remove } = useClientActions();
  const [confirming, setConfirming] = useState<Client | null>(null);

  if (clientId !== null) return <ClientPage clientId={clientId} />;

  const list = clients.data ?? [];
  const newButton = (
    <Button variant="secondary" onClick={onNew}>
      <IconPlus size={16} stroke={1.5} aria-hidden />
      New client
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto px-4 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page font-semibold text-fg">Clients</h1>
          <p className="min-h-[15px] text-small text-fg-muted">
            {clients.isSuccess && list.length > 0 ? `${String(list.length)} clients` : ' '}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {newButton}
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            onClick={onHelp}
            className="h-[30px] min-h-6 min-w-6 rounded-control px-2 text-body text-fg-muted focus-ring hover:bg-input hover:text-fg"
          >
            ?
          </button>
        </div>
      </header>

      {clients.isPending ? <Loading text="Loading clients…" /> : null}
      {clients.isError ? (
        <QueryError
          error={clients.error}
          fallback="Could not load your clients."
          onRetry={() => {
            void clients.refetch();
          }}
        />
      ) : null}

      {clients.isSuccess && list.length === 0 ? (
        <GlassCard className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-module-projects text-on-tile">
            <IconUser size={20} stroke={1.5} aria-hidden />
          </span>
          <h2 className="text-section font-medium text-fg">No clients yet</h2>
          <p className="text-body text-fg-muted">
            Add the people or companies you work for, then give their projects a client.
          </p>
          {newButton}
        </GlassCard>
      ) : null}

      {list.length > 0 ? (
        <ul
          aria-label="Clients"
          className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4"
        >
          {list.map((client) => (
            <li
              key={client.id}
              className="group relative flex flex-col gap-2 rounded-card glass p-4 transition-transform duration-150 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-module-projects text-on-tile"
                >
                  <IconUser size={16} stroke={1.5} />
                </span>
                <button
                  type="button"
                  data-project-row
                  data-client-id={client.id}
                  onClick={() => {
                    openClient(client.id);
                  }}
                  className="min-w-0 flex-1 truncate text-left text-body font-medium text-fg outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
                >
                  {client.name}
                </button>
                <IconButton
                  aria-label={`Delete client: ${client.name}`}
                  icon={<IconTrash size={14} aria-hidden />}
                  className="relative z-10 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                  onClick={() => {
                    setConfirming(client);
                  }}
                />
              </div>
              {client.company ? (
                <p className="truncate text-small text-fg-secondary">{client.company}</p>
              ) : null}
              <p className="flex items-center justify-between text-small text-fg-secondary">
                <span>
                  {client.projectCount === 1
                    ? '1 project'
                    : `${String(client.projectCount)} projects`}
                </span>
                <span className="flex items-center gap-1.5">
                  <IconClock size={14} stroke={1.5} aria-hidden />
                  {formatDuration(client.trackedSeconds)}
                </span>
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title="Delete client?"
          message={`"${confirming.name}" will be deleted. Its projects stay, without a client. You can undo it for a few seconds.`}
          confirmLabel="Delete"
          onCancel={() => {
            setConfirming(null);
          }}
          onConfirm={() => {
            remove.mutate(confirming.id);
            setConfirming(null);
          }}
        />
      ) : null}
    </div>
  );
}
