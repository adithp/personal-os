import type { Project } from '@personal-os/shared';
import { useProjectActions } from '../projects-queries';
import { ProjectDialog } from './project-dialog';

/**
 * The new / edit project dialog wired to the actions. `onSaved` gets the id of the project that was
 * created or changed; the dialog closes after it.
 */
export function ProjectFormDialog({
  project,
  onClose,
  onSaved,
}: {
  project?: Project;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { create, update, setStatus } = useProjectActions();
  return (
    <ProjectDialog
      {...(project ? { project } : {})}
      onClose={onClose}
      onSave={async ({ status, ...fields }) => {
        let id: string;
        if (project) {
          id = project.id;
          await update.mutateAsync({ id, ...fields });
          if (status !== project.status) await setStatus.mutateAsync({ id, status });
        } else {
          id = (await create.mutateAsync(fields)).item.id;
        }
        onSaved?.(id);
        onClose();
      }}
    />
  );
}
