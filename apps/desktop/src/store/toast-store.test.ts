import { beforeEach, describe, expect, it } from 'vitest';
import { useToasts } from './toast-store';

beforeEach(() => {
  useToasts.getState().clear();
});

describe('toast store', () => {
  it('adds, dismisses, and clears toasts', () => {
    const { show, dismiss, clear } = useToasts.getState();
    const first = show('One');
    show('Two', { tone: 'error' });
    expect(useToasts.getState().toasts.map((toast) => [toast.message, toast.tone])).toEqual([
      ['One', 'info'],
      ['Two', 'error'],
    ]);
    dismiss(first);
    expect(useToasts.getState().toasts.map((toast) => toast.message)).toEqual(['Two']);
    clear();
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it('keeps at most three, dropping the oldest', () => {
    const { show } = useToasts.getState();
    for (const message of ['1', '2', '3', '4']) show(message);
    expect(useToasts.getState().toasts.map((toast) => toast.message)).toEqual(['2', '3', '4']);
  });
});
