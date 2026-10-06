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
