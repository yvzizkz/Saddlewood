-- This year on each job, from the systems the business ran on before the app
-- (Lando 2026-10-20: "add the year to date information that we have on Joist
-- and Buildertrend ... and load it in the summary card").
--
-- The office Mac (Saddlewood-KB bot/job_history.py) reads Joist (estimates,
-- change orders, invoices and their dated payments) and Buildertrend (crew
-- hours), matches each document to a field job by its address, and posts one
-- summary per job to POST /api/bot/history. The site keeps the latest summary
-- here and shows it on the job's money card, read only, under money.view.
--
-- This is history, not billing: nothing here is a document, so nothing in it
-- reaches the money ladder, statements, or the Billed/Paid figures, which stay
-- what the app itself issued. Home Depot is not here: its lines are already in
-- purchases (0022) and the Material block reads them.
--
--   job_history   one row per field job. summary is the Mac's whole picture
--                 (src/lib/crew/jobHistory.ts jobHistorySchema), replaced on
--                 every post. as_of is when the Mac read its sources.
--
-- Numbered 0050 so the cohesive-app branches (0029-0043, not yet on main)
-- keep their numbers.

create table if not exists public.job_history (
  crew_job_id  text primary key references public.crew_jobs (id) on delete cascade,
  summary      jsonb not null default '{}'::jsonb,
  as_of        timestamptz not null,
  updated_at   timestamptz not null default now()
);

-- Service role only, like every crew table (0011): nothing for the browser's keys.
alter table public.job_history enable row level security;
revoke all on table public.job_history from anon, authenticated;
grant select, insert, update, delete on table public.job_history to service_role;
