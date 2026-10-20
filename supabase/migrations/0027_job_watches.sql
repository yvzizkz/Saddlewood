-- Award: the paperwork a won job owes before and as it starts (KB
-- docs/JOB-LIFECYCLE-PLAN-2026-10-19.md, link L8). Each is a dated line on the
-- billing job that shows in "Waiting on you" and the 7 AM push until someone
-- marks it done:
--
--   agreement      the full written agreement is signed (over the contract
--                  threshold in Company policies, SOP-007 §1)
--   deposit        the deposit is received, before scheduling
--   prelim_notice  the Arizona 20-day preliminary notice is served; due 20
--                  days after the first day anyone clocks in on the job
--   coi_gc         our certificate of insurance is with the GC (GC jobs)
--   permit         permits, added by hand
--   custom         anything else an owner adds
--
-- The Award step writes the first four as they apply. Done is who and when,
-- never deleted: a watch closed by mistake is reopened, and the row keeps both.
--
-- Additive only: one new table. Service role only, like every billing table.

begin;

create table if not exists public.job_watches (
  id          bigint generated always as identity primary key,
  job_id      uuid not null references public.jobs (id) on delete cascade,
  kind        text not null,
  title       text not null,
  -- A fixed date, or null when it is worked out from the job (prelim_notice: first clock-in + 20 days).
  due_on      date,
  note        text not null default '',
  done_at     timestamptz,
  done_by     text not null default '',
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint job_watches_kind_check check (kind in ('agreement', 'deposit', 'prelim_notice', 'coi_gc', 'permit', 'custom')),
  constraint job_watches_title_check check (btrim(title) <> '' and length(title) <= 200)
);

-- One of each standard kind per job, so running Award again never doubles them.
create unique index if not exists job_watches_kind_uidx on public.job_watches (job_id, kind) where kind not in ('permit', 'custom');
create index if not exists job_watches_open_idx on public.job_watches (job_id) where done_at is null;

drop trigger if exists trg_job_watches_updated_at on public.job_watches;
create trigger trg_job_watches_updated_at
  before update on public.job_watches
  for each row execute function public.set_updated_at();

alter table public.job_watches enable row level security;
revoke all on table public.job_watches from anon, authenticated;
revoke all on table public.job_watches from service_role;
grant select, insert, update on table public.job_watches to service_role;

comment on table public.job_watches is 'Paperwork a won job owes (agreement, deposit, 20-day notice, COI, permits); Waiting on you until done. Service-role access only.';

commit;
