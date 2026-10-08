import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../../../api/providers';
import { createFakeApi, makeTask } from '../../../test/fake-api';
import { resetEverything, restoreEverything } from '../my-tasks/test-utils';
import { useTasksUi } from '../tasks-ui-store';
import { BoardView } from './board-view';

const NOW = new Date('2025-10-07T09:30:00.000Z');

const todo = makeTask({ title: 'Write plan', status: 'todo' });
const todo2 = makeTask({ title: 'Buy milk', status: 'todo' });
const doing = makeTask({ title: 'Build board', status: 'doing' });

/** jsdom has no layout: give columns and cards boxes so keyboard dragging can find its way. */
function fakeLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const label = this.getAttribute('aria-label') ?? '';
    const column = ['To do tasks', 'In progress tasks', 'Done tasks'].indexOf(label);
    const card = this.closest('ul')?.getAttribute('aria-label') ?? '';
    const col =
      column >= 0 ? column : ['To do tasks', 'In progress tasks', 'Done tasks'].indexOf(card);
    const row = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0;
    const isColumn = column >= 0;
    const left = Math.max(col, 0) * 300;
    const top = isColumn ? 0 : 40 + row * 100;
    return new DOMRect(left, top, 280, isColumn ? 600 : 80);
  });
}

function setup(manualSort = true, tasks = [todo, todo2, doing]) {
  const fake = createFakeApi(tasks);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <AppProviders api={fake.api} queryClient={client}>
      <BoardView tasks={tasks} now={NOW} manualSort={manualSort} />
    </AppProviders>,
  );
  return { fake, user: userEvent.setup() };
}

const column = (name: string) => screen.getByRole('region', { name });

beforeEach(resetEverything);
afterEach(restoreEverything);

describe('BoardView', () => {
  it('shows three columns with counts and the cards in the right column', () => {
    setup();
    expect(within(column('To do')).getByRole('heading', { name: /To do/ })).toHaveTextContent('2');
    expect(within(column('In progress')).getByRole('heading')).toHaveTextContent('1');
    expect(within(column('To do')).getByText('Write plan')).toBeInTheDocument();
    expect(within(column('In progress')).getByText('Build board')).toBeInTheDocument();
    expect(within(column('Done')).getByText('Nothing here')).toBeInTheDocument();
  });

  it('leaves the "Sort is not Manual" hint to the page, so it shows only once', () => {
    setup(false);
    expect(screen.queryByText('Sort is not Manual, so reordering is off.')).not.toBeInTheDocument();
  });

  it('opens a card in the detail panel by selecting it', async () => {
    const { user } = setup();
    await user.click(within(column('To do')).getByText('Write plan'));
    expect(useTasksUi.getState().selectedTaskId).toBe(todo.id);
  });

  it('moves a card to In progress with the keyboard', async () => {
    fakeLayout();
    const { fake, user } = setup();
    screen.getByRole('button', { name: 'Drag Write plan' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowRight}');
    await user.keyboard(' ');
    await waitFor(() => {
      expect(
        fake.calls.some((call) => call.method === 'POST' && call.path === `/tasks/${todo.id}/move`),
      ).toBe(true);
    });
    const call = fake.calls.find((c) => c.path === `/tasks/${todo.id}/move`);
    expect(call?.body).toMatchObject({ status: 'doing' });
  });

  it('moves a card to Done with the keyboard', async () => {
    fakeLayout();
    const { fake, user } = setup();
    screen.getByRole('button', { name: 'Drag Write plan' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{ArrowRight}');
    await user.keyboard(' ');
    await waitFor(() => {
      expect(fake.calls.find((c) => c.path === `/tasks/${todo.id}/move`)?.body).toMatchObject({
        status: 'done',
      });
    });
  });

  it('announces the pickup for screen readers', async () => {
    fakeLayout();
    const { user } = setup();
    screen.getByRole('button', { name: 'Drag Write plan' }).focus();
    await user.keyboard(' ');
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /Write plan is over (To do column|Write plan)/,
      );
    });
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.getByText('Dragging Write plan was cancelled.')).toBeInTheDocument();
    });
  });
});
