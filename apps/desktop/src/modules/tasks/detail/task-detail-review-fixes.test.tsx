import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, makeTag, makeTask } from '../../../test/fake-api';
import { openLoaded, patches } from './test-utils';

const ref = (tag: { id: string; name: string; color: string }) => ({
  id: tag.id,
  name: tag.name,
  color: tag.color,
});

describe('fixes from the Feature 1 review', () => {
  it('saves a note you were typing when you press Escape, then closes', async () => {
    const task = makeTask({ title: 'Plan' });
    const fake = createFakeApi([task]);
    const { user, onClose } = await openLoaded(fake, task.id);
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'Draft text');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => {
      expect(fake.tasks()[0]?.description).toBe('Draft text');
    });
  });

  it('saves a title you were typing when you press Escape', async () => {
    const task = makeTask({ title: 'Old' });
    const fake = createFakeApi([task]);
    const { user } = await openLoaded(fake, task.id);
    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'New');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(fake.tasks()[0]?.title).toBe('New');
    });
  });

  it('two quick tag ticks keep both tags (the second does not undo the first)', async () => {
    const a = makeTag({ name: 'alpha' });
    const b = makeTag({ name: 'beta' });
    const task = makeTask();
    const fake = createFakeApi([task], [a, b]);
    fake.slow(60);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'alpha' }));
    // The second tick comes before the first answer has arrived
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'beta' }));
    await waitFor(() => {
      expect(
        fake
          .tasks()[0]
          ?.tags.map((tag) => tag.name)
          .sort(),
      ).toEqual(['alpha', 'beta']);
    });
    const sent = patches(fake).map((call) => (call.body as { tagIds: string[] }).tagIds.length);
    expect(sent).toEqual([1, 2]);
  });

  it('a tag created from the menu is added to the task, along with tags already on it', async () => {
    const existing = makeTag({ name: 'work' });
    const task = makeTask({ tags: [ref(existing)] });
    const fake = createFakeApi([task], [existing]);
    const { user } = await openLoaded(fake, task.id);
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.type(await screen.findByRole('textbox', { name: /new tag/i }), 'fresh{Enter}');
    await waitFor(() => {
      expect(
        fake
          .tasks()[0]
          ?.tags.map((tag) => tag.name)
          .sort(),
      ).toEqual(['fresh', 'work']);
    });
  });
});
