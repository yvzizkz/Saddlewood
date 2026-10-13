-- The field supervisor's side of the crew app (Eli, 2026-10-12).
--
-- Marco moves to selling and estimating; the field supervisor runs the jobs.
-- What this adds, all on the crew tables from 0011:
--
--   * a seat can be a lead (the field supervisor) or a runner, not only crew.
--     A lead is still a crew-marked sign-in (sw_role = 'crew'), so every lock
--     0011 put on the estimate tables still holds for them. What a lead may do
--     beyond their own day is decided by the site (src/lib/crew/auth.ts), never
--     by the database.
--   * a priority on each scheduled assignment and each task, and on each job
--     the date we promised the client, so the schedule can put promises first.
--   * "reported done" and "verified done" are no longer the same thing: a
--     worker reports a task done (with a photo), and the lead or an owner
--     verifies it or sends it back. 'doing' is the "started" state.
--   * pickups: material the lead ordered and had staged for will-call, for the
--     runner to fetch and deliver to the job.
--   * the nightly plan the lead sends Marco: what was sent, by whom, when.
--
-- Same rules as 0011: RLS on with no policies, service role only.

begin;

-- ---- seats --------------------------------------------------------------------

alter table public.crew_people
  add column if not exists role text not null default 'crew';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crew_people_role_check') then
    alter table public.crew_people
      add constraint crew_people_role_check check (role in ('crew', 'lead', 'runner'));
  end if;
end
$$;

-- ---- jobs: what we promised the client -------------------------------------------

alter table public.crew_jobs
  add column if not exists promised date,
  add column if not exists promise_note text not null default '';

-- ---- schedule: why this goes first ----------------------------------------------

alter table public.crew_schedule
  add column if not exists priority smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crew_schedule_priority_check') then
    alter table public.crew_schedule
      add constraint crew_schedule_priority_check check (priority is null or priority between 1 and 5);
  end if;
end
$$;

-- ---- tasks: reported vs verified ----------------------------------------------------

alter table public.crew_tasks
  add column if not exists priority smallint,
  add column if not exists reported_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by text not null default '',
  add column if not exists sent_back integer not null default 0;

alter table public.crew_tasks drop constraint if exists crew_tasks_status_check;
alter table public.crew_tasks
  add constraint crew_tasks_status_check check (status in ('open', 'doing', 'done', 'blocked', 'dropped'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crew_tasks_priority_check') then
    alter table public.crew_tasks
      add constraint crew_tasks_priority_check check (priority is null or priority between 1 and 5);
  end if;
end
$$;

-- Tasks done before this migration were closed by an owner or by the worker
-- with no check. Leave them as they were: verified, so nothing old turns up
-- as "waiting on you".
update public.crew_tasks
   set verified_at = coalesce(closed_at, updated_at), verified_by = 'before supervisor checks'
 where status = 'done' and verified_at is null;

create index if not exists crew_tasks_unverified_idx on public.crew_tasks (id)
  where status = 'done' and verified_at is null;

-- ---- pickups ----------------------------------------------------------------------

create table if not exists public.crew_pickups (
  id            bigint generated always as identity primary key,
  day           date not null,
  job_id        text not null default '',
  job_name      text not null default '',
  supplier      text not null,
  place         text not null default '',
  order_ref     text not null default '',
  items         text not null default '',
  note          text not null default '',
  -- Who is fetching it. '' means any runner.
  email         text not null default '',
  status        text not null default 'staged',
  runner_note   text not null default '',
  files         jsonb not null default '[]'::jsonb,
  picked_by     text not null default '',
  picked_at     timestamptz,
  delivered_at  timestamptz,
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint crew_pickups_status_check check (status in ('staged', 'picked', 'delivered', 'problem', 'cancelled'))
);

create index if not exists crew_pickups_day_idx on public.crew_pickups (day);
create index if not exists crew_pickups_open_idx on public.crew_pickups (status) where status in ('staged', 'picked', 'problem');

-- ---- the nightly plan --------------------------------------------------------------

create table if not exists public.crew_reports (
  id         bigint generated always as identity primary key,
  -- The day the plan is FOR (tomorrow, when sent in the evening).
  day        date not null,
  sent_by    text not null,
  sent_name  text not null default '',
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists crew_reports_day_idx on public.crew_reports (day, created_at desc);

alter table public.crew_pickups enable row level security;
alter table public.crew_reports enable row level security;

revoke all on table public.crew_pickups, public.crew_reports from anon, authenticated;
grant select, insert, update, delete on table public.crew_pickups, public.crew_reports to service_role;

comment on table public.crew_pickups is 'Material staged for will-call that a runner fetches and delivers to a job. Service-role access only.';
comment on table public.crew_reports is 'The nightly plan the field supervisor sends the owners: tomorrow''s schedule, open tasks, pickups. Service-role access only.';

commit;
