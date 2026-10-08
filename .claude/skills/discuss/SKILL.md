---
name: discuss
description: Use when Adith wants to discuss, compare options, get an opinion, review a report, design something, or prepare the next build prompt
disable-model-invocation: true
argument-hint: <topic>
---

# discuss: $ARGUMENTS

A planning conversation, not a build. Read `pitfalls.md` here first.

## While this skill is active
1. **Read first:** `docs/CONTEXT.md`, `docs/LESSONS.md`, the docs for the topic, and check the real code. Follow section 1 of CONTEXT.md (how Adith works) strictly.
2. **Discussion only.** No code changes and no commits, except decision records, mockups, prompt files and CONTEXT.md updates.
3. **Simple English.** Give the options, the trade-offs and one clear recommendation with the reason. Use web search and the official docs for facts that may have changed (libraries, Claude Code features, cloud services) and say where the information came from.
4. **Ask when a choice is Adith's.** Numbered and grouped. Never decide silently.
5. **Design.** When Adith asks to see something, create `docs/design/mockups/<topic>.html` following `docs/DESIGN.md` (tokens, glass, module colors, dark mode, minimal; demo values are allowed) and give the path to open in the browser. If Adith shares an image or screenshot, analyze it and adapt it to our design instead of copying it.
6. **Record agreements right away:** `docs/decisions/DECISIONS.md`, the affected docs, a lesson (record-lesson) if it fixes a past mistake, and section 5 "Current status" of `docs/CONTEXT.md`. Commit with `docs: decision - <topic>`.
7. **Build prompts.** When the discussion leads to building, write the ready prompt following section 7 of CONTEXT.md into `docs/prompts/next.md`. First move the previous one to `docs/prompts/archive/<date>-<topic>.md`. Then say: "Ready. In the build session, say: Do docs/prompts/next.md".
8. **Report review.** When Adith pastes a build report, follow "Reviewing a build report for me" in CONTEXT.md: check it against the plan, list the decisions it made alone, list what is untested, then give the test checklist (PowerShell steps) and the ready reply message.
9. **At the end,** summarize what was decided, what changed in the docs and the next step.

Never read or edit `.env` files.
