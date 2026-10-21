-- Purchase trade categorization & multi-vendor support (T10, docs/COHESIVE-APP-PLAN.md §3).
--
-- 1. Every purchase row is categorized to a trade in `public.trades(slug)` (default 'general').
-- 2. `trade_manual` records when a person explicitly categorized a purchase line or trip
--    so that `purchases_relink()` preserves manual trade categorization when a register alias
--    is assigned to a job.
-- 3. `purchases.source` is widened to allow 'vendor' and 'manual' in addition to 'hd' and 'app',
--    so non-Home-Depot material suppliers (Sherwin-Williams, Arizona Building Supply, Sunbelt
--    Rentals, etc.) live in the same filterable, searchable, exportable ledger.
-- 4. Additional department/class rules are seeded into `public.trade_map`.

begin;

-- Normalize any empty or unknown trade on existing rows to 'general' before adding the FK.
update public.purchases
   set trade = 'general'
 where btrim(coalesce(trade, '')) = ''
    or not exists (select 1 from public.trades t where t.slug = public.purchases.trade);

alter table public.purchases
  alter column trade set default 'general';

alter table public.purchases
  add column if not exists trade_manual boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchases_trade_fkey'
  ) then
    alter table public.purchases
      add constraint purchases_trade_fkey
      foreign key (trade) references public.trades (slug) on update cascade;
  end if;
end $$;

alter table public.purchases
  drop constraint if exists purchases_source_check;

alter table public.purchases
  add constraint purchases_source_check
  check (source in ('hd', 'app', 'vendor', 'manual'));

create index if not exists purchases_trade_day_idx on public.purchases (trade, purchased_on);
create index if not exists purchases_vendor_day_idx on public.purchases (vendor, purchased_on);

-- Expand trade_map with additional departments and classes matching public.trades.
insert into public.trade_map (department, class, trade) values
  ('LUMBER', 'INSULATION', 'insulation'),
  ('BLDG. MATERIALS', 'INSULATION', 'insulation'),
  ('BLDG. MATERIALS', 'CONCRETE', 'concrete'),
  ('BLDG. MATERIALS', 'ROOFING', 'roofing'),
  ('MILLWORK', '', 'windows'),
  ('DOORS & WINDOWS', '', 'windows'),
  ('FLOORING', 'TILE', 'tile'),
  ('FLOORING', '', 'flooring'),
  ('KITCHEN', 'CABINETS', 'cabinets'),
  ('HVAC', '', 'hvac'),
  ('CLEANING', '', 'cleanup'),
  ('GARDEN', '', 'landscape')
on conflict (department, class) do nothing;

-- Preserve manual trade overrides (`trade_manual = true`) when relinking register aliases.
create or replace function public.purchases_relink(p_key text, p_job text)
returns integer
language sql
set search_path = public, pg_temp
as $$
  with changed as (
    update public.purchases p
       set job_id = p_job,
           meta = case when p_job is null then p.meta || '{"ignored": true}'::jsonb else p.meta - 'ignored' end,
           trade = case
             when p.trade_manual then p.trade
             else coalesce(
               (select t.trade from public.trade_map t
                 where upper(btrim(t.department)) = upper(btrim(p.department))
                   and upper(btrim(t.class)) = upper(btrim(p.class))
                 limit 1),
               (select t.trade from public.trade_map t
                 where upper(btrim(t.department)) = upper(btrim(p.department))
                   and t.class = ''
                 limit 1),
               'general')
           end,
           updated_at = now()
     where p.job_key = p_key
     returning 1
  )
  select count(*)::int from changed;
$$;

revoke execute on function public.purchases_relink(text, text) from public, anon, authenticated;
grant execute on function public.purchases_relink(text, text) to service_role;

comment on column public.purchases.trade_manual is 'True when a user explicitly set the trade on this line, so purchases_relink preserves it.';

commit;
