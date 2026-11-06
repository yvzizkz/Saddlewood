-- The Wednesday payroll run (Finance & Admin): who gets paid for one pay date,
-- by hours or by amount, kept so next week starts from it and the email to the
-- accountant comes from the app. Pay rates and amounts: service-role access only.

create table if not exists public.payroll_runs (
  id          bigint generated always as identity primary key,
  pay_date    date not null unique,
  lines       jsonb not null,
  updated_by  text not null,
  updated_at  timestamptz not null default now(),
  constraint payroll_runs_lines_check check (jsonb_typeof(lines) = 'array')
);

alter table public.payroll_runs enable row level security;
revoke all on table public.payroll_runs from anon, authenticated, service_role;
grant select, insert, update on table public.payroll_runs to service_role;
comment on table public.payroll_runs is 'One payroll run per pay date: lines of name, kind (employee by hours, sub by amount), hours, amountCents, note, the crew email once linked, and byRate when the amount comes from the clock. Service-role access only.';
