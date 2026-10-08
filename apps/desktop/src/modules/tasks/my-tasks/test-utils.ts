import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { usePalette } from '../../../store/palette-store';
import { useSettings } from '../../../store/settings-store';
import { useToasts } from '../../../store/toast-store';
import { createFakeApi, type FakeApi } from '../../../test/fake-api';
import { signedInAuth } from '../../../test/fake-auth';
import { renderApp } from '../../../test/render-app';
import { resetTasksUi } from '../tasks-ui-store';

/** 3:00 PM on Tuesday 7 October 2025 in India. */
export const NOW = '2025-10-07T09:30:00.000Z';

export function resetEverything() {
  localStorage.clear();
  resetTasksUi();
  usePalette.setState({ open: false, query: '' });
  useSettings.getState().reset();
  useToasts.getState().clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  // Only the clock is fake, so promises and timers behave normally
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
}

export function restoreEverything() {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

export async function openMyTasks(
  fake: FakeApi = createFakeApi(),
  path = '/tasks/my-tasks',
): Promise<{
  router: Awaited<ReturnType<typeof renderApp>>;
  fake: FakeApi;
  user: ReturnType<typeof userEvent.setup>;
}> {
  const router = await renderApp(path, signedInAuth().auth, fake.api);
  return { router, fake, user: userEvent.setup() };
}

/** Every card or row on the page, in order. */
export const items = () => [...document.querySelectorAll<HTMLElement>('[data-item-key]')];

/** The titles of the cards or rows, in order. */
export const titles = () =>
  items().map((el) =>
    (el.querySelector('[role="checkbox"]')?.getAttribute('aria-label') ?? '').replace(
      /^(Complete|Reopen): /,
      '',
    ),
  );

/** The card or row with this title. */
export const itemOf = (title: string): HTMLElement => {
  const found = items().find((el) => titles()[items().indexOf(el)] === title);
  if (!found) throw new Error(`No task item titled "${title}"`);
  return found;
};

/** The toast with this text. (dnd-kit also keeps a hidden role "status" for spoken announcements.) */
export const findToast = (text: string): Promise<HTMLElement> =>
  waitFor(() => {
    const toast = [...screen.queryAllByRole('status'), ...screen.queryAllByRole('alert')].find(
      (el) => el.textContent.includes(text),
    );
    if (!toast) throw new Error(`No toast with "${text}"`);
    return toast;
  });

export const addBox = () => screen.getByRole('textbox', { name: 'New task' });
