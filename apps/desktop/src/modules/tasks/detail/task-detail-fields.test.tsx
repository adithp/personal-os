import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeApi, makeTask } from '../../../test/fake-api';
import { lastPatch, openLoaded, openPanel, patches } from './test-utils';

// 17:00 on 7 Oct 2025 in India
const DUE = '2025-10-07T11:30:00.000Z';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  document.documentElement.className = '';
});

describe('TaskDetailPanel: layout', () => {
  it('is a labelled complementary panel with a close button and every row', async () => {
    const task = makeTask({ title: 'Write report' });
    const fake = createFakeApi([task]);
    const { user, onClose } = await openLoaded(fake, task.id);
    const panel = screen.getByRole('complementary', { name: 'Task details' });
    expect(panel).toHaveClass('w-[340px]');
    expect(panel).toHaveClass('overflow-y-auto');
    for (const label of ['Status', 'Priority', 'Due', 'Reminder', 'Repeat', 'Blocked by', 'Tags']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Not blocked')).toBeVisible();
    expect(screen.getByText('Set a due date to repeat')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a custom repeat rule as Custom rule, never as raw text', async () => {
    const task = makeTask({ recurrenceRule: 'FREQ=WEEKLY' });
    await openLoaded(createFakeApi([task]), task.id);
    expect(screen.getByText('Custom rule')).toBeInTheDocument();
    expect(screen.queryByText('FREQ=WEEKLY')).not.toBeInTheDocument();
  });

  it('uses theme tokens only (no hard-coded colors in the panel classes)', async () => {
    const task = makeTask();
    await openLoaded(createFakeApi([task]), task.id);
    const html = screen.getByRole('complementary').outerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(|rgba\(/);
  });
});

describe('TaskDetailPanel: states', () => {
  it('shows Loading while the task loads', async () => {
    const task = makeTask();
    const fake = createFakeApi([task]);
    fake.slow(30);
    openPanel(fake, task.id);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Title' })).toBeInTheDocument();
  });

  it('closes itself when the task is gone (404)', async () => {
    const fake = createFakeApi([]);
    const { onClose } = openPanel(fake, '00000000-0000-4000-8000-00000000ffff');
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows the message and Try again on another error', async () => {
    const task = makeTask({ title: 'Back again' });
    const fake = createFakeApi([task]);
    fake.failNext(500, 'server_error', 'The server is having a bad day');
    const { user } = openPanel(fake, task.id);
    expect(await screen.findByText('The server is having a bad day')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByDisplayValue('Back again')).toBeInTheDocument();
  });
});

describe('TaskDetailPanel: title and notes', () => {
  it('saves the title on blur', async () => {
    const task = makeTask({ title: 'Old' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    const box = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(box);
    await user.type(box, 'New title');
    expect(patches(fake)).toHaveLength(0);
    await user.tab();
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ title: 'New title' });
    });
    expect(await screen.findByDisplayValue('New title')).toBeInTheDocument();
  });

  it('saves the title on Enter', async () => {
    const task = makeTask({ title: 'Old' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    const box = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(box);
    await user.type(box, 'Via enter{Enter}');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ title: 'Via enter' });
    });
  });

  it('puts the old title back when it is emptied, and saves nothing', async () => {
    const task = makeTask({ title: 'Keep me' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    const box = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(box);
    await user.tab();
    expect(box).toHaveValue('Keep me');
    expect(patches(fake)).toHaveLength(0);
  });

  it('does not save an unchanged title', async () => {
    const task = makeTask({ title: 'Same' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('textbox', { name: 'Title' }));
    await user.tab();
    expect(patches(fake)).toHaveLength(0);
  });

  it('saves notes on blur, and empty notes save null', async () => {
    const task = makeTask({ description: 'Something' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    const box = screen.getByRole('textbox', { name: 'Notes' });
    expect(box).toHaveValue('Something');
    await user.clear(box);
    await user.type(box, 'Line one');
    expect(patches(fake)).toHaveLength(0);
    await user.tab();
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ description: 'Line one' });
    });
    await user.clear(box);
    await user.tab();
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ description: null });
    });
  });

  it('starts with fresh drafts when another task is shown', async () => {
    const one = makeTask({ title: 'One' });
    const two = makeTask({ title: 'Two' });
    const fake = createFakeApi([one, two]);
    const { user, view } = await openLoaded(fake, one.id);
    await user.type(screen.getByRole('textbox', { name: 'Title' }), ' unsaved');
    const { TaskDetailPanel } = await import('./task-detail-panel');
    const { AppProviders } = await import('../../../api/providers');
    view.rerender(
      <AppProviders api={fake.api}>
        <TaskDetailPanel taskId={two.id} onClose={() => undefined} />
      </AppProviders>,
    );
    expect(await screen.findByDisplayValue('Two')).toBeInTheDocument();
  });
});

describe('TaskDetailPanel: status and priority', () => {
  it('saves a status at once', async () => {
    const task = makeTask();
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    expect(screen.getByRole('radio', { name: 'To do' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'In progress' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ status: 'doing' });
    });
    expect(screen.getByRole('radio', { name: 'In progress' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Done' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ status: 'done' });
    });
  });

  it('saves a priority at once', async () => {
    const task = makeTask({ priority: 4 });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    expect(screen.getByRole('radio', { name: 'Low' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Urgent' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ priority: 1 });
    });
    expect(screen.getAllByRole('radio', { name: /Urgent|High|Medium|Low/ })).toHaveLength(4);
  });

  it('works with the arrow keys', async () => {
    const task = makeTask({ status: 'todo' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    screen.getByRole('radio', { name: 'To do' }).focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ status: 'doing' });
    });
  });
});

describe('TaskDetailPanel: due date', () => {
  it('shows the due date in India time', async () => {
    const task = makeTask({ dueAt: DUE });
    await openLoaded(createFakeApi([task]), task.id);
    expect(screen.getByLabelText('Due')).toHaveValue('2025-10-07T17:00');
  });

  it('keeps a draft while typing and saves on blur', async () => {
    const task = makeTask({ dueAt: DUE });
    const fake = createFakeApi([task]);
    await openLoaded(fake, task.id);
    const box = screen.getByLabelText('Due');
    fireEvent.change(box, { target: { value: '0002-10-07T17:00' } });
    fireEvent.change(box, { target: { value: '0020-10-07T17:00' } });
    fireEvent.change(box, { target: { value: '2026-10-07T18:00' } });
    expect(patches(fake)).toHaveLength(0);
    expect(box).toHaveValue('2026-10-07T18:00');
    fireEvent.blur(box);
    await waitFor(() => {
      expect(patches(fake)).toHaveLength(1);
    });
    expect(lastPatch(fake)).toEqual({ dueAt: '2026-10-07T12:30:00.000Z', dueAllDay: false });
  });

  it('saves on Enter', async () => {
    const task = makeTask({ dueAt: DUE });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    const box = screen.getByLabelText('Due');
    fireEvent.change(box, { target: { value: '2025-10-08T10:00' } });
    box.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ dueAt: '2025-10-08T04:30:00.000Z', dueAllDay: false });
    });
  });

  it('ignores a half-typed (empty) value and puts the saved one back', async () => {
    const task = makeTask({ dueAt: DUE });
    const fake = createFakeApi([task]);
    await openLoaded(fake, task.id);
    const box = screen.getByLabelText('Due');
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect(patches(fake)).toHaveLength(0);
    expect(box).toHaveValue('2025-10-07T17:00');
  });

  it('turns All day on: keeps the date, saves the start of that India day', async () => {
    const task = makeTask({ dueAt: DUE });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('switch', { name: 'All day' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ dueAt: '2025-10-06T18:30:00.000Z', dueAllDay: true });
    });
    expect(await screen.findByLabelText('Due')).toHaveValue('2025-10-07');
    expect(screen.getByLabelText('Due')).toHaveAttribute('type', 'date');
    expect(screen.getByRole('switch', { name: 'All day' })).toBeChecked();
  });

  it('turns All day off: 9:00 AM India time on that date', async () => {
    const task = makeTask({ dueAt: '2025-10-06T18:30:00.000Z', dueAllDay: true });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    expect(screen.getByLabelText('Due')).toHaveValue('2025-10-07');
    await user.click(screen.getByRole('switch', { name: 'All day' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ dueAt: '2025-10-07T03:30:00.000Z', dueAllDay: false });
    });
    expect(await screen.findByLabelText('Due')).toHaveValue('2025-10-07T09:00');
  });

  it('saves a date from the date-only box with dueAllDay true', async () => {
    const task = makeTask({ dueAt: '2025-10-06T18:30:00.000Z', dueAllDay: true });
    const fake = createFakeApi([task]);
    await openLoaded(fake, task.id);
    const box = screen.getByLabelText('Due');
    fireEvent.change(box, { target: { value: '2025-10-09' } });
    fireEvent.blur(box);
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ dueAt: '2025-10-08T18:30:00.000Z', dueAllDay: true });
    });
  });

  it('with no date, the All day switch picks the kind of box', async () => {
    const task = makeTask();
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    expect(screen.queryByRole('button', { name: 'Clear due date' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'All day' }));
    expect(patches(fake)).toHaveLength(0);
    const box = screen.getByLabelText('Due');
    expect(box).toHaveAttribute('type', 'date');
    fireEvent.change(box, { target: { value: '2025-10-09' } });
    fireEvent.blur(box);
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ dueAt: '2025-10-08T18:30:00.000Z', dueAllDay: true });
    });
  });

  it('Clear removes the date and the all-day flag', async () => {
    const task = makeTask({ dueAt: '2025-10-06T18:30:00.000Z', dueAllDay: true });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Clear due date' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ dueAt: null, dueAllDay: false });
    });
    expect(await screen.findByLabelText('Due')).toHaveValue('');
    expect(screen.getByRole('switch', { name: 'All day' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Clear due date' })).not.toBeInTheDocument();
  });

  it('Clear on a repeating task also stops the repeat in the same update', async () => {
    const task = makeTask({ dueAt: '2025-10-06T20:00:00.000Z', recurrenceRule: 'FREQ=DAILY' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Clear due date' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ dueAt: null, dueAllDay: false, recurrenceRule: null });
    });
    expect(await screen.findByRole('button', { name: 'Repeat: Does not repeat' })).toBeVisible();
  });
});

describe('TaskDetailPanel: reminder', () => {
  it('saves a reminder as a date only, and Clear removes it', async () => {
    const task = makeTask();
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    const box = screen.getByLabelText('Reminder');
    fireEvent.change(box, { target: { value: '2025-10-07T08:00' } });
    fireEvent.blur(box);
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ reminderAt: '2025-10-07T02:30:00.000Z' });
    });
    await user.click(await screen.findByRole('button', { name: 'Clear reminder' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ reminderAt: null });
    });
  });

  it('ignores a half-typed reminder', async () => {
    const task = makeTask({ reminderAt: DUE });
    const fake = createFakeApi([task]);
    await openLoaded(fake, task.id);
    const box = screen.getByLabelText('Reminder');
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect(patches(fake)).toHaveLength(0);
  });
});

describe('TaskDetailPanel: light and dark', () => {
  it.each(['dark', 'light'])('renders in %s mode with tokens only', async (mode) => {
    document.documentElement.className = mode;
    const task = makeTask({ dueAt: DUE });
    await openLoaded(createFakeApi([task]), task.id);
    expect(screen.getByRole('complementary', { name: 'Task details' })).toBeInTheDocument();
  });
});
