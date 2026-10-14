import type { NoteTemplate } from '@personal-os/shared';
import type { Editor } from '@tiptap/core';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, type FakeApi } from '../../../test/fake-api';
import { TEMPLATE_SAVE_DELAY_MS } from './template-body';
import { renderWithApi } from './test-harness';
import { TemplatesView } from './templates-view';

beforeAll(() => {
  // ProseMirror measures text when it scrolls the cursor into view
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect });
});
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

async function seed(fake: FakeApi, input: Partial<NoteTemplate> & { name: string }) {
  const answer = await fake.api.request<{ item: NoteTemplate }>('POST', '/note-templates', {
    body: input,
  });
  return answer.item;
}
const templateCalls = (fake: FakeApi, method: string, path: RegExp) =>
  fake.calls.filter((call) => call.method === method && path.test(call.path));
const editorOf = (): Editor => {
  const dom = document.querySelector<HTMLElement & { editor?: Editor }>('.ProseMirror');
  if (!dom?.editor) throw new Error('editor not mounted');
  return dom.editor;
};
const rowNames = () =>
  within(screen.getByRole('list', { name: 'Templates' }))
    .getAllByRole('button')
    .map((b) => b.textContent);

describe('templates list', () => {
  it('says there are no templates and makes one with New template', async () => {
    const { fake, user } = renderWithApi(<TemplatesView />);
    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    await user.click(screen.getByLabelText('New template'));
    await waitFor(() => {
      expect(fake.noteTemplates().map((t) => t.name)).toEqual(['Untitled template']);
    });
    const name = await screen.findByRole('textbox', { name: 'Template name' });
    expect(name).toHaveValue('Untitled template');
    expect(name).toHaveFocus();

    await user.click(screen.getByLabelText('New template'));
    await waitFor(() => {
      expect(fake.noteTemplates().map((t) => t.name)).toContain('Untitled template 2');
    });
  });

  it('lists templates by name with a Daily marker on the daily one', async () => {
    const fake = createFakeApi();
    await seed(fake, { name: 'Weekly' });
    await seed(fake, { name: 'Journal', isDailyDefault: true });
    renderWithApi(<TemplatesView />, fake);
    await screen.findByRole('list', { name: 'Templates' });
    expect(rowNames()).toEqual(['JournalDaily', 'Weekly']);
  });

  it('shows the error message with Try again when the list cannot load', async () => {
    const fake = createFakeApi();
    fake.failNext(500, 'server_error', 'Server is down', '/note-templates');
    const { user } = renderWithApi(<TemplatesView />, fake);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server is down');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
  });
});

describe('renaming', () => {
  it('renames on Enter', async () => {
    const fake = createFakeApi();
    await seed(fake, { name: 'Weekly' });
    const { user } = renderWithApi(<TemplatesView />, fake);
    const name = await screen.findByRole('textbox', { name: 'Template name' });
    await user.clear(name);
    await user.type(name, 'Review{Enter}');
    await waitFor(() => {
      expect(fake.noteTemplates()[0]?.name).toBe('Review');
    });
    await waitFor(() => {
      expect(rowNames()).toEqual(['Review']);
    });
  });

  it('says so when the name is taken and puts the old name back on Escape', async () => {
    const fake = createFakeApi();
    await seed(fake, { name: 'Weekly' });
    await seed(fake, { name: 'Review' });
    const { user } = renderWithApi(<TemplatesView />, fake);
    await screen.findByRole('list', { name: 'Templates' });
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    const name = screen.getByRole('textbox', { name: 'Template name' });
    await user.clear(name);
    await user.type(name, 'review{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('A template with this name exists.');
    expect(name).toBeInvalid();
    expect(
      fake
        .noteTemplates()
        .map((t) => t.name)
        .sort(),
    ).toEqual(['Review', 'Weekly']);
    await user.keyboard('{Escape}');
    expect(name).toHaveValue('Weekly');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the daily template', () => {
  it('lets only one template be used for daily notes', async () => {
    const fake = createFakeApi();
    await seed(fake, { name: 'A', isDailyDefault: true });
    await seed(fake, { name: 'B' });
    const { user } = renderWithApi(<TemplatesView />, fake);
    await screen.findByRole('list', { name: 'Templates' });
    expect(screen.getByRole('switch', { name: 'Use for daily notes' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'B' }));
    const toggle = screen.getByRole('switch', { name: 'Use for daily notes' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await waitFor(() => {
      expect(rowNames()).toEqual(['A', 'BDaily']);
    });
    expect(
      fake
        .noteTemplates()
        .filter((t) => t.isDailyDefault)
        .map((t) => t.name),
    ).toEqual(['B']);
    expect(toggle).toBeChecked();
  });
});

describe('deleting', () => {
  it('deletes with an Undo toast that brings the template back', async () => {
    const fake = createFakeApi();
    await seed(fake, { name: 'Weekly' });
    const { user } = renderWithApi(<TemplatesView />, fake);
    await user.click(await screen.findByRole('button', { name: 'Delete template' }));
    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    expect(fake.noteTemplates()).toHaveLength(0);

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(rowNames()).toEqual(['Weekly']);
    });
    expect(templateCalls(fake, 'POST', /\/restore$/)).toHaveLength(1);
  });

  it('shows the server message when a delete fails', async () => {
    const fake = createFakeApi();
    await seed(fake, { name: 'Weekly' });
    const { user } = renderWithApi(<TemplatesView />, fake);
    const button = await screen.findByRole('button', { name: 'Delete template' });
    fake.failNext(500, 'server_error', 'Could not delete');
    await user.click(button);
    expect(await screen.findByText('Could not delete')).toBeInTheDocument();
  });
});

describe('the template text', () => {
  it('shows the variables hint and saves typed text after a short wait', async () => {
    const fake = createFakeApi();
    await seed(fake, { name: 'Weekly', contentMd: 'Hello' });
    renderWithApi(<TemplatesView />, fake);
    expect(await screen.findByText('Variables: {{title}}, {{date}}, {{time}}')).toBeInTheDocument();
    await screen.findByText('Hello');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    act(() => {
      editorOf().chain().focus('end').insertContent(' {{date}}').run();
    });
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(templateCalls(fake, 'PATCH', /^\/note-templates\//)).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(TEMPLATE_SAVE_DELAY_MS + 50));
    vi.useRealTimers();
    await waitFor(() => {
      expect(fake.noteTemplates()[0]?.contentMd).toBe('Hello {{date}}');
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('keeps [[x]] as plain text, not a link', async () => {
    const fake = createFakeApi();
    await seed(fake, { name: 'Weekly', contentMd: 'See [[Other]]' });
    renderWithApi(<TemplatesView />, fake);
    expect(await screen.findByText('See [[Other]]')).toBeInTheDocument();
    expect(document.querySelector('[data-type="wikiLink"], .wikilink')).toBeNull();
  });

  it('says Could not save when the save fails', async () => {
    const fake = createFakeApi();
    await seed(fake, { name: 'Weekly', contentMd: 'Hello' });
    renderWithApi(<TemplatesView />, fake);
    await screen.findByText('Hello');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fake.failNext(500, 'server_error', 'Nope');
    act(() => {
      editorOf().chain().focus('end').insertContent('!').run();
    });
    await act(() => vi.advanceTimersByTimeAsync(TEMPLATE_SAVE_DELAY_MS + 50));
    vi.useRealTimers();
    expect(await screen.findByText('Could not save')).toBeInTheDocument();
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });
});
