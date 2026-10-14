# Money lane: research memo (Step 6, without AI)

Method: the lane lead worked from known references (Monarch, YNAB, Spendee, Wallet by BudgetBakers, Subby, Rocket Money, Apple Wallet-style cards) and the existing Tasks and Notes patterns; no web research was done (local-only rule, short time box).

## Decisions
- Scope must: wallets, categories, transactions (income, expense, transfer), balances computed from transactions, repeating transactions on demand, budgets per category per month, savings goals, monthly report, subscriptions with upcoming and overdue. Nice (done): transfers on both wallets, category management dialog, yearly cost summary.
- Money in integer paise; days as India day strings; no stored balances (YNAB and Monarch also derive them; stored balances drift).
- A transfer is one transaction row with two wallets (not two rows): one edit or delete changes both sides, nothing can get out of balance.
- Budgets are monthly per expense category, set by hand (YNAB-style envelopes are out of scope). No rollover.
- Repeats are templates plus `next_on`; "generated on demand" means the page asks the server to create what is due up to today, so there is no cron job to run (single user, app opened daily).
- Subscriptions: renewal alerts are a list (Upcoming, Overdue), not push messages. Mark paid books the expense so the report stays right.
- Screens: Overview, Transactions, Wallets, Budgets, Goals, Subscriptions, Reports in an inner side panel; keys N, [ ], ?.
- Empty states say what to do first (add a wallet), because every transaction needs a wallet.
