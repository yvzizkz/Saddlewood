-- One spend ledger: Zelle payments and texted receipts are purchases lines
-- (cleanup Batch 2, Old Expenses).
--
-- The old Expenses page kept its list as JSON in progress_trackers
-- ('accounting-state'), with a free-text project and seed numbers. The bot
-- (KB accounting.py, receipt_ocr.py, crew.py) still posts to /api/expenses;
-- that route now writes here instead:
--
--   source 'zelle'    a Zelle payment the bot read from Chase
--   source 'receipt'  a receipt texted to the bot (receipt_ocr.py)
--
-- source_key is expense:<the bot's id>:1 (expense:z-12:1), so the trip key is
-- expense:z-12 and each payment is its own trip. A receipt filed in the app
-- is already here as app:<entry id> (crew.py posts it to /api/bot/purchases),
-- so the /api/expenses copy of it is not entered again.
--
-- The import below copies what the old row holds, once (on conflict do
-- nothing), and leaves the row as it is: that row is the export. It skips
-- the five seed payments the old page shipped with (their Chase transaction
-- ids are fixed in src/lib/expenses/store.ts on main), and receipts that
-- came from the app. A dismissed item comes in set aside (meta.ignored).
-- The project stays as typed in job_name_raw; an owner puts each line on a
-- job from "Tag spend" on Purchases.

begin;

alter table public.purchases drop constraint if exists purchases_source_check;
alter table public.purchases
  add constraint purchases_source_check check (source in ('hd', 'app', 'vendor', 'manual', 'zelle', 'receipt'));

insert into public.purchases (
  source, source_key, purchased_on, vendor, store, order_ref, job_name_raw, job_key,
  trade, description, qty, line_total_cents, meta
)
select case when e->>'source' = 'zelle' then 'zelle' else 'receipt' end,
       'expense:' || (e->>'id') || ':1',
       (e->>'date')::date,
       left(coalesce(nullif(btrim(e->>'vendor'), ''), nullif(btrim(e->>'recipient'), ''), 'Unknown'), 80),
       '',
       left(coalesce(e->>'transactionId', ''), 80),
       left(coalesce(e->>'project', ''), 160),
       '',
       'general',
       left(case when e->>'source' = 'zelle'
                 then 'Zelle to ' || coalesce(e->>'recipient', '?') || coalesce(': ' || nullif(btrim(e->>'memo'), ''), '')
                 else coalesce(nullif(btrim(e->>'memo'), ''), 'Receipt') end, 240),
       1,
       round((e->>'amount')::numeric * 100)::int,
       jsonb_strip_nulls(jsonb_build_object(
         'expenseId', e->>'id',
         'n', (e->>'n')::int,
         'recipient', e->>'recipient',
         'category', e->>'expenseType',
         'receiptUrl', e->>'receiptUrl',
         'notes', e->>'notes',
         'decidedBy', e->>'decidedBy',
         'importedFrom', 'accounting-state'
       )) || case when e->>'status' = 'dismissed' then '{"ignored": true}'::jsonb else '{}'::jsonb end
  from public.progress_trackers t,
       jsonb_array_elements(case when jsonb_typeof(t.state->'expenses') = 'array' then t.state->'expenses' else '[]'::jsonb end) e
 where t.id = 'accounting-state'
   and e->>'appEntry' is null
   and coalesce(e->>'transactionId', '') not in ('25497567655', '25497567891', '25497567112', '25497566840', '25497565902')
   and coalesce(e->>'id', '') ~ '^[a-z]+-[0-9]+$'
   and coalesce(e->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
   and coalesce(e->>'amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
   and (e->>'amount')::numeric > 0
on conflict (source_key) do nothing;

commit;
