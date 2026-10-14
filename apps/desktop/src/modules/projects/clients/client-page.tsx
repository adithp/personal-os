import { formatDuration } from '@personal-os/shared';
import { Button, GlassCard, IconButton } from '@personal-os/ui';
import { IconArrowLeft, IconPencil, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { ConfirmDialog, Loading, QueryError } from '../components';
import { ClientDialog } from '../dialogs/client-dialog';
import { ProjectCard } from '../list/projects-list';
import { useClient, useClientActions, useProjects } from '../projects-queries';
import { useProjectsUi } from '../projects-ui-store';

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-small text-fg-muted">{label}</dt>
      <dd className="truncate text-body text-fg">{value}</dd>
    </div>
  );
}

/** One client: details, total hours, and its projects. */
export function ClientPage({ clientId }: { clientId: string }) {
  const query = useClient(clientId);
  const projects = useProjects({ clientId });
  const { update, remove } = useClientActions();
  const closeClient = useProjectsUi((state) => state.closeClient);
  const [now] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const back = (
    <Button variant="secondary" onClick={closeClient}>
      <IconArrowLeft size={16} stroke={1.5} aria-hidden />
      All clients
    </Button>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4 px-4">
        <div>{back}</div>
        <Loading text="Loading client…" />
      </div>
    );
  }
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="flex flex-col gap-4 px-4">
        <div>{back}</div>
        {missing ? (
          <p role="alert" className="text-body text-fg-muted">
            This client does not exist any more.
          </p>
        ) : (
          <QueryError
            error={query.error}
            fallback="Could not load the client."
            onRetry={() => {
              void query.refetch();
            }}
          />
        )}
      </div>
    );
  }

  const client = query.data;
  const list = projects.data ?? [];

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto px-4 pb-4">
      <div>{back}</div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page font-semibold text-fg">{client.name}</h1>
          <p className="text-small text-fg-muted">
            {client.projectCount === 1 ? '1 project' : `${String(client.projectCount)} projects`}
            {' · '}
            {formatDuration(client.trackedSeconds)} tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            aria-label="Edit client"
            icon={<IconPencil size={16} aria-hidden />}
            onClick={() => {
              setEditing(true);
            }}
          />
          <IconButton
            aria-label="Delete client"
            icon={<IconTrash size={16} aria-hidden />}
            onClick={() => {
              setConfirming(true);
            }}
          />
        </div>
      </header>

      <GlassCard className="flex flex-col gap-3">
        <h2 className="text-section font-medium text-fg">Details</h2>
        {client.company || client.email || client.phone ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Detail label="Company" value={client.company} />
            <Detail label="Email" value={client.email} />
            <Detail label="Phone" value={client.phone} />
          </dl>
        ) : (
          <p className="text-body text-fg-muted">No contact details yet. Use Edit to add them.</p>
        )}
        {client.notes ? (
          <p className="text-body whitespace-pre-wrap text-fg-secondary">{client.notes}</p>
        ) : null}
      </GlassCard>

      <section aria-label="Projects of this client" className="flex flex-col gap-3">
        <h2 className="text-section font-medium text-fg">Projects</h2>
        {projects.isPending ? <Loading text="Loading projects…" /> : null}
        {projects.isError ? (
          <QueryError
            error={projects.error}
            fallback="Could not load the projects."
            onRetry={() => {
              void projects.refetch();
            }}
          />
        ) : null}
        {projects.isSuccess && list.length === 0 ? (
          <p className="text-body text-fg-muted">
            No projects for this client yet. Pick this client when you create a project.
          </p>
        ) : null}
        {list.length > 0 ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {list.map((project) => (
              <ProjectCard key={project.id} project={project} now={now} />
            ))}
          </ul>
        ) : null}
      </section>

      {editing ? (
        <ClientDialog
          client={client}
          onClose={() => {
            setEditing(false);
          }}
          onSave={async (values) => {
            await update.mutateAsync({ id: client.id, ...values });
            setEditing(false);
          }}
        />
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title="Delete client?"
          message={`"${client.name}" will be deleted. Its projects stay, without a client. You can undo it for a few seconds.`}
          confirmLabel="Delete"
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            closeClient();
            remove.mutate(client.id);
          }}
        />
      ) : null}
    </div>
  );
}
