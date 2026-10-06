import { describe, expect, it } from 'vitest';
import { ACCENT_COLOR, MODULE_IDS, MODULES, TEXT_ON_TILE } from './modules';

describe('modules', () => {
  it('has one entry per module id, keyed by its own id', () => {
    expect(Object.keys(MODULES).sort()).toEqual([...MODULE_IDS].sort());
    for (const id of MODULE_IDS) {
      expect(MODULES[id].id).toBe(id);
    }
  });

  it('keeps the dock order from DESIGN.md', () => {
    expect(MODULE_IDS).toEqual([
      'dashboard',
      'tasks',
      'habits',
      'notes',
      'graph',
      'calendar',
      'mail',
      'drive',
      'projects',
      'money',
      'assistant',
      'settings',
    ]);
  });

  it('uses 6-digit hex colors', () => {
    for (const id of MODULE_IDS) {
      expect(MODULES[id].color).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(TEXT_ON_TILE).toBe('#1C1C1C');
  });

  it('uses lavender as the app accent', () => {
    expect(ACCENT_COLOR).toBe('#C9B4F7');
  });

  it('maps every module to a roadmap step between 1 and 7', () => {
    for (const id of MODULE_IDS) {
      expect(MODULES[id].roadmapStep).toBeGreaterThanOrEqual(1);
      expect(MODULES[id].roadmapStep).toBeLessThanOrEqual(7);
    }
  });
});
