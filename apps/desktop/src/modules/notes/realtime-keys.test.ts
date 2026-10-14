import { describe, expect, it } from 'vitest';
import { realtimeRegistry } from '../../realtime/registry';

describe('Notes live updates', () => {
  it('refreshes notes and folders when either table changes', () => {
    expect(realtimeRegistry.notes).toEqual([['notes'], ['note-folders']]);
    expect(realtimeRegistry.note_folders).toEqual([['note-folders'], ['notes']]);
  });
});
