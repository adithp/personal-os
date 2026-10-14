import { CLIENT_NAME_MAX, type Client } from '@personal-os/shared';
import { Button, Input } from '@personal-os/ui';
import { useState } from 'react';
import { Dialog, Field, TextArea } from '../components';

export interface ClientFormValues {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
}

/** New or edit client: name, email, phone, company, notes. */
export function ClientDialog({
  client,
  onSave,
  onClose,
}: {
  client?: Client;
  /** Rejects when the server refused (the dialog then stays open). */
  onSave: (values: ClientFormValues) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(client?.name ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [company, setCompany] = useState(client?.company ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

  const submit = async () => {
    if (busy) return;
    if (name.trim() === '') {
      setError('Add a name');
      return;
    }
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        email: orNull(email),
        phone: orNull(phone),
        company: orNull(company),
        notes: orNull(notes),
      });
    } catch {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={client ? 'Edit client' : 'New client'}
      onClose={onClose}
      dirty={name.trim() !== ''}
    >
      <Field label="Name" htmlFor="client-name">
        <Input
          id="client-name"
          data-autofocus
          value={name}
          maxLength={CLIENT_NAME_MAX}
          aria-invalid={error !== null}
          onChange={(event) => {
            setName(event.target.value);
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
      <Field label="Company" htmlFor="client-company">
        <Input
          id="client-company"
          value={company}
          onChange={(event) => {
            setCompany(event.target.value);
          }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" htmlFor="client-email">
          <Input
            id="client-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </Field>
        <Field label="Phone" htmlFor="client-phone">
          <Input
            id="client-phone"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
            }}
          />
        </Field>
      </div>
      <Field label="Notes" htmlFor="client-notes">
        <TextArea
          id="client-notes"
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
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
          {client ? 'Save' : 'Add client'}
        </Button>
      </div>
    </Dialog>
  );
}
