// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODULE_IDS } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import {
  PALETTE_HINT,
  SHORTCUTS,
  actionForKeyPress,
  hintKeys,
  moduleHint,
  type KeyPress,
} from './shortcuts';

const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...modifiers,
});

describe('shortcut registry', () => {
  it('has one shortcut per module plus the palette', () => {
    expect(SHORTCUTS).toHaveLength(MODULE_IDS.length + 1);
    expect(SHORTCUTS.filter((s) => s.action.type === 'palette')).toHaveLength(1);
    for (const module of MODULE_IDS) {
      expect(
        SHORTCUTS.filter((s) => s.action.type === 'module' && s.action.module === module),
      ).toHaveLength(1);
    }
  });

  it('never uses the same key twice', () => {
    const keys = SHORTCUTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses single lowercase keys', () => {
    for (const { key } of SHORTCUTS) {
      expect(key).toHaveLength(1);
      expect(key).toBe(key.toLowerCase());
    }
  });
});

describe('shortcuts match docs/DESIGN.md section 9', () => {
  const design = readFileSync(
    fileURLToPath(new URL('../../../../docs/DESIGN.md', import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const section = design.slice(design.indexOf('## 9. Keyboard'), design.indexOf('## 10.'));

  it('documents the same keys', () => {
    expect(section).toContain('Ctrl K: global search and command palette');
    expect(section).toContain(
      'Ctrl 1 to Ctrl 9: Dashboard, Tasks, Habits, Notes, Graph, Calendar, Mail, Drive, Projects',
    );
    expect(section).toContain('Ctrl 0: Money');
    expect(section).toContain('Ctrl J: open AI assistant');
    expect(section).toContain('Ctrl , : Settings');
  });

  it.each([
    ['k', { type: 'palette' }],
    ['1', { type: 'module', module: 'dashboard' }],
    ['2', { type: 'module', module: 'tasks' }],
    ['3', { type: 'module', module: 'habits' }],
    ['4', { type: 'module', module: 'notes' }],
    ['5', { type: 'module', module: 'graph' }],
    ['6', { type: 'module', module: 'calendar' }],
    ['7', { type: 'module', module: 'mail' }],
    ['8', { type: 'module', module: 'drive' }],
    ['9', { type: 'module', module: 'projects' }],
    ['0', { type: 'module', module: 'money' }],
    ['j', { type: 'module', module: 'assistant' }],
    [',', { type: 'module', module: 'settings' }],
  ])('Ctrl %s does the documented thing', (key, action) => {
    expect(actionForKeyPress(press(key))).toEqual(action);
  });
});

describe('actionForKeyPress', () => {
  it('needs Ctrl', () => {
    expect(actionForKeyPress(press('k', { ctrlKey: false }))).toBeUndefined();
    expect(actionForKeyPress(press('2', { ctrlKey: false }))).toBeUndefined();
  });

  it.each(['shiftKey', 'altKey', 'metaKey'] as const)(
    'ignores Ctrl together with %s',
    (modifier) => {
      expect(actionForKeyPress(press('k', { [modifier]: true }))).toBeUndefined();
      expect(actionForKeyPress(press('2', { [modifier]: true }))).toBeUndefined();
    },
  );

  it('works with Caps Lock on (uppercase key names)', () => {
    expect(actionForKeyPress(press('K'))).toEqual({ type: 'palette' });
    expect(actionForKeyPress(press('J'))).toEqual({ type: 'module', module: 'assistant' });
  });

  it.each(['a', 'c', 'v', 'x', 'z', 'f', 'p', 'r', 'w', 't', '-', '=', 'Enter', 'Escape', ' '])(
    'leaves Ctrl %s alone (copy, paste, find, and so on)',
    (key) => {
      expect(actionForKeyPress(press(key))).toBeUndefined();
    },
  );
});

describe('hints', () => {
  it('shows Ctrl plus the key', () => {
    expect(hintKeys('k')).toEqual(['Ctrl', 'K']);
    expect(PALETTE_HINT).toEqual(['Ctrl', 'K']);
    expect(moduleHint('tasks')).toEqual(['Ctrl', '2']);
    expect(moduleHint('money')).toEqual(['Ctrl', '0']);
    expect(moduleHint('assistant')).toEqual(['Ctrl', 'J']);
    expect(moduleHint('settings')).toEqual(['Ctrl', ',']);
  });
});
