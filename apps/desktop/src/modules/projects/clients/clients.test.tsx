import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeClient, makeProject, makeTimeEntry } from '../../../test/fake-projects';
import {
  callsTo,
  findToast,
  openProjects,
  projectsSetup,
  resetProjectsEverything,
  restoreEverything,
} from '../test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetProjectsEverything);
afterEach(restoreEverything);

async function openClients(fake: ReturnType<typeof projectsSetup>['fake']) {
  const opened = await openProjects(fake);
  await opened.user.click(
    within(await screen.findByRole('navigation', { name: 'Projects' })).getByRole('button', {
      name: 'Clients',
    }),
  );
  await screen.findByRole('heading', { level: 1, name: 'Clients' });
  return opened;
}

const acme = makeClient({ name: 'Acme', company: 'Acme Ltd', email: 'hi@acme.test' });
const site = makeProject({ title: 'Acme site', client: { id: acme.id, name: 'Acme' } });
const app = makeProject({ title: 'Acme app', client: { id: acme.id, name: 'Acme' } });
const hours = [
  makeTimeEntry(site.id, {
    startedAt: '2025-10-06T04:00:00.000Z',
    endedAt: '2025-10-06T06:00:00.000Z',
  }),
  makeTimeEntry(app.id, {
    startedAt: '2025-10-06T08:00:00.000Z',
    endedAt: '2025-10-06T08:30:00.000Z',
  }),
];

describe('clients list', () => {
  it('shows the first-client card when there is none', async () => {
    const { fake } = projectsSetup();
    await openClients(fake);
    expect(await screen.findByText('No clients yet')).toBeInTheDocument();
  });

  it('shows the project count and the hours of each client', async () => {
    const { fake } = projectsSetup({ clients: [acme], projects: [site, app], entries: hours });
    await openClients(fake);
    const card = (await screen.findByRole('button', { name: 'Acme' })).closest('li') as HTMLElement;
    expect(within(card).getByText('2 projects')).toBeInTheDocument();
    expect(within(card).getByText('2h 30m')).toBeInTheDocument();
    expect(within(card).getByText('Acme Ltd')).toBeInTheDocument();
  });

  it('adds a client with N and the dialog', async () => {
    const { fake, projects } = projectsSetup();
    const { user } = await openClients(fake);
    await screen.findByText('No clients yet');
    await user.keyboard('n');
    const dialog = await screen.findByRole('dialog', { name: 'New client' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Globex');
    await user.type(within(dialog).getByRole('textbox', { name: 'Company' }), 'Globex Corp');
    await user.click(within(dialog).getByRole('button', { name: 'Add client' }));
    expect(await screen.findByRole('button', { name: 'Globex' })).toBeInTheDocument();
    expect(projects.clients()[0]?.company).toBe('Globex Corp');
  });

  it('asks for a name', async () => {
    const { fake } = projectsSetup();
    const { user } = await openClients(fake);
    await screen.findByText('No clients yet');
    await user.keyboard('n');
    const dialog = await screen.findByRole('dialog', { name: 'New client' });
    await user.click(within(dialog).getByRole('button', { name: 'Add client' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Add a name');
    expect(callsTo(fake, 'POST', '/clients')).toHaveLength(0);
  });

  it('deletes a client after a confirmation, keeping its projects, with Undo', async () => {
    const { fake, projects } = projectsSetup({ clients: [acme], projects: [site] });
    const { user } = await openClients(fake);
    await user.click(await screen.findByRole('button', { name: 'Delete client: Acme' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete client?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(projects.clients()).toHaveLength(0);
    });
    expect(projects.projects()).toHaveLength(1);
    const toast = await findToast('Client deleted.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(projects.clients()).toHaveLength(1);
    });
  });

  it('shows the server message with Try again on an error', async () => {
    const { fake } = projectsSetup({ clients: [acme] });
    const { user } = await openProjects(fake);
    await screen.findByRole('navigation', { name: 'Projects' });
    fake.failNext(500, 'boom', 'The clients are away.', '/clients');
    await user.click(screen.getByRole('button', { name: 'Clients' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The clients are away.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Acme' })).toBeInTheDocument();
  });
});

describe('client page', () => {
  it('shows the details, the total hours and the projects of the client', async () => {
    const other = makeProject({ title: 'Someone else' });
    const { fake } = projectsSetup({
      clients: [acme],
      projects: [site, app, other],
      entries: hours,
    });
    const { user } = await openClients(fake);
    await user.click(await screen.findByRole('button', { name: 'Acme' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    expect(await screen.findByText('2 projects · 2h 30m tracked')).toBeInTheDocument();
    expect(screen.getByText('hi@acme.test')).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Projects of this client' });
    expect(await within(section).findByRole('button', { name: 'Acme site' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Acme app' })).toBeInTheDocument();
    expect(within(section).queryByText('Someone else')).not.toBeInTheDocument();
  });

  it('opens a project from the client page', async () => {
    const { fake } = projectsSetup({ clients: [acme], projects: [site] });
    const { user } = await openClients(fake);
    await user.click(await screen.findByRole('button', { name: 'Acme' }));
    await user.click(await screen.findByRole('button', { name: 'Acme site' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme site' })).toBeInTheDocument();
  });

  it('goes back to the clients with Escape', async () => {
    const { fake } = projectsSetup({ clients: [acme] });
    const { user } = await openClients(fake);
    await user.click(await screen.findByRole('button', { name: 'Acme' }));
    await screen.findByRole('heading', { level: 1, name: 'Acme' });
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Clients' })).toBeInTheDocument();
  });

  it('edits the client', async () => {
    const { fake, projects } = projectsSetup({ clients: [acme] });
    const { user } = await openClients(fake);
    await user.click(await screen.findByRole('button', { name: 'Acme' }));
    await user.click(await screen.findByRole('button', { name: 'Edit client' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit client' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Acme Inc');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Inc' })).toBeInTheDocument();
    expect(projects.clients()[0]?.name).toBe('Acme Inc');
  });
});
