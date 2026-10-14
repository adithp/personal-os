import type {
  AddTimeEntryInput,
  Client,
  CreateClientInput,
  CreateProjectInput,
  Milestone,
  Project,
  ProjectNote,
  ProjectsWriteResult,
  ProjectStatus,
  Task,
  TaskProject,
  TimeEntry,
  TimeSummary,
  UpdateClientInput,
  UpdateMilestoneInput,
  UpdateProjectInput,
} from '@personal-os/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/api-client';
import { useApi } from '../../api/api-context';
import { useToasts } from '../../store/toast-store';
import { TASKS_KEY } from '../tasks/query-keys';
import { CLIENTS_KEY, MILESTONES_KEY, PROJECTS_KEY, TIME_KEY } from './query-keys';

/**
 * Server data for the Projects module: clients, projects, milestones, linked tasks and notes, and
 * time entries. Every write offers an Undo toast and refreshes everything this module shows.
 */

type Undo = ProjectsWriteResult<unknown>['undo'];

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

// ----- Reads

export function useClients() {
  const api = useApi();
  return useQuery({
    queryKey: [...CLIENTS_KEY, 'list'],
    queryFn: async () => (await api.request<{ items: Client[] }>('GET', '/clients')).items,
  });
}

export function useClient(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...CLIENTS_KEY, 'detail', id ?? ''],
    queryFn: async () => (await api.request<{ item: Client }>('GET', `/clients/${id ?? ''}`)).item,
    enabled: id !== null,
  });
}

/** Projects, optionally of one status and/or one client. */
export function useProjects(filter: { status?: ProjectStatus; clientId?: string } = {}) {
  const api = useApi();
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'list', filter.status ?? 'all', filter.clientId ?? 'all'],
    queryFn: async () =>
      (
        await api.request<{ items: Project[] }>('GET', '/projects', {
          query: {
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.clientId ? { clientId: filter.clientId } : {}),
          },
        })
      ).items,
  });
}

export function useProject(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'detail', id ?? ''],
    queryFn: async () =>
      (await api.request<{ item: Project }>('GET', `/projects/${id ?? ''}`)).item,
    enabled: id !== null,
  });
}

const fetchItems = async (
  api: ReturnType<typeof useApi>,
  id: string,
): Promise<{ tasks: Task[]; notes: ProjectNote[] }> =>
  (
    await api.request<{ item: { tasks: Task[]; notes: ProjectNote[] } }>(
      'GET',
      `/projects/${id}/items`,
    )
  ).item;

/**
 * The tasks of a project. The key starts with TASKS_KEY and the data is a task list, so the task
 * hooks (move on the board, complete, delete) patch it at once, like any other task list.
 */
export function useProjectTasks(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...TASKS_KEY, 'project', id ?? ''],
    queryFn: async () => (await fetchItems(api, id ?? '')).tasks,
    enabled: id !== null,
  });
}

/** The notes linked to a project. */
export function useProjectNotes(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'notes', id ?? ''],
    queryFn: async () => (await fetchItems(api, id ?? '')).notes,
    enabled: id !== null,
  });
}

/** The project a task belongs to (or null). */
export function useTaskProject(taskId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'task', taskId ?? ''],
    queryFn: async () =>
      (await api.request<{ item: TaskProject | null }>('GET', `/tasks/${taskId ?? ''}/project`))
        .item,
    enabled: taskId !== null,
  });
}

export function useMilestones(projectId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...MILESTONES_KEY, projectId ?? ''],
    queryFn: async () =>
      (await api.request<{ items: Milestone[] }>('GET', `/projects/${projectId ?? ''}/milestones`))
        .items,
    enabled: projectId !== null,
  });
}

/** Time entries, newest first. */
export function useTimeEntries(
  filter: { projectId?: string; taskId?: string; limit?: number } = {},
) {
  const api = useApi();
  return useQuery({
    queryKey: [
      ...TIME_KEY,
      'list',
      filter.projectId ?? 'all',
      filter.taskId ?? 'all',
      filter.limit ?? 0,
    ],
    queryFn: async () =>
      (
        await api.request<{ items: TimeEntry[] }>('GET', '/time-entries', {
          query: {
            ...(filter.projectId ? { projectId: filter.projectId } : {}),
            ...(filter.taskId ? { taskId: filter.taskId } : {}),
            ...(filter.limit ? { limit: String(filter.limit) } : {}),
          },
        })
      ).items,
  });
}

/** The running timer, or null. */
export function useRunningTimer() {
  const api = useApi();
  return useQuery({
    queryKey: [...TIME_KEY, 'running'],
    queryFn: async () =>
      (await api.request<{ item: TimeEntry | null }>('GET', '/time-entries/running')).item,
  });
}

export function useTimeSummary(projectId?: string, weeks = 8) {
  const api = useApi();
  return useQuery({
    queryKey: [...TIME_KEY, 'summary', projectId ?? 'all', weeks],
    queryFn: async () =>
      (
        await api.request<{ item: TimeSummary }>('GET', '/time-entries/summary', {
          query: { ...(projectId ? { projectId } : {}), weeks: String(weeks) },
        })
      ).item,
  });
}

// ----- Writes

/** Shared plumbing of the write hooks: refresh everything of the module, Undo toast, error toast. */
function useWriter() {
  const api = useApi();
  const client = useQueryClient();
  const toast = useToasts.getState;

  const refresh = async () => {
    await Promise.all(
      [CLIENTS_KEY, PROJECTS_KEY, MILESTONES_KEY, TIME_KEY, TASKS_KEY].map((queryKey) =>
        client.invalidateQueries({ queryKey }),
      ),
    );
  };
  const fail = (error: unknown) => {
    toast().show(messageOf(error), { tone: 'error' });
  };
  const offerUndo = (message: string, undo: Undo) => {
    if (!undo) return;
    toast().show(message, {
      action: {
        label: 'Undo',
        onClick: () => {
          void api.request('POST', '/undo', { body: undo }).then(refresh).catch(fail);
        },
      },
    });
  };
  return { api, refresh, fail, offerUndo };
}

export function useClientActions() {
  const { api, refresh, fail, offerUndo } = useWriter();

  const create = useMutation({
    mutationFn: (input: CreateClientInput) =>
      api.request<ProjectsWriteResult<Client>>('POST', '/clients', { body: input }),
    onSuccess: ({ undo }) => {
      offerUndo('Client added.', undo);
      return refresh();
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: ({ id, ...patch }: UpdateClientInput) =>
      api.request<ProjectsWriteResult<Client>>('PATCH', `/clients/${id}`, { body: patch }),
    onSuccess: () => refresh(),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.request<ProjectsWriteResult<Client>>('DELETE', `/clients/${id}`),
    onSuccess: ({ undo }) => {
      offerUndo('Client deleted.', undo);
      void refresh();
    },
    onError: fail,
  });
  return { create, update, remove };
}

export function useProjectActions() {
  const { api, refresh, fail, offerUndo } = useWriter();

  const create = useMutation({
    mutationFn: (input: CreateProjectInput) =>
      api.request<ProjectsWriteResult<Project>>('POST', '/projects', { body: input }),
    onSuccess: ({ undo }) => {
      offerUndo('Project created.', undo);
      return refresh();
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: ({ id, ...patch }: UpdateProjectInput) =>
      api.request<ProjectsWriteResult<Project>>('PATCH', `/projects/${id}`, { body: patch }),
    onSuccess: () => refresh(),
    onError: fail,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProjectStatus }) =>
      api.request<ProjectsWriteResult<Project>>('POST', `/projects/${id}/status`, {
        body: { status },
      }),
    onSuccess: ({ undo }) => {
      offerUndo('Status changed.', undo);
      return refresh();
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.request<ProjectsWriteResult<Project>>('DELETE', `/projects/${id}`),
    onSuccess: ({ undo }) => {
      offerUndo('Project deleted.', undo);
      void refresh();
    },
    onError: fail,
  });
  /** Put a task in a project, move it, or take it out (projectId null). `message` is the toast text. */
  const setTaskProject = useMutation({
    mutationFn: ({
      taskId,
      projectId,
    }: {
      taskId: string;
      projectId: string | null;
      message: string;
    }) =>
      api.request<ProjectsWriteResult<Project>>('PUT', `/tasks/${taskId}/project`, {
        body: { projectId },
      }),
    onSuccess: ({ undo }, { message }) => {
      offerUndo(message, undo);
      return refresh();
    },
    onError: fail,
  });
  const setNoteProject = useMutation({
    mutationFn: ({
      noteId,
      projectId,
    }: {
      noteId: string;
      projectId: string | null;
      message: string;
    }) =>
      api.request<ProjectsWriteResult<Project>>('PUT', `/notes/${noteId}/project`, {
        body: { projectId },
      }),
    onSuccess: ({ undo }, { message }) => {
      offerUndo(message, undo);
      return refresh();
    },
    onError: fail,
  });
  return { create, update, setStatus, remove, setTaskProject, setNoteProject };
}

export function useMilestoneActions() {
  const { api, refresh, fail, offerUndo } = useWriter();

  const create = useMutation({
    mutationFn: ({
      projectId,
      ...body
    }: {
      projectId: string;
      title: string;
      dueAt?: string | null;
    }) =>
      api.request<ProjectsWriteResult<Milestone>>('POST', `/projects/${projectId}/milestones`, {
        body,
      }),
    onSuccess: ({ undo }) => {
      offerUndo('Milestone added.', undo);
      return refresh();
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: ({ id, ...patch }: UpdateMilestoneInput) =>
      api.request<ProjectsWriteResult<Milestone>>('PATCH', `/milestones/${id}`, { body: patch }),
    onSuccess: () => refresh(),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.request<ProjectsWriteResult<Milestone>>('DELETE', `/milestones/${id}`),
    onSuccess: ({ undo }) => {
      offerUndo('Milestone deleted.', undo);
      return refresh();
    },
    onError: fail,
  });
  return { create, update, remove };
}

export function useTimeActions() {
  const { api, refresh, fail, offerUndo } = useWriter();

  const start = useMutation({
    mutationFn: (input: { projectId: string; taskId?: string | null; note?: string }) =>
      api.request<ProjectsWriteResult<TimeEntry>>('POST', '/time-entries/start', { body: input }),
    onSuccess: () => refresh(),
    onError: fail,
  });
  const stop = useMutation({
    mutationFn: (id?: string) =>
      api.request<ProjectsWriteResult<TimeEntry>>('POST', '/time-entries/stop', {
        body: id ? { id } : {},
      }),
    onSuccess: ({ undo }) => {
      offerUndo('Timer stopped.', undo);
      return refresh();
    },
    onError: fail,
  });
  const add = useMutation({
    mutationFn: (input: AddTimeEntryInput) =>
      api.request<ProjectsWriteResult<TimeEntry>>('POST', '/time-entries', { body: input }),
    onSuccess: ({ undo }) => {
      offerUndo('Time added.', undo);
      return refresh();
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      taskId?: string | null;
      startedAt?: string;
      endedAt?: string;
      note?: string | null;
    }) =>
      api.request<ProjectsWriteResult<TimeEntry>>('PATCH', `/time-entries/${id}`, { body: patch }),
    onSuccess: () => refresh(),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.request<ProjectsWriteResult<TimeEntry>>('DELETE', `/time-entries/${id}`),
    onSuccess: ({ undo }) => {
      offerUndo('Time entry deleted.', undo);
      return refresh();
    },
    onError: fail,
  });
  return { start, stop, add, update, remove };
}
