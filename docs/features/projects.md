# Projects

## Purpose
Manage freelance, college, personal, and software projects in one place.

## Screens
The Projects page has an inner side panel: All projects, Clients, Time.
- All projects: cards with status, client, due date, progress, tracked time; filter by status.
- Project page tabs: Overview (milestones, progress), Tasks, Notes, Board, Timeline, Time.
- Clients: list and a client page with its projects and total hours.
- Time: running timer, totals per project and per week, recent entries.
Not built yet: files, emails, events, income and expenses, progress dashboard (later steps).

## Features
- Clients: name, email, phone, company, notes.
- Projects: title, description, status (active, on hold, done, archived), client, start and due date, color.
- Linked items: tasks and notes join a project through a live `belongs_to` link, one project per item. A task can also stay in a goal. Link and unlink from the project page, and from the task detail panel ("Project" row).
- Milestones: title, due date, done; progress shown as done over total.
- Progress: done over counted linked top-level tasks (same rule as goals).
- Kanban board: columns todo, doing, done; dragging changes the task status.
- Timeline: milestones and task due dates on a horizontal date axis with a today marker.
- Time tracking: one running timer at a time (start stops the previous), manual entries (at most 24 hours), per project and task, totals per project and per India week (Monday start). Times stored in UTC.
- Every write returns an undo (stopping a timer has no undo).
- Keys: n new project, j/k move, Enter open, Esc back, 1 to 6 tabs, t timer, ? help.

## Actions
clients.list/get/create/update/delete/restore, projects.list/get/items/taskProject/create/update/setStatus/delete/restore/setTaskProject/setNoteProject, milestones.list/create/update/delete/restore, time.list/running/summary/start/stop/add/update/delete/restore. Decisions: docs/design/research/projects.md.

## AI
Answers "What is the status of my freelance projects?" using tasks, deadlines, emails, and notes (AI project manager skill comes later).

## Done when
Each project page shows everything about that project, and the AI reports status correctly.
