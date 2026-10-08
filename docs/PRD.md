# Personal OS – Product Requirements Document

## 1. Overview
Personal OS is a desktop app that puts my whole life in one place: tasks, habits, notes, calendar, email, files, money, and projects, with AI built into every part.

The problem: my information is spread across many apps that don't talk to each other, so I waste time switching and lose track of how things connect.

The solution: one app where everything is linked. An email becomes a task, the task belongs to a project, the project has notes and files, and the AI sees all of it. I ask questions in plain English and ask the AI to do work for me.

The vision: a personal assistant that understands my entire workspace and can actually work with it, not just a chatbot.

## 2. Goals
- Manage personal life, studies, freelance work, and projects from one app.
- Link everything: emails, tasks, notes, files, events, money, and projects.
- Ask questions and give instructions in plain English; the AI acts across every module.
- Keep data in the cloud so the Phase 2 mobile app shows the same data instantly.
- Hosting costs about ₹0 per month; only AI usage is paid (starting with free models).

## 3. Non-goals (this version)
- Multiple users, teams, or sharing.
- Selling or publishing the app publicly.
- Full offline use (the app needs internet to make changes).
- Automatic bank syncing (finance starts with manual entry and statement import).
- MCP as a core requirement (the app uses its own internal action system).

## 4. Target user
One user: me. A student and freelancer managing college projects, freelance clients, software projects, and personal life.

## 5. Phase 1 modules (desktop)
1. Tasks – subtasks, priorities, deadlines, reminders, recurring tasks, dependencies, categories, tags; list, kanban, and calendar views; daily/weekly/monthly planning; filter, sort, search, archive; AI organization, suggestions, and prioritization.
2. Habits – custom habits, daily/weekly/custom schedules, streaks, history, calendar view, statistics, categories, reminders, goals, notes; AI insights and recommendations.
3. Notes and knowledge – Markdown and rich text, tables, code, math, callouts, images, files, embeds; wikilinks, backlinks, tags, nested folders, properties, templates, daily notes, aliases, favorites, pinned, archived, version history, full-text search, advanced filtering.
4. Knowledge graph – interactive graph of notes, tags, projects, tasks, people, and files; zoom, pan, select, open, filter, search, local graph.
5. Calendar – Google Calendar events; create, edit, delete, recurring, reminders, multiple calendars; day, week, month, agenda views; link to tasks and projects; AI scheduling and daily planning.
6. Gmail – read, send, reply, forward, search, draft, delete, archive, star, labels, attachments, important emails, filtering; AI summaries, drafts, task and deadline extraction.
7. Google Drive – browse, search, upload, download, open, preview, manage; link files to projects and notes; AI search over file content.
8. Finance – income, expenses, transactions, categories, budgets, savings, goals, monthly summaries, spending analysis, reports, dashboards, recurring transactions.
9. Subscriptions – categories, monthly and yearly cost, renewal dates, reminders, history, upcoming renewals, total cost.
10. Wallet – cash, account balances, wallets, payment methods, transfers, balance history, spending overview; linked to Finance.
11. Projects – freelance, college, personal, and software projects with tasks, milestones, deadlines, status, kanban, timeline, client info, notes, files, time tracking, income, expenses, progress dashboard.

Plus: AI Skills Manager, internal AI action system, unified assistant, cross-app actions, customizable dashboards, global search, connections between everything, and a Settings area where appearance, dock, wallpaper, and AI providers are configurable.

## 6. AI system
- One assistant available everywhere that understands the whole app.
- All AI requests go through OmniRoute. Providers start with free models and are configurable in Settings.
- Every capability is an action with a permission level (read, write, external, destructive).
- Skills define instructions, allowed actions, and context; a fast model picks the skill per request.
- The AI can chain actions across modules and reports what it did.
- The same OmniRoute server also serves my coding tools, using a separate API key.
Full detail: docs/AI_SYSTEM.md.

## 7. Design
Dark glass design with bright pastel tiles and a macOS-style magnifying bottom dock, plus a matching light mode. Full detail: docs/DESIGN.md.

## 8. Architecture and hosting
Desktop app (Tauri 2) → Fastify backend on an AWS ARM server (Oracle Cloud Always Free later) → Supabase (Mumbai) for data, and OmniRoute for AI. Full detail: docs/ARCHITECTURE.md and docs/DEPLOYMENT.md.

## 9. Phase 2 – mobile
Tauri 2 mobile app using the same backend, database, AI, and integrations. Mobile includes tasks, habits, notes, knowledge graph, calendar, Gmail, Drive, finance, projects, AI assistant, dashboard, and push notifications.

## 10. Success criteria for Phase 1
- I use the app every day instead of separate task, note, and finance apps.
- The AI correctly completes: "Read the client email about the website project, summarize it, add the key points to the project notes, create the tasks with deadlines, and remind me tomorrow."
