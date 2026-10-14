import { useState } from 'react';
import { ClientsPage, NewClientDialog } from '../clients/clients-page';
import { ProjectPage } from '../detail/project-page';
import { ProjectFormDialog } from '../dialogs/project-form';
import { ProjectsList } from '../list/projects-list';
import { useProjectsUi } from '../projects-ui-store';
import { TimePage } from '../time/time-page';
import { ProjectsShortcutsHelp } from './shortcuts-help';
import { ProjectsSidePanel } from './side-panel';
import { useProjectsShortcuts } from './use-projects-shortcuts';

type Dialog = 'project' | 'client' | 'help' | null;

/**
 * The Projects page: the inner side panel on the left and, on the right, the projects list, a
 * project page, the clients, or the time overview. What is open lives in the Projects UI store.
 */
export function ProjectsLayout() {
  const view = useProjectsUi((state) => state.view);
  const projectId = useProjectsUi((state) => state.projectId);
  const clientId = useProjectsUi((state) => state.clientId);
  const openProject = useProjectsUi((state) => state.openProject);
  const closeProject = useProjectsUi((state) => state.closeProject);
  const closeClient = useProjectsUi((state) => state.closeClient);
  const [dialog, setDialog] = useState<Dialog>(null);

  useProjectsShortcuts({
    onNew: () => {
      if (view === 'projects' && projectId === null) setDialog('project');
      else if (view === 'clients' && clientId === null) setDialog('client');
    },
    onBack: () => {
      if (view === 'projects' && projectId !== null) closeProject();
      else if (view === 'clients' && clientId !== null) closeClient();
    },
    onHelp: () => {
      setDialog('help');
    },
  });

  const close = () => {
    setDialog(null);
  };

  return (
    <div className="flex h-full min-h-0 gap-3 pt-4 pl-4">
      <ProjectsSidePanel />
      <div className="min-h-0 min-w-0 flex-1">
        {view === 'projects' ? (
          projectId !== null ? (
            <ProjectPage projectId={projectId} />
          ) : (
            <ProjectsList
              onNew={() => {
                setDialog('project');
              }}
              onHelp={() => {
                setDialog('help');
              }}
            />
          )
        ) : null}
        {view === 'clients' ? (
          <ClientsPage
            onNew={() => {
              setDialog('client');
            }}
            onHelp={() => {
              setDialog('help');
            }}
          />
        ) : null}
        {view === 'time' ? <TimePage /> : null}
      </div>

      {dialog === 'project' ? <ProjectFormDialog onClose={close} onSaved={openProject} /> : null}
      {dialog === 'client' ? <NewClientDialog onClose={close} /> : null}
      {dialog === 'help' ? <ProjectsShortcutsHelp onClose={close} /> : null}
    </div>
  );
}
