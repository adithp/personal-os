# Tasks

## Purpose
Manage daily tasks and long-term goals.

## Screens
- List view with a quick-add box, a "To do" section and a "Done" section. Details (due date, priority) show quietly on each row. Every task can be dragged to reorder (dnd-kit, with a keyboard alternative).
- Kanban view (todo, doing, done) with drag and drop (dnd-kit).
- Task detail panel: title, description, status, priority, due date, reminder date, subtasks, tags, dependencies, recurrence.
- Archive: an "Archived" filter in the list view, plus archive and restore actions. There is no separate archive screen.
- Calendar view (Schedule-X) and the planning view (today, this week, this month) belong to the Calendar module (Step 4), not Step 2.

## Features
Create, edit, delete, subtasks, priorities 1–4, deadlines, reminders, recurring (RRULE), dependencies (blocks links), tags, filter, sort, search, archive.
Project link and category come in Step 5 (tags cover grouping until then).

## Rules
- Priority 1 is the most urgent, 4 the least (Urgent, High, Medium, Low). The default is 4.
- Dates are stored in UTC and shown and typed in India time (Asia/Kolkata, UTC+05:30).
- A reminder is only saved as a date for now. Notifications arrive with the reminder job.
- Subtasks go one level deep only.
- A blocked task (it has an unfinished task that blocks it) cannot be completed. It shows a "Blocked" badge listing the blockers, and the kanban refuses a move into Done with a clear message. A circular dependency (A blocks B blocks A) is rejected.
- Completing a recurring task creates the next copy. Its due date is the first occurrence of the RRULE that is after both the old due date and now (India time), so completing a task that is days overdue never creates a task that is already overdue.
- Recurrence is chosen from presets (daily, weekly on chosen days, monthly, yearly). The rule is stored as an RRULE; there is no free-text rule field.
- Deleting a task is a soft delete. Delete, complete, archive, and moves show an Undo toast.

## Actions
tasks.list, tasks.get, tasks.create, tasks.update, tasks.complete, tasks.delete, tasks.prioritize, tasks.restore

## AI
- Organize tasks into projects and tags.
- Suggest tasks from emails, notes, and projects.
- Prioritize by deadline, dependencies, and calendar free time.

## Done when
I manage all my tasks here, and the AI can create, update, and prioritize them from chat.
