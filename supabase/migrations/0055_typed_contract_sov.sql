-- The contract value and the schedule of values move out of jobs.billing
-- (JSON) into typed storage, and draws key their SOV lines by a stable id.
--
--   jobs.contract_cents   was billing.contractCents. null = not on file.
--   sov_lines             was billing.sov: one row per line, in order. A line
--                         is never edited once written (scheduled_cents in
--                         sov_progress keeps what each draw billed against),
--                         and one a draw billed can't be deleted.
--   sov_progress.line_key "sov:<index in billing.sov>" becomes
--                         "line:<sov_lines.id>", so reordering or replacing
--                         the schedule can never move a draw onto the wrong
--                         line. "co:<id>" and "deposit" are unchanged.
--
-- public.move_billing_sov() does the move and is safe to run again: it copies
-- whatever jobs.billing still holds (a job the old code awarded in the
-- minutes between this migration and the deploy), re-keys the opening
-- percents (billing.sovOpening), the PM's report (billing.pmReport.pcts) and
-- the draws, and takes sov / contractCents out of the JSON. A hand-carried
-- line's billedPct becomes its opening percent unless an opening was saved,
-- which is how the app already read it. retainagePct, sovOpening, pmReport
-- and award stay in billing.
--
-- Apply right before the site change, then run `select public.move_billing_sov();`
-- once more after the deploy is live. Between the two the old code finds no
-- schedule on any job, so it can't make a draw: it fails closed.

begin;

alter table public.jobs add column if not exists contract_cents bigint;
alter table public.jobs drop constraint if exists jobs_contract_cents_check;
alter table public.jobs add constraint jobs_contract_cents_check check (contract_cents is null or contract_cents >= 0);

create table if not exists public.sov_lines (
  id            bigint generated always as identity primary key,
  job_id        uuid not null references public.jobs (id) on delete cascade,
  position      integer not null,
  description   text not null,
  amount_cents  bigint not null,
  kind          text not null default 'section',
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  constraint sov_lines_kind_check check (kind in ('section', 'adjustment', 'option', 'contract')),
  constraint sov_lines_description_check check (btrim(description) <> ''),
  constraint sov_lines_position_uidx unique (job_id, position)
);

alter table public.sov_lines enable row level security;
revoke all on table public.sov_lines from anon, authenticated, service_role;
-- Award replaces a schedule nothing has billed yet: insert and delete, no update.
grant select, insert, delete on table public.sov_lines to service_role;
comment on table public.sov_lines is 'A job''s schedule of values, one row per line in order; draws reference a line as sov_progress.line_key ''line:<id>''. Service-role access only.';

-- A line a standing or past draw billed stays.
create or replace function public.sov_lines_keep_billed() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.sov_progress where job_id = old.job_id and line_key = 'line:' || old.id) then
    raise exception 'SOV line % has draws against it', old.id using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists sov_lines_keep_billed on public.sov_lines;
create trigger sov_lines_keep_billed before delete on public.sov_lines
  for each row execute function public.sov_lines_keep_billed();

alter table public.sov_progress drop constraint if exists sov_progress_key_check;

create or replace function public.move_billing_sov() returns integer
language plpgsql as $$
declare
  j record;
  keymap jsonb;
  opening jsonb;
  report jsonb;
  moved integer := 0;
begin
  for j in select id, billing from public.jobs where billing ?| array['sov', 'contractCents'] for update loop
    -- The contract figure. The JSON is the newer one when both are there.
    if jsonb_typeof(j.billing -> 'contractCents') = 'number' and (j.billing ->> 'contractCents') ~ '^[0-9]+$' then
      update public.jobs set contract_cents = (j.billing ->> 'contractCents')::bigint where id = j.id;
    end if;

    -- The lines, once per job, keeping each line's index as its position.
    if jsonb_typeof(j.billing -> 'sov') = 'array' and not exists (select 1 from public.sov_lines where job_id = j.id) then
      insert into public.sov_lines (job_id, position, description, amount_cents, kind, created_by)
      select j.id, (s.i - 1)::int,
             btrim(coalesce(s.line ->> 'description', s.line ->> 'label')),
             round(coalesce(s.line ->> 'amountCents', s.line ->> 'cents')::numeric)::bigint,
             case when s.line ->> 'kind' in ('section', 'adjustment', 'option', 'contract') then s.line ->> 'kind' else 'section' end,
             'migration 0055'
        from jsonb_array_elements(j.billing -> 'sov') with ordinality as s(line, i)
       where jsonb_typeof(s.line) = 'object'
         and btrim(coalesce(s.line ->> 'description', s.line ->> 'label', '')) <> ''
         and coalesce(s.line ->> 'amountCents', s.line ->> 'cents', '') ~ '^-?[0-9]+(\.[0-9]+)?$';
    end if;

    -- "sov:<index>" -> "line:<id>" for this job.
    select coalesce(jsonb_object_agg('sov:' || position, 'line:' || id), '{}'::jsonb) into keymap
      from public.sov_lines where job_id = j.id;

    opening := j.billing -> 'sovOpening';
    if opening is null and jsonb_typeof(j.billing -> 'sov') = 'array' then
      -- Never saved: what was billed before the app is each line's billedPct.
      select jsonb_object_agg('sov:' || (s.i - 1), (s.line ->> 'billedPct')::numeric) into opening
        from jsonb_array_elements(j.billing -> 'sov') with ordinality as s(line, i)
       where jsonb_typeof(s.line) = 'object'
         and (s.line ->> 'billedPct') ~ '^[0-9]+(\.[0-9]+)?$'
         and (s.line ->> 'billedPct')::numeric > 0 and (s.line ->> 'billedPct')::numeric <= 100;
    end if;
    if jsonb_typeof(opening) = 'object' then
      select coalesce(jsonb_object_agg(coalesce(keymap ->> e.key, e.key), e.value), '{}'::jsonb) into opening
        from jsonb_each(opening) e;
    end if;

    report := j.billing -> 'pmReport';
    if jsonb_typeof(report -> 'pcts') = 'object' then
      report := jsonb_set(report, '{pcts}', (
        select coalesce(jsonb_object_agg(coalesce(keymap ->> e.key, e.key), e.value), '{}'::jsonb) from jsonb_each(report -> 'pcts') e));
    end if;

    update public.sov_progress p set line_key = keymap ->> p.line_key
     where p.job_id = j.id and p.line_key like 'sov:%' and keymap ? p.line_key;

    update public.jobs set billing =
      (j.billing - 'sov' - 'contractCents' - 'sovOpening' - 'pmReport')
      || case when opening is null then '{}'::jsonb else jsonb_build_object('sovOpening', opening) end
      || case when report is null then '{}'::jsonb else jsonb_build_object('pmReport', report) end
     where id = j.id;
    moved := moved + 1;
  end loop;
  return moved;
end $$;

revoke all on function public.move_billing_sov() from public, anon, authenticated, service_role;
revoke all on function public.sov_lines_keep_billed() from public, anon, authenticated, service_role;

select public.move_billing_sov();

-- Every draw row now names a line by id (a sov:<index> left over had no line
-- at that index, and fails here rather than billing nothing against it).
alter table public.sov_progress
  add constraint sov_progress_key_check check (line_key ~ '^(line|co):[0-9]+$' or line_key = 'deposit');

comment on column public.sov_progress.line_key is '"line:<sov_lines.id>", "co:<change_orders.id>", or "deposit" (the deposit a draw credited back).';

commit;
