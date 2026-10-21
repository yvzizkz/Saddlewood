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

## Production state

As of 2026-10-20: 0050 is applied (it went in before #37 merged); 0029–0035
and 0040–0045 were not yet applied (0050 does not depend on them). 0051 is
not applied. Check before applying anything, since this note can go stale: a migration is in if
the table it creates exists.

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

## Rules

- A migration that is applied in production is never edited. Fix forward
  with a new number.
- Update the "Production state" section in the PR that adds a migration, and
  again when it is applied.
