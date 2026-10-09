import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, makeTask } from '../../../test/fake-api';
import { lastPatch, openLoaded, patches } from './test-utils';

// 01:30 on Tuesday 7 October in India, still Monday 6 October in UTC
const DUE_TUESDAY = '2025-10-06T20:00:00.000Z';
// 01:30 on 1 November in India, still 31 October in UTC
const DUE_FIRST = '2025-10-31T20:00:00.000Z';

async function chooseOption(user: Awaited<ReturnType<typeof openLoaded>>['user'], name: string) {
  await user.click(screen.getByRole('button', { name: /^Repeat:/ }));
  await user.click(await screen.findByRole('menuitemradio', { name }));
}

describe('TaskDetailPanel: repeat', () => {
  it('lists the five options and marks the current one', async () => {
    const task = makeTask({ dueAt: DUE_TUESDAY, recurrenceRule: 'FREQ=DAILY' });
    const { user } = await openLoaded(createFakeApi([task]), task.id);
    await user.click(screen.getByRole('button', { name: 'Repeat: Every day' }));
    const names = screen.getAllByRole('menuitemradio').map((item) => item.textContent);
    expect(names).toEqual([
      'Does not repeat',
      'Every day',
      'Every week',
      'Every month',
      'Every year',
    ]);
    expect(screen.getByRole('menuitemradio', { name: 'Every day' })).toBeChecked();
  });

  it('Every week starts on the weekday of the due date in India time and saves at once', async () => {
    const task = makeTask({ dueAt: DUE_TUESDAY });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    await chooseOption(user, 'Every week');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU' });
    });
    expect(await screen.findByRole('button', { name: 'Tue', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mon', pressed: false })).toBeInTheDocument();
  });

  it('toggling weekday chips saves the days in week order and keeps at least one', async () => {
    const task = makeTask({ dueAt: DUE_TUESDAY, recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Mon' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,TU' });
    });
    await user.click(screen.getByRole('button', { name: 'Tue' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO' });
    });
    const saved = patches(fake).length;
    await user.click(await screen.findByRole('button', { name: 'Mon', pressed: true }));
    expect(patches(fake)).toHaveLength(saved);
    expect(screen.getByRole('button', { name: 'Mon', pressed: true })).toBeInTheDocument();
  });

  it('Every month starts on the day of the month of the due date in India time', async () => {
    const task = makeTask({ dueAt: DUE_FIRST });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    await chooseOption(user, 'Every month');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ recurrenceRule: 'FREQ=MONTHLY;BYMONTHDAY=1' });
    });
    const box = await screen.findByRole('spinbutton', { name: 'Day of the month' });
    expect(box).toHaveValue(1);
  });

  it('the day of the month saves when you press Enter, and a bad day is ignored', async () => {
    const task = makeTask({ dueAt: DUE_FIRST, recurrenceRule: 'FREQ=MONTHLY;BYMONTHDAY=1' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    const box = screen.getByRole('spinbutton', { name: 'Day of the month' });
    await user.clear(box);
    await user.type(box, '40{Enter}');
    expect(patches(fake)).toHaveLength(0);
    expect(box).toHaveValue(1);
    await user.clear(box);
    await user.type(box, '15{Enter}');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ recurrenceRule: 'FREQ=MONTHLY;BYMONTHDAY=15' });
    });
    expect(await screen.findByRole('button', { name: /Every month on the 15th/ })).toBeVisible();
  });

  it('Every day and Every year save their presets', async () => {
    const task = makeTask({ dueAt: DUE_TUESDAY });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    await chooseOption(user, 'Every day');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ recurrenceRule: 'FREQ=DAILY' });
    });
    await chooseOption(user, 'Every year');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ recurrenceRule: 'FREQ=YEARLY' });
    });
  });

  it('Does not repeat saves null', async () => {
    const task = makeTask({ dueAt: DUE_TUESDAY, recurrenceRule: 'FREQ=DAILY' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    await chooseOption(user, 'Does not repeat');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ recurrenceRule: null });
    });
    expect(await screen.findByRole('button', { name: 'Repeat: Does not repeat' })).toBeVisible();
  });

  it('is off with a quiet hint when the task has no due date', async () => {
    const task = makeTask();
    await openLoaded(createFakeApi([task]), task.id);
    expect(screen.getByRole('button', { name: 'Repeat: Does not repeat' })).toBeDisabled();
    expect(screen.getByText('Set a due date to repeat')).toBeVisible();
  });

  it('shows a rule that is not a preset as read-only text', async () => {
    const task = makeTask({ dueAt: DUE_TUESDAY, recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2' });
    await openLoaded(createFakeApi([task]), task.id);
    expect(screen.getByText('FREQ=WEEKLY;INTERVAL=2')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Repeat:/ })).not.toBeInTheDocument();
  });

  it('works with the keyboard: Enter opens, arrows move, Enter picks, Escape closes only the menu', async () => {
    const task = makeTask({ dueAt: DUE_TUESDAY });
    const fake = createFakeApi([task]);
    const { user, onClose } = await openLoaded(fake, task.id);
    screen.getByRole('button', { name: /^Repeat:/ }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitemradio', { name: 'Does not repeat' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Every day' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Enter}{ArrowDown}{Enter}');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ recurrenceRule: 'FREQ=DAILY' });
    });
  });

  it('adds no hard-coded colors', async () => {
    const task = makeTask({ dueAt: DUE_TUESDAY, recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU' });
    const { user } = await openLoaded(createFakeApi([task]), task.id);
    await user.click(screen.getByRole('button', { name: /^Repeat:/ }));
    expect(document.documentElement.innerHTML).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});
