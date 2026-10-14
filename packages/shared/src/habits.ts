import { z } from 'zod';
import { defineAction } from './actions';

/**
 * Habits (Step 5, docs/design/research/habits.md). A habit has a schedule (daily, weekly on chosen
 * weekdays, or custom = every N days) and a target per scheduled day (1 = a simple check, more =
 * a counter such as 8 glasses). A log is one row per habit per India calendar day with a count; the
 * day is done when count >= target. Dates are India calendar days as `YYYY-MM-DD`. The streak and
 * statistics functions at the bottom are pure and run on the server and in tests.
 */

/** Tables of this lane that screens show live. */
export const HABITS_REALTIME_TABLES = ['habits', 'habit_logs'] as const;

export const HABIT_NAME_MAX = 80;
export const HABIT_CATEGORY_MAX = 40;
export const HABIT_NOTES_MAX = 5000;
export const HABIT_TARGET_MAX = 100;
export const HABIT_CUSTOM_DAYS_MAX = 365;

const IST_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const isoTime = z.iso.datetime({ offset: true });
const id = z.uuid();
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14');

export const habitDateSchema = dateText.refine((value) => {
  const day = dayNumberOf(value);
  return Number.isFinite(day) && dateOfDay(day) === value;
}, 'Not a real date');

/** ISO weekdays: 1 = Monday ... 7 = Sunday. */
export const HABIT_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const HABIT_WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const habitScheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily') }),
  z.object({
    type: z.literal('weekly'),
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Pick at least one day')
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  }),
  z.object({
    type: z.literal('custom'),
    everyDays: z.number().int().min(2).max(HABIT_CUSTOM_DAYS_MAX),
  }),
]);
export type HabitSchedule = z.infer<typeof habitScheduleSchema>;

export const habitNameSchema = z.string().trim().min(1, 'Add a name').max(HABIT_NAME_MAX);
const category = z.string().trim().min(1).max(HABIT_CATEGORY_MAX).nullable();
const target = z.number().int().min(1).max(HABIT_TARGET_MAX);
const reminderTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 07:30')
  .nullable();
const color = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a color like #C6E46E')
  .nullable();
const notes = z.string().max(HABIT_NOTES_MAX);

export const HABIT_RANGES = ['week', 'month', 'year'] as const;
export type HabitRange = (typeof HABIT_RANGES)[number];

/** How a habit stands today (India day). */
export const habitTodaySchema = z.object({
  date: dateText,
  scheduled: z.boolean(),
  count: z.number().int().min(0),
  done: z.boolean(),
});
export type HabitToday = z.infer<typeof habitTodaySchema>;

export const habitSchema = z.object({
  id,
  name: z.string(),
  category: z.string().nullable(),
  schedule: habitScheduleSchema,
  target,
  /** Stored only; nothing is sent yet (push notifications are not built). */
  reminderTime: z.string().nullable(),
  /** A hex color that replaces the module color, or null. */
  color: z.string().nullable(),
  notes: z.string(),
  startDate: dateText,
  archivedAt: isoTime.nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
  today: habitTodaySchema,
  currentStreak: z.number().int().min(0),
  bestStreak: z.number().int().min(0),
  /** Scheduled today, not done yet, and a streak would break at midnight. */
  atRisk: z.boolean(),
});
export type Habit = z.infer<typeof habitSchema>;

export const habitDaySchema = z.object({
  date: dateText,
  scheduled: z.boolean(),
  count: z.number().int().min(0),
  done: z.boolean(),
  /** After today: not counted anywhere. */
  future: z.boolean(),
});
export type HabitDay = z.infer<typeof habitDaySchema>;

export const habitStatsSchema = z.object({
  id,
  range: z.enum(HABIT_RANGES),
  from: dateText,
  to: dateText,
  days: z.array(habitDaySchema),
  /** Scheduled days from the start of the habit up to today inside the range. */
  scheduledCount: z.number().int().min(0),
  doneCount: z.number().int().min(0),
  /** doneCount / scheduledCount, 0 to 1 (0 when nothing was scheduled). */
  rate: z.number().min(0).max(1),
  currentStreak: z.number().int().min(0),
  bestStreak: z.number().int().min(0),
  /** Days done since the habit began (all time). */
  totalDone: z.number().int().min(0),
});
export type HabitStats = z.infer<typeof habitStatsSchema>;

export const listHabitsInput = z.object({
  archived: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
    .default(false),
});
export type ListHabitsInput = z.input<typeof listHabitsInput>;

export const habitIdInput = z.object({ id });

const habitFields = {
  name: habitNameSchema,
  category: category,
  schedule: habitScheduleSchema,
  target,
  reminderTime,
  color,
  notes,
};

export const createHabitInput = z.object({
  name: habitFields.name,
  category: habitFields.category.optional(),
  schedule: habitFields.schedule.default({ type: 'daily' }),
  target: habitFields.target.default(1),
  reminderTime: habitFields.reminderTime.optional(),
  color: habitFields.color.optional(),
  notes: habitFields.notes.default(''),
  /** India day the habit starts; default today. */
  startDate: habitDateSchema.optional(),
});
export type CreateHabitInput = z.input<typeof createHabitInput>;

export const updateHabitInput = z
  .object({
    id,
    name: habitFields.name.optional(),
    category: habitFields.category.optional(),
    schedule: habitFields.schedule.optional(),
    target: habitFields.target.optional(),
    reminderTime: habitFields.reminderTime.optional(),
    color: habitFields.color.optional(),
    notes: habitFields.notes.optional(),
    startDate: habitDateSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 1, 'Nothing to change');
export type UpdateHabitInput = z.input<typeof updateHabitInput>;

/** Mark a day done. `count` is the new total for the day (default: the habit's target). */
export const logHabitInput = z.object({
  id,
  date: habitDateSchema.optional(),
  count: z
    .number()
    .int()
    .min(1)
    .max(HABIT_TARGET_MAX * 10)
    .optional(),
});
export type LogHabitInput = z.input<typeof logHabitInput>;

export const unlogHabitInput = z.object({ id, date: habitDateSchema.optional() });
export type UnlogHabitInput = z.input<typeof unlogHabitInput>;

export const habitStatsInput = z.object({
  id,
  range: z.enum(HABIT_RANGES).default('month'),
  /** Any India day inside the wanted period; default today. */
  anchor: habitDateSchema.optional(),
});
export type HabitStatsInput = z.input<typeof habitStatsInput>;

export const habitActions = {
  list: defineAction({
    name: 'habits.list',
    description: 'List habits with today status and streaks (active ones, or the archived ones).',
    permission: 'read',
    input: listHabitsInput,
  }),
  get: defineAction({
    name: 'habits.get',
    description: 'Get one habit with today status and streaks.',
    permission: 'read',
    input: habitIdInput,
  }),
  create: defineAction({
    name: 'habits.create',
    description:
      'Create a habit (daily, weekly on chosen weekdays, or every N days) with a target per day.',
    permission: 'write',
    input: createHabitInput,
  }),
  update: defineAction({
    name: 'habits.update',
    description: 'Change a habit (name, category, schedule, target, reminder, color, notes).',
    permission: 'write',
    input: updateHabitInput,
  }),
  archive: defineAction({
    name: 'habits.archive',
    description: 'Archive a habit. Its history is kept.',
    permission: 'write',
    input: habitIdInput,
  }),
  restore: defineAction({
    name: 'habits.restore',
    description: 'Bring an archived habit back.',
    permission: 'write',
    input: habitIdInput,
  }),
  log: defineAction({
    name: 'habits.log',
    description:
      'Mark a habit done for an India day (default today), or set its count for the day.',
    permission: 'write',
    input: logHabitInput,
  }),
  unlog: defineAction({
    name: 'habits.unlog',
    description: 'Remove the check-in of a habit for an India day (default today).',
    permission: 'write',
    input: unlogHabitInput,
  }),
  stats: defineAction({
    name: 'habits.stats',
    description:
      'Statistics of a habit for a week, month or year: per-day history, completion rate, streaks.',
    permission: 'read',
    input: habitStatsInput,
  }),
};

// ---------------------------------------------------------------------------------------------
// India calendar days and the streak calculation (pure)
// ---------------------------------------------------------------------------------------------

/** An India calendar day as a whole number of days since 1970-01-01. */
export const dayNumberOf = (date: string): number =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** YYYY-MM-DD of a day number. */
export const dateOfDay = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** The India calendar day (YYYY-MM-DD) of an instant. */
export const indiaDateOf = (time: Date): string =>
  dateOfDay(Math.floor((time.getTime() + IST_MS) / DAY_MS));

/** ISO weekday of a day number: 1 = Monday ... 7 = Sunday (1970-01-01 was a Thursday). */
export const isoWeekdayOfDay = (day: number): number => ((((day + 3) % 7) + 7) % 7) + 1;

/** Is the habit due on this day? Days before the start date are never due. */
export function isScheduledOn(schedule: HabitSchedule, startDate: string, date: string): boolean {
  const day = dayNumberOf(date);
  const start = dayNumberOf(startDate);
  if (day < start) return false;
  switch (schedule.type) {
    case 'daily':
      return true;
    case 'weekly':
      return schedule.days.includes(isoWeekdayOfDay(day));
    case 'custom':
      return (day - start) % schedule.everyDays === 0;
  }
}

export interface StreakInput {
  schedule: HabitSchedule;
  startDate: string;
  target: number;
  /** Count per India day that has a log. */
  counts: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
  today: string;
}

export interface Streaks {
  current: number;
  best: number;
  atRisk: boolean;
}

const countOf = (counts: StreakInput['counts'], date: string): number =>
  counts instanceof Map
    ? ((counts.get(date) as number | undefined) ?? 0)
    : ((counts as Record<string, number>)[date] ?? 0);

/**
 * Current and best streak in scheduled days. Days the habit is not scheduled on are skipped (they
 * neither add nor break). A scheduled day counts when its count reaches the target. Today does not
 * break the current streak while it is still open; it adds one once done. The streak is at risk
 * when it is above 0 and today is scheduled but not done.
 */
export function computeStreaks(input: StreakInput): Streaks {
  const { schedule, startDate, target, counts, today } = input;
  const start = dayNumberOf(startDate);
  const end = dayNumberOf(today);
  let run = 0;
  let best = 0;
  let todayOpen = false;
  for (let day = start; day <= end; day += 1) {
    const date = dateOfDay(day);
    if (!isScheduledOn(schedule, startDate, date)) continue;
    if (countOf(counts, date) >= target) {
      run += 1;
      best = Math.max(best, run);
    } else if (day === end) {
      todayOpen = true; // today is still open: keeps the run, adds nothing
    } else {
      run = 0;
    }
  }
  return { current: run, best, atRisk: todayOpen && run > 0 };
}

/** First and last India day (inclusive) of the week (Mon to Sun), month or year around `anchor`. */
export function rangeBounds(range: HabitRange, anchor: string): { from: string; to: string } {
  const day = dayNumberOf(anchor);
  if (range === 'week') {
    const from = day - (isoWeekdayOfDay(day) - 1);
    return { from: dateOfDay(from), to: dateOfDay(from + 6) };
  }
  const [yearText, monthText] = anchor.split('-');
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  if (range === 'month') {
    return {
      from: dateOfDay(Math.floor(Date.UTC(year, month, 1) / DAY_MS)),
      to: dateOfDay(Math.floor(Date.UTC(year, month + 1, 0) / DAY_MS)),
    };
  }
  return { from: `${String(year)}-01-01`, to: `${String(year)}-12-31` };
}

/** Per-day history, completion rate and streaks for one range of one habit. */
export function buildHabitStats(
  input: StreakInput & { range: HabitRange; anchor: string },
): Omit<HabitStats, 'id'> {
  const { schedule, startDate, target, counts, today, range, anchor } = input;
  const { from, to } = rangeBounds(range, anchor);
  const days: HabitDay[] = [];
  let scheduledCount = 0;
  let doneCount = 0;
  for (let day = dayNumberOf(from); day <= dayNumberOf(to); day += 1) {
    const date = dateOfDay(day);
    const future = date > today;
    const scheduled = isScheduledOn(schedule, startDate, date);
    const count = countOf(counts, date);
    const done = count >= target;
    days.push({ date, scheduled, count, done, future });
    if (!future && scheduled) {
      scheduledCount += 1;
      if (done) doneCount += 1;
    }
  }
  let totalDone = 0;
  for (let day = dayNumberOf(startDate); day <= dayNumberOf(today); day += 1) {
    const date = dateOfDay(day);
    if (isScheduledOn(schedule, startDate, date) && countOf(counts, date) >= target) totalDone += 1;
  }
  const streaks = computeStreaks(input);
  return {
    range,
    from,
    to,
    days,
    scheduledCount,
    doneCount,
    rate: scheduledCount === 0 ? 0 : doneCount / scheduledCount,
    currentStreak: streaks.current,
    bestStreak: streaks.best,
    totalDone,
  };
}
