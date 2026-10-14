import type * as TauriWindow from '@tauri-apps/api/window';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../../test/fake-api';
import { makeProject, makeTimeEntry } from '../../../test/fake-projects';
import {
  callsTo,
  findToast,
  openProjectPage,
  openProjects,
  projectsSetup,
  resetProjectsEverything,
  restoreEverything,
} from '../test-utils';
import { formatTimer } from '../format';
import { must } from '../../../test/must';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetProjectsEverything);
afterEach(restoreEverything);

const project = makeProject({ title: 'Website' });
const other = makeProject({ title: 'Mobile app' });
const task = makeTask({ title: 'Write copy' });

const seed = () =>
  projectsSetup({
    projects: [project, other],
    tasks: [{ task, projectId: project.id }],
    entries: [
      makeTimeEntry(project.id, {
        startedAt: '2025-10-06T04:00:00.000Z',
        endedAt: '2025-10-06T05:30:00.000Z',
        note: 'Wireframes',
      }),
      makeTimeEntry(other.id, {
        startedAt: '2025-10-01T04:00:00.000Z',
        endedAt: '2025-10-01T04:45:00.000Z',
      }),
    ],
  });

describe('formatTimer', () => {
  it('pads hours, minutes and seconds', () => {
    expect(formatTimer(0)).toBe('00:00:00');
    expect(formatTimer(3725)).toBe('01:02:05');
  });
});

describe('Time tab of a project', () => {
  it('lists the entries of the project with the total', async () => {
    const { fake } = seed();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Time' }));
    expect(await screen.findByText('Total: 1h 30m')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Time entries' });
    expect(within(list).getByText('Wireframes')).toBeInTheDocument();
    expect(within(list).getByText('1h 30m')).toBeInTheDocument();
    expect(within(list).queryByText('45m')).not.toBeInTheDocument();
  });

  it('starts and stops the timer on the project and a task', async () => {
    const { fake, projects } = seed();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Time' }));
    await user.selectOptions(await screen.findByLabelText('Task (optional)'), 'Write copy');
    await user.click(screen.getByRole('button', { name: 'Start timer' }));
    const timer = must((await screen.findAllByRole('timer', { name: 'Running timer' })).at(0));
    expect(within(timer).getByText('00:00:00')).toBeInTheDocument();
    expect(callsTo(fake, 'POST', '/time-entries/start')[0]?.body).toEqual({
      projectId: project.id,
      taskId: task.id,
    });

    await act(async () => {
      vi.setSystemTime(new Date(Date.now() + 65_000));
      await Promise.resolve();
    });
    await user.click(within(timer).getByRole('button', { name: 'Stop' }));
    await waitFor(() => {
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    });
    expect(projects.entries().filter((entry) => entry.endedAt !== null)).toHaveLength(3);
    expect(await findToast('Timer stopped.')).toBeInTheDocument();
  });

  it('adds time by hand and rejects an end before the start', async () => {
    const { fake, projects } = seed();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Time' }));
    await user.click(await screen.findByRole('button', { name: 'Add time' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add time' });

    const setBox = (label: string, value: string) => {
      const box = within(dialog).getByLabelText(label);
      fireEvent.change(box, { target: { value } });
      fireEvent.blur(box);
    };
    setBox('Start', '2025-10-07T10:00');
    setBox('End', '2025-10-07T09:00');
    await user.click(within(dialog).getByRole('button', { name: 'Add time' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('The end must be after the start');
    expect(callsTo(fake, 'POST', '/time-entries')).toHaveLength(0);

    setBox('End', '2025-10-07T11:30');
    await user.click(within(dialog).getByRole('button', { name: 'Add time' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const added = projects
      .entries()
      .find((entry) => entry.startedAt === '2025-10-07T04:30:00.000Z');
    expect(added?.seconds).toBe(5400);
    expect(await screen.findByText('Total: 3h 00m')).toBeInTheDocument();
  });

  it('deletes an entry after a confirmation, with Undo', async () => {
    const { fake, projects } = seed();
    const { user } = await openProjectPage(fake, 'Website');
    await user.click(screen.getByRole('radio', { name: 'Time' }));
    const list = await screen.findByRole('list', { name: 'Time entries' });
    await user.click(within(list).getByRole('button', { name: /^Delete entry/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete time entry?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(projects.entries().filter((entry) => entry.projectId === project.id)).toHaveLength(0);
    });
    const toast = await findToast('Time entry deleted.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(projects.entries().filter((entry) => entry.projectId === project.id)).toHaveLength(1);
    });
  });
});

describe('Time page', () => {
  it('shows totals per project and per week and the recent entries', async () => {
    const { fake } = seed();
    const { user } = await openProjects(fake);
    await user.click(
      within(await screen.findByRole('navigation', { name: 'Projects' })).getByRole('button', {
        name: 'Time',
      }),
    );
    expect(await screen.findByText('2h 15m in the last 8 weeks')).toBeInTheDocument();
    const perProject = await screen.findByRole('list', { name: 'Time per project' });
    expect(within(perProject).getByText('Website')).toBeInTheDocument();
    expect(within(perProject).getByText('1h 30m')).toBeInTheDocument();
    expect(within(perProject).getByText('Mobile app')).toBeInTheDocument();
    expect(within(perProject).getByText('45m')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Time per week' })).getAllByRole('listitem'),
    ).toHaveLength(8);
    const recent = screen.getByRole('list', { name: 'Time entries' });
    expect(within(recent).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows the running timer', async () => {
    const { fake } = seed();
    await fake.api.request('POST', '/time-entries/start', { body: { projectId: other.id } });
    const { user } = await openProjects(fake);
    await user.click(
      within(await screen.findByRole('navigation', { name: 'Projects' })).getByRole('button', {
        name: 'Time',
      }),
    );
    const timer = must((await screen.findAllByRole('timer', { name: 'Running timer' })).at(0));
    expect(timer).toHaveTextContent('Mobile app');
  });

  it('shows the server message with Try again when the totals fail', async () => {
    const { fake } = seed();
    const { user } = await openProjects(fake);
    await screen.findByRole('button', { name: 'Website' });
    fake.failNext(500, 'boom', 'Totals are away.', '/time-entries/summary');
    await user.click(
      within(screen.getByRole('navigation', { name: 'Projects' })).getByRole('button', {
        name: 'Time',
      }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Totals are away.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Time per project' })).toBeInTheDocument();
  });
});
