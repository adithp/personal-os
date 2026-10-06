import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TitleBar } from './title-bar';
import { useTauriWindow } from './use-tauri-window';

const appWindow = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(),
  onResized: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => appWindow }));

describe('TitleBar', () => {
  function setup(maximized = false) {
    const handlers = { onMinimize: vi.fn(), onToggleMaximize: vi.fn(), onClose: vi.fn() };
    const { container } = render(<TitleBar maximized={maximized} {...handlers} />);
    return { handlers, container };
  }

  it('shows the app name on the left inside a drag region', () => {
    const { container } = setup();
    expect(container.querySelector('header')).toHaveAttribute('data-tauri-drag-region');
    expect(screen.getByText('Personal OS')).toHaveAttribute('data-tauri-drag-region');
  });

  it('has minimize, maximize and close buttons that call their handlers', async () => {
    const { handlers } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    await userEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(handlers.onMinimize).toHaveBeenCalledOnce();
    expect(handlers.onToggleMaximize).toHaveBeenCalledOnce();
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it('offers Restore instead of Maximize when the window is maximized', () => {
    setup(true);
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maximize' })).not.toBeInTheDocument();
  });

  it('is fully transparent: no background, border, or blur', () => {
    const { container } = setup();
    const classes = container.querySelector('header')?.className ?? '';
    for (const forbidden of ['bg-', 'border', 'backdrop', 'glass', 'shadow']) {
      expect(classes).not.toContain(forbidden);
    }
  });

  it('is 40 px tall and overlays the top of the window', () => {
    const { container } = setup();
    expect(container.querySelector('header')).toHaveClass('h-10', 'fixed', 'top-0', 'inset-x-0');
  });

  it('shows the app name small and muted with no background', () => {
    setup();
    const name = screen.getByText('Personal OS');
    expect(name).toHaveClass('text-[11px]', 'text-fg-muted');
    expect(name.className).not.toContain('bg-');
  });

  it('draws window buttons with no background until hovered', () => {
    setup();
    for (const label of ['Minimize', 'Maximize', 'Close']) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toHaveClass('text-fg-secondary', 'rounded-[8px]', 'hover:bg-glass');
      expect(button.className).not.toMatch(/(^|\s)bg-/);
    }
  });

  it('turns Close red with a white icon on hover', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(
      'hover:bg-window-close',
      'hover:text-white',
    );
  });

  it('keeps the buttons outside the drag region so they stay clickable', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveAttribute(
      'data-tauri-drag-region',
    );
  });
});

describe('useTauriWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appWindow.isMaximized.mockResolvedValue(false);
    appWindow.onResized.mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  });

  it('does nothing in a plain browser', () => {
    const { result } = renderHook(() => useTauriWindow());
    result.current.minimize();
    result.current.toggleMaximize();
    result.current.close();
    expect(appWindow.minimize).not.toHaveBeenCalled();
    expect(appWindow.isMaximized).not.toHaveBeenCalled();
    expect(result.current.maximized).toBe(false);
  });

  it('controls the Tauri window and tracks the maximized state', async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    appWindow.isMaximized.mockResolvedValue(true);
    const { result } = renderHook(() => useTauriWindow());

    await waitFor(() => {
      expect(result.current.maximized).toBe(true);
    });

    result.current.minimize();
    result.current.toggleMaximize();
    result.current.close();
    expect(appWindow.minimize).toHaveBeenCalledOnce();
    expect(appWindow.toggleMaximize).toHaveBeenCalledOnce();
    expect(appWindow.close).toHaveBeenCalledOnce();
  });

  it('stops listening for resizes when unmounted', async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    const stop = vi.fn();
    appWindow.onResized.mockResolvedValue(stop);
    const { unmount } = renderHook(() => useTauriWindow());
    await waitFor(() => {
      expect(appWindow.onResized).toHaveBeenCalled();
    });
    await Promise.resolve();
    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
});
