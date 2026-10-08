import { beforeEach, describe, expect, it } from 'vitest';
import { resetTasksUi, useTasksUi } from './tasks-ui-store';

beforeEach(() => {
  localStorage.clear();
  resetTasksUi();
});

describe('tasks UI store', () => {
  it('starts with Cards, an open side panel, Completed collapsed, manual sort, grouped by due', () => {
    expect(useTasksUi.getState()).toMatchObject({
      view: 'cards',
      sidePanelCollapsed: false,
      collapsedSections: { completed: true },
      sort: 'manual',
      group: 'due',
      selectedTaskId: null,
    });
  });

  it('saves only the view, the panel, and the sections on this device', () => {
    const state = useTasksUi.getState();
    state.setView('list');
    state.toggleSidePanel();
    state.toggleSection('completed');
    state.toggleSection('overdue');
    state.setSort('title');
    state.setGroup('tag');
    state.select('task-1');
    const saved = JSON.parse(localStorage.getItem('personal-os.tasks-ui') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state).toEqual({
      view: 'list',
      sidePanelCollapsed: true,
      collapsedSections: { completed: false, overdue: true },
    });
  });
});
