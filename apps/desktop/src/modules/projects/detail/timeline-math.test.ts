import { describe, expect, it } from 'vitest';
import { makeTask } from '../../../test/fake-api';
import { makeMilestone, makeProject } from '../../../test/fake-projects';
import { buildTimeline, positionPercent } from './timeline-math';

// 3 PM on Tuesday 7 October 2025 in India
const NOW = Date.parse('2025-10-07T09:30:00.000Z');
// Start of 1 Oct and of 31 Oct 2025 in India time
const OCT_1 = '2025-09-30T18:30:00.000Z';
const OCT_31 = '2025-10-30T18:30:00.000Z';

describe('buildTimeline', () => {
  it('runs from the start date to the due date, in whole India days', () => {
    const project = makeProject({ startAt: OCT_1, dueAt: OCT_31 });
    const timeline = buildTimeline(project, [], [], NOW);
    expect(new Date(timeline.start).toISOString()).toBe(OCT_1);
    // The due day is included: the axis ends when it ends
    expect(new Date(timeline.end).toISOString()).toBe('2025-10-31T18:30:00.000Z');
    expect(timeline.ticks.length).toBeLessThanOrEqual(6);
    expect(new Date(timeline.ticks[0] ?? 0).toISOString()).toBe(OCT_1);
  });

  it('lists dated milestones and top-level tasks, oldest first, and skips the rest', () => {
    const project = makeProject({ startAt: OCT_1, dueAt: OCT_31 });
    const milestones = [
      makeMilestone(project.id, { title: 'Late', dueAt: '2025-10-20T06:30:00.000Z' }),
      makeMilestone(project.id, { title: 'No date' }),
    ];
    const tasks = [
      makeTask({ title: 'Early', dueAt: '2025-10-10T06:30:00.000Z' }),
      makeTask({ title: 'Undated' }),
      makeTask({
        title: 'Sub',
        parentTaskId: '00000000-0000-4000-8000-000000000001',
        dueAt: '2025-10-11T06:30:00.000Z',
      }),
      makeTask({
        title: 'Archived',
        dueAt: '2025-10-12T06:30:00.000Z',
        archivedAt: '2025-10-01T00:00:00.000Z',
      }),
    ];
    const timeline = buildTimeline(project, milestones, tasks, NOW);
    expect(timeline.items.map((item) => item.title)).toEqual(['Early', 'Late']);
    expect(timeline.items.map((item) => item.kind)).toEqual(['task', 'milestone']);
  });

  it('always includes today and widens a short range to a week', () => {
    const project = makeProject({
      startAt: null,
      dueAt: null,
      createdAt: '2025-10-07T00:00:00.000Z',
    });
    const timeline = buildTimeline(project, [], [], NOW);
    expect(timeline.end - timeline.start).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000);
    expect(NOW).toBeGreaterThanOrEqual(timeline.start);
    expect(NOW).toBeLessThanOrEqual(timeline.end);
  });

  it('stretches to an item before the start date or after the due date', () => {
    const project = makeProject({ startAt: OCT_1, dueAt: OCT_31 });
    const tasks = [makeTask({ dueAt: '2025-11-15T06:30:00.000Z' })];
    const timeline = buildTimeline(project, [], tasks, NOW);
    expect(timeline.end).toBeGreaterThan(Date.parse('2025-11-15T06:30:00.000Z'));
  });
});

describe('positionPercent', () => {
  it('is 0 at the start, 100 at the end and clamps outside', () => {
    const axis = { start: 1000, end: 3000 };
    expect(positionPercent(axis, 1000)).toBe(0);
    expect(positionPercent(axis, 2000)).toBe(50);
    expect(positionPercent(axis, 3000)).toBe(100);
    expect(positionPercent(axis, 0)).toBe(0);
    expect(positionPercent(axis, 9000)).toBe(100);
  });
});
