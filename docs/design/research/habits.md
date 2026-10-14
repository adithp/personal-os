# Habits: research memo (Step 5, lane habits)

References looked at (from knowledge, no web copy): Loop Habit Tracker (per-habit score, history calendar, frequency charts), Streaks (round one-tap check, streak number, flexible weekday schedules), TickTick Habits (counter habits with a daily goal, month calendar), Habitica (too gamified, not wanted), Way of Life (red/green day grid).

## Scope
- Must: habits with name, category, schedule (daily / weekly on chosen weekdays / custom every N days), target per scheduled day, reminder time (stored only), color override, notes, archive. One log per habit per India day (a count; done when count >= target), undo. Streaks (current, best) that skip non-scheduled days. Page with today's check-ins, create/edit dialog, detail (streak, history month calendar, statistics week / month / year), archive view, keyboard keys, empty / loading / error states.
- Nice, if time: category filter chips, streak-at-risk badge on today's list.
- Not now: AI coach, push notifications, reminders that fire, habit goals.

## Decisions
- D1 Plain tables `habits` and `habit_logs`, not entities (no links or search yet; entity type `habit` stays unused until the graph needs it).
- D2 "Target per period" means a count per scheduled day (1 = simple check, 8 = glasses of water). "Weekly" means chosen weekdays, "custom" means every N days from the start date (N 2 to 365). A "3 times a week, any day" habit is not supported (one reading only; ask later if wanted).
- D3 Schedule is a jsonb union, validated by Zod in packages/shared; the streak and statistics functions are pure and live there (`computeStreaks`, `buildHabitStats`, `isScheduledOn`).
- D4 Streak rules: counted in scheduled days; non-scheduled days are skipped; a scheduled day counts when count >= target; today does not break the current streak while open; "at risk" = streak above 0, today scheduled and not done. Days before the start date do not exist. Logs on non-scheduled days are kept but ignored by streaks.
- D5 Logging is allowed from the start date up to today (India), not on archived habits. `habits.log` sets the day's count (default = target), so a counter uses `count`; `unlog` deletes the row. Undo restores the previous count or removes the row.
- D6 Changing the schedule, target or start date recomputes streaks from the existing logs (history is not frozen). Documented as known behavior.
- D7 There is no delete action: archive keeps history; undo of create archives.
- D8 Stats are computed on the server per habit: `days` for the period (week Monday to Sunday, month, year) with scheduled / count / done / future flags, rate, streaks, total done. The year chart groups days by month in the client.
- D9 List returns every habit with `today`, streaks and `atRisk` (logs read in one query; one user, so small).

## Screens
- Habits page: header (title, Active / Archived switch, New habit). "Today" list: undone first, then done; round check, name, category chip, streak number (flame), count/target with a + for counters, at-risk badge. "Not today" group, collapsed. Right panel: detail (streak tiles, month calendar with done / missed / not scheduled / future days, statistics switch Week / Month / Year with a Recharts bar chart and rate, notes, Edit, Archive). Archived view with Restore.
- Dialog: name, category, schedule (chips for weekdays, number for every N days), target, reminder time (hint: stored only), color, notes.

## Keys (plain keys on the page, not while typing)
N new habit, Up / Down, Space toggle today's check, Enter open detail, E edit, Esc close, ? help.

## States
Empty (no habits: short text and a New habit button), loading skeletons, error with Retry, empty archive.
