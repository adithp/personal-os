import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  PROJECT_TITLE_MAX,
  type Project,
  type ProjectStatus,
} from '@personal-os/shared';
import { Button, cx, Input } from '@personal-os/ui';
import { useState, type KeyboardEvent } from 'react';
import { DateTimeBox } from '../../tasks/detail/date-fields';
import { Dialog, Field, Select, TextArea } from '../components';
import { accentOf, PROJECT_COLORS } from '../format';
import { useClientActions, useClients } from '../projects-queries';

export interface ProjectDialogProps {
  /** The project to edit; omit to create. */
  project?: Project;
  /** Saves. Rejects when the server refused (the dialog then stays open; the hook showed why). */
  onSave: (input: {
    title: string;
    description: string | null;
    clientId: string | null;
    startAt: string | null;
    dueAt: string | null;
    color: string | null;
    status: ProjectStatus;
  }) => Promise<void>;
  onClose: () => void;
}

const NEW_CLIENT = '__new__';

/** Color swatches: "Default" (the Projects pink) and the palette. Arrow keys move the choice. */
function ColorSwatches({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  const options: (string | null)[] = [null, ...PROJECT_COLORS];
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    if (next === undefined) return;
    onChange(next);
    const group = event.currentTarget.parentElement;
    window.setTimeout(() => {
      group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    }, 0);
  };
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
      {options.map((color, index) => {
        const on = color === value;
        return (
          <button
            key={color ?? 'default'}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={color === null ? 'Default color' : `Color ${color}`}
            tabIndex={on ? 0 : -1}
            onClick={() => {
              onChange(color);
            }}
            onKeyDown={(event) => {
              move(event, index);
            }}
            style={{ backgroundColor: accentOf(color) }}
            className={cx(
              'size-6 rounded-full focus-ring',
              on ? 'ring-2 ring-fg' : 'ring-1 ring-transparent hover:ring-fg-muted',
            )}
          />
        );
      })}
    </div>
  );
}

/** New or edit project: title, description, status, client (or a quick new one), dates, color. */
export function ProjectDialog({ project, onSave, onClose }: ProjectDialogProps) {
  const clients = useClients();
  const { create: createClient } = useClientActions();
  const [title, setTitle] = useState(project?.title ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active');
  const [clientId, setClientId] = useState<string>(project?.client?.id ?? '');
  const [newClient, setNewClient] = useState('');
  const [startAt, setStartAt] = useState<string | null>(project?.startAt ?? null);
  const [dueAt, setDueAt] = useState<string | null>(project?.dueAt ?? null);
  const [color, setColor] = useState<string | null>(project?.color ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = title.trim() !== '' || description.trim() !== '';

  const submit = async () => {
    if (busy) return;
    if (title.trim() === '') {
      setError('Add a title');
      return;
    }
    if (startAt && dueAt && Date.parse(dueAt) < Date.parse(startAt)) {
      setError('The due date is before the start date');
      return;
    }
    setBusy(true);
    try {
      let chosen: string | null = clientId === '' || clientId === NEW_CLIENT ? null : clientId;
      if (clientId === NEW_CLIENT && newClient.trim() !== '') {
        chosen = (await createClient.mutateAsync({ name: newClient.trim() })).item.id;
      }
      await onSave({
        title: title.trim(),
        description: description.trim() === '' ? null : description,
        clientId: chosen,
        startAt,
        dueAt,
        color,
        status,
      });
    } catch {
      // The hook showed the server's message in a toast; keep the dialog open
      setBusy(false);
    }
  };

  return (
    <Dialog title={project ? 'Edit project' : 'New project'} onClose={onClose} dirty={dirty}>
      <Field label="Title" htmlFor="project-title">
        <Input
          id="project-title"
          data-autofocus
          value={title}
          maxLength={PROJECT_TITLE_MAX}
          aria-invalid={error !== null}
          placeholder="What is the project?"
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <p role="alert" className="min-h-[15px] text-small text-danger">
          {error}
        </p>
      </Field>

      <Field label="Description" htmlFor="project-description">
        <TextArea
          id="project-description"
          value={description}
          maxLength={PROJECT_DESCRIPTION_MAX}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </Field>

      {project ? (
        <Field label="Status" htmlFor="project-status">
          <Select
            id="project-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ProjectStatus);
            }}
          >
            {PROJECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PROJECT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field label="Client" htmlFor="project-client">
        <Select
          id="project-client"
          value={clientId}
          onChange={(event) => {
            setClientId(event.target.value);
          }}
        >
          <option value="">No client</option>
          {(clients.data ?? []).map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
          <option value={NEW_CLIENT}>New client…</option>
        </Select>
        {clientId === NEW_CLIENT ? (
          <Input
            aria-label="New client name"
            placeholder="Client name"
            value={newClient}
            onChange={(event) => {
              setNewClient(event.target.value);
            }}
          />
        ) : null}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <div className="flex items-center gap-1">
            <DateTimeBox label="Start date" kind="date" value={startAt} onCommit={setStartAt} />
            {startAt ? (
              <Button
                variant="secondary"
                aria-label="Clear start date"
                onClick={() => {
                  setStartAt(null);
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label="Due date">
          <div className="flex items-center gap-1">
            <DateTimeBox label="Due date" kind="date" value={dueAt} onCommit={setDueAt} />
            {dueAt ? (
              <Button
                variant="secondary"
                aria-label="Clear due date"
                onClick={() => {
                  setDueAt(null);
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </Field>
      </div>

      <Field label="Color">
        <ColorSwatches value={color} onChange={setColor} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            void submit();
          }}
        >
          {project ? 'Save' : 'Create project'}
        </Button>
      </div>
    </Dialog>
  );
}
