-- Joist sync (docs/JOIST-SYNC.md): while Joist is still in use, each change
-- order the app drafts, prices or gets signed is copied into Joist as an
-- estimate, so the two never disagree. Joist has no write API: the Mac bot
-- does the writing through its signed-in browser (KB bot/browser.py) and reads
-- it back through the Joist read API to check. The site never talks to Joist
-- and holds no Joist credential; it only keeps the queue and what came back.
--
-- joist_jobs is that queue. A change to a change order queues one job; more
-- changes before the Mac picks it up fold into the same job (one queued job
-- per change order at a time). The Mac claims jobs, writes, and reports; a job
-- claimed and never reported is claimable again after a while. A failure is
-- retried a few times, then flagged on the change order. Nothing here ever
-- blocks the app's own send.

alter table public.change_orders add column if not exists joist_id bigint;
alter table public.change_orders add column if not exists joist_url text not null default '';
alter table public.change_orders add column if not exists joist_synced_at timestamptz;
alter table public.change_orders add column if not exists joist_error text not null default '';

create table if not exists public.joist_jobs (
  id               bigint generated always as identity primary key,
  change_order_id  bigint not null references public.change_orders (id) on delete cascade,
  reason           text not null,
  status           text not null default 'queued',
  attempts         integer not null default 0,
  claimed_at       timestamptz,
  claimed_by       text not null default '',
  finished_at      timestamptz,
  joist_id         bigint,
  joist_url        text not null default '',
  error            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint joist_jobs_reason_check check (reason in ('drafted', 'priced', 'signed', 'retry')),
  constraint joist_jobs_status_check check (status in ('queued', 'claimed', 'done', 'failed'))
);

-- One waiting job per change order: later changes fold into it.
create unique index if not exists joist_jobs_queued_uidx on public.joist_jobs (change_order_id) where status = 'queued';
create index if not exists joist_jobs_status_idx on public.joist_jobs (status, created_at);

alter table public.joist_jobs enable row level security;
revoke all on table public.joist_jobs from anon, authenticated, service_role;
grant select, insert, update on table public.joist_jobs to service_role;

comment on table public.joist_jobs is 'Change orders waiting to be copied into Joist by the Mac (docs/JOIST-SYNC.md). Service-role access only.';
