import type { Note, NoteTemplate } from '@personal-os/shared';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeNote, type FakeApi } from '../../../test/fake-api';
import { renderWithApi } from '../templates/test-harness';
import { DailyList } from './daily-list';
import { useOpenDaily } from './use-open-daily';

const nav = vi.hoisted(() => ({ openNote: vi.fn(), noteId: null as string | null }));
vi.mock('../shell/use-notes-nav', () => ({
  useNotesNav: () => ({ noteId: nav.noteId, place: 'all', openNote: nav.openNote }),
}));

beforeEach(() => {
  nav.openNote.mockReset();
  nav.noteId = null;
});
afterEach(() => {
  vi.useRealTimers();
});

/** A button that opens the daily note of a day (or today). */
function OpenButton({ date }: { date?: string }) {
  const daily = useOpenDaily();
  return (
    <button
      type="button"
      disabled={daily.isPending}
      onClick={() => {
        void daily.open(date);
      }}
    >
      {date ? `Open ${date}` : 'Open today'}
    </button>
  );
}

async function seedTemplate(fake: FakeApi, body: Partial<NoteTemplate> & { name: string }) {
  await fake.api.request('POST', '/note-templates', { body });
}
const dailyCalls = (fake: FakeApi) =>
  fake.calls.filter((call) => call.method === 'POST' && call.path === '/notes/daily');

describe('opening the daily note', () => {
  it('creates today in India time and opens it', async () => {
    // 00:10 on 8 October in India is still 7 October in UTC
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2025-10-07T18:40:00.000Z'));
    const { fake, user } = renderWithApi(<OpenButton />);
    await user.click(screen.getByRole('button', { name: 'Open today' }));
    await waitFor(() => {
      expect(nav.openNote).toHaveBeenCalledTimes(1);
    });
    expect(fake.notes().map((n) => n.title)).toEqual(['2025-10-08']);
    expect(nav.openNote).toHaveBeenCalledWith(fake.notes()[0]?.id);
    expect(dailyCalls(fake)[0]?.body).toEqual({});
  });

  it('is still the same day just before midnight in India', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2025-10-07T18:20:00.000Z'));
    const { fake, user } = renderWithApi(<OpenButton />);
    await user.click(screen.getByRole('button', { name: 'Open today' }));
    await waitFor(() => {
      expect(fake.notes().map((n) => n.title)).toEqual(['2025-10-07']);
    });
  });

  it('opens the same note again instead of making another', async () => {
    const { fake, user } = renderWithApi(<OpenButton date="2025-03-04" />);
    await user.click(screen.getByRole('button', { name: 'Open 2025-03-04' }));
    await waitFor(() => {
      expect(nav.openNote).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole('button', { name: 'Open 2025-03-04' }));
    await waitFor(() => {
      expect(nav.openNote).toHaveBeenCalledTimes(2);
    });
    expect(fake.notes()).toHaveLength(1);
    expect(nav.openNote.mock.calls[1]?.[0]).toBe(nav.openNote.mock.calls[0]?.[0]);
    expect(dailyCalls(fake)[0]?.body).toEqual({ date: '2025-03-04' });
  });

  it('fills the daily template, with the day as the title', async () => {
    const fake = createFakeApi();
    await seedTemplate(fake, {
      name: 'Journal',
      contentMd: '# {{title}}\n\nWritten {{date}}',
      isDailyDefault: true,
    });
    const { user } = renderWithApi(<OpenButton date="2025-03-04" />, fake);
    await user.click(screen.getByRole('button', { name: 'Open 2025-03-04' }));
    await waitFor(() => {
      expect(fake.notes()).toHaveLength(1);
    });
    expect(fake.notes()[0]?.contentMd).toMatch(/^# 2025-03-04\n\nWritten \d{4}-\d{2}-\d{2}$/);
  });

  it('adds (daily) when a normal note already has the day as its title', async () => {
    const fake = createFakeApi([], [], [], [], [makeNote({ title: '2025-03-04' })]);
    const { user } = renderWithApi(<OpenButton date="2025-03-04" />, fake);
    await user.click(screen.getByRole('button', { name: 'Open 2025-03-04' }));
    await waitFor(() => {
      expect(fake.notes().map((n) => n.title)).toContain('2025-03-04 (daily)');
    });
  });

  it('shows the server message and does not open anything when it fails', async () => {
    const fake = createFakeApi();
    fake.failNext(500, 'server_error', 'Daily failed', '/notes/daily');
    const { user } = renderWithApi(<OpenButton />, fake);
    await user.click(screen.getByRole('button', { name: 'Open today' }));
    expect(await screen.findByText('Daily failed')).toBeInTheDocument();
    expect(nav.openNote).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open today' })).toBeEnabled();
  });
});

describe('the Daily notes list', () => {
  const daily = async (fake: FakeApi, date: string) => {
    const answer = await fake.api.request<{ item: Note }>('POST', '/notes/daily', {
      body: { date },
    });
    return answer.item;
  };

  it('lists daily notes newest day first and leaves normal notes out', async () => {
    const fake = createFakeApi([], [], [], [], [makeNote({ title: 'Plain' })]);
    await daily(fake, '2025-10-05');
    await daily(fake, '2025-10-07');
    await daily(fake, '2025-10-06');
    renderWithApi(<DailyList />, fake);
    const list = await screen.findByRole('list', { name: 'Daily notes by day' });
    expect(list.textContent).toBe('2025-10-072025-10-062025-10-05');
    expect(screen.getByText('3 days')).toBeInTheDocument();
    expect(fake.calls.find((c) => c.path === '/notes')?.query).toMatchObject({ dailyOnly: true });
  });

  it('opens a day with a click', async () => {
    const fake = createFakeApi();
    const note = await daily(fake, '2025-10-05');
    const { user } = renderWithApi(<DailyList />, fake);
    await user.click(await screen.findByRole('button', { name: /2025-10-05/ }));
    expect(nav.openNote).toHaveBeenCalledWith(note.id);
  });

  it('says there are no daily notes yet', async () => {
    renderWithApi(<DailyList />);
    expect(await screen.findByText('No daily notes yet')).toBeInTheDocument();
  });
});
