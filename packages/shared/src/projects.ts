import { z } from 'zod';
import { defineAction } from './actions';
import { taskSchema } from './tasks';

/**
 * Projects lane (docs/features/projects.md): clients, projects, milestones, linked tasks and notes,
 * and time tracking. A project is an entity (type `project`) and a client an entity (type `client`);
 * tasks and notes join a project through a live `belongs_to` link (source = task or note, target =
 * project), one project per item. A task can stay in a goal as well (a goal link goes to a goal).
 */

/** Tables of this lane that screens show live. */
export const PROJECTS_REALTIME_TABLES = [
  'clients',
  'projects',
  'project_milestones',
  'time_entries',
] as const;

export const PROJECT_STATUSES = ['active', 'on_hold', 'done', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  done: 'Done',
  archived: 'Archived',
};

export const PROJECT_TITLE_MAX = 200;
export const PROJECT_DESCRIPTION_MAX = 20000;
export const MAX_ITEMS_PER_PROJECT = 500;
export const MILESTONE_TITLE_MAX = 200;
export const TIME_NOTE_MAX = 500;
/** A single time entry can be at most this long (seconds). */
export const MAX_TIME_ENTRY_SECONDS = 24 * 60 * 60;

const isoTime = z.iso.datetime({ offset: true });
const id = z.uuid();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #7C9CF5');

// ----- Clients

export const CLIENT_NAME_MAX = 200;
const clientName = z.string().trim().min(1, 'Name is required').max(CLIENT_NAME_MAX);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

/** A client as the API returns it. */
export const clientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
  /** Live projects of this client. */
  projectCount: z.number().int().min(0),
  /** Tracked seconds over all projects of this client (finished entries only plus the running one). */
  trackedSeconds: z.number().int().min(0),
});
export type Client = z.infer<typeof clientSchema>;

export const clientIdInput = z.object({ id });
export const listClientsInput = z.object({});
export const createClientInput = z.object({
  name: clientName,
  email: optionalText(200).optional(),
  phone: optionalText(50).optional(),
  company: optionalText(200).optional(),
  notes: optionalText(20000).optional(),
});
export type CreateClientInput = z.infer<typeof createClientInput>;
export const updateClientInput = z
  .object({
    id,
    name: clientName.optional(),
    email: optionalText(200).optional(),
    phone: optionalText(50).optional(),
    company: optionalText(200).optional(),
    notes: optionalText(20000).optional(),
  })
  .refine((input) => Object.keys(input).length > 1, { message: 'Nothing to change' });
export type UpdateClientInput = z.infer<typeof updateClientInput>;

// ----- Projects

export const projectProgressSchema = z.object({
  done: z.number().int().min(0),
  total: z.number().int().min(0),
});
export type ProjectProgress = z.infer<typeof projectProgressSchema>;

/** A project as the API returns it. Dates are the start of the India day, as ISO UTC. */
export const projectSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  color: z.string().nullable(),
  startAt: isoTime.nullable(),
  dueAt: isoTime.nullable(),
  client: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
  /** Linked top-level tasks: done over counted (archived and not done are not counted, like goals). */
  progress: projectProgressSchema,
  /** Milestones done over all milestones. */
  milestones: projectProgressSchema,
  noteCount: z.number().int().min(0),
  /** Total tracked seconds (finished entries plus the running one up to now). */
  trackedSeconds: z.number().int().min(0),
});
export type Project = z.infer<typeof projectSchema>;

/** What a task carries about its project (null when it has none). */
export const taskProjectSchema = z.object({ id: z.uuid(), title: z.string() });
export type TaskProject = z.infer<typeof taskProjectSchema>;

const projectTitle = z.string().trim().min(1, 'Title is required').max(PROJECT_TITLE_MAX);
const projectDescription = z.string().max(PROJECT_DESCRIPTION_MAX).nullable();

export const listProjectsInput = z.object({
  status: projectStatusSchema.optional(),
  clientId: id.optional(),
});
export const projectIdInput = z.object({ id });

export const createProjectInput = z
  .object({
    title: projectTitle,
    description: projectDescription.optional(),
    clientId: id.nullable().optional(),
    startAt: isoTime.nullable().optional(),
    dueAt: isoTime.nullable().optional(),
    color: hexColor.nullable().optional(),
  })
  .refine(
    (input) => !input.startAt || !input.dueAt || Date.parse(input.dueAt) >= Date.parse(input.startAt),
    { message: 'The due date cannot be before the start date', path: ['dueAt'] },
  );
export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const updateProjectInput = z
  .object({
    id,
    title: projectTitle.optional(),
    description: projectDescription.optional(),
    clientId: id.nullable().optional(),
    startAt: isoTime.nullable().optional(),
    dueAt: isoTime.nullable().optional(),
    color: hexColor.nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 1, { message: 'Nothing to change' });
export type UpdateProjectInput = z.infer<typeof updateProjectInput>;

export const setProjectStatusInput = z.object({ id, status: projectStatusSchema });

/** Put a task in a project, move it to another, or take it out (projectId null). */
export const setTaskProjectInput = z.object({ taskId: id, projectId: id.nullable() });
export type SetTaskProjectInput = z.infer<typeof setTaskProjectInput>;
/** The same for a note. */
export const setNoteProjectInput = z.object({ noteId: id, projectId: id.nullable() });
export type SetNoteProjectInput = z.infer<typeof setNoteProjectInput>;

export const taskProjectInput = z.object({ taskId: id });

/** A note linked to a project. */
export const projectNoteSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  updatedAt: isoTime,
});
export type ProjectNote = z.infer<typeof projectNoteSchema>;

/** The linked items of a project: all its top-level tasks (archived too) and its notes. */
export const projectItemsSchema = z.object({
  tasks: z.array(taskSchema),
  notes: z.array(projectNoteSchema),
});
export type ProjectItems = z.infer<typeof projectItemsSchema>;

// ----- Milestones

export const milestoneSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  dueAt: isoTime.nullable(),
  doneAt: isoTime.nullable(),
  position: z.number(),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type Milestone = z.infer<typeof milestoneSchema>;

const milestoneTitle = z.string().trim().min(1, 'Title is required').max(MILESTONE_TITLE_MAX);
export const listMilestonesInput = z.object({ projectId: id });
export const milestoneIdInput = z.object({ id });
export const createMilestoneInput = z.object({
  projectId: id,
  title: milestoneTitle,
  dueAt: isoTime.nullable().optional(),
});
/** `done: true` sets doneAt to now, `false` clears it. */
export const updateMilestoneInput = z
  .object({
    id,
    title: milestoneTitle.optional(),
    dueAt: isoTime.nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 1, { message: 'Nothing to change' });
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneInput>;

// ----- Time tracking

export const timeEntrySchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  projectTitle: z.string(),
  taskId: z.uuid().nullable(),
  taskTitle: z.string().nullable(),
  startedAt: isoTime,
  /** null while the timer runs. */
  endedAt: isoTime.nullable(),
  /** Seconds: endedAt - startedAt, or now - startedAt while running. */
  seconds: z.number().int().min(0),
  note: z.string().nullable(),
  createdAt: isoTime,
});
export type TimeEntry = z.infer<typeof timeEntrySchema>;

const timeNote = optionalText(TIME_NOTE_MAX);

export const startTimerInput = z.object({
  projectId: id,
  taskId: id.nullable().optional(),
  note: timeNote.optional(),
});
/** Stops the running timer (the id is optional: the running one). */
export const stopTimerInput = z.object({ id: id.optional() });
export const addTimeEntryInput = z
  .object({
    projectId: id,
    taskId: id.nullable().optional(),
    startedAt: isoTime,
    endedAt: isoTime,
    note: timeNote.optional(),
  })
  .refine((input) => Date.parse(input.endedAt) > Date.parse(input.startedAt), {
    message: 'The end must be after the start',
    path: ['endedAt'],
  })
  .refine(
    (input) =>
      Date.parse(input.endedAt) - Date.parse(input.startedAt) <= MAX_TIME_ENTRY_SECONDS * 1000,
    { message: 'An entry can be at most 24 hours', path: ['endedAt'] },
  );
export type AddTimeEntryInput = z.infer<typeof addTimeEntryInput>;
export const updateTimeEntryInput = z
  .object({
    id,
    taskId: id.nullable().optional(),
    startedAt: isoTime.optional(),
    endedAt: isoTime.optional(),
    note: timeNote.optional(),
  })
  .refine((input) => Object.keys(input).length > 1, { message: 'Nothing to change' });
export const timeEntryIdInput = z.object({ id });
export const listTimeEntriesInput = z.object({
  projectId: id.optional(),
  taskId: id.optional(),
  from: isoTime.optional(),
  to: isoTime.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export const timeSummaryInput = z.object({
  projectId: id.optional(),
  /** How many India weeks (Monday start) to report, newest last. */
  weeks: z.coerce.number().int().min(1).max(26).default(8),
});

export const timeSummarySchema = z.object({
  totalSeconds: z.number().int().min(0),
  byProject: z.array(
    z.object({ projectId: z.uuid(), title: z.string(), seconds: z.number().int().min(0) }),
  ),
  /** weekStart: the Monday 00:00 India time of the week, as ISO UTC. */
  byWeek: z.array(z.object({ weekStart: isoTime, seconds: z.number().int().min(0) })),
});
export type TimeSummary = z.infer<typeof timeSummarySchema>;

// ----- Actions

export const clientActions = {
  list: defineAction({
    name: 'clients.list',
    description: 'List clients with their project count and tracked hours.',
    permission: 'read',
    input: listClientsInput,
  }),
  get: defineAction({
    name: 'clients.get',
    description: 'Get one client.',
    permission: 'read',
    input: clientIdInput,
  }),
  create: defineAction({
    name: 'clients.create',
    description: 'Create a client (name, email, phone, company, notes).',
    permission: 'write',
    input: createClientInput,
  }),
  update: defineAction({
    name: 'clients.update',
    description: 'Change the details of a client.',
    permission: 'write',
    input: updateClientInput,
  }),
  delete: defineAction({
    name: 'clients.delete',
    description: 'Delete a client (its projects stay, without a client). It can be restored.',
    permission: 'destructive',
    input: clientIdInput,
  }),
  restore: defineAction({
    name: 'clients.restore',
    description: 'Bring back a deleted client.',
    permission: 'write',
    input: clientIdInput,
  }),
} as const;

export const projectActions = {
  list: defineAction({
    name: 'projects.list',
    description: 'List projects (optionally by status or client) with progress and tracked time.',
    permission: 'read',
    input: listProjectsInput,
  }),
  get: defineAction({
    name: 'projects.get',
    description: 'Get one project with its progress.',
    permission: 'read',
    input: projectIdInput,
  }),
  items: defineAction({
    name: 'projects.items',
    description: 'List the tasks and notes linked to a project.',
    permission: 'read',
    input: projectIdInput,
  }),
  taskProject: defineAction({
    name: 'projects.taskProject',
    description: 'Get the project a task belongs to (or null).',
    permission: 'read',
    input: taskProjectInput,
  }),
  create: defineAction({
    name: 'projects.create',
    description: 'Create a project (title, client, dates, color).',
    permission: 'write',
    input: createProjectInput,
  }),
  update: defineAction({
    name: 'projects.update',
    description: 'Change the title, description, client, dates, or color of a project.',
    permission: 'write',
    input: updateProjectInput,
  }),
  setStatus: defineAction({
    name: 'projects.setStatus',
    description: 'Set a project active, on hold, done, or archived.',
    permission: 'write',
    input: setProjectStatusInput,
  }),
  delete: defineAction({
    name: 'projects.delete',
    description: 'Delete a project (its tasks and notes stay). It can be restored.',
    permission: 'destructive',
    input: projectIdInput,
  }),
  restore: defineAction({
    name: 'projects.restore',
    description: 'Bring back a deleted project.',
    permission: 'write',
    input: projectIdInput,
  }),
  setTaskProject: defineAction({
    name: 'projects.setTaskProject',
    description: 'Put a task in a project, move it to another project, or take it out.',
    permission: 'write',
    input: setTaskProjectInput,
  }),
  setNoteProject: defineAction({
    name: 'projects.setNoteProject',
    description: 'Put a note in a project, move it to another project, or take it out.',
    permission: 'write',
    input: setNoteProjectInput,
  }),
} as const;

export const milestoneActions = {
  list: defineAction({
    name: 'milestones.list',
    description: 'List the milestones of a project.',
    permission: 'read',
    input: listMilestonesInput,
  }),
  create: defineAction({
    name: 'milestones.create',
    description: 'Add a milestone (title, optional due date) to a project.',
    permission: 'write',
    input: createMilestoneInput,
  }),
  update: defineAction({
    name: 'milestones.update',
    description: 'Change a milestone or mark it done or not done.',
    permission: 'write',
    input: updateMilestoneInput,
  }),
  delete: defineAction({
    name: 'milestones.delete',
    description: 'Delete a milestone. It can be restored.',
    permission: 'destructive',
    input: milestoneIdInput,
  }),
  restore: defineAction({
    name: 'milestones.restore',
    description: 'Bring back a deleted milestone.',
    permission: 'write',
    input: milestoneIdInput,
  }),
} as const;

export const timeActions = {
  list: defineAction({
    name: 'time.list',
    description: 'List time entries (by project, task, or period), newest first.',
    permission: 'read',
    input: listTimeEntriesInput,
  }),
  running: defineAction({
    name: 'time.running',
    description: 'Get the running timer, or null.',
    permission: 'read',
    input: z.object({}),
  }),
  summary: defineAction({
    name: 'time.summary',
    description: 'Total tracked time, per project and per India week.',
    permission: 'read',
    input: timeSummaryInput,
  }),
  start: defineAction({
    name: 'time.start',
    description: 'Start the timer on a project (stops the running one first).',
    permission: 'write',
    input: startTimerInput,
  }),
  stop: defineAction({
    name: 'time.stop',
    description: 'Stop the running timer.',
    permission: 'write',
    input: stopTimerInput,
  }),
  add: defineAction({
    name: 'time.add',
    description: 'Add a finished time entry by hand.',
    permission: 'write',
    input: addTimeEntryInput,
  }),
  update: defineAction({
    name: 'time.update',
    description: 'Change the times, task, or note of a time entry.',
    permission: 'write',
    input: updateTimeEntryInput,
  }),
  delete: defineAction({
    name: 'time.delete',
    description: 'Delete a time entry. It can be restored.',
    permission: 'destructive',
    input: timeEntryIdInput,
  }),
  restore: defineAction({
    name: 'time.restore',
    description: 'Bring back a deleted time entry.',
    permission: 'write',
    input: timeEntryIdInput,
  }),
} as const;

/** What a write route of this lane returns. */
export interface ProjectsWriteResult<T> {
  item: T;
  undo: { action: string; input: Record<string, unknown> } | null;
}

/** Whole percent of a progress, or null when there is nothing to count. */
export function progressPercent(progress: ProjectProgress): number | null {
  return progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
}

/** "1h 05m", "45m", "0m" (no seconds; under a minute shows "<1m" when above zero). */
export function formatDuration(seconds: number): string {
  if (seconds > 0 && seconds < 60) return '<1m';
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${String(hours)}h ${String(rest).padStart(2, '0')}m` : `${String(rest)}m`;
}
