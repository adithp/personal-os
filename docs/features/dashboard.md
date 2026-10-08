# Dashboard

## Purpose
One screen that shows my whole day and lets me act on it.

## Layout
Follows docs/DESIGN.md section 8.
- Main column: greeting and date, a wide search field (type to open the command palette with your text), the assistant card, then a 3 by 2 grid of equal-size cards: Today's tasks, Important emails, Money, Streak, Projects, and the Quick actions card (New task, New note, Log expense, New event in a 2 by 2 grid).
- Right column (280 px): mini calendar, Upcoming (Today and Tomorrow, at most 4 events), Activity (3 items with "View all").
- The greeting follows India time (05:00–11:59 morning, 12:00–16:59 afternoon, otherwise evening) and the date reads like "Tuesday, 7 October". The search field is an input whose value stays empty: typing opens the palette with the typed text. The page is at most 1200 px wide.
- Today the dashboard is a fixed layout filled with static placeholder data (modules/dashboard/dashboard-data.ts). It is not connected to the real Tasks module yet (a known limitation). Activity "View all" says "Coming in a later step"; the mini calendar shows static event dots and any day opens the Calendar placeholder; the assistant card answers "The assistant arrives in step 3."
- At the 1100×700 minimum window the main column fits without scrolling; the two columns scroll independently if the window is shorter.

## Widgets
Built so far: Today's tasks, Important emails, Money, Streak (the "Habits streak" row), Projects, and Quick actions; the Upcoming card in the right column shows the next events. The rest are planned (Upcoming renewals, Recent notes, Reminders, AI insights).

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
| Quick actions | glass card with module-colored icon squares | New task (opens My tasks with the add box focused), New note, Log expense, New event (these three show "<Module> arrives in step N" until built) |

## Behavior
Planned (ROADMAP Step 7, customizable dashboards); today the layout is fixed.
- Add, remove, move, and resize widgets (react-grid-layout).
- Multiple dashboards; defaults: Work (projects, tasks, emails, calendar) and Personal (habits, money, calendar, tasks).
- Layouts saved in the dashboards table.
- Data comes from GET /dashboard/today and refreshes on realtime events.
- Each tile's corner button opens its module.

## Done when
I can open the app in the morning and see everything I need for the day without opening another screen.
