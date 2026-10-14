# Projects lane: research memo (decisions only)

References looked at from knowledge (no web search this run): Linear (projects with status, target date, progress from issues, milestones), Notion projects database (status, client relation, timeline view), Toggl/Harvest (one running timer, manual entries, weekly totals), Height/Asana (board by status, timeline).

## Scope
Must: clients, projects, milestones, linked tasks and notes, kanban, timeline, time tracking, undo for every write, keyboard keys, empty/loading/error states.
Nice (built): project progress from tasks, client page with its projects and hours.
Not in scope: AI project manager and freelance skills, invoices, project expenses and income, files, emails, events.

## Decisions
- D1 A project is an entity (`project`), a client an entity (`client`). Tasks and notes join a project with a live `belongs_to` link (source item, target project). One project per item (like goals); a task can be in a goal and a project at the same time because each lookup filters by the target table.
- D2 Status: active, on_hold, done, archived (enum `project_status`). Dates are India day starts (like goal targets).
- D3 Progress = done over counted linked top-level tasks (same rule as goals: archived and not done are not counted). Milestones have their own done/total.
- D4 Milestones are a plain table (title, due day, doneAt, position), no entity.
- D5 Time entries: one table, `endedAt` null = running, a partial unique index allows one running entry per user. Start stops the running one. Manual entries max 24 hours. Stop has no undo (an ended entry cannot be reopened by an action); start, add, update, delete are undoable. Week = India week, Monday start.
- D6 Linking from the task detail panel is a small "Project" row (one extra line in task-detail-panel); linking from the project page uses pickers.
- D7 One route `/projects`; the inner navigation (All projects, Clients, Time) and the open project live in a Zustand store, so no new route files (routeTree.gen.ts is shared).
- D8 Board = columns todo/doing/done of the project's tasks; dragging uses the existing tasks.move action. Timeline = plain divs on a date axis (milestones, task due dates, today marker).

## Actions
clients.list/get/create/update/delete/restore; projects.list/get/items/taskProject/create/update/setStatus/delete/restore/setTaskProject/setNoteProject; milestones.list/create/update/delete/restore; time.list/running/summary/start/stop/add/update/delete/restore.

## Keyboard
n new project, j/k move in lists, Enter open, Esc back, 1 to 6 switch project tabs, t start/stop timer on the open project, ? help.

## Empty/error states
Every list has a short empty text with the action to start, a skeleton while loading, and an error box with Retry.
