# Habits

Research and decisions: docs/design/research/habits.md.

## Purpose
Build and track habits.

## Screens
- Habits page (Step 5): header with an Active / Archived switch and New habit; today's check-ins (one click on the round check; counter habits show count/target with a +; undone first, then done; habits not scheduled today in a collapsed "Not today" group); streak number and an "at risk" badge.
- Habit detail: current and best streak, history calendar (month grid, click a past day to toggle its log), statistics for week, month and year (completion rate, done/scheduled, total done, bar chart), notes.
- Create or edit habit dialog: name, category, schedule (daily, weekly on chosen weekdays, custom every N days), target per day, reminder time (stored only), color override, notes, archive.
- Archive view with Restore.

## Rules
- A schedule is daily, weekly on chosen ISO weekdays, or custom (every N days from the start date). "Target" is the count per scheduled day that makes it done (1 = simple check).
- One log per habit per India calendar day (a count). Logging is allowed from the start date up to today; archived habits cannot be logged.
- Streaks count scheduled days only: days the habit is not scheduled on are skipped, a missed scheduled day breaks the streak, and today does not break it while it is open. The functions are pure and tested in packages/shared/src/habits.ts.
- Reminder time is stored only: nothing is sent yet (no push notifications).
- Archive keeps the history; there is no delete. Undo of create archives.
- Changing the schedule, target or start date recomputes streaks from the existing logs.

## Features
Custom habits, daily/weekly/custom schedules, streaks, completion tracking, history, calendar view, statistics, categories, reminder time (stored), notes, archive. Not built: reminders that fire, habit goals, AI coach.

## Actions
habits.list, habits.get, habits.create, habits.update, habits.archive, habits.restore, habits.log, habits.unlog, habits.stats (see docs/AI_SYSTEM.md and docs/API.md).

## Keyboard
Plain keys on the page: N, Up/Down, Space, Enter, E, Esc, ? (docs/DESIGN.md section 9).

## AI
- Insights such as "Why have I been missing my workout habit recently?" using habit logs, calendar, and tasks.
- Recommendations for better times or smaller goals.
- Warns in the activity feed when a streak is at risk.
(All of this comes with the AI step; only the data and actions exist now.)

## Done when
I track all habits daily and the AI explains my patterns.
