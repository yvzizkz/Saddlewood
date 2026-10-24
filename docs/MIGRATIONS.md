# Database migrations: the production order

Migrations in `supabase/migrations/` are applied to production by hand (the
Supabase SQL editor), one file at a time, in the order below. Nothing applies
them on deploy, so code on `main` can be ahead of the production database.

## Order

Apply in number order. The numbers match the order the files reached `main`;
0036–0039 and 0046–0049 were never used.

0051 is the one exception to "apply before the code needs it": it takes the
signed-in session's access away from `jobs` and the estimate tables, so the
site change that reads them with the server key must be live first.

| # | File | On main |
|---|---|---|
| 0001–0009 | estimates, ops board, progress trackers | 2026-05 to 2026-09 |
| 0010–0028 | bot app, crew, billing, payments, passkeys, purchases, sales, watches, subs and bids | 2026-10-03 to 10-19 |
| 0029 | `trades` | 2026-10-20 |
| 0030 | `purchase_trade_categorization` | 2026-10-20 |
| 0031 | `payables` | 2026-10-20 |
| 0032 | `role_seats` | 2026-10-20 |
| 0033 | `work_items` | 2026-10-20 |
| 0034 | `schedule_items` | 2026-10-20 |
| 0035 | `field_ops` | 2026-10-20 |
| 0040 | `change_orders_waivers` | 2026-10-20 |
| 0041 | `sov_progress` | 2026-10-20 |
| 0042 | `purchases_keep_manual` | 2026-10-20 |
| 0043 | `sov_discard_deposit` | 2026-10-20 |
| 0044 | `app_receipt_trip_key` | 2026-10-20 |
| 0045 | `trade_checklists` | 2026-10-20 |
| 0050 | `job_history` | 2026-10-20 |
| 0051 | `estimate_tables_service_role_only` (deploy the site first) | cleanup PR |
| 0052 | `old_tables_no_public_grants` | cleanup PR |
| 0053 | `spend_ledger` (after 0042 and 0044; before the site change) | cleanup PR |
| 0054 | `bot_payments` (before the site change) | cleanup PR |

## Production state

As of 2026-10-22 (checked live by the KB session): everything through 0050
is applied, including 0029–0035, 0040–0045 and the 0044 trip_key
expression. 0051, 0052, 0053 and 0054 (the cleanup stack) are not. They go in, in
order, as the stack merges, each before the code that needs it is live
(0051 is the exception, after; see above). Check before applying anything,
since this note can go stale: a migration is in if the table it creates exists.

```sql
select t from unnest(array[
  'trades','bills','role_seats','work_items','schedule_items','checklists',
  'change_orders','lien_waivers','sov_progress','job_history'
]) as t
where to_regclass('public.' || t) is null;  -- lists the missing ones
```

0030, 0042, 0043, 0044 and 0045 change functions, columns or seed rows rather
than adding a table; apply them right after the migration before them. 0051
changes policies and grants: check it with `select count(*) from pg_policies
where policyname = 'auth_full_access'` (0 once it is in).
0052 only revokes grants (any time, no site change needed): check it with
`select count(*) from information_schema.role_table_grants where
table_schema = 'public' and grantee in ('anon', 'authenticated')` (0 once it
is in, with 0051).
0053 lets purchases hold Zelle payments and texted receipts and copies the
old Expenses row (`progress_trackers` 'accounting-state', left in place) into
them, skipping the page's five seed payments. Apply it before the site change
that writes them (/api/expenses). Check it with `select pg_get_constraintdef(oid)
from pg_constraint where conname = 'purchases_source_check'` (lists 'zelle').
0054 adds `payments.source` ('app' or 'bot') and `external_ref` (the bot's
P number, one standing row each). Apply it before the site change that
writes them (/api/bot/payments). Money and Receivables read it with `*`, so
they keep working without it. Check it with `select count(*) from
information_schema.columns where table_name = 'payments' and column_name = 'source'` (1).

## Rules

- Grants: every table enables RLS and revokes all from `anon` and
  `authenticated`; the site reads and writes with the service role. Grant
  the service role `delete` only where the app deletes rows. Money and proof
  tables (documents, payments, allocations, events) are voided, never
  deleted, so they get select, insert and update.

- A migration that is applied in production is never edited. Fix forward
  with a new number.
- Update the "Production state" section in the PR that adds a migration, and
  again when it is applied.
