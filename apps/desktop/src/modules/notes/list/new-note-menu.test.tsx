import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeFolder, type FakeApi } from '../../../test/fake-api';
import { renderWithApi } from '../templates/test-harness';
import { NewNoteMenu } from './new-note-menu';

async function seed(fake: FakeApi, name: string, contentMd = '') {
  await fake.api.request('POST', '/note-templates', { body: { name, contentMd } });
}
const noteCalls = (fake: FakeApi) =>
  fake.calls.filter((call) => call.method === 'POST' && call.path === '/notes');

describe('NewNoteMenu', () => {
  it('creates a blank note at once when there are no templates', async () => {
    const onCreated = vi.fn();
    const { fake, user } = renderWithApi(<NewNoteMenu onCreated={onCreated} />);
    await waitFor(() => {
      expect(fake.calls.some((c) => c.path === '/note-templates')).toBe(true);
    });
    await user.click(screen.getByRole('button', { name: 'New note' }));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(fake.notes().map((n) => n.title)).toEqual(['Untitled']);
  });

  it('offers Blank note and the templates, and creates from a template', async () => {
    const fake = createFakeApi();
    await seed(fake, 'Meeting', '# {{title}}\n\n{{date}} {{time}}');
    await seed(fake, 'Book');
    const onCreated = vi.fn();
    const { user } = renderWithApi(<NewNoteMenu onCreated={onCreated} />, fake);
    const button = screen.getByRole('button', { name: 'New note' });
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
    });
    await user.click(button);
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['Blank note', 'Book', 'Meeting']);

    await user.click(screen.getByRole('menuitem', { name: 'Meeting' }));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const template = fake.noteTemplates().find((t) => t.name === 'Meeting');
    expect(noteCalls(fake)[0]?.body).toEqual({ templateId: template?.id });
    expect(fake.notes()[0]?.contentMd).toMatch(/^# Untitled\n\n\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('works with the keyboard: arrows, Enter, and Escape gives the focus back', async () => {
    const fake = createFakeApi();
    await seed(fake, 'Book');
    const onCreated = vi.fn();
    const { user } = renderWithApi(<NewNoteMenu onCreated={onCreated} />, fake);
    const button = screen.getByRole('button', { name: 'New note' });
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
    });
    button.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'Blank note' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Book' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
    expect(noteCalls(fake)).toHaveLength(1);
  });

  it('puts the note in the folder', async () => {
    const work = makeFolder({ name: 'Work' });
    const fake = createFakeApi([], [], [], [], [], [work]);
    await seed(fake, 'Book');
    const { user } = renderWithApi(<NewNoteMenu folderId={work.id} onCreated={vi.fn()} />, fake);
    const button = screen.getByRole('button', { name: 'New note' });
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
    });
    await user.click(button);
    await user.click(screen.getByRole('menuitem', { name: 'Blank note' }));
    await waitFor(() => {
      expect(fake.notes()).toHaveLength(1);
    });
    expect(noteCalls(fake)[0]?.body).toEqual({ folderId: work.id });
  });

  it('shows the server message when creating fails and does not report a note', async () => {
    const fake = createFakeApi();
    await seed(fake, 'Book');
    const onCreated = vi.fn();
    const { user } = renderWithApi(<NewNoteMenu onCreated={onCreated} />, fake);
    const button = screen.getByRole('button', { name: 'New note' });
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
    });
    await user.click(button);
    fake.failNext(500, 'server_error', 'Could not create', '/notes');
    await user.click(screen.getByRole('menuitem', { name: 'Book' }));
    expect(await screen.findByText('Could not create')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
