import type * as TauriWindow from '@tauri-apps/api/window';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlassSupport } from '../store/glass-support-store';
import { useSettings } from '../store/settings-store';
import { signedInAuth } from '../test/fake-auth';
import { renderApp } from '../test/render-app';

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof TauriWindow>()),
  getCurrentWindow: vi.fn(),
}));

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0';

/** Makes the browser look like WebView2: Chromium, SVG backdrop filters, and a 2D canvas. */
function pretendToBeChromium() {
  vi.stubGlobal('CSS', { supports: () => true });
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(CHROME_UA);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
}

const radio = (group: string, name: string) =>
  within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });
const defs = () => document.querySelector('[data-liquid-glass-defs]');

beforeEach(() => {
  localStorage.clear();
  useSettings.getState().reset();
  useGlassSupport.setState({ liquidUnavailable: false });
  delete document.documentElement.dataset.glass;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        /* sizes are not measured in jsdom */
      }
      unobserve() {
        /* sizes are not measured in jsdom */
      }
      disconnect() {
        /* sizes are not measured in jsdom */
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the glass effect on the whole app', () => {
  it('is Liquid by default, at medium strength', () => {
    expect(useSettings.getState()).toMatchObject({ glassEffect: 'liquid', liquidStrength: 50 });
  });

  it('shows Liquid on a Chromium browser (WebView2) and runs the refraction engine', async () => {
    pretendToBeChromium();
    await renderApp('/tasks', signedInAuth().auth);
    expect(document.documentElement.dataset.glass).toBe('liquid');
    expect(defs()).not.toBeNull();
    expect(useGlassSupport.getState().liquidUnavailable).toBe(false);
  });

  it('falls back to Simple automatically where Liquid is not supported', async () => {
    // jsdom has no backdrop-filter support at all
    await renderApp('/tasks', signedInAuth().auth);
    expect(document.documentElement.dataset.glass).toBe('simple');
    expect(defs()).toBeNull();
    expect(useGlassSupport.getState().liquidUnavailable).toBe(true);
    expect(useSettings.getState().glassEffect).toBe('liquid'); // the saved choice is kept
  });

  it.each(['simple', 'off'] as const)(
    'shows %s when chosen, without the engine',
    async (glassEffect) => {
      pretendToBeChromium();
      useSettings.getState().update({ glassEffect });
      await renderApp('/tasks', signedInAuth().auth);
      expect(document.documentElement.dataset.glass).toBe(glassEffect);
      expect(defs()).toBeNull();
      expect(useGlassSupport.getState().liquidUnavailable).toBe(false);
    },
  );

  it('applies to the login screen too', async () => {
    pretendToBeChromium();
    const { signedOutAuth } = await import('../test/fake-auth');
    await renderApp('/login', signedOutAuth().auth);
    expect(document.documentElement.dataset.glass).toBe('liquid');
  });

  it('switches live when the setting changes', async () => {
    pretendToBeChromium();
    await renderApp('/tasks', signedInAuth().auth);
    expect(document.documentElement.dataset.glass).toBe('liquid');

    act(() => {
      useSettings.getState().update({ glassEffect: 'off' });
    });
    expect(document.documentElement.dataset.glass).toBe('off');
    expect(defs()).toBeNull();

    act(() => {
      useSettings.getState().update({ glassEffect: 'liquid' });
    });
    expect(document.documentElement.dataset.glass).toBe('liquid');
    expect(defs()).not.toBeNull();
  });

  it('gives the dock, window buttons, and quick actions the Liquid Glass classes', async () => {
    pretendToBeChromium();
    await renderApp('/', signedInAuth().auth);

    const dock = screen.getByRole('navigation', { name: 'Modules' }).firstElementChild;
    expect(dock).toHaveClass('glass-strong');
    expect(dock).toHaveAttribute('data-liquid-step', '96'); // wide steps while icons grow
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveClass('liquid-tile');
    expect(screen.getByRole('button', { name: 'Minimize' })).toHaveClass('liquid-hover');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('liquid-hover');

    const quick = screen.getByRole('region', { name: 'Quick actions' });
    for (const module of ['tasks', 'notes', 'money', 'calendar']) {
      expect(quick.querySelector(`[data-module="${module}"]`)).toHaveClass('liquid-tile');
    }
    expect(screen.getByRole('textbox', { name: 'Ask or tell me what to do' })).toHaveClass(
      'liquid-input',
    );
  });
});

describe('Settings → Appearance → Glass effect', () => {
  async function openSettings() {
    const router = await renderApp('/settings', signedInAuth().auth);
    return { router, user: userEvent.setup() };
  }

  it('offers Liquid, Simple, and Off with Liquid selected by default', async () => {
    await openSettings();
    const group = screen.getByRole('radiogroup', { name: 'Glass effect' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Liquid', 'Simple', 'Off']);
    expect(radio('Glass effect', 'Liquid')).toBeChecked();
  });

  it('sits in the Appearance section', async () => {
    await openSettings();
    const appearance = screen.getByRole('region', { name: 'Appearance' });
    expect(
      within(appearance).getByRole('radiogroup', { name: 'Glass effect' }),
    ).toBeInTheDocument();
  });

  it('shows the strength slider only for Liquid', async () => {
    const { user } = await openSettings();
    expect(screen.getByRole('slider', { name: 'Strength' })).toBeInTheDocument();

    await user.click(radio('Glass effect', 'Simple'));
    expect(screen.queryByRole('slider', { name: 'Strength' })).not.toBeInTheDocument();

    await user.click(radio('Glass effect', 'Off'));
    expect(screen.queryByRole('slider', { name: 'Strength' })).not.toBeInTheDocument();

    await user.click(radio('Glass effect', 'Liquid'));
    expect(screen.getByRole('slider', { name: 'Strength' })).toBeInTheDocument();
  });

  it('has a 0–100 strength slider at medium (50) by default', async () => {
    await openSettings();
    const slider = screen.getByRole('slider', { name: 'Strength' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '100');
    expect(slider).toHaveValue('50');
  });

  it('saves the strength and shows its value', async () => {
    await openSettings();
    fireEvent.change(screen.getByRole('slider', { name: 'Strength' }), { target: { value: '80' } });
    expect(useSettings.getState().liquidStrength).toBe(80);
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(localStorage.getItem('personal-os.settings')).toContain('"liquidStrength":80');
  });

  it('changes the whole app right away', async () => {
    pretendToBeChromium();
    const { user } = await openSettings();
    expect(document.documentElement.dataset.glass).toBe('liquid');

    await user.click(radio('Glass effect', 'Simple'));
    expect(document.documentElement.dataset.glass).toBe('simple');
    await user.click(radio('Glass effect', 'Off'));
    expect(document.documentElement.dataset.glass).toBe('off');
    expect(useSettings.getState().glassEffect).toBe('off');
  });

  it('explains each effect', async () => {
    const { user } = await openSettings();
    expect(
      screen.getByText('Glass bends the background at its edges, with a bright rim and shine.'),
    ).toBeInTheDocument();
    await user.click(radio('Glass effect', 'Simple'));
    expect(screen.getByText('Plain blurred glass.')).toBeInTheDocument();
    await user.click(radio('Glass effect', 'Off'));
    expect(screen.getByText('Solid panels. Uses the least power.')).toBeInTheDocument();
  });

  it('says when Liquid is not available on this computer and Simple is shown', async () => {
    await openSettings(); // jsdom cannot draw Liquid
    expect(
      await screen.findByText(
        'Liquid glass is not available on this computer, so simple glass is shown instead.',
      ),
    ).toBeInTheDocument();
  });

  it('does not show that note when Liquid works, or when Liquid was not chosen', async () => {
    pretendToBeChromium();
    const { user } = await openSettings();
    const note =
      'Liquid glass is not available on this computer, so simple glass is shown instead.';
    expect(screen.queryByText(note)).not.toBeInTheDocument();

    act(() => {
      useGlassSupport.setState({ liquidUnavailable: true });
    });
    expect(await screen.findByText(note)).toBeInTheDocument();
    await user.click(radio('Glass effect', 'Simple'));
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });

  it('keeps the choice after a restart', async () => {
    const { user } = await openSettings();
    await user.click(radio('Glass effect', 'Off'));
    const saved = localStorage.getItem('personal-os.settings') ?? '';
    act(() => {
      useSettings.getState().reset();
    });
    localStorage.setItem('personal-os.settings', saved);
    await act(async () => {
      await useSettings.persist.rehydrate();
    });
    expect(useSettings.getState().glassEffect).toBe('off');
    await waitFor(() => {
      expect(radio('Glass effect', 'Off')).toBeChecked();
    });
  });
});
