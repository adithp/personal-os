---
name: time-and-money
description: Rules for dates, times, recurrence, and money: UTC storage, Asia/Kolkata display, India calendar-day sections, all-day due dates, rrule floating-UTC pitfalls, and integer paise with en-IN formatting. Use whenever code handles a date, a due time, a recurring rule, or an amount of money.
---

# time-and-money

Rules 4 and 5 of CLAUDE.md: money is integer paise; dates are stored in UTC and shown in Asia/Kolkata. Read `pitfalls.md` here first.

## Time
- **Store UTC.** Columns are `timestamptz`. The API sends ISO 8601 strings with a zone (`2025-10-07T11:30:00.000Z`); inputs are validated with `z.iso.datetime({ offset: true })`.
- **Show India time.** India is UTC+05:30 with no daylight saving, so it is a fixed offset. Helpers in `apps/desktop/src/modules/tasks/dates.ts`: `toIstInput`/`fromIstInput` (date-time boxes), `toIstDate`/`fromIstDate` (date boxes), `startOfIstDay`, `istDayStartPlus`, `istDay` (whole days since 1970 in India), `dueLabel` (Today, Tomorrow, Yesterday, weekday and date). Use them instead of `toLocaleString` or `new Date(y, m, d)` (those use the machine's zone).
- **India calendar days** decide sections (`sections.ts`): Overdue means the due DAY is before today in India. A task due today at 9 AM is still Today at 3 PM, with its time shown in red.
- **All-day due dates** (`due_all_day`): the server stores the start of that India day (`2025-10-06T18:30:00.000Z` is 7 October) and normalises any time to it; the UI shows the date only. Turning All day off uses 9:00 AM India time on that date.
- **A date-time box in India time:** typed `2025-10-07T17:00` means `2025-10-07T11:30:00.000Z`. Keep a draft while typing and save on blur or Enter (typing a year passes through 0002, 0020, 0202).
- **Tests:** use `vi.setSystemTime` or fake timers, and test around midnight India time (00:10 IST is still the previous day in UTC), month ends, and a leap day.

## Recurrence (from Feature 3; library `rrule` 2.8.1)
- A rule is stored as RRULE text (`FREQ=WEEKLY;BYDAY=MO`), chosen from presets (daily, weekly on days, monthly, yearly), no free-text field.
- **rrule works in "floating UTC":** it treats the date parts you give it as UTC and returns dates the same way. India midnight is 18:30 UTC the day before, so a naive call shifts days. Convert the base date to an India wall-clock value first, make a floating-UTC date from those wall-clock parts, ask rrule, then convert each result back from India wall-clock to real UTC. Never pass real UTC instants straight through.
- **Next date rule:** the next due date is the first occurrence that is after BOTH the old due date and now (India time); otherwise completing a task that is days overdue creates a task that is already overdue. Test: complete on time, 5 days late, month ends (31st, 29 Feb).
- Any change of status to done spawns the next copy, and its undo must remove that copy (decision 47).

## Money (Step 6; helpers in `packages/shared/src/money.ts`)
- Integer **paise** everywhere (`amount_paise`, `currency` default `'INR'`). Never floats: convert rupees to paise with rounding at the input edge only.
- Format with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` (lakh and crore grouping).
- Sums and budgets are sums of integers; percentages are computed for display only.
