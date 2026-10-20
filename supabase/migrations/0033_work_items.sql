-- One task system: work_items (docs/COHESIVE-APP-PLAN.md §6.5).
--
-- Tasks already live in several places (crew_tasks, ops_cards, job_watches,
-- the bot's waiting-on ledger, material requests, "Which job is this?"). The
-- app reads all of them in place into one feed (src/lib/tasks/feed.ts); this
-- table holds the kinds that had no home: punch, follow-ups, change orders
-- awaiting a price, decisions, compliance and billing steps, missing daily
-- logs, friction items, and plain tasks an owner or PM hands to a role.
--
-- An item belongs to a role (role_seats, 0032), optionally to a person, and
-- optionally to a job (either id). Past its due date plus escalate_days it
-- moves up one role (the feed works that out; nothing is rewritten).

create table if not exists public.work_items (
  id              bigint generated always as identity primary key,
  kind            text not null default 'task',
  title           text not null,
  detail          text not null default '',
  role            text not null,
  assignee        text not null default '',
  job_id          uuid references public.jobs (id) on delete set null,
  crew_job_id     text references public.crew_jobs (id) on update cascade on delete set null,
  due_on          date,
  escalate_days   integer not null default 2,
  status          text not null default 'open',
  -- Where it came from and where it is acted on, when somewhere else.
  source          text not null default '',
  href            text not null default '',
  created_by      text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  done_at         timestamptz,
  done_by         text not null default '',
  constraint work_items_kind_check check (kind in ('task', 'punch', 'follow_up', 'approval', 'co_price', 'decision', 'compliance', 'billing', 'daily_log', 'friction')),
  constraint work_items_role_check check (role in ('decisions', 'sales', 'finance', 'ops', 'pm', 'field_lead')),
  constraint work_items_status_check check (status in ('open', 'done', 'dropped')),
  constraint work_items_escalate_check check (escalate_days between 0 and 60),
  constraint work_items_title_check check (length(btrim(title)) between 1 and 200)
);

create index if not exists work_items_open_idx on public.work_items (status, role, due_on);
create index if not exists work_items_job_idx on public.work_items (job_id);
create index if not exists work_items_crew_job_idx on public.work_items (crew_job_id);
create unique index if not exists work_items_source_uidx on public.work_items (source) where source <> '' and status = 'open';

drop trigger if exists trg_work_items_updated_at on public.work_items;
create trigger trg_work_items_updated_at
  before update on public.work_items
  for each row execute function public.set_updated_at();

alter table public.work_items enable row level security;
revoke all on table public.work_items from anon, authenticated, service_role;
grant select, insert, update on table public.work_items to service_role;

comment on table public.work_items is 'Tasks with no other home, assigned to a role (role_seats); the task feed reads them beside crew_tasks, ops_cards, job_watches and the waiting list. Service-role access only.';
