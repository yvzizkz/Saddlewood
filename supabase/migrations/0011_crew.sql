-- The crew side of the Saddlewood app (/app): field workers and employees
-- clock in and out, send paper receipts and progress photos, see where they
-- are scheduled and what is assigned to them, file the end-of-day check-in,
-- and answer what the bot asks. Owners see and manage all of it from the
-- app's Crew tab.
--
-- Unlike the bot_* tables (a mailbox for work the office Mac carries out),
-- these ARE the record. A clock-in at 6 AM must not depend on the office Mac
-- being awake, so the site writes it here at once and the Mac reads it
-- afterwards (Saddlewood-KB bot/crew.py, through /api/bot/crew) to file the
-- receipts, write the daily brief, and ask follow-up questions.
--
-- Who is crew: a row here AND app_metadata.sw_role = 'crew' on the Supabase
-- Auth user (set only by the service role when an owner adds the person).
-- Crew are never on the portal allowlist, so none of /internal or its APIs
-- opens for them.
--
-- A crew sign-in is still a real Supabase session, and that matters below the
-- site too: the estimate tables were written when only staff could sign in,
-- and they trust ANY signed-in session ("auth_full_access"). The last part of
-- this file shuts that for every session that carries an sw_role mark, so the
-- crew side cannot be switched on without it.
--
-- RLS is enabled with NO policies on every table, same as the rest of the
-- portal: only the service-role client reaches them, after the API route has
-- authorized the actor.

-- One transaction: the crew tables do not come into being unless the two locks
-- at the top of this file went on first.
begin;

-- ---------------------------------------------------------------------------
-- Staff sessions only, below the site as well.
--
-- jobs, estimates, estimate_trades, estimate_line_items, estimate_overrides,
-- bid_log, export_links and email_log carry a policy that lets any signed-in
-- session read and write every row. That was "Marco" when it was written.
-- With crew seats, a field worker's session token would pass it too, straight
-- against the database API, without ever touching the site.
--
-- The rule added here is RESTRICTIVE, so it holds whatever the permissive
-- policies are called and however many there are: a session whose Auth user
-- carries app_metadata.sw_role (crew, or 'former' once a seat is taken away)
-- gets nothing from these tables. Staff carry no mark and see what they always
-- saw. The site never clears a mark once it is set (src/lib/crew/admin.ts), and
-- sign-ups are disabled on the project, so every Auth user is either staff or
-- marked.
--
-- It is put on every table that has a permissive policy for signed-in
-- sessions today, plus the eight named ones in case this runs somewhere they
-- were created differently.
do $$
declare
  t text;
begin
  for t in
    select distinct tablename::text
      from pg_policies
     where schemaname = 'public'
       and permissive = 'PERMISSIVE'
       and (roles && array['authenticated', 'public']::name[])
    union
    select unnest(array['jobs', 'estimates', 'estimate_trades', 'estimate_line_items',
                        'estimate_overrides', 'bid_log', 'export_links', 'email_log'])
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop policy if exists staff_sessions_only on public.%I', t);
      execute format(
        'create policy staff_sessions_only on public.%I as restrictive for all to authenticated '
        'using ((auth.jwt() -> ''app_metadata'' ->> ''sw_role'') is null) '
        'with check ((auth.jwt() -> ''app_metadata'' ->> ''sw_role'') is null)', t);
    end if;
  end loop;
end
$$;

-- ingest_estimate() runs with its owner's rights (SECURITY DEFINER) and writes
-- jobs and estimates, archiving the estimate it replaces. Postgres lets every
-- role execute a new function unless told otherwise, so until now anyone
-- holding the site's public key could call it. Only the server does: the
-- ingest route uses the service role, behind PIPELINE_INGEST_SECRET.
do $$
begin
  if to_regprocedure('public.ingest_estimate(jsonb)') is not null then
    revoke execute on function public.ingest_estimate(jsonb) from public, anon, authenticated;
    grant execute on function public.ingest_estimate(jsonb) to service_role;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The crew tables.

create table if not exists public.crew_people (
  email         text primary key,
  auth_id       uuid,
  name          text not null,
  lang          text not null default 'en',
  phone         text not null default '',
  trade         text not null default '',
  active        boolean not null default true,
  added_by      text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  constraint crew_people_lang_check check (lang in ('en', 'es'))
);

create table if not exists public.crew_jobs (
  id          text primary key,
  name        text not null,
  address     text not null default '',
  note        text not null default '',
  active      boolean not null default true,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per stretch of work. `day` is the Phoenix calendar day it started.
-- `source` says how the start got here: app (tapped, stamped by the server),
-- late (tapped with no signal and sent afterwards, so the time is the
-- phone's), office (an owner entered it). `review` is non-empty when an owner
-- should look at it. `edits` keeps what the row said before every change.
create table if not exists public.crew_shifts (
  id          bigint generated always as identity primary key,
  email       text not null,
  job_id      text not null,
  job_name    text not null,
  day         date not null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  break_min   integer not null default 0,
  start_geo   jsonb,
  end_geo     jsonb,
  note        text not null default '',
  source      text not null default 'app',
  end_source  text,
  review      text not null default '',
  status      text not null default 'ok',
  edits       jsonb not null default '[]'::jsonb,
  client_in   text,
  client_out  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crew_shifts_source_check check (source in ('app', 'late', 'office')),
  constraint crew_shifts_end_source_check check (end_source is null or end_source in ('app', 'late', 'reported', 'office')),
  constraint crew_shifts_status_check check (status in ('ok', 'void')),
  constraint crew_shifts_break_check check (break_min >= 0 and break_min <= 480),
  constraint crew_shifts_order_check check (ended_at is null or ended_at > started_at)
);

-- A person is on the clock at most once. The database holds the line, so two
-- taps racing each other cannot open two shifts.
create unique index if not exists crew_shifts_one_open_idx on public.crew_shifts (email)
  where ended_at is null and status = 'ok';
create index if not exists crew_shifts_day_idx on public.crew_shifts (day, email);
create index if not exists crew_shifts_person_idx on public.crew_shifts (email, started_at desc);

-- What a person sends in: a receipt, a progress note with photos, the
-- end-of-day check-in, a note to the office, a request to fix their time.
-- `bot` is what the Mac made of it (the receipt's vendor and amount, where the
-- photos were filed). `client_id` comes from the phone so a retry on a bad
-- connection does not make a second entry.
create table if not exists public.crew_entries (
  id          bigint generated always as identity primary key,
  email       text not null,
  kind        text not null,
  day         date not null,
  job_id      text not null default '',
  job_name    text not null default '',
  body        text not null default '',
  data        jsonb not null default '{}'::jsonb,
  files       jsonb not null default '[]'::jsonb,
  status      text not null default 'new',
  bot         jsonb not null default '{}'::jsonb,
  bot_at      timestamptz,
  decided_by  text not null default '',
  client_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crew_entries_kind_check check (kind in ('receipt', 'progress', 'eod', 'note', 'timefix')),
  constraint crew_entries_status_check check (status in ('new', 'filed', 'needs', 'approved', 'denied'))
);

create unique index if not exists crew_entries_client_idx on public.crew_entries (email, client_id)
  where client_id is not null;
create index if not exists crew_entries_day_idx on public.crew_entries (day, email);
create index if not exists crew_entries_person_idx on public.crew_entries (email, id desc);
create index if not exists crew_entries_unfiled_idx on public.crew_entries (id) where bot_at is null;

-- Who is where, which day, from what time: the dispatch.
create table if not exists public.crew_schedule (
  id          bigint generated always as identity primary key,
  day         date not null,
  email       text not null,
  job_id      text not null,
  job_name    text not null,
  start_time  text not null default '',
  note        text not null default '',
  ack         text not null default '',
  ack_note    text not null default '',
  ack_at      timestamptz,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crew_schedule_unique unique (day, email, job_id),
  constraint crew_schedule_ack_check check (ack in ('', 'ok', 'cant')),
  constraint crew_schedule_time_check check (start_time = '' or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

create index if not exists crew_schedule_day_idx on public.crew_schedule (day);
create index if not exists crew_schedule_person_idx on public.crew_schedule (email, day);

create table if not exists public.crew_tasks (
  id          bigint generated always as identity primary key,
  email       text not null,
  title       text not null,
  detail      text not null default '',
  job_id      text not null default '',
  job_name    text not null default '',
  due         date,
  status      text not null default 'open',
  done_note   text not null default '',
  files       jsonb not null default '[]'::jsonb,
  closed_at   timestamptz,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crew_tasks_status_check check (status in ('open', 'done', 'blocked', 'dropped'))
);

create index if not exists crew_tasks_person_idx on public.crew_tasks (email, status);

-- What the bot (or an owner) asks a person. `kind` decides what an answer
-- does: 'clockout' closes the shift in `ref` at the time given, 'amount' puts
-- a figure on a receipt, 'eod' opens the end-of-day form, 'late' and 'ask'
-- are simply recorded. `dedupe` keeps the same question from being asked
-- twice.
create table if not exists public.crew_questions (
  id           bigint generated always as identity primary key,
  email        text not null,
  body         text not null,
  body_es      text not null default '',
  options      jsonb not null default '[]'::jsonb,
  kind         text not null default 'ask',
  ref          jsonb not null default '{}'::jsonb,
  asked_by     text not null default 'bot',
  dedupe       text,
  status       text not null default 'open',
  answer       text not null default '',
  answered_at  timestamptz,
  bot_seen_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint crew_questions_kind_check check (kind in ('ask', 'clockout', 'amount', 'eod', 'late')),
  constraint crew_questions_status_check check (status in ('open', 'answered', 'cancelled'))
);

create unique index if not exists crew_questions_dedupe_idx on public.crew_questions (dedupe)
  where dedupe is not null;
create index if not exists crew_questions_person_idx on public.crew_questions (email, status);

alter table public.crew_people enable row level security;
alter table public.crew_jobs enable row level security;
alter table public.crew_shifts enable row level security;
alter table public.crew_entries enable row level security;
alter table public.crew_schedule enable row level security;
alter table public.crew_tasks enable row level security;
alter table public.crew_questions enable row level security;

-- The server (the service role) is the only reader and writer of these tables
-- and of the bot_* tables from 0010. Say so outright instead of leaning on the
-- project's default privileges: newer Supabase projects no longer hand new
-- tables to the API roles, and older ones hand them to every role. Either
-- way, after this the browser's keys (anon, authenticated) hold nothing here,
-- with or without a policy.
revoke all on table
  public.crew_people, public.crew_jobs, public.crew_shifts, public.crew_entries,
  public.crew_schedule, public.crew_tasks, public.crew_questions,
  public.bot_messages, public.bot_actions, public.bot_state, public.bot_push_subscriptions
from anon, authenticated;

grant select, insert, update, delete on table
  public.crew_people, public.crew_jobs, public.crew_shifts, public.crew_entries,
  public.crew_schedule, public.crew_tasks, public.crew_questions,
  public.bot_messages, public.bot_actions, public.bot_state, public.bot_push_subscriptions
to service_role;

comment on table public.crew_people is 'Field crew and employees with a seat in the app. Managed by owners. Service-role access only.';
comment on table public.crew_jobs is 'Jobs a person can clock in to or log against. Service-role access only.';
comment on table public.crew_shifts is 'Time on the clock, one row per stretch of work. Service-role access only.';
comment on table public.crew_entries is 'Receipts, progress notes, end-of-day check-ins, notes and time-fix requests from the crew. Service-role access only.';
comment on table public.crew_schedule is 'Who is on which job on which day. Service-role access only.';
comment on table public.crew_tasks is 'Tasks assigned to a crew member. Service-role access only.';
comment on table public.crew_questions is 'Questions the bot or an owner asked a crew member, and the answers. Service-role access only.';

commit;
