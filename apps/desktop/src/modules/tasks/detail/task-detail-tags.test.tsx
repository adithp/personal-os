import { TAG_PALETTE } from '@personal-os/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, makeTag, makeTask } from '../../../test/fake-api';
import { lastPatch, openLoaded, patches } from './test-utils';

const ref = (tag: { id: string; name: string; color: string }) => ({
  id: tag.id,
  name: tag.name,
  color: tag.color,
});

function setup() {
  const work = makeTag({ name: 'work', color: TAG_PALETTE[0] });
  const home = makeTag({ name: 'home', color: TAG_PALETTE[1] });
  const task = makeTask({ tags: [ref(work)] });
  const fake = createFakeApi([task], [work, home]);
  return { work, home, task, fake };
}

describe('TaskDetailPanel: tags', () => {
  it('shows all of the task tags as chips', async () => {
    const tags = ['a', 'b', 'c', 'd'].map((name) => makeTag({ name }));
    const task = makeTask({ tags: tags.map(ref) });
    await openLoaded(createFakeApi([task], tags), task.id);
    expect(screen.getAllByTestId('tag-chip')).toHaveLength(4);
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it('lists the user tags with a check on the ones on the task', async () => {
    const { task, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: 'work' })).toBeChecked();
    expect(screen.getByRole('menuitemcheckbox', { name: 'home' })).not.toBeChecked();
  });

  it('toggling a tag saves the whole set at once', async () => {
    const { work, home, task, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'home' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ tagIds: [work.id, home.id] });
    });
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'work' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ tagIds: [home.id] });
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('tag-chip')).toHaveLength(1);
    });
  });

  it('Enter in the new tag box creates the tag and puts it on the task', async () => {
    const { work, task, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.type(await screen.findByRole('textbox', { name: 'New tag' }), 'errands{Enter}');
    await waitFor(() => {
      expect(fake.tags().map((tag) => tag.name)).toContain('errands');
    });
    const created = fake.tags().find((tag) => tag.name === 'errands');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ tagIds: [work.id, created?.id] });
    });
  });

  it('an existing name (any case) reuses the tag', async () => {
    const { home, work, task, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.type(await screen.findByRole('textbox', { name: 'New tag' }), 'HOME{Enter}');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ tagIds: [work.id, home.id] });
    });
    expect(fake.tags()).toHaveLength(2);
  });

  it('shows the validation message for a name with a space or #', async () => {
    const { task, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    const box = await screen.findByRole('textbox', { name: 'New tag' });
    await user.type(box, 'two words{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A tag name has no spaces or # characters',
    );
    expect(patches(fake)).toHaveLength(0);
    expect(fake.tags()).toHaveLength(2);
  });

  it('recolors a tag from the chip menu', async () => {
    const { work, task, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Tag work' }));
    const swatches = await screen.findAllByRole('menuitemradio');
    expect(swatches).toHaveLength(TAG_PALETTE.length);
    expect(swatches[0]).toBeChecked();
    const fourth = swatches.at(3);
    if (!fourth) throw new Error('missing swatch');
    await user.click(fourth);
    await waitFor(() => {
      expect(
        fake.calls.find((call) => call.method === 'PATCH' && call.path === `/tags/${work.id}`)
          ?.body,
      ).toEqual({ color: TAG_PALETTE[3] });
    });
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
  });

  it('removes a tag from this task via the chip menu', async () => {
    const { task, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Tag work' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from task' }));
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ tagIds: [] });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('tag-chip')).not.toBeInTheDocument();
    });
    expect(fake.tags()).toHaveLength(2);
  });
});

describe('TaskDetailPanel: tag menus and keyboard', () => {
  it('Escape closes the menu first, then the panel', async () => {
    const { task, fake } = setup();
    const { user, onClose } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await screen.findByRole('menu', { name: 'Tags' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Tags' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add tag' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the chip menu first too', async () => {
    const { task, fake } = setup();
    const { user, onClose } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Tag work' }));
    await screen.findByRole('menu', { name: 'Tag work options' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Tag work options' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape in the new tag box closes the menu, not the panel', async () => {
    const { task, fake } = setup();
    const { user, onClose } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('textbox', { name: 'New tag' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'New tag' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the menu on an outside click', async () => {
    const { task, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await screen.findByRole('menu', { name: 'Tags' });
    await user.click(screen.getByText('Repeat'));
    expect(screen.queryByRole('menu', { name: 'Tags' })).not.toBeInTheDocument();
  });

  it('is usable with the keyboard only', async () => {
    const { work, home, task, fake } = setup();
    const { user } = await openLoaded(fake, task.id);
    screen.getByRole('button', { name: 'Add tag' }).focus();
    await user.keyboard('{Enter}');
    // The checked tag has focus first; arrow to the next one and toggle it with Space
    expect(await screen.findByRole('menuitemcheckbox', { name: 'work' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemcheckbox', { name: 'home' })).toHaveFocus();
    await user.keyboard(' ');
    await waitFor(() => {
      expect(lastPatch(fake)).toEqual({ tagIds: [work.id, home.id] });
    });
    const menu = screen.getByRole('menu', { name: 'Tags' });
    expect(within(menu).getByRole('textbox', { name: 'New tag' })).toBeInTheDocument();
  });
});
