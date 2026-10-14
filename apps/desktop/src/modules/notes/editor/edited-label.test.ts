import { describe, expect, it } from 'vitest';
import { editedLabel } from './edited-label';
import { onWindowCloseFlush } from './window-close';

const NOW = Date.parse('2025-10-07T06:30:00.000Z');

describe('editedLabel', () => {
  it('counts minutes and hours, then shows the India date', () => {
    expect(editedLabel('2025-10-07T06:29:40.000Z', NOW)).toBe('Edited just now');
    expect(editedLabel('2025-10-07T06:28:00.000Z', NOW)).toBe('Edited 2 min ago');
    expect(editedLabel('2025-10-07T03:30:00.000Z', NOW)).toBe('Edited 3 h ago');
    // 18:40 UTC on the 5th is already the 6th in India
    expect(editedLabel('2025-10-05T18:40:00.000Z', NOW)).toBe('Edited 6 Oct');
  });
});

describe('onWindowCloseFlush', () => {
  it('does nothing outside the Tauri window', () => {
    const remove = onWindowCloseFlush(() => Promise.resolve());
    expect(typeof remove).toBe('function');
    remove();
  });
});
