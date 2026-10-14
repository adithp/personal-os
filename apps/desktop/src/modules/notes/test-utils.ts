import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { usePalette } from '../../store/palette-store';
import { useSettings } from '../../store/settings-store';
import { useToasts } from '../../store/toast-store';
import { createFakeApi, type FakeApi } from '../../test/fake-api';
import { signedInAuth } from '../../test/fake-auth';
import { renderApp } from '../../test/render-app';
import { resetNotesUi } from './notes-ui-store';

/** 3:00 PM on Tuesday 7 October 2025 in India. */
export const NOW = '2025-10-07T09:30:00.000Z';

export function resetEverything() {
  localStorage.clear();
  resetNotesUi();
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

export async function openNotes(fake: FakeApi = createFakeApi(), path = '/notes') {
  const router = await renderApp(path, signedInAuth().auth, fake.api);
  return { router, fake, user: userEvent.setup() };
}

/** The titles of the rows in the note list, in order. */
export const rowTitles = () =>
  [...document.querySelectorAll<HTMLElement>('[data-note-row]')].map(
    (row) => row.querySelector('.font-medium')?.textContent ?? '',
  );

/** The list row of a note, found by its title. */
export const rowOf = (title: string): HTMLElement => {
  const row = [...document.querySelectorAll<HTMLElement>('[data-note-row]')].find(
    (el) => el.querySelector('.font-medium')?.textContent === title,
  );
  if (!row) throw new Error(`No note row titled "${title}"`);
  return row;
};

/** The toast with this text. */
export const findToast = (text: string): Promise<HTMLElement> =>
  waitFor(() => {
    const toast = [...screen.queryAllByRole('status'), ...screen.queryAllByRole('alert')].find(
      (el) => el.textContent.includes(text),
    );
    if (!toast) throw new Error(`No toast with "${text}"`);
    return toast;
  });

export const callsTo = (fake: FakeApi, method: string, path: string) =>
  fake.calls.filter((call) => call.method === method && call.path === path);

/** The New note button in the list header (an empty list shows a second one in its message). */
export const newNoteButton = (): HTMLElement => {
  const [first] = screen.getAllByRole('button', { name: 'New note' });
  if (!first) throw new Error('No New note button');
  return first;
};

/** The "more options" button of a note's row. */
export const rowMore = (title: string): HTMLElement => {
  const item = rowOf(title).parentElement;
  if (!item) throw new Error('Row has no list item');
  return within(item).getByRole('button', { name: /More options/ });
};
