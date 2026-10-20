-- The stage of each job (Lando, 2026-10-19): a list of phases the project
-- manager or an owner keeps on the job, verified one by one by a person. The
-- stage is derived, never stored: the first phase nobody has verified is where
-- the job is (src/lib/crew/phases.ts stageOf). A worker's word never moves it;
-- only a seat with the check-work switch (on their jobs) or an owner verifies.
--
--   crew_job_phases   one row per phase, in order (ord) under its job.
--                     trade      'framing' | 'drywall' | '' (free text)
--                     planned_*  the dates the PM expects it to run, optional
--                     verified_* who checked it and when; empty until then
--                     note       what was said at verification, or on unverify
--
-- Two templates start a job's list (framing: layout, walls, roof and ceiling,
-- backing, inspection; drywall: hang, tape, texture, punch); they live in the
-- site (PHASE_TEMPLATES), not here, so an owner can change them in the app.
--
-- Additive only. Same rules as 0011: RLS on with no policies, service role only.

begin;

create table if not exists public.crew_job_phases (
  id            bigserial primary key,
  job_id        text not null references public.crew_jobs (id) on update cascade on delete cascade,
  ord           integer not null,
  name          text not null,
  trade         text not null default '',
  planned_from  date,
  planned_to    date,
  verified_by   text not null default '',
  verified_at   timestamptz,
  note          text not null default '',
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint crew_job_phases_job_ord_key unique (job_id, ord),
  constraint crew_job_phases_name_check check (length(trim(name)) > 0),
  constraint crew_job_phases_planned_check check (planned_from is null or planned_to is null or planned_from <= planned_to)
);

create index if not exists crew_job_phases_job_idx on public.crew_job_phases (job_id, ord);

alter table public.crew_job_phases enable row level security;

-- The site reads and writes it with the service role; nobody else touches it.
revoke all on table public.crew_job_phases from anon, authenticated;
grant select, insert, update, delete on table public.crew_job_phases to service_role;
grant usage, select on sequence public.crew_job_phases_id_seq to service_role;

comment on table public.crew_job_phases is 'The phases of a field job in order, each verified by a person (never by the worker who did it). The job''s stage is the first unverified one. Service-role access only.';

commit;
