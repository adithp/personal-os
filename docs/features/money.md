# Money (Finance, Wallet, Subscriptions)

One Money page (module color mint `#9EE0C8`, route `/money`) with an inner side panel like Tasks and Notes. Details per part: [finance.md](finance.md), [wallet.md](wallet.md), [subscriptions.md](subscriptions.md). Research memo: [docs/design/research/money.md](../design/research/money.md).

## Built in this step (no AI, no CSV import, no push notifications)
Wallets with balances computed from transactions, categories with colors (defaults created on first list), transactions (income, expense, transfer shown on both wallets), repeating transactions (generated on demand), budgets per expense category per month with progress, savings goals with progress, monthly report (Recharts), subscriptions with an upcoming renewals list and an overdue state, yearly cost summary.

## Decisions
- Money is integer paise (`bigint` read as a number). A transaction has a `date` column `occurred_on` holding the India calendar day (`YYYY-MM-DD`), not an instant (DATABASE.md planned `occurred_at`). Renewal, budget month, goal target and repeat dates are day strings too. Helpers: `packages/shared/src/finance.ts` (`addDays`, `addMonths`, `nextRuleDay`, `monthOf`, `monthStart`, `monthEnd`; `indiaDay` comes from note-text.ts).
- Balances are not stored: `opening_balance_paise + income - expense + transfers in - transfers out` over live transactions, computed in code by `finance.wallets.list`.
- Repeats use the presets of `recurrence.ts` (daily, weekly on days, monthly on a day, yearly) and pure day arithmetic (no rrule, so no time zone shift). `finance.recurring.run` creates every due transaction up to today and moves `next_on` on; the Money page calls it when it opens. It has no undo.
- Subscriptions: `subscriptions.renew` ("Mark paid") moves the renewal day one cycle on (monthly clamps to month end) and, when the subscription has a wallet, books an expense (`subscription_id` set). Undo is `subscriptions.undo_renew`. Overdue = active and renewal day before today (India).
- Wallets with transactions cannot be deleted (409 `wallet_in_use`); archive them instead. Deleting a category keeps its transactions (shown as Uncategorised). Budgets are hard-deleted (undo = set again). Other deletes are soft with a restore action as undo.
- Table names follow DATABASE.md: `wallets`, `categories`, `transactions`, `recurring_transactions`, `budgets`, `savings_goals`, `subscriptions`. Goals of the Tasks module stay `goals`; Money goals are `finance.goals.*` / `/savings-goals`.

## Actions
`finance.wallets.{list,create,update,delete,restore}`, `finance.categories.{list,create,update,delete,restore}`, `finance.transactions.{list,create,update,delete,restore}`, `finance.recurring.{list,create,update,delete,restore,run}`, `finance.budgets.{list,set,delete}`, `finance.goals.{list,create,update,contribute,delete,restore}`, `finance.summary`, `subscriptions.{list,upcoming,create,update,renew,undo_renew,delete,restore}`. All writes are permission `write` and return an undo.

## Routes (all under /api/v1, see API.md)
Reads answer `{ items }` (or the object named). Writes answer `{ item, undo }` and POST `/undo` runs the undo.
- `GET/POST /wallets`, `PATCH/DELETE /wallets/:id`, `POST /wallets/:id/restore` (`GET ?includeArchived=true`)
- `GET/POST /categories`, `PATCH/DELETE /categories/:id`, `POST /categories/:id/restore`
- `GET /transactions?walletId&categoryId&kind&from&to&q&limit&offset`, `POST /transactions`, `PATCH/DELETE /transactions/:id`, `POST /transactions/:id/restore`
- `GET/POST /recurring-transactions`, `POST /recurring-transactions/run` (answers `{ created }`), `PATCH/DELETE /recurring-transactions/:id`, `POST /recurring-transactions/:id/restore`
- `GET /budgets?month=YYYY-MM`, `PUT /budgets` (set), `DELETE /budgets/:id`
- `GET/POST /savings-goals`, `PATCH/DELETE /savings-goals/:id`, `POST /savings-goals/:id/restore`, `POST /savings-goals/:id/contribute`
- `GET /finance/summary?month=YYYY-MM` answers `{ summary }`
- `GET /subscriptions?status` answers `{ items, summary }`; `GET /subscriptions/upcoming?days` answers `{ items }`; `POST /subscriptions`, `PATCH/DELETE /subscriptions/:id`, `POST /subscriptions/:id/restore`, `POST /subscriptions/:id/renew` (answers `{ item: { subscription, transaction }, undo }`)

## Screens (side panel: Overview, Transactions, Wallets, Budgets, Goals, Subscriptions, Reports)
Overview (total balance, this month in/out, budgets close to the limit, upcoming renewals, recent transactions), Transactions (month filter, wallet/category/kind filters, add and edit form, repeats list), Wallets (cards with balance, add/edit/archive, detail list of its transactions), Budgets (month switch, progress bars), Goals (progress, add money), Subscriptions (list with monthly and yearly totals, upcoming and overdue, mark paid), Reports (month switch, income/expense, by-category chart, day chart, table toggle). Categories are managed from a dialog on Transactions.
Keys: `N` new (transaction on Transactions, wallet on Wallets, and so on), `[` and `]` previous and next month, `?` shows the keys. Empty, loading and error states on every page.

## Not built
CSV statement import and AI categorization (after Step 3), push notifications for renewals (the upcoming list and the overdue state are the alerts), wallet balance history chart, per-wallet currency.
