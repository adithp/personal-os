# Tasks Feature 7: Reporting – research and decision memo

Written 2026-10-13 by the research agent (decision 58: autonomous loop). The owner reviews this later. Every decision lists its sources, the options that were rejected, and a confidence level, so a wrong guess is easy to find and change.

Already fixed before this memo (not redone here): a Reporting page in the Tasks side panel, weeks start on Monday, an on-time rate, a "This week | This month" switch, Recharts 3.10.1 (decision 53), a read action `tasks.report` with no new tables, dates stored in UTC and shown in India time, India calendar days decide "today".

Mockup: `docs/design/mockups/tasks-reporting.html` (open it in a browser; buttons at the top switch dark and light, week and month, and the empty state).

---

## 1. Sources

### Opened and read (the facts in this memo come from these)
| # | Source | What it gave |
|---|---|---|
| S1 | https://www.todoist.com/help/todoist/features/use-the-productivity-view-in-todoist-6S63uAa9 | Todoist Productivity: Daily and Weekly tabs, completed tasks of the last 7 days as a chart coloured by project, last 4 weeks in the Weekly tab, daily goal line, streaks, days off, Karma |
| S2 | https://help.ticktick.com/articles/7082302534169133056 (read in the browser) | TickTick: completion trend per day, week, month; completion rate = tasks completed in the period divided by tasks originally scheduled for it; compares this week with last week; achievement points |
| S3 | https://forum.asana.com/t/team-member-performance-dashboard-completion-on-time-report-vs-overdue-deadlines/96653 | Asana: on time vs late = completion date compared with due date; once a task is completed the missed deadline is no longer visible in Asana's own charts |
| S4 | https://asana.com/resources/dashboards | Asana dashboard chart types: bar, donut (complete, incomplete, overdue), lollipop, burnup, numeric roll-ups |
| S5 | https://linear.app/docs/insights | Linear Insights: issue count as bar charts, cycle and lead time as scatterplots, slicing by label, project and so on, burn-up charts, filters on created and completed dates |
| S6 | https://www.nngroup.com/articles/dashboards-preattentive/ | NN/g: dashboards are for a fast glance; use length (bars) and 2D position (lines); avoid pies, donuts, gauges, 3D; colour is secondary and must not carry magnitude |
| S7 | https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | WCAG 1.4.11: chart parts need 3:1 against adjacent colours, unless labels and values or a table give the same information |
| S8 | https://github.com/recharts/recharts/wiki/3.0-migration-guide | Recharts 3: `accessibilityLayer` is on by default; `TooltipProps` renamed `TooltipContentProps` for custom tooltips; `CategoricalChartState` removed; `Customized` no longer needed for custom axes |
| S9 | https://github.com/recharts/recharts/wiki/Recharts-and-accessibility | `accessibilityLayer`: one tab stop, arrow keys move between data points, `role="application"`; JAWS and NVDA work directly, VoiceOver needs QuickNav off |
| S10 | https://recharts.github.io/en-US/api/BarChart/ | BarChart props: `accessibilityLayer` (default true), `responsive` (default false), `width` and `height` (number or percent), `margin`, `barCategoryGap` (default "10%"), `barGap`, `maxBarSize`, and `title`, `desc`, `role`, `tabIndex`, `style` (listed without descriptions) |
| S11 | https://recharts.github.io/en-US/guide/sizes/ | The `responsive` prop (Recharts 3.3 and later) resizes the chart with its parent and works in CSS grid and flex; `ResponsiveContainer` is the older way |
| S12 | https://recharts.github.io/en-US/api/ResponsiveContainer/ | ResponsiveContainer props (width, height, aspect, minHeight, debounce, initialDimension); uses ResizeObserver |
| S13 | https://recharts.github.io/en-US/api/Tooltip/ | Tooltip props: `content`, `cursor`, `formatter`, `labelFormatter`, `contentStyle`, `wrapperStyle`, `isAnimationActive` ("auto" follows reduced motion), `trigger`, `portal`, `defaultIndex` |
| S14 | https://recharts.github.io/en-US/api/Bar/ | Bar props: `dataKey`, `radius` (number or four corners), `maxBarSize`, `name`, `isAnimationActive` ("auto"), `activeBar`, `label`, `minPointSize` (default 0, so a zero shows no bar) |
| S15 | https://mobbin.com/search/apps/ios?content_type=screens&q=productivity+stats (screenshots viewed) | Real app stats screens: a Days / Weeks / Months / All time tab row at the top; a row of 3 numbers above one bar chart; "current" and "best" rows as plain text lines |
| S16 | https://mobbin.com/search/apps/ios?content_type=screens&q=tasks+completed+chart (screenshots viewed) | A progress screen with a strip of 3 small stats including "vs prior 30 days" as plain text; single-colour bar charts with few gridlines |
| S17 | https://dribbble.com/tags/productivity-dashboard (screenshots viewed) | Concept shots: one big number with a trend chart, and small stat cards each with a number, a coloured +/− badge and a thin progress bar (busy; badges and many colours) |
| S18 | dataviz skill in this environment (references: choosing-a-form, marks-and-anatomy, interaction, anti-patterns) and its `validate_palette.js` | Stat tiles for single numbers, bars ≤ 24 px with 4 px rounded tops, hairline solid grid, legend only for 2+ series, tooltips never the only way to a value, a table view, keep the previous render while refetching; the validator results in section 5 |

### Seen only in search-result summaries (not opened; treated as unverified)
- Recharts 3.3 release note "ResponsiveContainer is now built-in to all charts" (newreleases.io); the official guide S11 confirms the `responsive` prop itself.
- Recharts bundle size: about 68 kB min+gzip for one tree-shaken chart and about 136 to 158 kB for everything (codingdunia.com, pkgpulse.com, recharts.github.io/en-US/examples/BundleSizeTreemap). Numbers disagree between sources. **Unverified.**
- CSS variables in Recharts `fill` work in browsers, but legend and tooltip swatches may not resolve them (shadcn/ui chart docs, a GitHub issue in leonarduk/allotmint). **Unverified**; our design avoids the risky case (custom tooltip, no Recharts legend).
- Broken streaks lower motivation (Silverman and Barasch, Journal of Consumer Research 2023, via psychologytoday.com and phys.org summaries). **Unverified** beyond the summaries.
- Things 3 has no statistics screen, only the Logbook (several reviews). **Unverified.**
- ISO 8601 weeks start on Monday; Unicode CLDR may give Sunday as the first day for en-IN (search summary). **Unverified**; we do not rely on the locale anyway.

### Could not view
- Behance: searched, no page opened (no statistics screen stood out in results).
- Mobbin pages for Todoist and TickTick statistics: the Todoist search showed only list and settings screens.
- Browser screenshots were thumbnails at reduced size; fine details (exact font sizes, colours) were not readable. The browser extension disconnected twice, so only 3 reference pages were viewed as images.
- The mockup itself was checked with local headless Chrome screenshots (dark week, light month, empty week); the real Tauri WebView2 window was not used.

---

## 2. What the research says (short)

- **Leading apps keep personal stats small.** Todoist shows completed tasks per day for 7 days and per week for 4 weeks, plus goals and streaks (S1). TickTick shows a completion trend and a completion rate, compared with last period (S2). Things has no stats at all (unverified). Asana and Linear are team tools with many charts (S4, S5); for one person they are too much.
- **Honest metrics for one person:** tasks done per day, an on-time rate with its real counts, what is overdue right now, tasks added vs done (is the list growing?), and where the work went (tags). These answer real questions: "Did I get things done?", "Am I meeting my dates?", "Is my list growing?".
- **Vanity or risky metrics:** points and levels (Karma, achievement scores; S1, S2) reward volume, not meaning; streaks can demotivate when broken (unverified study) and the Habits module owns streaks anyway; "best day" and "most productive hour" are trivia for one person; average completion time is distorted by tasks entered late or imported in bulk.
- **On-time is defined by comparing the completion date with the due date** (S3). Asana itself loses this after completion (S3), so storing `completed_at` (we do) is what makes it possible.
- **Form:** bars for counts per day (length is read fastest), stat tiles for single numbers, no pies, donuts or gauges (S6, S18).
- **Accessibility:** colour is never the only signal; pastel bars on light glass are below 3:1 (section 5), so values must also be readable as text: tooltips, labels and a table view (S7, S18); Recharts gives a keyboard layer by default (S8, S9).
- **Design patterns seen (S15 to S17):** (a) a period tab row at the top with a small row of numbers above one chart: calm and readable; (b) a big hero number with a large gradient chart and coloured delta badges: loud, many colours; (c) plain "this period vs prior period" text under a number: quiet and honest. **Chosen: (a) with (c)**, re-drawn in our tokens: glass cards, Tasks yellow bars, muted comparison text, no badges.

---

## 3. Decisions

Confidence: High = backed by sources and our docs; Medium = reasoned, sources partly support; Low = a judgment call the owner may well change.

**D1. The page has 4 stat tiles and 2 charts, nothing more.** Tiles: Done, On time, Overdue now, Added. Charts: "Done per day" and "Done by tag".
- Why: Todoist and TickTick show 1 or 2 charts plus a few numbers (S1, S2); a dashboard is for a glance (S6); CONTEXT.md asks for a minimal design.
- Rejected: Asana-style many charts (team tool, S4); a priority chart (4 fixed values that say little about the week; kept as an open point); an "open tasks over time" line (we have no history table, so it could not be honest after reopen or delete).
- Confidence: High.

**D2. Stat tiles are glass cards, not pastel module tiles.** Each: card title 13 (secondary), big number 30 semibold, one small line 11 (muted). Proportional digits on the big number.
- Why: DESIGN.md section 6 says a pastel Tile is a dashboard widget with an action button that opens a module; 4 yellow blocks would be loud on a page that is already inside Tasks. Glass cards are DESIGN.md's "lists, panels". Stat tile shape from S18.
- Rejected: 4 yellow tiles (loud, wrong meaning of the arrow button); one yellow hero tile (no single number deserves it here).
- Confidence: Medium.

**D3. The switch is a calendar period, not rolling.** "This week" = Monday 00:00 to Sunday 24:00 India time of the current week. "This month" = the 1st to the last day of the current India month. Future days of the period are shown as empty slots (their axis labels stay), so the chart does not jump.
- Why: the labels say "this week" and "this month", which people read as calendar periods; TickTick uses this week / this month (S2); weeks start Monday (CONTEXT.md section 4).
- Rejected: rolling 7 and 30 days (Todoist's "last 7 days", S1): always full charts, but the labels would then have to be "Last 7 days | Last 30 days", which is not what was decided.
- Week start comes from our own code, never from `Intl` or the locale (CLDR may say Sunday for en-IN: unverified).
- Confidence: High.

**D4. Compare with the previous period to the same point, as quiet text.** Under Done and Added: "Last week by Fri: 9" (or "Last month by the 16th: 31"). Under On time: the previous rate. No arrows, no green or red.
- Why: TickTick compares this week with last week (S2); a stat tile may show a delta vs a named period (S18). Comparing a part-week with a whole week is unfair, so we compare the same number of days. Small personal numbers swing a lot, so colour judgement would be noise; plain text is honest (pattern (c), S16).
- Rejected: no comparison (loses context); coloured delta badges (S17 style; loud and judgemental); a full previous-period overlay on the chart (two series, clutter).
- Confidence: Medium.

**D5. What counts as a task in the report.** Top-level tasks only (no subtasks), not deleted. Archived tasks count for Done and Added (they were really done or added) but not for Overdue now (the lists hide them too). Each copy of a repeating task is its own row, so each completed occurrence counts once.
- Why: My tasks and the "N open · M overdue" summary count top-level tasks only (`sections.ts` checks `parentTaskId === null`); Goals count top-level only (CONTEXT.md section 4). Repeat copies are separate rows by design (decision 47).
- Rejected: counting subtasks (a task with 5 steps would look like 6 tasks of work).
- Confidence: Medium.

**D6. Formulas (all days are India calendar days, Asia/Kolkata, UTC+05:30, no daylight saving).**
- `istDay(t)` = the India date of instant t (in SQL: `(t AT TIME ZONE 'Asia/Kolkata')::date`).
- **Done** = count of tasks with `status = 'done'` and `istDay(completed_at)` inside the period.
- **On time** (per done task with a due date) = `istDay(completed_at) <= istDay(due_at)`. Same rule for all-day and timed tasks: a task due today at 9 AM and finished at 3 PM today is on time.
- **Late** = done, has a due date, `istDay(completed_at) > istDay(due_at)`.
- **No due date** = done with `due_at` null; not in the rate at all.
- **On-time rate** = `onTime / (onTime + late)`, shown as a whole percent (rounded half up) with "8 of 10 with a due date" under it. When `onTime + late = 0` the tile shows "–" and "No due dates this week".
- **Overdue now** = open (`status <> 'done'`), not archived, top-level, `due_at` not null, `istDay(due_at) < today`. A snapshot, not a period count; the label says "now". Same rule as the Overdue section (decision 45).
- **Added** = tasks with `istDay(created_at)` inside the period (top-level, not deleted). This includes the automatic next copy of a repeating task (there is no column that marks a copy); the tile tooltip says so.
- **Done per day** = Done grouped by `istDay(completed_at)`, with onTime and late per day for the tooltip.
- **Done by tag** = Done tasks joined to their tags; a task with two tags counts once in each (same as Group by Tag); top 5 tags by count (ties by name), then "Other tags" (sum of the rest) and "No tag".
- **Previous period to the same point** = the previous week's Monday through the same weekday as today; or the previous month's 1st through `min(today's day of month, days in that month)`.
- Why: the overdue rule in our app is date-based in India time (decision 45, CONTEXT.md section 4), so "on time" must use the same day rule or a task could be "not overdue" in the list but "late" in the report. Due vs completion date follows S3. Excluding no-date tasks follows TickTick's "scheduled" idea (S2).
- Rejected: exact-time on-time for timed tasks (contradicts the list's overdue rule); counting no-date tasks as on time (inflates the rate); TickTick's completion rate (done / scheduled in the period) as the main rate (it mixes "did I finish what was due this week" with tasks due later; can be added later).
- Note: reopening a task clears `completed_at` (`tasks.ts`), so the report always reflects the latest completion. If a task was done late, reopened and done again, only the last completion counts.
- Confidence: High for the day rule and exclusions; Medium for "Added" including repeat copies.

**D7. Chart 1, "Done per day": one series of columns in Tasks yellow.**
- Week: 7 columns Mon to Sun, labels "Mon" … "Sun", the value shown above each column that is above zero (7 small labels are readable). Today's label is primary and medium; future days are muted with no column.
- Month: 28 to 31 columns, labels on the 1st and on each Monday ("1", "5", "12" …), no value labels (too many; the tooltip and table carry them).
- Marks: `maxBarSize={24}`, `radius={[4, 4, 0, 0]}`, a zero shows no bar (`minPointSize` 0), one solid hairline baseline and at most 3 horizontal gridlines in `--glass-border`, Y ticks are whole numbers (`allowDecimals={false}`), axis text 11 px `--text-muted`.
- No legend (one series; the card title names it).
- Why: counts over days = magnitude → columns, one hue (S6, S18); Todoist uses the same form (S1).
- Rejected: a line or area chart (counts per day are discrete and often zero); stacked on-time/late columns (a second and third colour on the same chart; yellow next to Calendar orange is a known weak pair; the on-time split stays in the tile and the tooltip).
- Confidence: High.

**D8. Chart 2, "Done by tag": horizontal bars, one hue, tag colour only as a small dot.**
- Rows: up to 5 tags, then "Other tags", then "No tag" (each only if above zero). Each row: an 8 px dot in the tag's own colour, the name (13, primary), the bar in Tasks yellow, and the count at the bar end (11, secondary). Subtitle: "A task counts once for each tag".
- Why: horizontal bars fit long names and are read by length (S6); "one series, one colour" (S18 anti-patterns: no value ramp on categories); the tag dot keeps the identity people already know from tag chips without making the bars a rainbow.
- Rejected: bars in each tag colour (8+ pastels fail the categorical checks, section 5); a donut (S6).
- Confidence: Medium.

**D9. Colours come only from tokens; text never uses the series colour.**
- Bars `var(--module-tasks)` in both themes. Grid and baseline `var(--glass-border)`. Axis and secondary text `--text-muted` / `--text-secondary`. Tooltip: glass-strong, radius 8, 11 px (DESIGN.md Tooltip). Hovered column: the cursor band behind it uses `--input-bg`; the bar itself does not change colour.
- Light mode problem (measured, section 5): Tasks yellow on light glass is about 1.3:1, below WCAG 1.4.11's 3:1. Relief, as WCAG allows (S7): values are readable without the colour (week value labels, tooltip, the always-available table view, the tile totals). A darker chart yellow for light mode is listed under Suggested changes; it is not used now because DESIGN.md says module colours are the same in both themes.
- Confidence: High (tokens), Medium (light-mode relief is acceptable rather than ideal).

**D10. Tooltips enhance; they never hide information.**
- Chart 1: "Fri 16 Oct · 4 done" and a second line "3 on time · 1 late" (and "· 1 no date" when there is one). Chart 2: "work · 6 done".
- Built as a custom Recharts tooltip component (`content`, typed with `TooltipContentProps`, S8, S13) styled with tokens, not `contentStyle` objects; `isAnimationActive="auto"` so reduced motion is respected (S13). No Recharts `Legend` (avoids the CSS-variable swatch issue: unverified).
- Every value is also in the table view (D11).
- Confidence: High.

**D11. Accessibility.**
- Charts keep Recharts' `accessibilityLayer` on (the default in 3.x, S8, S10): one tab stop, arrow keys move between days and show the tooltip (S9).
- Each chart card has a small text button "Show table" / "Show chart" that swaps the chart for a plain table (Day, Done, On time, Late; or Tag, Done). This is the WCAG relief for the light-mode contrast (S7) and the dataviz "table view" rule (S18).
- Each chart gets a short accessible summary sentence, for example "Done per day this week: 21 tasks, most on Thursday (6)." (BarChart lists `title` and `desc` props, S10, but their behaviour was not documented, so the summary is also a visually hidden paragraph next to the chart: unverified which is better, test with NVDA.)
- The period switch is the DESIGN.md segmented control (radio group, arrow keys).
- Confidence: High.

**D12. States.**
- **Loading (first time):** the 4 tiles and 2 cards keep their final size with muted placeholders (no spinner). **Refetch** (switching period, or after a task change): keep the previous render at 50% opacity until new data arrives, no skeleton flash (S18).
- **Nothing ever done** (no completed tasks at all): one centered glass card: "No finished tasks yet" / "Complete a few tasks and your week will show up here." and a secondary button "Go to My tasks". Tiles and charts are hidden.
- **Empty period** (tasks exist, none done this period): tiles show 0 and "–"; chart 1 keeps its day labels and the baseline only (no gridlines or Y numbers) with a muted centered line "Nothing done this week yet"; chart 2 shows "No tags yet this week".
- **Error:** the content area shows a glass card "Could not load the report." with a secondary "Try again" button (the normal error toast also appears, as elsewhere). A 503 schema_behind shows the existing "Database update needed" message.
- Confidence: High.

**D13. `tasks.report` input and output.** A read action (permission `read`, no undo) and `GET /api/v1/tasks/report?period=week|month`. The server takes "now" from its clock (injectable in tests). Counts are integers; the client computes the percent. Dates are India dates as `YYYY-MM-DD` strings (not instants), because the report is about days.

Input (Zod in packages/shared):
```json
{ "period": "week" }
```
`period` is `"week" | "month"`, required.

Output:
```json
{
  "period": "week",
  "timeZone": "Asia/Kolkata",
  "today": "2026-10-16",
  "start": "2026-10-12",
  "end": "2026-10-18",
  "days": [
    { "date": "2026-10-12", "done": 3, "onTime": 2, "late": 1, "noDueDate": 0 },
    { "date": "2026-10-13", "done": 5, "onTime": 4, "late": 0, "noDueDate": 1 }
  ],
  "totals": { "done": 21, "onTime": 14, "late": 3, "noDueDate": 4, "added": 18 },
  "previous": {
    "start": "2026-10-05",
    "end": "2026-10-09",
    "done": 17, "onTime": 10, "late": 4, "noDueDate": 3, "added": 22
  },
  "overdueNow": 2,
  "byTag": [
    { "tagId": "uuid", "name": "work", "color": "#93D3F5", "done": 9 }
  ],
  "otherTagsDone": 0,
  "noTagDone": 5
}
```
- `days` has one entry for every day from `start` to `end`, future days included with zeros (the client greys out days after `today`). Week = 7 entries, month = 28 to 31.
- `previous.end` is the "same point" day of D6 (inclusive).
- `byTag` has at most 5 entries, sorted by `done` descending then name.
- Confidence: High for the shape; Medium for the field names (the contract step may rename them).

**D14. Performance limits.** One request per period switch. The server runs at most 4 small grouped queries (done per day for the period and the previous span, added counts, overdue now, done by tag), each scoped by `user_id` through the shared helper and grouped in SQL by India day; no task rows are sent to the client. The response is under about 4 kB (31 days max). No new index now (existing `user_id`, `(user_id, status)` and `(user_id, due_at)` indexes; one person has thousands of tasks, not millions); revisit with an index on `(user_id, completed_at)` if the query passes about 100 ms (unverified estimate). Client: TanStack Query key `['tasks', 'report', period]`, staleTime 60 s, invalidated by the same task mutations that invalidate task lists. Recharts is imported by named imports only (tree-shaking), and the Reporting route should be code-split so the main bundle does not grow (see Suggested changes).
- Confidence: Medium.

**D15. Recharts usage (API names checked against the official pages).**
- `<BarChart responsive width="100%" height={200} data={days} accessibilityLayer margin={...} barCategoryGap="20%">` (S10, S11). Use the `responsive` prop (3.3 and later) instead of `ResponsiveContainer` (still works in 3.x, S11, S12). The parent card must give the chart a height that includes the X axis labels (no inner scroll).
- `<Bar dataKey="done" name="Done" fill="var(--module-tasks)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive="auto" />` (S14). Chart 2 is a `BarChart` with `layout="vertical"` (the `layout` prop is standard in Recharts but was **not** checked on the page I opened: verify in the contract step).
- `<XAxis dataKey="date" tickFormatter={...} axisLine={false} tickLine={false} />`, `<YAxis allowDecimals={false} width={24} />`, `<CartesianGrid vertical={false} stroke="var(--glass-border)" />`, `<Tooltip content={<ReportTooltip />} cursor={{ fill: 'var(--input-bg)' }} />` (Tooltip props from S13; the XAxis, YAxis and CartesianGrid prop names were **not** opened: verify in the contract step).
- jsdom has no ResizeObserver; the desktop test setup already stubs it (LESSONS.md). Tests should assert on the table view and the summary text, not on SVG geometry.
- Confidence: High for the props seen in S10 to S14; Medium for the others (marked).

**D16. Out of scope for Feature 7.** Streaks, points, levels and goals for task counts (Habits owns streaks; points reward volume); best day and most productive hour; average completion time (lead time); open tasks over time (no history table); custom date ranges and browsing older weeks; projects (Step 5); export; AI insights ("you did more this week…", Step 3); reporting on the dashboard tile; subtasks. Confidence: High.

---

## 4. Layout (what the mockup shows)

- Header row: "Reporting" (22, semibold) with the period under it in 11 muted ("Mon 12 – Sun 18 Oct" or "October 2026"); on the right the segmented control "This week | This month". One row, above everything it controls (S18).
- Row of 4 glass stat cards, equal width.
- Row of 2 glass cards: "Done per day" (wider, about 2/3) and "Done by tag" (about 1/3). Each card: title 13, a muted subtitle 11, and a "Show table" text button at the top right.
- Fits the 1100 × 700 minimum window without the page scrolling (DESIGN.md section 8: the Tasks page does not scroll as a whole); the content area scrolls on its own if the window is shorter.

---

## 5. Colour checks (dataviz `validate_palette.js`, run 2026-10-13)

- Tasks yellow `#F7D96B` vs a dark chart surface (`#1F2127`, `#2A2C33`): contrast passes 3:1.
- Tasks yellow vs a light surface (`#F4F5F7`): 1.28:1 → WARN, relief required (labels or table view). Graph periwinkle `#B8C4F7` gave 1.57:1.
- Our pastels fail the categorical "lightness band" and "chroma floor" checks (they are pastels by design). This is why the charts use **one** hue and never a multi-colour category palette.
- A light-mode-only yellow that passes 3:1 on `#F4F5F7`: `#9C7A00` (checked; `#B08A12` gave 2.97:1). Not adopted (see Suggested changes).

---

## 6. Suggested changes to existing docs or decisions (not applied)

1. **Decision 53 (Recharts size):** the reason says "about 50 kB gzipped". Search summaries gave about 68 kB min+gzip for one tree-shaken chart and up to 158 kB for everything (unverified, numbers disagree). Suggest checking the real size after `pnpm build` and code-splitting the Reporting route (TanStack Router supports lazy routes; the exact setup here was not checked).
2. **DESIGN.md, a chart section:** add short chart rules (bars ≤ 24 px, 4 px rounded tops, hairline `--glass-border` grid, no legend for one series, table view, tooltip look) so Habits, Money and later charts match.
3. **DESIGN.md tokens, light-mode chart colour:** consider a `--chart-tasks` token that is `#F7D96B` in dark and a darker yellow such as `#9C7A00` in light, so bars pass WCAG 1.4.11 without relying on the table. Evidence: section 5. This changes the rule "module colours are the same in both themes", so it is the owner's call.

---

## 7. Open points for the owner

1. Is "Added" (with repeat copies included) useful, or should the 4th tile be TickTick's "due this period: N, M done" instead?
2. Should subtasks ever count (for example as a separate small number)?
3. Do you want a priority breakdown later (Urgent, High, Medium, Low done this period)?
4. Is the same-point comparison ("Last week by Fri: 9") clear, or would you prefer the full previous week?
5. Light mode: accept the pale yellow bars with the table as relief, or add the darker chart token (Suggested change 3)?
