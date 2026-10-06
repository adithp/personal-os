# Dashboard

## Purpose
One screen that shows my whole day and lets me act on it.

## Layout
Follows docs/DESIGN.md section 8.
- Main column: greeting and search, assistant card, two wide tiles (Today's tasks, Important emails), three small tiles (Money, Streak, Projects), then a Quick actions row (New task, New note, Log expense, New event).
- Right column (280 px): mini calendar, Upcoming (Today and Tomorrow, at most 4 events), Activity (3 items with "View all").
- Tiles and the assistant card are compact so the main column fits the 1100×700 minimum window. The two columns scroll independently when the window is shorter or the content is taller.

## Widgets
| Widget | Color | Shows |
|---|---|---|
| Today's tasks | Tasks yellow | done of total, progress bar, next due task |
| Next event | Calendar orange | time of next event, title, minutes until (in the first layout this is shown by the Upcoming card instead) |
| Habits streak | Habits lime | best current streak, today's habits |
| Money | Money mint | spent this month of budget, % used |
| Projects | Projects pink | active count, top two with progress |
| Important emails | Mail blue | count needing reply, top two subjects |
| Upcoming renewals | Money mint | renewals in the next 7 days with cost |
| Recent notes | Notes peach | last 3 edited notes |
| Reminders | Tasks yellow | next reminders |
| AI insights | AI lavender | one insight from the Daily planner skill |
| Quick actions | AI lavender | new task, new note, log expense, new event |

## Behavior
- Add, remove, move, and resize widgets (react-grid-layout).
- Multiple dashboards; defaults: Work (projects, tasks, emails, calendar) and Personal (habits, money, calendar, tasks).
- Layouts saved in the dashboards table.
- Data comes from GET /dashboard/today and refreshes on realtime events.
- Each tile's corner button opens its module.

## Done when
I can open the app in the morning and see everything I need for the day without opening another screen.
