-- One trade list for the whole app (docs/COHESIVE-APP-PLAN.md §3).
--
-- Until now a trade was free text in five places (purchases, crew phases,
-- material requests, bid packages, subs) and Home Depot's map allowed only
-- eight values. Accounting groups labor and materials by trade, so they have to
-- agree: this table is the list, keyed by a slug, and the places that carry a
-- trade point at it.
--
--   trades              slug, label, order, active. Owners add more.
--   trade_map.trade     now must be a trade in the list (was 8 fixed values)
--   crew_shifts.trade   new: the trade a shift was worked in. Set from the
--                       phase being worked or the person's trade; owners fix
--                       it. Null = not known yet (Payroll then uses the
--                       person's trade).
--
-- Additive: no column is dropped, every existing value stays valid.

create table if not exists public.trades (
  slug        text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label       text not null,
  ord         integer not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.trades (slug, label, ord) values
  ('general', 'General conditions', 10),
  ('demo', 'Demolition', 20),
  ('concrete', 'Concrete', 30),
  ('framing', 'Framing', 40),
  ('roofing', 'Roofing', 50),
  ('windows', 'Windows and doors', 60),
  ('plumbing', 'Plumbing', 70),
  ('electrical', 'Electrical', 80),
  ('hvac', 'HVAC', 90),
  ('insulation', 'Insulation', 100),
  ('drywall', 'Drywall', 110),
  ('finish-carpentry', 'Finish carpentry', 120),
  ('cabinets', 'Cabinets', 130),
  ('tile', 'Tile', 140),
  ('flooring', 'Flooring', 150),
  ('paint', 'Paint', 160),
  ('landscape', 'Landscape', 170),
  ('cleanup', 'Cleanup', 180),
  ('tools', 'Tools and equipment', 190),
  ('rentals', 'Rentals', 200)
on conflict (slug) do nothing;

-- Home Depot's map: any trade in the list, not just the first eight.
alter table public.trade_map drop constraint if exists trade_map_trade_check;
alter table public.trade_map
  add constraint trade_map_trade_fkey foreign key (trade) references public.trades (slug) on update cascade;

alter table public.crew_shifts add column if not exists trade text references public.trades (slug) on update cascade;
create index if not exists crew_shifts_trade_day_idx on public.crew_shifts (trade, day);

alter table public.trades enable row level security;
revoke all on table public.trades from anon, authenticated;
grant select, insert, update on table public.trades to service_role;

comment on table public.trades is 'The one trade list: purchases, time entries, phases, bids and subs group by it. Service-role access only.';
comment on column public.crew_shifts.trade is 'Trade worked on this shift (trades.slug); null = use the person''s trade.';
