import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../../test/fake-api';
import {
  makeClient,
  makeMilestone,
  makeProject,
  makeProjectNote,
} from '../../../test/fake-projects';
import {
  callsTo,
  findToast,
  openProjectPage,
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

const project = makeProject({
  title: 'Website',
  description: 'Rebuild the marketing site',
  startAt: '2025-09-30T18:30:00.000Z',
  dueAt: '2025-11-30T18:30:00.000Z',
});
const openTask = makeTask({ title: 'Write copy', dueAt: '2025-10-20T06:30:00.000Z' });
const doneTask = makeTask({ title: 'Pick a theme', status: 'done' });
const doingTask = makeTask({ title: 'Build pages', status: 'doing' });

function setup(
  extra: Parameters<typeof projectsSetup>[0] = {},
  others = [makeTask({ title: 'Loose task' })],
) {
  return projectsSetup(
    {
      projects: [project],
      tasks: [
        { task: openTask, projectId: project.id },
        { task: doneTask, projectId: project.id },
        { task: doingTask, projectId: project.id },
      ],
      ...extra,
    },
    others,
  );
}

describe('overview', () => {
  it('shows progress, dates, description and tracked time', async () => {
    const { fake } = setup({
      entries: [
        {
          id: '00000000-0000-4000-8000-000000999001',
          projectId: project.id,
          projectTitle: 'Website',
          taskId: null,
          taskTitle: null,
          startedAt: '2025-10-06T04:00:00.000Z',
          endedAt: '2025-10-06T05:30:00.000Z',
          seconds: 5400,
          note: null,
          createdAt: '2025-10-06T05:30:00.000Z',
        },
      ],
    });
    await openProjectPage(fake, 'Website');
    expect(await screen.findByText('1 of 3 tasks')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('1 Oct 2025')).toBeInTheDocument();
    expect(screen.getByText('1 Dec 2025')).toBeInTheDocument();
    expect(screen.getByText('Rebuild the marketing site')).toBeInTheDocument();
    expect(await screen.findByText('1h 30m')).toBeInTheDocument();
  });

  it('opens the client page from the client link', async () => {
    const client = makeClient({ name: 'Acme' });
    const { fake } = projectsSetup({
      clients: [client],
      projects: [makeProject({ title: 'Website', client: { id: client.id, name: 'Acme' } })],
    });
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('button', { name: 'Acme' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
  });

  it('changes the status from the status menu', async () => {
    const { fake, projects } = setup();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('button', { name: 'Change status' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'On hold' }));
    await waitFor(() => {
      expect(projects.projects()[0]?.status).toBe('on_hold');
    });
    expect(await findToast('Status changed.')).toBeInTheDocument();
  });

  it('edits the project in the dialog', async () => {
    const { fake, projects } = setup();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('button', { name: 'Edit project' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit project' });
    const title = within(dialog).getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Website v2');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Website v2' }),
    ).toBeInTheDocument();
    expect(projects.projects()[0]?.title).toBe('Website v2');
  });

  it('deletes the project after a confirmation and can undo it', async () => {
    const { fake, projects } = setup();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete project?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
    expect(projects.projects()).toHaveLength(0);
    const toast = await findToast('Project deleted.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(projects.projects()).toHaveLength(1);
    });
  });
});

describe('milestones', () => {
  it('adds, ticks, dates and deletes milestones', async () => {
    const existing = makeMilestone(project.id, { title: 'Design signed off' });
    const { fake, projects } = setup({ milestones: [existing] });
    const { user } = await openProjectPage(fake, 'Website');
    expect(await screen.findByText('Design signed off')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'New milestone' }), 'Launch');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Launch')).toBeInTheDocument();
    expect(projects.milestones().map((m) => m.title)).toContain('Launch');

    await user.click(
      screen.getByRole('checkbox', { name: 'Complete milestone: Design signed off' }),
    );
    await waitFor(() => {
      expect(projects.milestones().find((m) => m.id === existing.id)?.doneAt).not.toBeNull();
    });
    expect(
      await screen.findByRole('checkbox', { name: 'Reopen milestone: Design signed off' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('1 of 2 done')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete milestone: Launch' }));
    await waitFor(() => {
      expect(projects.milestones().map((m) => m.title)).toEqual(['Design signed off']);
    });
  });

  it('shows the empty line', async () => {
    const { fake } = setup();
    await openProjectPage(fake, 'Website');
    expect(
      await screen.findByText('No milestones yet. Add the first one below.'),
    ).toBeInTheDocument();
  });
});

describe('tasks tab', () => {
  it('lists the linked tasks and completes one', async () => {
    const { fake } = setup();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Tasks' }));
    expect(await screen.findByText('Write copy')).toBeInTheDocument();
    expect(screen.getByText('Build pages')).toBeInTheDocument();
    expect(screen.getByText('Done (1)')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Complete: Write copy' }));
    await waitFor(() => {
      expect(callsTo(fake, 'POST', `/tasks/${openTask.id}/complete`)).toHaveLength(1);
    });
  });

  it('creates a new task directly in the project', async () => {
    const { fake, projects } = setup();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Tasks' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'New task in this project' }),
      'Review layout{Enter}',
    );
    expect(await screen.findByText('Review layout')).toBeInTheDocument();
    expect(callsTo(fake, 'POST', '/tasks')).toHaveLength(1);
    const created = fake.tasks().find((task) => task.title === 'Review layout');
    expect(created).toBeDefined();
    expect(projects.taskProjectOf(created?.id ?? '')).toBe(project.id);
  });

  it('adds an existing task from the picker', async () => {
    const { fake, projects } = setup();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Tasks' }));
    await user.click(await screen.findByRole('button', { name: 'Add existing task' }));
    await user.click(await screen.findByRole('option', { name: 'Loose task' }));
    const loose = fake.tasks().find((task) => task.title === 'Loose task');
    await waitFor(() => {
      expect(projects.taskProjectOf(loose?.id ?? '')).toBe(project.id);
    });
    expect(await findToast('Added to Website.')).toBeInTheDocument();
  });

  it('takes a task out of the project, with Undo', async () => {
    const { fake, projects } = setup();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Tasks' }));
    await user.click(
      await screen.findByRole('button', { name: 'Remove from project: Write copy' }),
    );
    await waitFor(() => {
      expect(projects.taskProjectOf(openTask.id)).toBeNull();
    });
    const toast = await findToast('Removed from Website.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(projects.taskProjectOf(openTask.id)).toBe(project.id);
    });
  });

  it('opens the task details with the project row', async () => {
    const { fake } = setup();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Tasks' }));
    await user.click(await screen.findByRole('button', { name: 'Write copy' }));
    const panel = await screen.findByRole('complementary', { name: 'Task details' });
    expect(await within(panel).findByRole('link', { name: 'Website' })).toBeInTheDocument();
  });

  it('shows an empty line for a project with no tasks', async () => {
    const { fake } = projectsSetup({ projects: [project] });
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Tasks' }));
    expect(await screen.findByText(/No tasks in this project yet/)).toBeInTheDocument();
  });
});

describe('notes tab', () => {
  it('lists linked notes, links another and unlinks one', async () => {
    const linked = makeProjectNote({ title: 'Kickoff notes' });
    const { fake, projects } = setup({ notes: [{ note: linked, projectId: project.id }] });
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Notes' }));
    expect(await screen.findByRole('link', { name: 'Kickoff notes' })).toHaveAttribute(
      'href',
      expect.stringContaining(`note=${linked.id}`),
    );
    await user.click(screen.getByRole('button', { name: 'Unlink note: Kickoff notes' }));
    await waitFor(() => {
      expect(projects.noteProjectOf(linked.id)).toBeNull();
    });
    expect(await screen.findByText(/No notes linked yet/)).toBeInTheDocument();
  });

  it('links a note chosen in the picker', async () => {
    const { fake, projects } = setup();
    const note = (
      await fake.api.request<{ item: { id: string } }>('POST', '/notes', {
        body: { title: 'Brief' },
      })
    ).item;
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Notes' }));
    await user.click(await screen.findByRole('button', { name: 'Link a note' }));
    await user.click(await screen.findByRole('option', { name: 'Brief' }));
    await waitFor(() => {
      expect(projects.noteProjectOf(note.id)).toBe(project.id);
    });
  });
});

describe('board tab', () => {
  it('shows the project tasks in To do, In progress and Done', async () => {
    const { fake } = setup();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Board' }));
    const todo = await screen.findByRole('region', { name: 'To do' });
    expect(within(todo).getByText('Write copy')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'In progress' })).getByText('Build pages'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Done' })).getByText('Pick a theme'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Loose task')).not.toBeInTheDocument();
  });

  it('completes a card with its checkbox and moves it to Done', async () => {
    const { fake } = setup();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Board' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Complete: Write copy' }));
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'Done' })).getByText('Write copy'),
      ).toBeInTheDocument();
    });
  });
});

describe('timeline tab', () => {
  it('shows dated milestones and tasks with a today marker', async () => {
    const dated = makeMilestone(project.id, {
      title: 'Beta ready',
      dueAt: '2025-11-09T18:30:00.000Z',
    });
    const { fake } = setup({ milestones: [dated] });
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Timeline' }));
    expect(await screen.findByText('Beta ready')).toBeInTheDocument();
    expect(screen.getByText('Write copy')).toBeInTheDocument();
    expect(screen.getByTestId('today-marker')).toBeInTheDocument();
    expect(document.querySelector('[data-kind="milestone"]')).not.toBeNull();
    expect(document.querySelector('[data-kind="task"]')).not.toBeNull();
    // Tasks without a due date are not on the timeline
    expect(screen.queryByText('Build pages')).not.toBeInTheDocument();
  });

  it('says so when nothing is dated', async () => {
    const { fake } = projectsSetup({ projects: [makeProject({ title: 'Plain' })] });
    const { user } = await openProjectPage(fake, 'Plain');
    await user.click(screen.getByRole('radio', { name: 'Timeline' }));
    expect(await screen.findByText(/Nothing dated yet/)).toBeInTheDocument();
  });
});
