-- One schedule: schedule_items (docs/COHESIVE-APP-PLAN.md §6.3, Phase 2 step 4).
--
-- The schedule feed (src/lib/schedule/feed.ts) reads every dated source in
-- place: crew_schedule, crew_job_phases, bid_packages, client billing cutoffs,
-- AR collection ladder steps, job_watches, sub COI/W-9 expiries, payroll/AP
-- Friday cutoffs, and ops_goals.
--
-- This table holds only the schedule events that had no home: city/building
-- inspections, architect/GC site visits, material deliveries, meetings, and
-- subcontractor mobilizations.

begin;

create table if not exists public.schedule_items (
  id           bigint generated always as identity primary key,
  kind         text not null default 'inspection',
  title        text not null,
  detail       text not null default '',
  job_id       uuid references public.jobs (id) on delete set null,
  crew_job_id  text references public.crew_jobs (id) on update cascade on delete set null,
  sub_id       uuid references public.subs (id) on delete set null,
  start_day    date not null,
  end_day      date,
  start_time   text not null default '',
  role         text not null default 'pm',
  who          text not null default '',
  status       text not null default 'scheduled',
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  done_at      timestamptz,
  done_by      text not null default '',
  constraint schedule_items_kind_check check (
    kind in ('inspection', 'site_visit', 'delivery', 'meeting', 'sub_mobilization')
  ),
  constraint schedule_items_role_check check (
    role in ('decisions', 'sales', 'finance', 'ops', 'pm', 'field_lead')
  ),
  constraint schedule_items_status_check check (
    status in ('scheduled', 'done', 'cancelled')
  ),
  constraint schedule_items_days_check check (
    end_day is null or end_day >= start_day
  ),
  constraint schedule_items_title_check check (
    length(btrim(title)) between 1 and 200
  )
);

create index if not exists schedule_items_day_idx on public.schedule_items (start_day, end_day, status);
create index if not exists schedule_items_job_idx on public.schedule_items (job_id, start_day);
create index if not exists schedule_items_crew_job_idx on public.schedule_items (crew_job_id, start_day);

drop trigger if exists trg_schedule_items_updated_at on public.schedule_items;
create trigger trg_schedule_items_updated_at
  before update on public.schedule_items
  for each row execute function public.set_updated_at();

alter table public.schedule_items enable row level security;
revoke all on table public.schedule_items from anon, authenticated, service_role;
grant select, insert, update on table public.schedule_items to service_role;

comment on table public.schedule_items is 'Inspections, site visits, deliveries, meetings and sub mobilizations read by the unified schedule feed (src/lib/schedule/feed.ts). Service-role access only.';

commit;
