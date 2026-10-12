import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../../../../test/fake-api';
import { addBox, openMyTasks, resetEverything, restoreEverything } from '../../my-tasks/test-utils';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

beforeEach(resetEverything);
afterEach(restoreEverything);

// The clock is Tuesday 7 October 2025, 3:00 PM in India (see resetEverything)
describe('the quick add bar with the real parser', () => {
  it('turns one sentence into a task with a date, a tag, a priority, and a repeat', async () => {
    const fake = createFakeApi();
    const { user } = await openMyTasks(fake);
    await user.type(addBox(), 'Call mom tomorrow 5pm #family !high every week');

    const chips = await screen.findByRole('group', { name: 'Understood from your text' });
    expect(chips).toHaveTextContent('Tomorrow, 5:00 PM');
    expect(chips).toHaveTextContent('High');
    expect(chips).toHaveTextContent('family');
    expect(chips).toHaveTextContent('Every week on Wed');

    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(fake.calls.some((call) => call.method === 'POST' && call.path === '/tasks')).toBe(
        true,
      );
    });
    const body = fake.calls.find((call) => call.method === 'POST' && call.path === '/tasks')?.body;
    expect(body).toMatchObject({
      title: 'Call mom',
      dueAt: '2025-10-08T11:30:00.000Z',
      dueAllDay: false,
      priority: 2,
      tagNames: ['family'],
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=WE',
    });
  });

  it('keeps the words of a part you switch off in the title', async () => {
    const fake = createFakeApi();
    const { user } = await openMyTasks(fake);
    await user.type(addBox(), 'Plan sprint tomorrow');
    await user.click(await screen.findByRole('button', { name: 'Ignore tomorrow' }));
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(fake.calls.some((call) => call.method === 'POST' && call.path === '/tasks')).toBe(
        true,
      );
    });
    const body = fake.calls.find((call) => call.method === 'POST' && call.path === '/tasks')?.body;
    expect(body).toMatchObject({ title: 'Plan sprint tomorrow' });
    expect(body).not.toHaveProperty('dueAt');
  });
});
