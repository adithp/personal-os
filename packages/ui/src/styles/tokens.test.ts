// @vitest-environment node
import type { ModuleId } from '@personal-os/shared';
import { ACCENT_COLOR, MODULE_IDS, MODULES, TEXT_ON_TILE } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  cssVariablesBySelector,
  markdownTable,
  normalizeColor,
  readRepoFile,
} from '../test/design-doc';

const design = readRepoFile('docs/DESIGN.md');
const css = cssVariablesBySelector(readRepoFile('packages/ui/src/styles/tokens.css'));

const darkVars = css.get(":root,[data-theme='dark']");
const lightVars = css.get("[data-theme='light']");
const rootVars = css.get(':root');

const DESIGN_MODULE_NAMES: Record<string, ModuleId> = {
  Dashboard: 'dashboard',
  Tasks: 'tasks',
  Habits: 'habits',
  Notes: 'notes',
  'Knowledge graph': 'graph',
  Calendar: 'calendar',
  Mail: 'mail',
  Drive: 'drive',
  Projects: 'projects',
  'Money (Finance, Wallet, Subscriptions)': 'money',
  'AI assistant (also the app accent)': 'assistant',
  Settings: 'settings',
};

describe('theme tokens match DESIGN.md section 1', () => {
  const rows = markdownTable(design, ['Token', 'Dark', 'Light']);

  it('finds the token table and both theme blocks', () => {
    expect(rows.length).toBeGreaterThanOrEqual(9);
    expect(darkVars).toBeDefined();
    expect(lightVars).toBeDefined();
  });

  // "glass-strong (dock)" -> "glass-strong"
  it.each(
    rows.map((row) => [(row[0] ?? '').replace(/\s*\(.*\)$/, ''), row[1] ?? '', row[2] ?? '']),
  )('%s', (token, dark, light) => {
    expect(normalizeColor(darkVars?.get(`--${token}`) ?? 'missing')).toBe(normalizeColor(dark));
    expect(normalizeColor(lightVars?.get(`--${token}`) ?? 'missing')).toBe(normalizeColor(light));
  });

  it('defines the same variables in dark and light', () => {
    expect([...(darkVars?.keys() ?? [])].sort()).toEqual([...(lightVars?.keys() ?? [])].sort());
  });

  it('uses the DESIGN.md input backgrounds', () => {
    expect(normalizeColor(darkVars?.get('--input-bg') ?? '')).toBe('rgba(255,255,255,0.06)');
    expect(normalizeColor(lightVars?.get('--input-bg') ?? '')).toBe('rgba(0,0,0,0.04)');
  });
});

describe('module colors match DESIGN.md section 3', () => {
  const rows = markdownTable(design, ['Module', 'Color', 'Hex']);

  it('lists every module exactly once', () => {
    const ids = rows.map((row) => DESIGN_MODULE_NAMES[row[0] ?? '']);
    expect(ids.sort()).toEqual([...MODULE_IDS].sort());
  });

  it.each(rows.map((row) => [row[0] ?? '', row[2] ?? '']))('%s is %s', (name, hex) => {
    const id = DESIGN_MODULE_NAMES[name];
    if (!id) throw new Error(`Unknown module in DESIGN.md: ${name}`);
    expect(MODULES[id].color).toBe(hex.toUpperCase());
    expect(normalizeColor(rootVars?.get(`--module-${id}`) ?? 'missing')).toBe(normalizeColor(hex));
  });

  it('uses lavender as the accent', () => {
    expect(rootVars?.get('--accent')).toBe('var(--module-assistant)');
    expect(ACCENT_COLOR).toBe('#C9B4F7');
  });

  it('keeps the dock order from DESIGN.md section 7', () => {
    const orderLine = design.split('\n').find((line) => line.startsWith('- Order:')) ?? '';
    const names = orderLine
      .replace('- Order:', '')
      .replace('.', '')
      .replace('| divider |', ',')
      .split(',')
      .map((name) => name.trim());
    const dockNames: Record<string, ModuleId> = {
      Graph: 'graph',
      Money: 'money',
      'AI assistant': 'assistant',
    };
    const ids = names.map((name) => dockNames[name] ?? DESIGN_MODULE_NAMES[name]);
    expect(ids).toEqual([...MODULE_IDS]);
  });
});

describe('readability', () => {
  it.each(MODULE_IDS)('dark text on %s passes WCAG AA (4.5:1)', (id) => {
    expect(contrastRatio(TEXT_ON_TILE, MODULES[id].color)).toBeGreaterThanOrEqual(4.5);
  });

  it('primary text passes WCAG AA on the solid background in both themes', () => {
    expect(contrastRatio('#F2F2F2', '#15171C')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#1C1C1C', '#EEF0F3')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Liquid Glass tokens and modes', () => {
  const LIQUID_TOKENS = [
    '--panel-solid',
    '--panel-solid-strong',
    '--lg-fill',
    '--lg-fill-strong',
    '--lg-hairline',
    '--lg-edge',
    '--lg-rim-light',
    '--lg-rim-soft',
    '--lg-rim-dark',
    '--lg-glow',
    '--lg-shine',
    '--lg-input-dark',
  ];

  it.each(LIQUID_TOKENS)('%s is defined for both dark and light', (token) => {
    expect(darkVars?.has(token), `dark ${token}`).toBe(true);
    expect(lightVars?.has(token), `light ${token}`).toBe(true);
  });

  it('has a brighter rim and glow in light mode', () => {
    expect(darkVars?.get('--lg-rim-light')).not.toBe(lightVars?.get('--lg-rim-light'));
    expect(normalizeColor(lightVars?.get('--lg-rim-light') ?? '')).toBe('rgba(255,255,255,1)');
  });

  const modes = ['simple', 'off', 'liquid'].map(
    (mode) => [mode, css.get(`[data-glass='${mode}']`)] as const,
  );

  it.each(modes)('the %s mode block exists', (_mode, vars) => {
    expect(vars).toBeDefined();
  });

  it('defines exactly the same variables in all three modes, so switching never leaves one unset', () => {
    const names = modes.map(([, vars]) => [...(vars?.keys() ?? [])].sort());
    expect(names[0]?.length).toBeGreaterThan(8);
    expect(names[1]).toEqual(names[0]);
    expect(names[2]).toEqual(names[0]);
  });

  it('marks each mode with --glass-mode for the Off style query', () => {
    expect(css.get("[data-glass='off']")?.get('--glass-mode')).toBe('off');
    expect(css.get("[data-glass='liquid']")?.get('--glass-mode')).toBe('liquid');
    expect(css.get("[data-glass='simple']")?.get('--glass-mode')).toBe('simple');
  });

  it('Simple is the plain blur glass that was used before (no rim, shine, or glow)', () => {
    const simple = css.get("[data-glass='simple']");
    expect(simple?.get('--g-bg')).toBe('var(--glass)');
    expect(simple?.get('--g-shadow')).toBe('none');
    expect(simple?.get('--g-image')).toBe('none');
    expect(simple?.get('--g-post')).toBe('blur(var(--glass-blur))');
    expect(simple?.get('--g-tile-shadow')).toBe('none');
  });

  it('Off uses solid panels with no blur', () => {
    const off = css.get("[data-glass='off']");
    expect(off?.get('--g-bg')).toBe('var(--panel-solid)');
    expect(off?.get('--g-bg-strong')).toBe('var(--panel-solid-strong)');
    expect(off?.get('--g-post')).toBe('blur(0px)');
    expect(off?.get('--g-shadow')).toBe('none');
  });

  it('Liquid draws a quiet edge: a faint hairline, a dark bottom, and an inner glow, with no white ring', () => {
    const shadow = css.get("[data-glass='liquid']")?.get('--g-shadow') ?? '';
    expect(shadow).toContain('inset 0 0 0 1px var(--lg-hairline)');
    expect(shadow).not.toContain('--lg-rim-light');
    expect(shadow).not.toContain('--lg-edge');
    expect(shadow).toContain('var(--lg-rim-dark)');
    expect(shadow).toContain('inset 0 0 20px 0 var(--lg-glow)');
  });

  it('Liquid uses whole pixels only for its edge, so it is even at 125% and 150% display scaling', () => {
    const liquid = css.get("[data-glass='liquid']");
    for (const name of ['--g-shadow', '--g-tile-shadow', '--g-input-shadow']) {
      const insets = (liquid?.get(name) ?? '').match(/inset [^,]+/g) ?? [];
      expect(insets.length).toBeGreaterThan(1);
      for (const inset of insets) {
        expect(inset, `${name}: ${inset}`).not.toMatch(/\d+\.\d+px/);
      }
    }
  });

  it('Liquid has no separate border (the edge ring replaces it); Simple and Off keep the 0.5px border', () => {
    expect(css.get("[data-glass='liquid']")?.get('--g-border-w')).toBe('0px');
    expect(css.get("[data-glass='simple']")?.get('--g-border-w')).toBe('0.5px');
    expect(css.get("[data-glass='off']")?.get('--g-border-w')).toBe('0.5px');
  });

  it('Liquid has a specular shine and boosts the background color with blur and saturation', () => {
    const liquid = css.get("[data-glass='liquid']");
    expect(liquid?.get('--g-image')).toContain('var(--lg-shine)');
    expect(liquid?.get('--g-post')).toContain('blur(');
    expect(liquid?.get('--g-post')).toContain('saturate(');
  });

  it('Liquid puts rim and shine on solid pastel tiles without changing their color', () => {
    const liquid = css.get("[data-glass='liquid']");
    expect(liquid?.get('--g-tile-shadow')).not.toContain('255 255 255 / 0.85');
    expect(liquid?.get('--g-tile-image')).toContain('radial-gradient');
    expect(liquid?.has('--g-tile-bg')).toBe(false);
  });

  describe('the utilities', () => {
    const utilities = readRepoFile('packages/ui/src/styles/index.css');

    it('send the per-element refraction filter first, then the mode blur', () => {
      expect(utilities).toContain(
        'backdrop-filter: var(--lg-filter, blur(0px)) var(--g-post, blur(var(--glass-blur)));',
      );
    });

    it.each(['glass', 'glass-strong', 'liquid-tile', 'liquid-input', 'liquid-hover'])(
      'define %s',
      (name) => {
        expect(utilities).toContain(`@utility ${name} {`);
      },
    );

    it('fall back to the old plain glass when no mode is set', () => {
      expect(utilities).toContain('background-color: var(--g-bg, var(--glass));');
      expect(utilities).toContain('border: var(--g-border-w, 0.5px) solid var(--glass-border);');
      expect(utilities).toContain('background-color: var(--g-bg-strong, var(--glass-strong));');
    });

    it('remove the backdrop effect completely in Off mode', () => {
      expect(utilities).toContain('@container style(--glass-mode: off)');
      const block = utilities.slice(utilities.indexOf('@container style(--glass-mode: off)'));
      expect(block).toContain('backdrop-filter: none;');
      expect(block).toContain('.glass-strong');
    });
  });
});
