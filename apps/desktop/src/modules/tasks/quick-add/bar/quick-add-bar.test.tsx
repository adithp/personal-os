import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeTask } from '../../../../test/fake-api';
import {
  addBox,
  openMyTasks,
  resetEverything,
  restoreEverything,
  titles,
} from '../../my-tasks/test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

describe('the quick add bar', () => {
  it('has a placeholder, an accessible name, and is focused when My tasks opens', async () => {
    await openMyTasks();
    const box = await screen.findByRole('textbox', { name: 'New task' });
    expect(box).toHaveAttribute('placeholder', 'Add a task');
    expect(box).toHaveFocus();
  });

  it('is focused when opened from the dashboard New task button', async () => {
    const { user } = await openMyTasks(createFakeApi(), '/');
    await user.click(await screen.findByRole('button', { name: 'New task' }));
    expect(await screen.findByRole('textbox', { name: 'New task' })).toHaveFocus();
  });

  it('adds on Enter with the title only, clears the box, and keeps focus', async () => {
    const { user, fake } = await openMyTasks();
    await screen.findByText(/No tasks yet/);
    await user.type(addBox(), '  Buy milk {Enter}');
    await waitFor(() => {
      expect(titles()).toEqual(['Buy milk']);
    });
    expect(addBox()).toHaveValue('');
    expect(addBox()).toHaveFocus();
    expect(fake.calls.filter((call) => call.method === 'POST')).toEqual([
      { method: 'POST', path: '/tasks', body: { title: 'Buy milk' }, query: undefined },
    ]);
    await user.type(addBox(), 'Second{Enter}');
    await waitFor(() => {
      expect(titles()).toEqual(['Buy milk', 'Second']);
    });
  });

  it('ignores an empty or blank title', async () => {
    const { user, fake } = await openMyTasks(createFakeApi([makeTask({ title: 'Existing' })]));
    await screen.findByText('Existing');
    await user.type(addBox(), '   {Enter}');
    await user.type(addBox(), '{Enter}');
    expect(fake.calls.filter((call) => call.method === 'POST')).toEqual([]);
  });

  it('shows the server’s message and gives the text back when it refuses', async () => {
    const { user, fake } = await openMyTasks();
    await screen.findByText(/No tasks yet/);
    fake.failNext(400, 'validation_error', 'Title is too long');
    await user.type(addBox(), 'x{Enter}');
    expect(await screen.findByText('Title is too long')).toBeInTheDocument();
    expect(titles()).toEqual([]);
    await waitFor(() => {
      expect(addBox()).toHaveValue('x');
    });
  });
});
