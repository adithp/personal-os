import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../test/fake-api';
import { makeProject } from '../../test/fake-projects';
import { openLoaded, toastMessages } from '../tasks/detail/test-utils';
import { useToasts } from '../../store/toast-store';
import { projectsSetup, resetProjectsEverything, restoreEverything } from './test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetProjectsEverything);
afterEach(restoreEverything);

const website = makeProject({ title: 'Website' });
const mobile = makeProject({ title: 'Mobile app' });
const paused = makeProject({ title: 'Paused one', status: 'on_hold' });

describe('TaskProjectRow in the task details', () => {
  it('shows No project in muted text for a task without one', async () => {
    const task = makeTask({ title: 'Loose' });
    const { fake } = projectsSetup({ projects: [website] }, [task]);
    await openLoaded(fake, task.id);
    expect(await screen.findByText('Project')).toBeInTheDocument();
    expect(screen.getByText('No project')).toHaveClass('text-fg-muted');
  });

  it('shows the project of the task as a chip', async () => {
    const task = makeTask({ title: 'In a project' });
    const { fake } = projectsSetup({
      projects: [website],
      tasks: [{ task, projectId: website.id }],
    });
    await openLoaded(fake, task.id);
    expect(await screen.findByRole('link', { name: 'Website' })).toBeInTheDocument();
  });

  it('puts the task in an active project and offers Undo', async () => {
    const task = makeTask({ title: 'Loose' });
    const { fake, projects } = projectsSetup({ projects: [website, mobile, paused] }, [task]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(await screen.findByRole('button', { name: 'Change project' }));
    const menu = await screen.findByRole('menu', { name: 'Projects' });
    // Only active projects are offered
    expect(
      within(menu).queryByRole('menuitemradio', { name: 'Paused one' }),
    ).not.toBeInTheDocument();
    await user.click(await within(menu).findByRole('menuitemradio', { name: 'Website' }));
    await waitFor(() => {
      expect(projects.taskProjectOf(task.id)).toBe(website.id);
    });
    await waitFor(() => {
      expect(toastMessages()).toContain('Added to Website.');
    });
    expect(await screen.findByRole('link', { name: 'Website' })).toBeInTheDocument();
    useToasts.getState().toasts.at(-1)?.action?.onClick();
    await waitFor(() => {
      expect(projects.taskProjectOf(task.id)).toBeNull();
    });
  });

  it('moves the task to another project and takes it out', async () => {
    const task = makeTask({ title: 'Moving' });
    const { fake, projects } = projectsSetup({
      projects: [website, mobile],
      tasks: [{ task, projectId: website.id }],
    });
    const { user } = await openLoaded(fake, task.id);
    await screen.findByRole('link', { name: 'Website' });
    await user.click(screen.getByRole('button', { name: 'Change project' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Mobile app' }));
    await waitFor(() => {
      expect(projects.taskProjectOf(task.id)).toBe(mobile.id);
    });
    await waitFor(() => {
      expect(toastMessages()).toContain('Moved to Mobile app.');
    });

    await screen.findByRole('link', { name: 'Mobile app' });
    await user.click(screen.getByRole('button', { name: 'Change project' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'No project' }));
    await waitFor(() => {
      expect(projects.taskProjectOf(task.id)).toBeNull();
    });
    await waitFor(() => {
      expect(toastMessages()).toContain('Removed from Mobile app.');
    });
  });

  it('says a subtask follows its parent', async () => {
    const parent = makeTask({ title: 'Parent' });
    const child = makeTask({ title: 'Child', parentTaskId: parent.id });
    const { fake } = projectsSetup({ projects: [website] }, [parent, child]);
    await openLoaded(fake, child.id);
    // The Goal row says the same
    expect(await screen.findByText('Same project as the parent task')).toBeInTheDocument();
  });
});
