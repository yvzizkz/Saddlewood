-- Progress billing on the schedule of values (docs/COHESIVE-APP-PLAN.md Phase 2 step 6).
--
-- One row per SOV line (or signed change order) per draw: the percent complete
-- to date it was billed at and what this draw billed on it. Billed to date on a
-- line is the sum over draws whose invoice is still standing (draft or issued,
-- not void), so voiding a draw puts its amounts back. The invoice itself is an
-- ordinary `documents` row; this table only says which line each part came from.
--
--   line_key   "sov:<index in jobs.billing.sov>" or "co:<change_orders.id>"

create table if not exists public.sov_progress (
  id             bigint generated always as identity primary key,
  job_id         uuid not null references public.jobs (id) on delete cascade,
  document_id    uuid not null references public.documents (id) on delete cascade,
  line_key       text not null,
  description    text not null default '',
  scheduled_cents bigint not null,
  pct_to_date    numeric(5,2) not null,
  amount_cents   bigint not null,
  created_by     text not null default '',
  created_at     timestamptz not null default now(),
  constraint sov_progress_pct_check check (pct_to_date >= 0 and pct_to_date <= 100),
  constraint sov_progress_key_check check (line_key ~ '^(sov|co):[0-9]+$'),
  constraint sov_progress_line_uidx unique (document_id, line_key)
);

create index if not exists sov_progress_job_idx on public.sov_progress (job_id, line_key);

alter table public.sov_progress enable row level security;
revoke all on table public.sov_progress from anon, authenticated, service_role;
grant select, insert on table public.sov_progress to service_role;

comment on table public.sov_progress is 'What each progress draw billed per SOV line or change order; billed to date counts draws whose invoice is not void. Service-role access only.';
