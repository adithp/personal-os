# AI system

AI is the intelligence layer across the whole app. The AI never touches the database directly; it uses tools (actions), and the backend runs them.

## 1. OmniRoute
- One self-hosted OmniRoute server on the server machine (Docker, private network, never public).
- Pinned to a reviewed, patched version. No automatic updates.
- Two gateway API keys:
  - assistant – used only by the Personal OS backend.
  - coding – used by Claude Code, Codex, and other coding tools on my laptop, reached through Tailscale, with its own usage limits so coding never uses up the assistant's quota.
- Providers: start with the free providers and free models available at setup time. Providers, keys, and fallback order are managed in Settings → AI, which opens the OmniRoute dashboard inside the app over Tailscale.
- Model routes (OmniRoute aliases), each changeable in Settings → AI:

| Route | Used for |
|---|---|
| fast | choosing skills, tagging, sorting, short summaries |
| smart | planning, multi-step actions, long answers |
| embed | embeddings for search by meaning |
| coding | coding tools only |

- Only models that support tool calling are allowed on fast and smart.

## 2. Agent loop (backend, Vercel AI SDK)
1. Receive the message from /ai/chat.
2. The fast route picks one or more skills.
3. Build the context: today's date (Asia/Kolkata), relevant data, and top note matches from hybrid search.
4. Call the smart route with only the selected skills' actions as tools.
5. For each tool call: validate input with Zod, check permission, run the action, log it, return the result.
6. Repeat until the model answers, up to 10 tool steps.
7. Stream the answer to the app, with a summary of every action taken.

## 3. Actions
Every capability is an action defined once in packages/shared and implemented in apps/server/src/actions:
name, description, Zod input schema, permission, handler, and undo (for write actions).

The UI and the AI call the same actions.

## 4. Permission levels
| Level | Examples | Behavior |
|---|---|---|
| read | search notes, list tasks, read email | runs automatically |
| write | create task, update note, log expense | runs, shows an undo button |
| external | send email, create event with guests | waits for my confirmation in the chat |
| destructive | delete project, delete email, bulk changes | always waits for my confirmation |

Every action is recorded in ai_action_log (Step 3). Until then the registry only tells observers after each action (success or failure); no log table exists yet.

Today: read = tasks.list, tasks.get, tags.list; write = tasks.create, tasks.update, tasks.archive, tasks.unarchive, tasks.complete, tasks.move, tasks.addBlocker, tasks.removeBlocker, tasks.reopen, tasks.prioritize, tasks.restore, tags.create, tags.update; destructive = tasks.delete. The app's buttons run actions with confirmed = true (a button press is the confirmation), so deleting in the app does not prompt; a call from the AI without confirmation is stopped by the registry (409 confirmation_required) until the user confirms.

`tasks.addBlocker` and `tasks.removeBlocker` (write): add or remove a link with relation blocks from the blocker to the blocked task (cycles, self links and unknown tasks are refused); each one's undo is the other. `tasks.reopen` (write) is the undo of completing a repeating task: it restores the old values and removes the copy that completing it created (only live copies that are not done, with the same repeat rule and parent, and their subtasks); it has no undo of its own. It is meant as an undo: the AI should not call it on its own.

`tasks.move` (write): puts a task between two neighbours (`afterId` above, `beforeId` below) and can change its status and due date in the same step through the same code as tasks.update. The new position is the middle between the neighbours; when the gap is smaller than 1e-6 the siblings are renumbered first. The undo is a tasks.update with the old status, dates and position (tasks.update accepts `position`, from -1e9 to 1e9); the renumbered siblings are not restored (their order does not change).

Undo: a write returns an undo (an action plus its input). tasks.create undoes with tasks.delete (tags created by name stay), tasks.delete with tasks.restore (and back), tasks.update (and tasks.complete and tasks.move) with tasks.update carrying the old values, except when the change completes a repeating task: then the undo is tasks.reopen with the old values and the id of the new copy; tasks.addBlocker and tasks.removeBlocker undo each other (undo is null when nothing changed); tasks.reopen has no undo, archive and unarchive undo each other, tags.update undoes itself, tags.create has no undo. POST /undo runs it through the same registry.

## 5. Action list (Phase 1)
- tasks: list, get, create, update, archive, unarchive, complete, move, addBlocker, removeBlocker, reopen, delete, restore, prioritize
- tags: list, create, update
- habits: list, log, stats
- notes: search, get, create, update, append, summarize, link
- graph: related
- calendar: list, create, update, delete
- gmail: search, read, draft, send, reply, forward, archive, star, label, delete
- drive: search, list, read_text, upload
- projects: list, get, create, update, status
- finance: add_transaction, summary, budget_status
- subscriptions: list, upcoming, add, update
- wallet: balances, transfer
- reminders: create
- search: global
- links: create

## 6. Skills
Built-in skills (editable in the Skills Manager): Email assistant, Finance assistant, Project manager, Daily planner, Habit coach, Knowledge assistant, Research assistant, Calendar assistant, Subscription assistant, Freelance assistant, Coding assistant.

Each skill has: instructions, allowed actions, context sources, model route, and an on/off switch. I can create new skills and edit existing ones.

## 7. Knowledge answers (RAG)
- Notes are split into chunks and embedded with the embed route; updated every 10 minutes for changed notes.
- Questions about my notes use hybrid search: Postgres full-text plus pgvector, merged, top 8 chunks sent to the model with links to the source notes.

## 8. Example cross-app flow
"Read the client email about the website project, summarize it, add the key points to the project notes, create the tasks, and remind me tomorrow."
gmail.search → gmail.read → projects.get → notes.append → tasks.create (one per item, with deadlines) → reminders.create → summary to me.
