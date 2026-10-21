-- Role seats: who holds each role, and who covers it (docs/COHESIVE-APP-PLAN.md §6.1).
--
-- Work is assigned to a role, and a person holds the role. An empty seat is
-- covered by its backup, so hiring someone moves every open item with the
-- seat. Until now the holders were written into the code (src/lib/owner/
-- lanes.ts: Marco sells and decides, Ilene runs money, Lando runs systems).
--
-- The limits that go with each role (what a PM may approve, from what amount
-- a change order needs a signature…) stay in Company policies (app_settings);
-- the decision-rights table on the Settings screen is read from them, so no
-- limit lives in two places.
--
--   role     decisions | sales | finance | ops | pm | field_lead
--   holder   a first name (an owner seat, as the lanes use) or an email (a crew seat)
--   backup   the same, used while the holder has no seat
--
-- Seeded with the lane decision of 2026-10-12, and the open seats named as
-- the operating model (2026-09-04) leaves them: the Estimating & Sales Admin
-- seat is empty (Marco covers), the Bookkeeper is Ilene, the PM is Eli, the
-- Field lead is not designed yet (the PM covers).

create table if not exists public.role_seats (
  role        text primary key,
  holder      text not null default '',
  backup      text not null default '',
  note        text not null default '',
  updated_by  text not null default 'setup',
  updated_at  timestamptz not null default now(),
  constraint role_seats_role_check check (role in ('decisions', 'sales', 'finance', 'ops', 'pm', 'field_lead'))
);

insert into public.role_seats (role, holder, backup, note) values
  ('decisions', 'Marco', 'Lando', 'Prices, change orders, anything over a limit, client money talks.'),
  ('sales', 'Marco', 'Lando', 'Covers the open Estimating & Sales Admin seat (SOP-005) until it is hired.'),
  ('finance', 'Ilene', 'Lando', 'Payroll, payables, the collection ladder through day 14, waivers, COIs.'),
  ('ops', 'Lando', 'Marco', 'The app, the bot, SOPs and the Friday review.'),
  ('pm', 'Eli', 'Marco', 'Runs jobs per SOP-006; awards and approves within the policy limits.'),
  ('field_lead', '', 'Eli', 'Not designed yet (role-gap analysis): the PM covers.')
on conflict (role) do nothing;

alter table public.role_seats enable row level security;
revoke all on table public.role_seats from anon, authenticated, service_role;
grant select, insert, update on table public.role_seats to service_role;

comment on table public.role_seats is 'Who holds each role and who covers it; work is assigned to roles. Service-role access only.';
