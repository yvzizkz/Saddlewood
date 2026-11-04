-- The client portal, first slice: one live link per job, /c/<token>.
--
-- An owner makes the link and turns each section on; nothing is shared until
-- they do. Turning a link off keeps the row, so the job shows who did it, and a
-- new link gets a new token: an old one never comes back.

create table if not exists public.client_portals (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete restrict,
  token       text not null,
  sections    text[] not null default '{}',
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  revoked_by  text not null default '',
  revoked_at  timestamptz,
  constraint client_portals_token_check check (length(token) >= 32),
  constraint client_portals_sections_check check (sections <@ array['documents', 'log', 'complaint']::text[])
);

create unique index if not exists client_portals_token_uidx on public.client_portals (token);
create unique index if not exists client_portals_live_job_uidx on public.client_portals (job_id) where revoked_at is null;

alter table public.client_portals enable row level security;
revoke all on table public.client_portals from anon, authenticated, service_role;
grant select, insert, update on table public.client_portals to service_role;

comment on table public.client_portals is 'A client''s link to their job, /c/<token>, and which sections it shows (src/lib/portal). Service-role access only.';
