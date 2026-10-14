import { describe, expect, it } from 'vitest';
import { realtimeRegistry } from '../../realtime/registry';

const has = (table: keyof typeof realtimeRegistry, key: string) =>
  realtimeRegistry[table].some((entry) => entry[0] === key);

describe('Projects live updates', () => {
  it('refreshes clients and projects when either changes', () => {
    expect(has('clients', 'clients')).toBe(true);
    expect(has('clients', 'projects')).toBe(true);
    expect(has('projects', 'projects')).toBe(true);
    expect(has('projects', 'clients')).toBe(true);
  });

  it('refreshes milestones and the projects that carry their progress', () => {
    expect(has('project_milestones', 'project-milestones')).toBe(true);
    expect(has('project_milestones', 'projects')).toBe(true);
  });

  it('refreshes time, projects and clients when time entries change', () => {
    expect(has('time_entries', 'time-entries')).toBe(true);
    expect(has('time_entries', 'projects')).toBe(true);
    expect(has('time_entries', 'clients')).toBe(true);
  });

  it('refreshes the items of a project when tasks, notes or links change', () => {
    expect(has('tasks', 'projects')).toBe(true);
    expect(has('notes', 'projects')).toBe(true);
    expect(has('links', 'projects')).toBe(true);
  });
});
