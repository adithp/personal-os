import type { Task } from '@personal-os/shared';
import { screen } from '@testing-library/react';
import { createFakeApi, type FakeApi } from '../../test/fake-api';
import { currentProjectsFake, type ProjectsSeed } from '../../test/fake-projects';
import { openMyTasks, resetEverything } from '../tasks/my-tasks/test-utils';
import { resetProjectsUi } from './projects-ui-store';

export { findToast, restoreEverything } from '../tasks/my-tasks/test-utils';

/** Clean stores and a fake clock (3 PM on Tuesday 7 October 2025 in India), before each test. */
export function resetProjectsEverything() {
  resetEverything();
  resetProjectsUi();
}

/** A mock API with the given Projects data; `otherTasks` are tasks that are in no project. */
export function projectsSetup(seed: ProjectsSeed = {}, otherTasks: Task[] = []) {
  const fake = createFakeApi([...(seed.tasks ?? []).map(({ task }) => task), ...otherTasks]);
  const projects = currentProjectsFake();
  projects.seed(seed);
  return { fake, projects };
}

/** Opens the Projects page. */
export async function openProjects(fake: FakeApi) {
  return openMyTasks(fake, '/projects');
}

/** Opens the Projects page and then the project card with this title. */
export async function openProjectPage(fake: FakeApi, title: string) {
  const opened = await openProjects(fake);
  await opened.user.click(await screen.findByRole('button', { name: title }));
  await screen.findByRole('heading', { level: 1, name: title });
  return opened;
}

export const callsTo = (fake: FakeApi, method: string, path: string) =>
  fake.calls.filter((call) => call.method === method && call.path === path);
