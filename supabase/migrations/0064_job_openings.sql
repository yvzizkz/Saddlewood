-- What a job carried in from before the app (the January move, docs/SCENARIOS.md).
--
-- Closed history only: one figure for everything billed and paid in full before
-- the app, through a date, and where the figure came from. It counts in a job's
-- Billed and Paid and never in what's owed. A bill still owed comes in as a real
-- bill, so Receivables and the job always agree.
--
-- Nothing is updated or deleted: each save is a new row and the newest counts,
-- so a figure a client can see keeps its trail.

create table if not exists public.job_openings (
  id             bigint generated always as identity primary key,
  job_id         uuid not null references public.jobs (id) on delete cascade,
  settled_cents  bigint not null,
  as_of          date not null,
  source         text not null,
  contract_cents bigint,
  entered_by     text not null,
  entered_at     timestamptz not null default now(),
  constraint job_openings_settled_check check (settled_cents >= 0),
  constraint job_openings_contract_check check (contract_cents is null or contract_cents >= 0),
  constraint job_openings_source_check check (btrim(source) <> '')
);

create index if not exists job_openings_job_idx on public.job_openings (job_id, id desc);

alter table public.job_openings enable row level security;
revoke all on table public.job_openings from anon, authenticated, service_role;
grant select, insert on table public.job_openings to service_role;
comment on table public.job_openings is 'What a job carried in from before the app: billed and paid in full through as_of. Append only, the newest row per job counts. Service-role access only.';
