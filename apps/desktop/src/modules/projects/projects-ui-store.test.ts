import { beforeEach, describe, expect, it } from 'vitest';
import { resetProjectsUi, useProjectsUi } from './projects-ui-store';

beforeEach(() => {
  localStorage.clear();
  resetProjectsUi();
});

describe('Projects UI store', () => {
  it('opens a project on its Overview tab and closes it again', () => {
    const { openProject, setTab, closeProject } = useProjectsUi.getState();
    openProject('p1');
    setTab('board');
    expect(useProjectsUi.getState()).toMatchObject({ view: 'projects', projectId: 'p1', tab: 'board' });
    closeProject();
    expect(useProjectsUi.getState()).toMatchObject({ projectId: null, tab: 'overview' });
  });

  it('opens a client on the Clients view, and a project leaves it', () => {
    useProjectsUi.getState().openClient('c1');
    expect(useProjectsUi.getState()).toMatchObject({ view: 'clients', clientId: 'c1' });
    useProjectsUi.getState().openProject('p1');
    expect(useProjectsUi.getState()).toMatchObject({ view: 'projects', projectId: 'p1' });
  });

  it('switching the view closes the open project and client', () => {
    useProjectsUi.getState().openProject('p1');
    useProjectsUi.getState().showView('time');
    expect(useProjectsUi.getState()).toMatchObject({
      view: 'time',
      projectId: null,
      clientId: null,
    });
  });

  it('saves only the collapsed side panel on this device', () => {
    useProjectsUi.getState().openProject('p1');
    useProjectsUi.getState().toggleSidePanel();
    const saved = JSON.parse(localStorage.getItem('personal-os.projects-ui') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state).toEqual({ sidePanelCollapsed: true });
  });
});
