import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../../test/fake-api';
import { makeClient, makeProject } from '../../../test/fake-projects';
import {
  callsTo,
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

describe('projects list states', () => {
  it('shows the loading line while the projects load', async () => {
    const { fake } = projectsSetup({ projects: [makeProject({ title: 'Website' })] });
    fake.slow(200);
    await openProjects(fake);
    expect(await screen.findByText('Loading projects…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Website' })).toBeInTheDocument();
  });

  it('shows the first-project card when there is none', async () => {
    const { fake } = projectsSetup();
    await openProjects(fake);
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New project' })).toHaveLength(2);
  });

  it('shows the server message with Try again on an error, and recovers', async () => {
    const { fake } = projectsSetup({ projects: [makeProject({ title: 'Website' })] });
    fake.failNext(500, 'boom', 'The projects are away.', '/projects');
    const { user } = await openProjects(fake);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The projects are away.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Website' })).toBeInTheDocument();
  });
});

describe('project cards', () => {
  it('show status, client, due date, progress and tracked time', async () => {
    const client = makeClient({ name: 'Acme' });
    const project = makeProject({
      title: 'Website',
      client: { id: client.id, name: client.name },
      dueAt: '2025-12-30T18:30:00.000Z',
      color: '#F7D96B',
    });
    const { fake } = projectsSetup({
      clients: [client],
      projects: [project],
      tasks: [
        { task: makeTask({ title: 'A', status: 'done' }), projectId: project.id },
        { task: makeTask({ title: 'B' }), projectId: project.id },
      ],
    });
    await openProjects(fake);
    const card = (await screen.findByRole('button', { name: 'Website' })).closest(
      'li',
    ) as HTMLElement;
    expect(within(card).getByText('Active')).toBeInTheDocument();
    expect(within(card).getByText('Acme')).toBeInTheDocument();
    expect(within(card).getByText('Due 31 Dec 2025')).toBeInTheDocument();
    expect(within(card).getByText('1 of 2 tasks')).toBeInTheDocument();
    expect(within(card).getByText('50%')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar', { name: 'Tasks done: 1 of 2' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
  });

  it('mark an active project past its due day as overdue', async () => {
    const { fake } = projectsSetup({
      projects: [makeProject({ title: 'Late', dueAt: '2025-10-05T18:30:00.000Z' })],
    });
    await openProjects(fake);
    expect(await screen.findByText('Overdue: 6 Oct 2025')).toHaveClass('text-danger');
  });

  it('are filtered by status', async () => {
    const { fake } = projectsSetup({
      projects: [
        makeProject({ title: 'Live one' }),
        makeProject({ title: 'Paused one', status: 'on_hold' }),
      ],
    });
    const { user } = await openProjects(fake);
    await screen.findByRole('button', { name: 'Live one' });
    expect(screen.getByRole('button', { name: 'Paused one' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'On hold' }));
    expect(screen.queryByRole('button', { name: 'Live one' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paused one' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Done' }));
    expect(await screen.findByText('No projects with this status')).toBeInTheDocument();
  });
});

describe('new project', () => {
  it('creates a project with a quick new client and opens it', async () => {
    const { fake, projects } = projectsSetup({ projects: [makeProject({ title: 'Existing' })] });
    const { user } = await openProjects(fake);
    await screen.findByRole('button', { name: 'Existing' });
    await user.click(screen.getByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Brand site');
    await user.selectOptions(within(dialog).getByLabelText('Client'), 'New client…');
    await user.type(within(dialog).getByRole('textbox', { name: 'New client name' }), 'Globex');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Brand site' })).toBeInTheDocument();
    expect(callsTo(fake, 'POST', '/clients')).toHaveLength(1);
    const created = projects.projects().find((project) => project.title === 'Brand site');
    expect(created?.client?.name).toBe('Globex');
  });

  it('asks for a title', async () => {
    const { fake } = projectsSetup();
    const { user } = await openProjects(fake);
    await user.click((await screen.findAllByRole('button', { name: 'New project' }))[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Add a title');
    expect(callsTo(fake, 'POST', '/projects')).toHaveLength(0);
  });

  it('closes with Escape', async () => {
    const { fake } = projectsSetup();
    const { user } = await openProjects(fake);
    await user.click((await screen.findAllByRole('button', { name: 'New project' }))[0] as HTMLElement);
    await screen.findByRole('dialog', { name: 'New project' });
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('keyboard', () => {
  it('N opens the new project dialog, and not while typing', async () => {
    const { fake } = projectsSetup({ projects: [makeProject({ title: 'Website' })] });
    const { user } = await openProjects(fake);
    await screen.findByRole('button', { name: 'Website' });
    await user.keyboard('n');
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    // Typing an n in the title does not open another dialog
    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'nnn');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('J and K move between cards, Enter opens, Escape goes back', async () => {
    const { fake } = projectsSetup({
      projects: [makeProject({ title: 'Alpha' }), makeProject({ title: 'Beta' })],
    });
    const { user } = await openProjects(fake);
    await screen.findByRole('button', { name: 'Beta' });
    await user.keyboard('j');
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveFocus();
    await user.keyboard('j');
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveFocus();
    await user.keyboard('k');
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
  });

  it('? shows the help and Escape closes it', async () => {
    const { fake } = projectsSetup({ projects: [makeProject({ title: 'Website' })] });
    const { user } = await openProjects(fake);
    await screen.findByRole('button', { name: 'Website' });
    await user.keyboard('?');
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('side panel', () => {
  it('switches between projects, clients and time', async () => {
    const { fake } = projectsSetup({ clients: [makeClient({ name: 'Acme' })] });
    const { user } = await openProjects(fake);
    const nav = await screen.findByRole('navigation', { name: 'Projects' });
    await user.click(within(nav).getByRole('button', { name: 'Clients' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Clients' })).toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: 'Time' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Time' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Time' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('collapses to icons and remembers it', async () => {
    const { fake } = projectsSetup();
    const { user } = await openProjects(fake);
    await user.click(await screen.findByRole('button', { name: 'Collapse side panel' }));
    expect(screen.getByRole('button', { name: 'Expand side panel' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(localStorage.getItem('personal-os.projects-ui')).toContain('"sidePanelCollapsed":true');
  });
});

describe('colors', () => {
  it('uses no hard-coded color in the markup of the list', async () => {
    const { fake } = projectsSetup({ projects: [makeProject({ title: 'Website' })] });
    await openProjects(fake);
    await screen.findByRole('button', { name: 'Website' });
    expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
