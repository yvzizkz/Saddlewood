-- The project manager group (KB docs/APP-PERMISSIONS-PLAN-2026-10-12.md,
-- "Project manager group", decisions A-C, Lando 2026-10-13).
--
-- The ladder is Crew -> Supervisor -> Project manager -> Owners, each a group
-- of switches (0016). A project manager runs several jobs and sees only the
-- jobs assigned to them (the projects.mine switch). What this adds:
--
--   * crew_job_people: who is on a job, and as what. projects.mine limits every
--     list to the jobs a person has a row here for.
--   * the built-in "Project manager" group: everything the Supervisor group has
--     right now (so checking work, the nightly plan and the crew's updates come
--     along when someone moves up), plus projects.view, projects.mine and
--     money.view. money.prepare, money.request and estimate.view stay off
--     until the owners decide who gets them.
--
-- A field job and its billing job are linked by jobs.crew_job_id, which 0012
-- already made (unique, so one billing job per field job). Nothing new is
-- needed for that: a second column pointing the other way could disagree
-- with it.
--
-- Additive only. Same rules as 0011: RLS on with no policies, service role only.

begin;

create table if not exists public.crew_job_people (
  job_id      text not null references public.crew_jobs (id) on update cascade on delete cascade,
  email       text not null references public.crew_people (email) on update cascade on delete cascade,
  -- What they are on this job. Any row counts for projects.mine.
  role        text not null default 'pm',
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  primary key (job_id, email),
  constraint crew_job_people_role_check check (role in ('pm', 'supervisor', 'crew'))
);

create index if not exists crew_job_people_email_idx on public.crew_job_people (email);

alter table public.crew_job_people enable row level security;

-- The site reads and writes it with the service role; nobody else touches it.
revoke all on table public.crew_job_people from anon, authenticated;
grant select, insert, update, delete on table public.crew_job_people to service_role;

-- The Supervisor group's switches as they are now, plus the three that make a
-- project manager. Never overwrites a group an owner already changed.
insert into public.crew_groups (id, name, description, perms, builtin, created_by)
select 'pm',
       'Project manager',
       'Runs several jobs: everything a supervisor does, on the jobs assigned to them, with the projects view and each job''s money (read only).',
       (select coalesce(jsonb_agg(distinct p), '[]'::jsonb)
          from jsonb_array_elements_text(
                 coalesce((select perms from public.crew_groups where id = 'lead'),
                          '["clock", "receipts", "crew.view", "updates", "schedule.edit", "tasks.assign", "tasks.verify", "questions.ask", "jobs.promise", "pickups.stage", "plan.send"]'::jsonb)
                 || '["projects.view", "projects.mine", "money.view"]'::jsonb) as p),
       true,
       'setup'
on conflict (id) do nothing;

commit;
