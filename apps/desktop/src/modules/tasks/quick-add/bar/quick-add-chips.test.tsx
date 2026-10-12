import type * as TauriWindow from '@tauri-apps/api/window';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../../../../test/fake-api';
import {
  addBox,
  openMyTasks,
  resetEverything,
  restoreEverything,
  titles,
} from '../../my-tasks/test-utils';
import type { ParsedQuickAdd, QuickAddPart } from '../parse';
import * as parse from '../parse';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

vi.mock('../parse', async (importOriginal) => ({
  ...(await importOriginal<typeof parse>()),
  parseQuickAdd: vi.fn(),
}));

const parseMock = vi.mocked(parse.parseQuickAdd);

const PARTS = {
  date: { kind: 'date', text: 'tomorrow 5pm', start: 9, end: 21, label: 'Tomorrow, 5:00 PM' },
  priority: { kind: 'priority', text: '!high', start: 22, end: 27, label: 'High' },
  tag: { kind: 'tag', text: '#home', start: 28, end: 33, label: 'home' },
  repeat: { kind: 'repeat', text: 'every month', start: 34, end: 45, label: 'Every month' },
} satisfies Record<string, QuickAddPart>;

const EMPTY: ParsedQuickAdd = {
  title: '',
  dueAt: null,
  dueAllDay: false,
  priority: null,
  tagNames: [],
  recurrenceRule: null,
  parts: [],
};

/** Plain text parses to itself; the magic words below add parts, unless the key is ignored. */
function fakeParse(input: string, _now: Date, ignored: ReadonlySet<string> = new Set()) {
  const text = input.trim();
  if (text === 'only parts') return { ...EMPTY, title: '', parts: [PARTS.tag] };
  if (text !== 'Pay rent all') return { ...EMPTY, title: text };
  const parts = Object.values(PARTS).filter((part) => !ignored.has(parse.partKey(part)));
  const has = (kind: string) => parts.some((part) => part.kind === kind);
  return {
    title: 'Pay rent',
    dueAt: has('date') ? '2025-10-08T11:30:00.000Z' : null,
    dueAllDay: false,
    priority: has('priority') ? (2 as const) : null,
    tagNames: has('tag') ? ['home'] : [],
    recurrenceRule: has('repeat') ? 'FREQ=MONTHLY' : null,
    parts,
  } satisfies ParsedQuickAdd;
}

beforeEach(() => {
  resetEverything();
  parseMock.mockReset();
  parseMock.mockImplementation(fakeParse);
});
afterEach(restoreEverything);

const posts = (fake: { calls: { method: string }[] }) =>
  fake.calls.filter((call) => call.method === 'POST');

describe('the understood chips', () => {
  it('shows nothing when no part is understood', async () => {
    const { user } = await openMyTasks();
    await user.type(addBox(), 'Buy milk');
    expect(screen.getByRole('group', { name: 'Understood from your text' })).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /^Ignore/ })).not.toBeInTheDocument();
  });

  it('shows a chip with its label and an Ignore button for each kind, announced politely', async () => {
    const { user } = await openMyTasks();
    await user.type(addBox(), 'Pay rent all');
    const row = screen.getByRole('group', { name: 'Understood from your text' });
    expect(row).toHaveAttribute('aria-live', 'polite');
    for (const part of Object.values(PARTS)) {
      expect(within(row).getByText(part.label)).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: `Ignore ${part.text}` })).toBeInTheDocument();
    }
    expect(parseMock).toHaveBeenLastCalledWith('Pay rent all', expect.any(Date), expect.any(Set));
  });

  it('ignoring a part removes its chip, parses again with its key, and returns focus to the box', async () => {
    const { user, fake } = await openMyTasks();
    await user.type(addBox(), 'Pay rent all');
    await user.click(screen.getByRole('button', { name: 'Ignore !high' }));
    expect(screen.queryByRole('button', { name: 'Ignore !high' })).not.toBeInTheDocument();
    expect(addBox()).toHaveFocus();
    const lastIgnored = parseMock.mock.lastCall?.[2];
    expect([...(lastIgnored ?? [])]).toEqual(['priority:!high']);
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(posts(fake)).toHaveLength(1);
    });
    const body = (posts(fake)[0] as unknown as { body: Record<string, unknown> }).body;
    expect(body).not.toHaveProperty('priority');
  });
});

describe('adding with understood parts', () => {
  it('sends exactly the understood fields and resets the box and the ignored set', async () => {
    const { user, fake } = await openMyTasks();
    await user.type(addBox(), 'Pay rent all');
    await user.click(screen.getByRole('button', { name: 'Ignore #home' }));
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await waitFor(() => {
      expect(titles()).toEqual(['Pay rent']);
    });
    expect(fake.calls.filter((call) => call.method === 'POST')).toEqual([
      {
        method: 'POST',
        path: '/tasks',
        body: {
          title: 'Pay rent',
          dueAt: '2025-10-08T11:30:00.000Z',
          dueAllDay: false,
          priority: 2,
          recurrenceRule: 'FREQ=MONTHLY',
        },
        query: undefined,
      },
    ]);
    expect(addBox()).toHaveValue('');
    expect(addBox()).toHaveFocus();
    // The ignored set was reset: the same text shows every chip again
    await user.type(addBox(), 'Pay rent all');
    expect(screen.getByRole('button', { name: 'Ignore #home' })).toBeInTheDocument();
  });

  it('sends the tag names when a tag is understood', async () => {
    const { user, fake } = await openMyTasks();
    await user.type(addBox(), 'Pay rent all{Enter}');
    await waitFor(() => {
      expect(posts(fake)).toHaveLength(1);
    });
    expect((posts(fake)[0] as unknown as { body: { tagNames: string[] } }).body.tagNames).toEqual([
      'home',
    ]);
  });

  it('gives the text and the chips back when the server refuses', async () => {
    const { user, fake } = await openMyTasks();
    await screen.findByText(/No tasks yet/);
    fake.failNext(400, 'validation_error', 'Title is too long');
    await user.type(addBox(), 'Pay rent all{Enter}');
    expect(await screen.findByText('Title is too long')).toBeInTheDocument();
    await waitFor(() => {
      expect(addBox()).toHaveValue('Pay rent all');
    });
    expect(screen.getByRole('button', { name: 'Ignore !high' })).toBeInTheDocument();
  });

  it('keeps send off and shows "Add a title" when only parts were typed', async () => {
    const { user, fake } = await openMyTasks();
    await user.type(addBox(), 'only parts');
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled();
    expect(screen.getByText('Add a title')).toBeInTheDocument();
    expect(addBox()).toHaveAccessibleDescription('Add a title');
    await user.keyboard('{Enter}');
    expect(posts(fake)).toEqual([]);
  });
});

describe('the quick add hint', () => {
  it('shows the example while the box is focused and empty, and hides it once typing', async () => {
    const { user } = await openMyTasks();
    const hint = 'Try: Pay rent every month #home !high';
    expect(await screen.findByText(hint)).toBeInTheDocument();
    await user.type(addBox(), 'a');
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    await user.clear(addBox());
    expect(screen.getByText(hint)).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });
});

describe('keyboard and look', () => {
  it('tabs from the box to the send button to the chips’ Ignore buttons', async () => {
    const { user } = await openMyTasks(createFakeApi());
    await user.type(addBox(), 'Pay rent all');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Add task' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ignore tomorrow 5pm' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ignore !high' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('button', { name: 'Ignore !high' })).not.toBeInTheDocument();
  });

  it('uses no hard-coded colors in the chips', async () => {
    const { user } = await openMyTasks();
    await user.type(addBox(), 'Pay rent all');
    const row = screen.getByRole('group', { name: 'Understood from your text' });
    expect(row.innerHTML).not.toMatch(/#[0-9a-f]{6}\b/i);
    expect(row.innerHTML).not.toMatch(/rgb\(/i);
  });
});
