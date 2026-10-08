# Tasks

## Purpose
Manage daily tasks and long-term goals.

## Screens
- My tasks page with a quick-add bar (title only for now), Filter, Sort, and Group menus, and two views: Cards (default) and List. Tasks are grouped into Overdue, Today, Upcoming, No date, and Completed (last 7 days, "Show more"). Drag to reorder and the Board (kanban) view are planned (Feature 2); Board shows as a disabled "Soon" button.
- Task detail panel (340 px): title, status (To do, Doing, Done), priority, due (date and time, or date only with an All day switch), reminder, repeat and blocked by (placeholders, "Not available yet", until Feature 3), tags, subtasks (one level), notes, Archive or Unarchive, Delete.
- Archive: an "Archived" filter in the list view, plus archive and restore actions. There is no separate archive screen.
- Calendar view (Schedule-X) and the planning view (today, this week, this month) belong to the Calendar module (Step 4), not Step 2.

## Features
Create, edit, delete, subtasks, priorities 1–4, deadlines, reminders, recurring (RRULE), dependencies (blocks links), tags, filter, sort, archive. Searching tasks from the palette is planned (the filter menu covers status, priority, tag, due, and archived today).
Project link and category come in Step 5 (tags cover grouping until then).

## Rules
- Priority 1 is the most urgent, 4 the least (Urgent, High, Medium, Low). The default is 4.
- Dates are stored in UTC and shown and typed in India time (Asia/Kolkata, UTC+05:30). A due date can be all-day (date only, no time).
- The redesigned screens (side panel, Overview, My tasks) are described in docs/features/tasks-redesign.md.
- A reminder is only saved as a date for now. Notifications arrive with the reminder job.
- Subtasks go one level deep only.
- (Built in Feature 3; the server only has stubs now.) A blocked task (it has an unfinished task that blocks it) cannot be completed. It shows a "Blocked" badge listing the blockers, and the kanban (planned) refuses a move into Done with a clear message. Today the server enforces it on complete and update, and the "Blocked" badge shows on cards and rows. A circular dependency (A blocks B blocks A) is rejected.
- (Built in Feature 3; recurrence cannot be set yet.) Any change of a task to done (the checkbox, the status control, a drag, the AI) creates the next copy of a recurring task, and its undo removes that copy. Its due date is the first occurrence of the RRULE that is after both the old due date and now (India time), so completing a task that is days overdue never creates a task that is already overdue.
- Recurrence is chosen from presets (daily, weekly on chosen days, monthly, yearly). The rule is stored as an RRULE; there is no free-text rule field.
- Deleting a task is a soft delete. Complete, delete, and archive show an Undo toast ("Task completed.", "Task deleted.", "Task archived."); moves will too once drag and drop exists. Reopening and unarchiving do not.
- Due dates read "Today, 5:00 PM", "Tomorrow", "Yesterday", "Mon, 13 Oct" (with the year when it is not this year); an all-day task shows no time. Overdue (red) means an earlier India day; a task due today at a time that has passed shows only its time in red.
- The UI calls GET /tasks, GET /tasks/:id, POST /tasks, PATCH /tasks/:id, POST /tasks/:id/complete, DELETE /tasks/:id, POST /tasks/:id/archive, POST /tasks/:id/unarchive, and POST /undo; priority changes go through PATCH.
- Wording: the status "doing" is called "Doing" in the detail panel and "In progress" on cards and in the filter menu.

## Actions
tasks.list, tasks.get, tasks.create, tasks.update, tasks.archive, tasks.unarchive, tasks.complete, tasks.delete, tasks.prioritize, tasks.restore; tags.list, tags.create, tags.update

## AI
- Organize tasks into projects and tags.
- Suggest tasks from emails, notes, and projects.
- Prioritize by deadline, dependencies, and calendar free time.

## Done when
I manage all my tasks here, and the AI can create, update, and prioritize them from chat.
