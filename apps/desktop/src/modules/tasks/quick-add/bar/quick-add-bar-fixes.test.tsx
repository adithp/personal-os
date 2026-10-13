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

const barOf = (): HTMLElement => {
  const bar = addBox().closest('form')?.parentElement;
  if (!bar) throw new Error('The quick add bar is missing');
  return bar;
};
const statusOf = () => barOf().querySelector<HTMLElement>('p.sr-only[role="status"]');

describe('ignored parts', () => {
  it('bring their chip back once the words are gone and typed again', async () => {
    const { user } = await openMyTasks();
    await user.type(addBox(), 'Pay rent tomorrow');
    await user.click(await screen.findByRole('button', { name: 'Ignore tomorrow' }));
    expect(screen.queryByRole('button', { name: 'Ignore tomorrow' })).not.toBeInTheDocument();
    await user.clear(addBox());
    await user.type(addBox(), 'Buy milk tomorrow');
    expect(await screen.findByRole('button', { name: 'Ignore tomorrow' })).toBeInTheDocument();
  });

  it('stay ignored while their words are still in the text', async () => {
    const { user } = await openMyTasks();
    await user.type(addBox(), 'Pay rent tomorrow');
    await user.click(await screen.findByRole('button', { name: 'Ignore tomorrow' }));
    await user.type(addBox(), ' soon');
    expect(screen.queryByRole('button', { name: 'Ignore tomorrow' })).not.toBeInTheDocument();
  });
});

describe('when the server refuses', () => {
  it('gives the text back if the box is still empty', async () => {
    const fake = createFakeApi();
    const { user } = await openMyTasks(fake);
    fake.slow(100);
    fake.failNext(400, 'validation_error', 'Title is too long');
    await user.type(addBox(), 'Pay rent tomorrow{Enter}');
    expect(await screen.findByText('Title is too long')).toBeInTheDocument();
    await waitFor(() => {
      expect(addBox()).toHaveValue('Pay rent tomorrow');
    });
  });

  it('keeps the new text when the user already typed while the request was running', async () => {
    const fake = createFakeApi();
    const { user } = await openMyTasks(fake);
    // The server answers after 1.5 s, so the typing is done before the failure on a busy machine too
    fake.slow(1500);
    fake.failNext(400, 'validation_error', 'Title is too long');
    await user.type(addBox(), 'Pay rent{Enter}');
    await user.type(addBox(), 'Walk dog');
    expect(await screen.findByText('Title is too long', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(addBox()).toHaveValue('Walk dog');
  });
});

describe('screen reader announcements', () => {
  it('has no aria-live on the chip row and one always-mounted status summary', async () => {
    const { user } = await openMyTasks();
    expect(statusOf()).toHaveTextContent('');
    await user.type(addBox(), 'Call mom tomorrow 5pm !high');
    expect(screen.getByRole('group', { name: 'Understood from your text' })).not.toHaveAttribute(
      'aria-live',
    );
    await waitFor(() => {
      expect(statusOf()).toHaveTextContent(/^Understood: .*Tomorrow, 5:00 PM.*High/);
    });
  });

  it('updates the summary at once when a chip is ignored', async () => {
    const { user } = await openMyTasks();
    await user.type(addBox(), 'Call mom !high');
    await waitFor(() => {
      expect(statusOf()).toHaveTextContent('Understood: High');
    });
    await user.click(screen.getByRole('button', { name: 'Ignore !high' }));
    await waitFor(
      () => {
        expect(statusOf()).toBeEmptyDOMElement();
      },
      { timeout: 300 },
    );
  });

  it('keeps the "Add a title" line mounted as a status, with text only when needed', async () => {
    const { user } = await openMyTasks();
    const line = barOf().querySelector<HTMLElement>('#quick-add-no-title');
    expect(line).toHaveAttribute('role', 'status');
    expect(line).toBeEmptyDOMElement();
    await user.type(addBox(), '!high');
    expect(line).toHaveTextContent('Add a title');
    await user.clear(addBox());
    expect(line).toBeEmptyDOMElement();
  });
});

describe('look', () => {
  it('reserves one slot under the bar and gives Ignore buttons a 24 px hit area', async () => {
    const { user } = await openMyTasks();
    const slot = screen.getByRole('group', { name: 'Understood from your text' }).parentElement;
    expect(slot).toHaveClass('min-h-5');
    await user.type(addBox(), 'Call mom tomorrow');
    const button = await screen.findByRole('button', { name: 'Ignore tomorrow' });
    expect(button).toHaveClass('size-6', 'rounded-[8px]', 'hover:bg-glass-strong', 'focus-ring');
    expect(button).toHaveClass('text-fg-secondary');
  });

  it.each(['dark', 'light'])(
    'uses no hard-coded colors and has accessible names in %s mode',
    async (theme) => {
      const { user } = await openMyTasks();
      document.documentElement.dataset.theme = theme;
      await user.type(addBox(), 'Call mom tomorrow 5pm #home !high');
      await screen.findByRole('button', { name: 'Ignore !high' });
      const clone = barOf().cloneNode(true) as HTMLElement;
      // The send button's old gradient uses color-mix; it is the only element allowed a style
      clone.querySelector('button[aria-label="Add task"]')?.removeAttribute('style');
      expect(clone.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      expect(screen.getByRole('textbox', { name: 'New task' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Understood from your text' })).toBeInTheDocument();
    },
  );
});
