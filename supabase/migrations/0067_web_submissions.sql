-- What the website's forms send, kept in the app. Until now a submission went
-- only to GoHighLevel and email, so GHL can't go until the app holds them.
--
-- contact shows in the Sales inbox; trade_partner and careers show at
-- /app/sales/applications. The site writes with the service role; nothing
-- public reads this.

create table if not exists public.web_submissions (
  id          bigint generated always as identity primary key,
  form        text not null,
  name        text not null default '',
  email       text not null default '',
  phone       text not null default '',
  company     text not null default '',
  about       text not null default '',
  summary     text not null default '',
  status      text not null default 'new',
  created_at  timestamptz not null default now(),
  constraint web_submissions_form_check check (form in ('contact', 'trade_partner', 'careers')),
  constraint web_submissions_status_check check (status in ('new', 'called', 'texted', 'dismissed'))
);

create index if not exists web_submissions_form_idx on public.web_submissions (form, created_at desc);

alter table public.web_submissions enable row level security;
revoke all on table public.web_submissions from anon, authenticated, service_role;
grant select, insert, update on table public.web_submissions to service_role;
