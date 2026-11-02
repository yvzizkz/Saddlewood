-- Change-order intake (docs/CO-INTAKE.md): a client's emailed request becomes a
-- register row and a priced-at-$0 draft with no typing, numbered from the start.
--
-- Where a row came from. The Mac reads the request (KB bot triage) and posts it
-- with the mail thread it came in on (source_ref) and which change in that
-- thread it is (source_key: one email can ask for several). The same request
-- sent again, or answered in the thread, finds its row instead of making a
-- second one. Rows made by hand or from a directive keep source_ref ''.
--
-- intake_hash is the draft as intake last wrote it. A re-sent request rewrites
-- the draft only while it still matches, so nothing an owner changed by hand is
-- ever overwritten.
--
-- The timeline (change_order_events): requested, drafted, priced, sent,
-- viewed, signed, billed, paid, each with who and when, read by the job's
-- Changes tab and the CO itself. Intake writes the first two.

alter table public.change_orders add column if not exists source_ref text not null default '';
alter table public.change_orders add column if not exists source_key text not null default '';
alter table public.change_orders add column if not exists intake_hash text not null default '';

create unique index if not exists change_orders_source_uidx
  on public.change_orders (source_ref, source_key)
  where source_ref <> '';

create table if not exists public.change_order_events (
  id               bigint generated always as identity primary key,
  change_order_id  bigint not null references public.change_orders (id) on delete cascade,
  kind             text not null,
  at               timestamptz not null default now(),
  actor            text not null default '',
  detail           jsonb not null default '{}'::jsonb,
  constraint change_order_events_kind_check check (kind in (
    'requested', 'updated', 'drafted', 'priced', 'sent', 'viewed', 'signed', 'rejected', 'billed', 'paid', 'void', 'note'
  ))
);

create index if not exists change_order_events_co_idx on public.change_order_events (change_order_id, at);

alter table public.change_order_events enable row level security;
revoke all on table public.change_order_events from anon, authenticated, service_role;
grant select, insert on table public.change_order_events to service_role;

comment on table public.change_order_events is 'Each change order''s timeline, for the Changes tab. Service-role access only.';
