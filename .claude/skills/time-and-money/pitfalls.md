# Pitfalls: time-and-money

Lessons for this area (index: docs/LESSONS.md). Add new ones with the record-lesson skill.

### 2026-10-09: rrule treats dates as floating UTC, which shifts days around midnight India time
- Symptom: (expected) a weekly task landing on the wrong day near 00:00 IST
- Cause: rrule has no time zone: it works on the UTC parts of the date it is given
- Fix: Convert to India wall-clock, make a floating-UTC date, ask rrule, convert each result back; test on time, 5 days late, month ends
- Prevention: documented, time-and-money SKILL (guard planned in the Feature 3 tests)

### 2026-10-09: All-day due dates must be stored as the start of the India day
- Symptom: An all-day task with 15:30 stored disagreed with the documented storage
- Cause: The server only checked that a date existed
- Fix: Create and update normalise dueAt to the India day start when dueAllDay is true
- Prevention: guarded, apps/server/src/actions/tasks.ts (normalises) and its tests

### 2026-10-09: Typing a year in a date-time box passes through invalid years
- Symptom: Saves of 0002, 0020, 0202 on the way to 2026
- Cause: The browser fires change for each valid intermediate value
- Fix: Keep a draft and save on blur or Enter only
- Prevention: guarded, task-detail tests (draft saved on blur or Enter)

### 2026-10-12: chrono en.GB reads "oct 12" as the year 2012
- Symptom: Typing "oct 12" gave October 2012
- Cause: In en.GB the month-day parser skips year-like dates, so the month-year parser wins; plain en reads "5/10" month first
- Fix: Use a clone of en.GB with that one parser swapped for the one from en.casual
- Prevention: guarded, the date table in quick-add/parse.test.ts ("oct 12", "12 oct", "5/11")

### 2026-10-12: The first date of a repeat typed in quick add must follow the same short-month rule as the server
- Symptom: "every month on the 31st" typed on 1 November gave 31 December while the server gives 30 November for later copies
- Cause: The parser skipped short months, the server uses the last day
- Fix: Clamp the day to the month length in the parser
- Prevention: guarded, quick-add/parse.test.ts

### 2026-10-12: chrono marks a lone month name as day 1 with a certain day
- Symptom: "Call April about rent" got a due date of 1 April
- Cause: isCertain(day) is true for a month name alone
- Fix: A match with a month name counts only when the text has a digit
- Prevention: guarded, quick-add/parse.test.ts
