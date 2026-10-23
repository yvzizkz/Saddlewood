-- Payments the bot confirmed in Joist are recorded in the app too (owner
-- decision, Lando 2026-10-22: "record in BOTH for now").
--
-- The KB bot (accounting.py) records each confirmed P<n> in Joist, as today,
-- and then posts it to POST /api/bot/payments. The site writes one row here,
-- applied to the invoice with that number, so Receivables and Joist track the
-- same money side by side. Nothing in the app writes back to Joist.
--
--   source        'app' (a person, on Money) or 'bot' (a Joist payment the
--                 bot confirmed). Receivables tells them apart by it.
--   external_ref  the bot's number, 'P12'. One standing row per source and
--                 number: a retry or a re-sync never records it twice.
--
-- Additive. Rows already here are 'app'. payments_guard (0014) still freezes
-- a row once written, new columns included.

begin;

alter table public.payments
  add column if not exists source text not null default 'app',
  add column if not exists external_ref text;

alter table public.payments drop constraint if exists payments_source_check;
alter table public.payments
  add constraint payments_source_check check (source in ('app', 'bot'));

alter table public.payments drop constraint if exists payments_external_ref_check;
alter table public.payments
  add constraint payments_external_ref_check check (external_ref is null or (btrim(external_ref) <> '' and length(external_ref) <= 40));

-- Voided rows step aside, so a payment voided because its allocation failed can be recorded again.
create unique index if not exists payments_source_external_ref_uidx
  on public.payments (source, external_ref)
  where external_ref is not null and voided_at is null;

commit;
