import { MODULE_IDS, MODULES } from '@personal-os/shared';
import { describe, expect, it, vi } from 'vitest';
import { buildCommands, scoreCommand, type CommandContext } from './commands';

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    openModule: vi.fn(),
    theme: 'system',
    setTheme: vi.fn(),
    dockAutoHide: false,
    setDockAutoHide: vi.fn(),
    ...overrides,
  };
}

describe('buildCommands', () => {
  it('opens every module, in dock order, first', () => {
    const commands = buildCommands(context());
    const goTo = commands.filter((c) => c.group === 'Go to');
    expect(goTo.map((c) => c.title)).toEqual(MODULE_IDS.map((id) => `Open ${MODULES[id].name}`));
    expect(commands.slice(0, goTo.length)).toEqual(goTo);
  });

  it('opens Settings and the AI assistant like any other module', () => {
    const ctx = context();
    const commands = buildCommands(ctx);
    commands.find((c) => c.title === 'Open Settings')?.run();
    commands.find((c) => c.title === 'Open AI assistant')?.run();
    expect(ctx.openModule).toHaveBeenNthCalledWith(1, 'settings');
    expect(ctx.openModule).toHaveBeenNthCalledWith(2, 'assistant');
  });

  it('shows each module its keyboard shortcut', () => {
    const commands = buildCommands(context());
    expect(commands.find((c) => c.title === 'Open Tasks')?.shortcut).toEqual(['Ctrl', '2']);
    expect(commands.find((c) => c.title === 'Open Money')?.shortcut).toEqual(['Ctrl', '0']);
    expect(commands.find((c) => c.title === 'Open Settings')?.shortcut).toEqual(['Ctrl', ',']);
  });

  it('has dark, light, and system theme commands that set the theme', () => {
    const ctx = context();
    const themes = buildCommands(ctx).filter((c) => c.group === 'Appearance');
    expect(themes.map((c) => c.title)).toEqual([
      'Switch to dark theme',
      'Switch to light theme',
      'Follow system theme',
    ]);
    for (const command of themes) command.run();
    expect(vi.mocked(ctx.setTheme).mock.calls.map((call) => call[0])).toEqual([
      'dark',
      'light',
      'system',
    ]);
  });

  it('marks only the current theme', () => {
    const themes = buildCommands(context({ theme: 'light' })).filter(
      (c) => c.group === 'Appearance',
    );
    expect(themes.map((c) => c.hint)).toEqual([undefined, 'Current', undefined]);
  });

  it('toggles dock auto-hide in both directions and shows its state', () => {
    const off = context({ dockAutoHide: false });
    const offCommand = buildCommands(off).find((c) => c.group === 'Dock');
    expect(offCommand?.hint).toBe('Off');
    offCommand?.run();
    expect(off.setDockAutoHide).toHaveBeenCalledWith(true);

    const on = context({ dockAutoHide: true });
    const onCommand = buildCommands(on).find((c) => c.group === 'Dock');
    expect(onCommand?.hint).toBe('On');
    onCommand?.run();
    expect(on.setDockAutoHide).toHaveBeenCalledWith(false);
  });

  it('gives every command a unique id and title', () => {
    const commands = buildCommands(context());
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
    expect(new Set(commands.map((c) => c.title)).size).toBe(commands.length);
  });

  it('has exactly the commands asked for: modules, themes, and the dock toggle', () => {
    expect(buildCommands(context())).toHaveLength(MODULE_IDS.length + 3 + 1);
  });
});

describe('scoreCommand', () => {
  const KEYWORDS = ['night', 'black'];

  it('shows everything when nothing is typed', () => {
    expect(scoreCommand('Open Tasks', [], '')).toBe(1);
    expect(scoreCommand('Open Tasks', [], '   ')).toBe(1);
  });

  it('matches whole words and parts of words in the title, ignoring case', () => {
    expect(scoreCommand('Open Tasks', [], 'tasks')).toBeGreaterThan(0);
    expect(scoreCommand('Open Tasks', [], 'TAS')).toBeGreaterThan(0);
    expect(scoreCommand('Open Tasks', [], 'open t')).toBeGreaterThan(0);
  });

  it('does not match letters scattered through the text', () => {
    expect(scoreCommand('Open Habits', ['go', 'navigate', 'show', 'habits'], 'night')).toBe(0);
    expect(scoreCommand('Open Tasks', [], 'otk')).toBe(0);
  });

  it('finds a command by a keyword, ranked below a title match', () => {
    const byKeyword = scoreCommand('Switch to dark theme', KEYWORDS, 'night');
    const byTitle = scoreCommand('Switch to dark theme', KEYWORDS, 'dark');
    expect(byKeyword).toBeGreaterThan(0);
    expect(byTitle).toBeGreaterThan(byKeyword);
  });

  it('needs every typed word to match', () => {
    expect(scoreCommand('Switch to dark theme', KEYWORDS, 'dark night')).toBeGreaterThan(0);
    expect(scoreCommand('Switch to dark theme', KEYWORDS, 'dark banana')).toBe(0);
  });

  it('ranks a title that starts with the word above one that merely contains it', () => {
    expect(scoreCommand('Open Tasks', [], 'open')).toBeGreaterThan(
      scoreCommand('Toggle dock auto-hide', [], 'open'),
    );
    expect(scoreCommand('Switch to dark theme', [], 'dark')).toBe(0.9);
  });
});
