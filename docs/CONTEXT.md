# Personal OS – Full Context (for the discuss session)

Read this file at the start of every `/discuss` session. It carries the context of the long planning chat where the project was designed. Keep it updated when decisions, status or working style change.

---

## 1. Who I am and how I work

- **Name:** Adith. Student and freelancer in Kerala, India. Timezone Asia/Kolkata.
- **The only user** of this app. It is my personal assistant.
- **Machine:** Windows 11, PowerShell. VS Code with Claude Code (model Sonnet 5.5).
- **Project folder:** `C:\Users\adith\OneDrive\Documents\personal-os`. The project is in the OneDrive\Documents folder, but the OneDrive app is uninstalled, so the folder does not sync. Controlled Folder Access is off so Cargo can write. Branch for the current work: `step-2-tasks-notes`.

### How I like to work (follow these always)

1. **Simple, understandable English.** Short sentences. No jargon without explaining it.
2. **Never present "use this or that" as a final answer.** Give options, then a clear recommendation, and let me decide. Ask me when a choice is mine.
3. **Ask doubts before building**, numbered and grouped. Never guess, even in auto mode.
4. **One feature at a time.** A "feature" is something I can see and test. Stop and report only at visible features. Internal work (schema, actions, refactors) is not a stopping point.
5. **I test every feature myself** before saying "next".
6. **Minimal design.** Quiet icons, lots of space, details on hover or selection.
7. **Never ask me to paste secrets** (database URL, keys, tokens) into chat. I edit `.env` files myself in Notepad.
8. **Give PowerShell commands**, not bash (`sed` and similar don't work in my terminal).
9. When I share a screenshot or reference design, **analyze it and adapt it to our design**; don't copy it.
10. I often write in quick, informal English. Understand the intent and confirm when unsure.

---

## 2. What Personal OS is

A desktop "personal operating system": one app for tasks, habits, Obsidian-style notes with a knowledge graph, calendar, Gmail, Google Drive, finance, wallet, subscriptions and projects, with an AI assistant built into every part. The AI answers questions about my data and acts across modules ("read the client email, add notes to the project, create tasks, remind me tomorrow").

- **Phase 1:** desktop app (Tauri 2).
- **Phase 2:** mobile app (Tauri 2 mobile) using the same backend and database.

Full product details: `docs/PRD.md`. Build order: `docs/ROADMAP.md`. Decisions with reasons: `docs/decisions/DECISIONS.md`.

---

## 3. Key decisions (summary – DECISIONS.md is the full list)

| Area | Decision |
|---|---|
| Desktop | Tauri 2, React 19, TypeScript, Vite, Tailwind v4, TanStack Router (file-based) and Query, Zustand, Motion, cmdk |
| Backend | Node.js 22 + TypeScript + Fastify (chosen over Python: one language, shared types; speed is the same) |
| Database | Supabase free, Mumbai. Postgres + Auth + Storage + Realtime + pgvector. Drizzle ORM. RLS on every table. Session pooler (IPv4). JWKS token check with jose |
| Data model | Universal entities + links tables connect everything. Money in paise. Store UTC, show Asia/Kolkata |
| Backend design | Action registry: every data change is an action with Zod input, permission level (read/write/external/destructive) and undo. The UI and the AI use the same actions |
| AI | Self-hosted OmniRoute gateway (one OpenAI-compatible endpoint, many providers, fallback). Routes: fast, smart, embed, coding (the backend uses only fast, smart and embed; coding is used only by my coding tools through Tailscale, never by the backend). Free providers first, configurable in Settings. Separate keys for the app and for coding tools; coding tools reach it via Tailscale. OmniRoute is a gateway, not an agent: the agent logic lives in the backend |
| Hosting | **AWS**, live at `adith-os.duckdns.org` (DuckDNS domain, Caddy HTTPS, Docker Compose). Oracle was abandoned (no free ARM capacity in Mumbai). The AWS server does NOT have the Step 2 code or DATABASE_URL yet; redeploy later. Watch the AWS free-plan time limit |
| Local development | Backend runs locally (`pnpm dev:server`, `http://127.0.0.1:3000/api/v1`). The desktop `.env` points `VITE_API_URL` there during Step 2. Port 3000 can be taken by another Docker container (ruview); auto-restart turned off |
| Design | Dark glass + light mode. Pastel module colors (Tasks yellow #F7D96B, Calendar orange #F6A462, Habits lime #C6E46E, Notes peach #F0C9A0, Graph periwinkle #B8C4F7, Mail sky #93D3F5, Drive slate #C5CCD6, Projects pink #F4A9C4, Money mint #9EE0C8, AI and accent lavender #C9B4F7). Inter font, Tabler icons. No sidebar: macOS-style bottom dock with magnification. Frameless window with a transparent title bar. Backgrounds: Transparent (Windows Acrylic, default) / Wallpaper / Solid, all in Settings |
| Liquid Glass | Built (decision 33, DESIGN.md section 2b): Liquid / Simple / Off with a Strength slider. Our own CSS + SVG filters, NOT the liquid-glass-js library (single-commit experiment, html2canvas can't see the desktop, one WebGL canvas per element). |
| Work process | Claude Code builds. Parallel agents (max 5 at once, Sonnet, git worktrees): server-dev, ui-dev, plus reviewers code-reviewer, design-reviewer, security-reviewer, docs-reviewer. Contract-first, file ownership, the orchestrator merges. Karpathy coding principles in CLAUDE.md. Project skills (verify, new-action, api-route, db-change, ui-design-system, data-hooks, time-and-money, testing-patterns, record-lesson, docs-sync, feature-report, orchestrate-feature, dev-environment, discuss) |
| Quality systems | Lessons system (docs/LESSONS.md + pitfalls.md per skill; prefer automated guards). Docs sync (doc-map.json + docs:check + commit-msg hook + docs-reviewer). Design consistency (design:check, shared components only, design audit: planned, design-consistency job). Schema-behind startup guard |

---

## 4. Tasks module redesign (Step 2) – decisions

- **Inner side panel** when Tasks opens: Overview, My tasks, Inbox (count), Reporting, Goals, Portfolios ("Soon", Step 5), Favorites (colored squares, + button). Features not built yet show disabled with "Soon".
- **Overview opens first** (dock click and Ctrl 2). It has a greeting, a "Tasks due soon" card (5 compact rows: overdue first, then today and upcoming) and glossy Favorite tiles (at most 6; the section is hidden until the first favorite exists).
- **My tasks:** views Cards (default) | List | Board, saved per device. Sections: Overdue, Today, Upcoming, No date, Completed (collapsed, last 7 days, "Show more").
  - **Cards:** checkbox, title (2 lines), tag chip (+N), Blocked badge, subtask progress bar "2/3", due date (red when overdue), repeat icon, priority flag. Hover lifts the card and shows a drag handle.
  - **Detail panel** on the right.
- **Dates:** overdue is date-based in India time (a 9 AM task stays in Today at 3 PM, with a red time). `due_all_day` column: all-day tasks show the date only.
- **Drag and drop:** reorder in manual sort only; drop on Today = today; Upcoming = date picker; Overdue = no drops; Completed = complete (with the blocked check); dragging a completed card out reopens it; Board columns change status.
- **Filter:** status, priority, tag, due range, archived. **Sort:** manual (default), due, priority, created, title. **Group:** due (default), none, tag, priority.
- **Tags:** plain table with entity_tags; colors auto-cycle through the palette; Manage tags dialog (built, feature 5).
- **Subtasks:** one level deep; completing them all doesn't complete the parent.
- **Dependencies:** a blocked task cannot be completed; cycles are rejected.
- **Recurring:** the next copy is created on completion, at the first RRULE occurrence after both the old due date and now.
- **Favorites:** stored on the server (task_favorites table); auto color and icon, changeable.
- **Inbox:** tasks with no date and no tags, excluding done and archived.
- **Quick add:** chrono-node, "#tag", "!1–!4" and "!urgent/high/medium/low", "every monday".
- **Reporting:** weeks start Monday; on-time rate; This week | This month switch; Recharts (decision 53).
- **Goals:** linked through the links table (goal entity type); progress counts top-level tasks only; asks "mark as achieved?" instead of changing status automatically.
- **Keyboard:** N, Space, Enter, Delete, Esc, arrow keys, "?" for help (page-scoped, no new Ctrl shortcuts).
- **Build order:** 1 panel + Overview + My tasks + detail + subtasks + tags + archive → 2 Board + drag and drop → 3 dependencies + recurring → 4 quick add → 5 favorites + manage tags → 6 inbox → 7 reporting → 8 goals.

---

## 5. Current status (update this section often)

- **Step 1:** done (shell, dock, login, settings, dashboard, palette, server, database, infra).
- **Skills, agents, lessons and docs-sync job:** done (commit f7a746d).
- **Step 2, Tasks feature 1:** built, tested and approved by me. ROADMAP.md is ticked.
- **Decisions 52 to 65:** up to 5 agents at once; Recharts instead of ECharts; keep dnd-kit, rrule and chrono-node; the drag and drop rules; the dependency and recurring rules; the quick add rules; the autonomous build loop; favorites and tag management; the Inbox rules; the Reporting rules; the Goals rules.
- **Design-consistency job** (design audit, design:check, shared-components rule, design-reviewer checklist): still unsent: I send it when I want it.
- **Tasks feature 2 (Board and drag and drop):** built, tested and approved by me (ROADMAP ticked). The dashboard Today's tasks tile is real. Next in order: feature 3 (dependencies and recurring), then 4 to 8, one prompt each; the design-consistency job comes before feature 3.
- **Tasks feature 3 (dependencies and recurring):** built, tested and approved by me (ROADMAP ticked). Then feature 4 (quick add).
- **Tasks feature 4 (quick add):** built and merged; reviews and the feature report in progress, waiting for my check and "next". Then 5 to 8, one at a time.
- **Autonomous loop (decision 58):** I am away; features 5 (favorites and manage tags), 6 (inbox) and 7 (reporting) are built one after the other without waiting for "next", each after a research memo (docs/design/research/). Features 4 to 7 wait for my check; nothing is ticked in ROADMAP.md until I say "next". Reports are in docs/reports/.
- **Tasks feature 5 (favorites and manage tags):** built and merged on step-2-tasks-notes; needs migrations 0006 and 0007 applied (`pnpm db:migrate`, I run it); reviews and the report in progress. Memos for features 6 (inbox) and 7 (reporting) are written in docs/design/research/.
- **Tasks features 4, 5, 6 and 7:** approved by me ("approve all", 2026-10-13) and ticked in ROADMAP.md. Feature 5 needs `pnpm db:migrate` (0006 and 0007), which I run. Reports: docs/reports/.
- **Next autonomous batch (decision 62):** Goals (Tasks feature 8), full-text search and realtime updates are built and merged (migrations 0008 to 0011 to apply; Realtime needs 0011: publication, SELECT for authenticated, REVOKE from anon; code in apps/desktop/src/realtime/); Notes (stages N1 to N4) follow; research memos for all are in docs/design/research/. The server redeploy needs DATABASE_URL in apps/server/.env on the server, which I do myself.
- **Discuss skill and this CONTEXT.md:** done.
- **Pending later:** Notes features, redeploying AWS, Step 3 (AI + OmniRoute + Tailscale), Step 4 (Google), and the rest of the roadmap.

---

## 6. How to help me in a discussion

1. Read this file, `docs/LESSONS.md` and the docs relevant to the topic, and check the real code.
2. Verify facts that may have changed (libraries, Claude Code features, cloud services) with web search or the official docs, and mention the source.
3. Give options, trade-offs and one clear recommendation. Answer from this file and the docs first; ask me only for choices that are mine and not already decided.
4. For visuals, make an HTML mockup in `docs/design/mockups/` following DESIGN.md, and give me the path.
5. Record agreed decisions in DECISIONS.md and the docs; update section 5 of this file when the status changes.
6. **Write the next prompt for the build session** when the discussion leads to building (see section 7).

---

## 7. How to write prompts for the build session

When a discussion is done, save the ready prompt to `docs/prompts/next.md` (overwrite it; keep old ones in `docs/prompts/archive/` with a date). I then tell the build session: "Do docs/prompts/next.md". Prompt rules:

- Start with what the message replaces or continues ("This replaces…", "Checked, working. next").
- Use numbered sections, with exact names, files, values and rules. No vague wording.
- Always include: "ask me if anything is unclear, even in auto mode", the stop rule (stop only when I can see and test a feature), report format, and "never read or edit .env files".
- Say what NOT to do (for example "do not start feature 2", "do not install that library").
- When I must do something (migrate, edit .env, test the real window), tell me separately, step by step, with PowerShell commands.

### Standard message types

- **Approval:** "Checked, working. <what I tested>. next" + approved decisions + "Commit X, tick it in ROADMAP.md, then start Y only."
- **Fix:** "Problem in feature (x): <what I saw>. Fix only this, run the checks again, and send a new feature report."
- **Answers to doubts:** "Answers by number:" and then 1, 2, 3…, each answer decided, with the reason when useful.
- **Plan approval:** "Plan approved, with these corrections: …" + "Start feature N only."

### Reviewing a build report for me

When I paste a report, check: did it follow the plan? Are there hidden decisions it made alone (list them so I can approve)? Is anything untested (the real Tauri window, real Supabase, Windows-specific)? Then give me the test checklist and the ready reply message.
