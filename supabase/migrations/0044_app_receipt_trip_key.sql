-- An app receipt is its own trip (PR #32 review).
--
-- trip_key (0026) is the source key up to its last colon, so a Home Depot line
-- hd:<day>:<store>:<reg>:<txn>:<line> groups under its receipt. A receipt
-- filed in the app is one line keyed app:<entry id> (the bot's key, 0026 doc),
-- which that rule cut to 'app': every app receipt on every job became one trip.
-- An app:<number> key is now its own trip_key, as src/lib/crew/purchases.ts
-- tripKey computes it. Postgres before 17 can't change a generated column's
-- expression, so the column is rebuilt with its index.

begin;

alter table public.purchases drop column if exists trip_key;

alter table public.purchases
  add column trip_key text generated always as (
    case
      when source_key ~ '^app:[0-9]+$' then source_key
      when position(':' in source_key) > 0 then regexp_replace(source_key, ':[^:]*$', '')
      else source_key
    end
  ) stored;

create index if not exists purchases_trip_key_idx on public.purchases (trip_key);

commit;
