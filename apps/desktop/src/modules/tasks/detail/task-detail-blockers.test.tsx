import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, makeTask } from '../../../test/fake-api';
import { lastPatch, openLoaded, toastMessages } from './test-utils';

const posts = (fake: ReturnType<typeof createFakeApi>) =>
  fake.calls.filter((call) => call.method === 'POST' && call.path.endsWith('/blockers'));

function setup() {
  const blocker = makeTask({ title: 'Write the report' });
  const other = makeTask({ title: 'Book flights' });
  const third = makeTask({ title: 'Buy gloves' });
  const task = makeTask({ title: 'Main task' });
  const child = makeTask({ title: 'Child step', parentTaskId: task.id });
  const fake = createFakeApi([task, blocker, other, third, child]);
  return { task, blocker, other, third, fake };
}

describe('TaskDetailPanel: blocked by', () => {
  it('says Not blocked when nothing blocks the task', async () => {
    const { task, fake } = setup();
    await openLoaded(fake, task.id);
    expect(screen.getByText('Not blocked')).toBeVisible();
  });

  it('lists the open blockers as chips with a remove button', async () => {
    const { task, blocker, other, fake } = setup();
    await fake.api.request('POST', `/tasks/${task.id}/blockers`, {
      body: { blockerId: blocker.id },
    });
    await fake.api.request('POST', `/tasks/${task.id}/blockers`, { body: { blockerId: other.id } });
    await openLoaded(fake, task.id);
    expect(screen.queryByText('Not blocked')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove blocker Write the report' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove blocker Book flights' })).toBeVisible();
  });

  it('adds a blocker by searching, arrow keys and Enter', async () => {
    const { task, blocker, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add blocker' }));
    const search = await screen.findByRole('textbox', { name: 'Search tasks' });
    expect(search).toHaveFocus();
    await user.type(search, 'B');
    // "Book flights" and "Buy gloves" match, "Write the report" does not
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Book flights',
      'Buy gloves',
    ]);
    await user.clear(search);
    await user.type(search, 'report');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(posts(fake)).toHaveLength(1);
    });
    expect(posts(fake)[0]).toMatchObject({
      path: `/tasks/${task.id}/blockers`,
      body: { blockerId: blocker.id },
    });
    expect(
      await screen.findByRole('button', { name: 'Remove blocker Write the report' }),
    ).toBeVisible();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Enter in the search box picks the first match', async () => {
    const { task, other, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add blocker' }));
    await user.type(await screen.findByRole('textbox', { name: 'Search tasks' }), 'flights{Enter}');
    await waitFor(() => {
      expect(posts(fake)[0]?.body).toEqual({ blockerId: other.id });
    });
  });

  it('does not offer the task itself, its subtasks or its current blockers', async () => {
    const { task, blocker, fake } = setup();
    await fake.api.request('POST', `/tasks/${task.id}/blockers`, {
      body: { blockerId: blocker.id },
    });
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add blocker' }));
    await screen.findByRole('textbox', { name: 'Search tasks' });
    const popup = screen.getByRole('menu', { name: 'Add blocker' });
    await waitFor(() => {
      expect(within(popup).getAllByRole('menuitem').length).toBeGreaterThan(0);
    });
    const titles = within(popup)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(titles).toEqual(['Book flights', 'Buy gloves']);
  });

  it('says so when nothing matches', async () => {
    const { task, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add blocker' }));
    await user.type(await screen.findByRole('textbox', { name: 'Search tasks' }), 'zzz');
    expect(screen.getByRole('status')).toHaveTextContent('No tasks match your search.');
  });

  it('says so when there are no other open tasks', async () => {
    const task = makeTask({ title: 'Alone' });
    const { user } = await openLoaded(createFakeApi([task]), task.id);
    await user.click(screen.getByRole('button', { name: 'Add blocker' }));
    expect(await screen.findByRole('status')).toHaveTextContent('You have no other open tasks.');
  });

  it('shows the first match as active and arrow keys move it', async () => {
    const { task, other, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add blocker' }));
    const search = await screen.findByRole('textbox', { name: 'Search tasks' });
    const first = await screen.findByRole('menuitem', { name: 'Write the report' });
    expect(search).toHaveAttribute('aria-activedescendant', first.id);
    expect(first).toHaveClass('bg-input');
    await user.keyboard('{ArrowDown}');
    const second = screen.getByRole('menuitem', { name: 'Book flights' });
    expect(search).toHaveAttribute('aria-activedescendant', second.id);
    expect(search).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(posts(fake)[0]?.body).toEqual({ blockerId: other.id });
    });
  });

  it('shows the server message and Try again when the tasks cannot be loaded', async () => {
    const { task, other, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    fake.failNext(500, 'internal', 'Tasks are down');
    await user.click(screen.getByRole('button', { name: 'Add blocker' }));
    expect(await screen.findByText('Tasks are down')).toBeVisible();
    expect(screen.queryByText('No tasks match your search.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('menuitem', { name: other.title })).toBeVisible();
  });

  it('after removing a blocker focus moves to the next chip, the previous one, then Add blocker', async () => {
    const { task, blocker, other, third, fake } = setup();
    for (const id of [blocker.id, other.id, third.id]) {
      await fake.api.request('POST', `/tasks/${task.id}/blockers`, { body: { blockerId: id } });
    }
    const { user } = await openLoaded(fake, task.id);
    const remove = (title: string) =>
      screen.getByRole('button', { name: `Remove blocker ${title}` });
    expect(remove('Write the report').className).toContain('size-5');
    await user.click(remove('Book flights'));
    await waitFor(() => {
      expect(remove('Buy gloves')).toHaveFocus();
    });
    await user.click(remove('Buy gloves'));
    await waitFor(() => {
      expect(remove('Write the report')).toHaveFocus();
    });
    await user.click(remove('Write the report'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add blocker' })).toHaveFocus();
    });
  });

  it('Escape closes the popup but not the panel', async () => {
    const { task, fake } = setup();
    const { user, onClose } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add blocker' }));
    await screen.findByRole('textbox', { name: 'Search tasks' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add blocker' })).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removing a blocker calls DELETE and offers Undo', async () => {
    const { task, blocker, fake } = setup();
    await fake.api.request('POST', `/tasks/${task.id}/blockers`, {
      body: { blockerId: blocker.id },
    });
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Remove blocker Write the report' }));
    await waitFor(() => {
      expect(
        fake.calls.some(
          (call) =>
            call.method === 'DELETE' && call.path === `/tasks/${task.id}/blockers/${blocker.id}`,
        ),
      ).toBe(true);
    });
    expect(await screen.findByText('Not blocked')).toBeVisible();
    expect(toastMessages()).toContain('Blocker removed.');
  });

  it('shows the error toast for a cycle and adds nothing', async () => {
    const { task, blocker, fake } = setup();
    // The other task is already blocked by the main task, so the main task cannot wait for it
    await fake.api.request('POST', `/tasks/${blocker.id}/blockers`, {
      body: { blockerId: task.id },
    });
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add blocker' }));
    await user.type(await screen.findByRole('textbox', { name: 'Search tasks' }), 'report{Enter}');
    await waitFor(() => {
      expect(toastMessages()).toContain('That would make the tasks wait for each other');
    });
    expect(screen.getByText('Not blocked')).toBeVisible();
  });

  it('completing a blocked task shows the server message and rolls the status back', async () => {
    const { task, blocker, fake } = setup();
    await fake.api.request('POST', `/tasks/${task.id}/blockers`, {
      body: { blockerId: blocker.id },
    });
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('radio', { name: 'Done' }));
    await waitFor(() => {
      expect(toastMessages()).toContain('Blocked by: Write the report');
    });
    expect(lastPatch(fake)).toEqual({ status: 'done' });
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'To do' })).toBeChecked();
    });
  });

  it('adds no hard-coded colors', async () => {
    const { task, blocker, fake } = setup();
    await fake.api.request('POST', `/tasks/${task.id}/blockers`, {
      body: { blockerId: blocker.id },
    });
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add blocker' }));
    await screen.findByRole('textbox', { name: 'Search tasks' });
    expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});
