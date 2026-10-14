# Subscriptions

## Purpose
Track recurring payments.

## Screens
Subscription list with monthly and yearly totals, upcoming renewals, add or edit subscription, history.

## Features
Categories, monthly cost, yearly cost, renewal dates, payment reminders, history, upcoming renewals, total subscription cost. Each renewal creates a transaction in Finance.

## Actions
subscriptions.list, subscriptions.upcoming, subscriptions.add, subscriptions.update

## AI
Answers "Which subscriptions are renewing this week?" and "How much am I spending on subscriptions every month?"

## Done when
I never miss a renewal and know my total monthly subscription cost.

## Built (Step 6, money lane)
Subscriptions with cycle (weekly, monthly, quarterly, yearly), next renewal day, status (active, paused, cancelled), wallet and category; monthly and yearly cost per subscription and in total; an Upcoming renewals list (default 30 days) and an Overdue state instead of push reminders; "Mark paid" moves the renewal on and books the expense in the wallet (Finance). Not built: reminder notifications, renewal history screen. See [money.md](money.md).
