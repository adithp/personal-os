import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useToasts } from '../../../store/toast-store';
import { createFakeApi, makeTask } from '../../../test/fake-api';
import { openLoaded, patches, toastMessages } from './test-utils';

describe('TaskDetailPanel: subtasks', () => {
  function setup() {
    const parent = makeTask({ title: 'Parent' });
    const a = makeTask({ title: 'Sub A', parentTaskId: parent.id, status: 'done', position: 1 });
    const b = makeTask({ title: 'Sub B', parentTaskId: parent.id, position: 2 });
    const c = makeTask({ title: 'Sub C', parentTaskId: parent.id, position: 3 });
    return { parent, a, b, c, fake: createFakeApi([parent, a, b, c]) };
  }

  it('lists subtasks with a progress line', async () => {
    const { parent, fake } = setup();
    await openLoaded(fake, parent.id);
    const list = await screen.findByRole('list', { name: 'Subtasks' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('shows no progress line without subtasks', async () => {
    const task = makeTask();
    await openLoaded(createFakeApi([task]), task.id);
    expect(screen.getByRole('textbox', { name: 'Add a subtask' })).toBeInTheDocument();
    expect(screen.queryByText(/^\d+\/\d+$/)).not.toBeInTheDocument();
  });

  it('adds a subtask with Enter', async () => {
    const { parent, fake } = setup();
    const { user } = await openLoaded(fake, parent.id);
    await screen.findByText('Sub A');
    const box = screen.getByRole('textbox', { name: 'Add a subtask' });
    await user.type(box, 'Sub D{Enter}');
    await waitFor(() => {
      expect(
        fake.calls.find((call) => call.method === 'POST' && call.path === '/tasks')?.body,
      ).toEqual({ title: 'Sub D', parentTaskId: parent.id });
    });
    expect(await screen.findByText('Sub D')).toBeInTheDocument();
    expect(box).toHaveValue('');
    expect(await screen.findByText('1/4')).toBeInTheDocument();
  });

  it('ignores an empty subtask box', async () => {
    const { parent, fake } = setup();
    const { user } = await openLoaded(fake, parent.id);
    await screen.findByText('Sub A');
    await user.type(screen.getByRole('textbox', { name: 'Add a subtask' }), '   {Enter}');
    expect(fake.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('completes a subtask', async () => {
    const { parent, b, fake } = setup();
    const { user } = await openLoaded(fake, parent.id);
    await user.click(await screen.findByRole('checkbox', { name: 'Complete: Sub B' }));
    await waitFor(() => {
      expect(
        fake.calls.some(
          (call) => call.method === 'POST' && call.path === `/tasks/${b.id}/complete`,
        ),
      ).toBe(true);
    });
    expect(await screen.findByText('2/3')).toBeInTheDocument();
  });

  it('reopens a done subtask by setting it back to todo', async () => {
    const { parent, a, fake } = setup();
    const { user } = await openLoaded(fake, parent.id);
    await user.click(await screen.findByRole('checkbox', { name: 'Reopen: Sub A' }));
    await waitFor(() => {
      expect(patches(fake).at(-1)).toMatchObject({
        path: `/tasks/${a.id}`,
        body: { status: 'todo' },
      });
    });
    expect(await screen.findByText('0/3')).toBeInTheDocument();
  });

  it('deletes a subtask with an Undo toast, and Undo brings it back', async () => {
    const { parent, fake } = setup();
    const { user } = await openLoaded(fake, parent.id);
    await user.click(await screen.findByRole('button', { name: 'Delete subtask: Sub B' }));
    await waitFor(() => {
      expect(screen.queryByText('Sub B')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(toastMessages()).toContain('Task deleted.');
    });
    useToasts
      .getState()
      .toasts.find((toast) => toast.action)
      ?.action?.onClick();
    expect(await screen.findByText('Sub B')).toBeInTheDocument();
  });

  it('the delete icon can be reached with Tab', async () => {
    const { parent, fake } = setup();
    const { user } = await openLoaded(fake, parent.id);
    const button = await screen.findByRole('button', { name: 'Delete subtask: Sub A' });
    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.queryByText('Sub A')).not.toBeInTheDocument();
    });
  });

  it('a subtask panel has no Subtasks section', async () => {
    const { a, fake } = setup();
    await openLoaded(fake, a.id);
    expect(screen.queryByRole('textbox', { name: 'Add a subtask' })).not.toBeInTheDocument();
    expect(screen.queryByText('Subtasks')).not.toBeInTheDocument();
  });
});

describe('TaskDetailPanel: Archive, Unarchive, Delete', () => {
  it('Archive closes the panel and offers Undo', async () => {
    const task = makeTask({ title: 'Archive me' });
    const fake = createFakeApi([task]);
    const { user, onClose } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        fake.calls.some(
          (call) => call.method === 'POST' && call.path === `/tasks/${task.id}/archive`,
        ),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(toastMessages()).toContain('Task archived.');
    });
  });

  it('shows Unarchive for an archived task and calls unarchive', async () => {
    const task = makeTask({ archivedAt: '2025-10-02T00:00:00.000Z' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unarchive' }));
    await waitFor(() => {
      expect(
        fake.calls.some(
          (call) => call.method === 'POST' && call.path === `/tasks/${task.id}/unarchive`,
        ),
      ).toBe(true);
    });
  });

  it('Delete closes the panel and offers Undo', async () => {
    const task = makeTask({ title: 'Delete me' });
    const fake = createFakeApi([task]);
    const { user, onClose } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => {
      expect(fake.softDeleted()).toContain(task.id);
    });
    await waitFor(() => {
      expect(toastMessages()).toContain('Task deleted.');
    });
  });

  it('the buttons work with the keyboard', async () => {
    const task = makeTask();
    const fake = createFakeApi([task]);
    const { user, onClose } = await openLoaded(fake, task.id);
    screen.getByRole('button', { name: 'Delete' }).focus();
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('TaskDetailPanel: Escape', () => {
  it('closes the panel from inside a text box', async () => {
    const task = makeTask();
    const fake = createFakeApi([task]);
    const { user, onClose } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('textbox', { name: 'Notes' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the panel from the title box', async () => {
    const task = makeTask();
    const fake = createFakeApi([task]);
    const { user, onClose } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('textbox', { name: 'Title' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
