-- Field operations: phase quality checklists and punch locations (docs/COHESIVE-APP-PLAN.md §6.4, Phase 2 step 5).
--
-- 1. checklists: pre-cover -> pre-board -> pre-tape -> pre-texture -> pre-paint
--    per job and phase (SOP-009 quality gate). Every wall, both faces, with a
--    location label and checked items. While any checklist on a phase is not
--    'passed', verifying that phase (phase.verify) is blocked.
-- 2. work_items.location: room / wall location for punch items and field tasks.

begin;

create table if not exists public.checklists (
  id              bigint generated always as identity primary key,
  job_id          text not null references public.crew_jobs (id) on update cascade on delete cascade,
  phase_id        bigint references public.crew_job_phases (id) on delete cascade,
  stage           text not null default 'pre_cover',
  location_label  text not null,
  -- [{key, label, checked, note}]
  items           jsonb not null default '[]'::jsonb,
  files           jsonb not null default '[]'::jsonb,
  status          text not null default 'open',
  note            text not null default '',
  completed_by    text not null default '',
  completed_at    timestamptz,
  created_by      text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint checklists_stage_check check (
    stage in ('pre_cover', 'pre_board', 'pre_tape', 'pre_texture', 'pre_paint', 'final_walk')
  ),
  constraint checklists_status_check check (
    status in ('open', 'passed', 'blocked')
  ),
  constraint checklists_location_check check (
    length(btrim(location_label)) between 1 and 200
  )
);

create index if not exists checklists_job_idx on public.checklists (job_id, phase_id, status);
create index if not exists checklists_phase_idx on public.checklists (phase_id, status);

drop trigger if exists trg_checklists_updated_at on public.checklists;
create trigger trg_checklists_updated_at
  before update on public.checklists
  for each row execute function public.set_updated_at();

alter table public.checklists enable row level security;
revoke all on table public.checklists from anon, authenticated, service_role;
grant select, insert, update on table public.checklists to service_role;

comment on table public.checklists is 'SOP-009 quality checklists per phase and wall location (pre_cover -> pre_board -> pre_tape -> pre_texture -> pre_paint); gates phase.verify. Service-role access only.';

-- Room / wall location on work_items (used by punch items and field tasks).
alter table public.work_items
  add column if not exists location text not null default '';

commit;
