-- Client complaints (the Roadmap's complaint handling, first slice).
--
-- A complaint is a work item (0033) on a job: it goes to that job's PM, or to
-- Owner decisions when the job has none, on a clock from Company policies
-- ("complaints"), and moves up a role like any other item when it runs late.
-- It closes only with what was done, kept on the row and shown on the job.

alter table public.work_items add column if not exists resolution text not null default '';

alter table public.work_items drop constraint if exists work_items_kind_check;
alter table public.work_items add constraint work_items_kind_check
  check (kind in ('task', 'punch', 'follow_up', 'approval', 'co_price', 'decision', 'compliance', 'billing', 'daily_log', 'friction', 'complaint'));

alter table public.work_items drop constraint if exists work_items_complaint_resolution_check;
alter table public.work_items add constraint work_items_complaint_resolution_check
  check (kind <> 'complaint' or status = 'open' or length(btrim(resolution)) > 0);

create index if not exists work_items_complaints_idx on public.work_items (created_at desc) where kind = 'complaint';
