import { formatInr, percentOf } from '@personal-os/shared';
import type { ActivityEntry } from './activity-card';
import type { UpcomingEvent } from './upcoming-card';

/**
 * Static placeholder data for the dashboard (feature e). It is replaced by GET /dashboard/today
 * when the modules exist. Money is integer paise.
 */
export const DASHBOARD_DATA = {
  summary: 'You have 4 tasks due today and a client call at 3:00 PM.',
  tasks: { done: 3, total: 7, nextTitle: 'Submit DBMS assignment', nextDue: '5:00 PM' },
  emails: {
    needReply: 3,
    topSubjects: ['Website feedback – need your reply', 'Invoice #204 question'],
  },
  /** Days from today that have events (dots in the mini calendar). */
  eventDayOffsets: [0, 1, 3, 6, 10, 17, 24],
  /** Next events; the card shows at most four. */
  upcoming: [
    {
      day: 'today',
      time: '3:00 PM',
      title: 'Client call – website project',
      module: 'calendar',
      minutesUntil: 45,
    },
    { day: 'today', time: '5:00 PM', title: 'Submit DBMS assignment', module: 'tasks' },
    { day: 'tomorrow', time: '10:00 AM', title: 'Project review', module: 'projects' },
    { day: 'tomorrow', time: '4:30 PM', title: 'Gym session', module: 'habits' },
    { day: 'tomorrow', time: '6:00 PM', title: 'Team sync', module: 'calendar' },
  ],
  money: { spentPaise: 1_245_000, budgetPaise: 2_000_000 },
  streak: { days: 12, habit: 'Morning workout' },
  projects: {
    active: 4,
    top: [
      { name: 'Website redesign', progress: 70 },
      { name: 'Mobile app', progress: 35 },
    ],
  },
  activity: [
    {
      module: 'mail',
      title: 'New email from Rahul',
      description: 'Website feedback and next steps',
    },
    { module: 'tasks', title: 'Task completed', description: 'Submit DBMS assignment' },
    { module: 'money', title: 'Expense logged', description: `${formatInr(45_000)} · Food · UPI` },
    { module: 'notes', title: 'Note edited', description: 'Cybersecurity project plan' },
    { module: 'calendar', title: 'Event added', description: 'Client call · Today, 3:00 PM' },
    { module: 'habits', title: 'Streak extended', description: 'Morning workout · 12 days' },
  ],
} as const satisfies {
  summary: string;
  upcoming: readonly UpcomingEvent[];
  activity: readonly ActivityEntry[];
} & Record<string, unknown>;

export function moneyTileText() {
  const { spentPaise, budgetPaise } = DASHBOARD_DATA.money;
  const percent = percentOf(spentPaise, budgetPaise);
  return {
    spent: formatInr(spentPaise),
    percent,
    line: `${String(percent)}% of ${formatInr(budgetPaise)} budget`,
  };
}

export function tasksProgressPercent(): number {
  return percentOf(DASHBOARD_DATA.tasks.done, DASHBOARD_DATA.tasks.total);
}
